import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interface, toBeHex, zeroPadValue, type JsonFragment } from 'ethers';
import { Web3RPCClient } from '@cyberchain/smart-contract-wrapper';
import {
  CYBER_DAO_GOVERNANCE_READ_ABI,
  CYBER_DAO_GOVERNANCE_WRITE_ABI,
} from '@dao-platform/blockchain-cyberchain';
import { PostgresService } from '../database/postgres.service';

export type VerificationStatus =
  'verified' | 'mismatched' | 'unavailable' | 'unverified';
export interface Comparison {
  field: string;
  status: VerificationStatus;
  database: unknown;
  blockchain: unknown;
  reason?: string;
}
export interface VerificationReport {
  status: VerificationStatus;
  dao_id: string;
  proposal_id: string;
  on_chain_id: string | null;
  chain_id: string;
  contract: string;
  block_number?: string;
  block_hash?: string;
  observed_at: string;
  proposal?: Record<string, unknown>;
  voting_status?: string;
  vote_counts?: string[];
  comparisons: Comparison[];
  events: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  errors: string[];
  scope: string;
  duration_ms?: number;
}
const names = [
  'ProposalCreated',
  'MemberAssigned',
  'MemberUnassigned',
  'VoteCast',
  'ProposalCancelled',
  'ProposalFinalized',
];

@Injectable()
export class BlockchainVerificationService {
  private readonly abi = new Interface([
    ...(CYBER_DAO_GOVERNANCE_WRITE_ABI as unknown as JsonFragment[]),
    ...CYBER_DAO_GOVERNANCE_READ_ABI,
  ]);
  constructor(
    private readonly postgres: PostgresService,
    private readonly config: ConfigService,
  ) {}

  // Uses the platform's existing RPC client, URL and contract ABI. No caller can
  // choose an RPC method, URL, contract, block range or arbitrary transaction.
  protected rpc(method: string, params: unknown[]): Promise<any> {
    return Web3RPCClient.getInstance().rpcRequest(method, params, {
      rpcURL: this.config.getOrThrow<string>('CYBERCHAIN_RPC_URL'),
      timeout: 15_000,
    });
  }

  async verify(id: string, daoId?: string): Promise<VerificationReport> {
    const started = performance.now();
    const db = this.postgres.database;
    const p = await db
      .selectFrom('proposals')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!p) throw new NotFoundException('Proposal not found.');
    if (daoId && daoId !== p.dao_id)
      throw new ForbiddenException('Proposal is outside the selected DAO.');
    const report: VerificationReport = {
      status: 'unverified',
      dao_id: p.dao_id,
      proposal_id: p.id,
      on_chain_id: p.on_chain_id?.toString() ?? null,
      chain_id: String(p.chain_id),
      contract: p.contract_address,
      observed_at: new Date().toISOString(),
      comparisons: [],
      events: [],
      transactions: [],
      errors: [],
      scope:
        'Pinned block; selected proposal only. Title, purpose and document contents are off-chain and remain unverified.',
    };
    const compare = (
      field: string,
      local: unknown,
      live: unknown,
      reason?: string,
    ) =>
      report.comparisons.push({
        field,
        database: local ?? null,
        blockchain: live ?? null,
        status:
          local == null
            ? 'unverified'
            : String(local).toLowerCase() === String(live).toLowerCase()
              ? 'verified'
              : 'mismatched',
        ...(reason ? { reason } : local == null ? { reason: 'Database value is missing; the on-chain value was read successfully.' } : {}),
      });
    if (!p.on_chain_id) {
      report.errors.push('This proposal has no on-chain identifier.');
      return report;
    }
    if (
      String(p.chain_id) !== this.config.get<string>('CYBERCHAIN_CHAIN_ID') ||
      p.contract_address.toLowerCase() !==
        this.config.get<string>('GOVERNANCE_CONTRACT_ADDRESS')?.toLowerCase()
    ) {
      report.errors.push(
        'Proposal deployment does not match the configured deployment.',
      );
      return report;
    }
    try {
      const actualChain = BigInt(await this.rpc('eth_chainId', [])).toString();
      if (actualChain !== String(p.chain_id)) {
        report.status = 'mismatched';
        compare('chain_id', String(p.chain_id), actualChain);
        return report;
      }
      const block = await this.rpc('eth_blockNumber', []);
      const snapshot = await this.rpc('eth_getBlockByNumber', [block, false]);
      if (!snapshot?.hash) throw new Error('Snapshot block unavailable');
      report.block_number = BigInt(block).toString();
      report.block_hash = snapshot.hash;
      const call = async (name: string, args: unknown[]) =>
        this.abi.decodeFunctionResult(
          name,
          await this.rpc('eth_call', [
            {
              to: p.contract_address,
              data: this.abi.encodeFunctionData(name, args),
            },
            block,
          ]),
        );
      const [proposalResult, stateResult] = await Promise.all([
        call('getProposal', [p.on_chain_id]),
        call('proposalState', [p.on_chain_id]),
      ]);
      const value = proposalResult[0];
      report.proposal = Object.fromEntries(
        [
          'metadataHash',
          'metadataURI',
          'startsAt',
          'endsAt',
          'optionCount',
          'winningOption',
          'assignedMemberCount',
          'voteCount',
          'proposalType',
          'cancelled',
          'finalized',
          'tied',
        ].map((key, i) => [
          key,
          typeof value[i] === 'bigint' ? value[i].toString() : value[i],
        ]),
      );
      const live = report.proposal;
      const state = ['Pending', 'Active', 'Closed', 'Cancelled'][
        Number(stateResult[0])
      ];
      if (
        !state ||
        Number(live.optionCount) < 2 ||
        Number(live.optionCount) > 10
      )
        throw new Error('Unexpected contract response');
      report.voting_status = state;
      const localState = (
        {
          DRAFT: 'Pending',
          PENDING: 'Pending',
          VOTING_OPEN: 'Active',
          ACTIVE: 'Active',
          VOTING_CLOSED: 'Closed',
          CLOSED: 'Closed',
          EXECUTED: 'Closed',
          CANCELLED: 'Cancelled',
        } as Record<string, string>
      )[p.status];
      compare('voting_status', localState ?? p.status, state);
      compare('metadata_hash', p.metadata_hash, live.metadataHash);
      compare('metadata_uri', p.metadata_uri, live.metadataURI);
      compare(
        'starts_at',
        Math.floor(new Date(p.starts_at as any).getTime() / 1000).toString(),
        live.startsAt,
      );
      compare(
        'ends_at',
        Math.floor(new Date(p.ends_at as any).getTime() / 1000).toString(),
        live.endsAt,
      );
      compare('finalized', p.finalized_at ? true : false, live.finalized);
      if (live.finalized) {
        compare('winning_option', p.winning_option, live.winningOption);
        compare('tied', p.tied, live.tied);
      }
      report.vote_counts = await Promise.all(
        Array.from({ length: Number(live.optionCount) }, async (_, i) =>
          String((await call('optionVoteCount', [p.on_chain_id, i]))[0]),
        ),
      );
      const votes = await db
        .selectFrom('votes')
        .selectAll()
        .where('proposal_id', '=', id)
        .execute();
      compare('public.votes.count', votes.length, live.voteCount);
      compare(
        'public.proposals.total_votes',
        p.total_votes?.toString(),
        live.voteCount,
      );
      report.vote_counts.forEach((count, index) =>
        compare(
          `option_${index}_vote_count`,
          votes.filter((v) => v.option_index === index).length,
          count,
        ),
      );
      const stored = await db
        .selectFrom('governance_events')
        .selectAll()
        .where('chain_id', '=', p.chain_id)
        .where('contract_address', '=', p.contract_address)
        .where('proposal_id', '=', p.on_chain_id)
        .where('canonical', '=', true)
        .execute();
      const creation = stored.find((e) => e.event_name === 'ProposalCreated');
      const from = creation
        ? BigInt(String(creation.block_number))
        : BigInt(this.config.get<string>('GOVERNANCE_DEPLOYMENT_BLOCK') ?? '0');
      let logs: any[] | null = null;
      try {
        const topics = [
          names.map((name) => this.abi.getEvent(name)!.topicHash),
          zeroPadValue(toBeHex(BigInt(p.on_chain_id)), 32),
        ];
        const ranges: Array<[bigint, bigint]> = [];
        for (
          let start = from;
          start <= BigInt(block) && ranges.length < 2000;
          start += 1000n
        )
          ranges.push([
            start,
            start + 999n < BigInt(block) ? start + 999n : BigInt(block),
          ]);
        const fullRange =
          !ranges.length || ranges[ranges.length - 1][1] === BigInt(block);
        let next = 0;
        const found: any[] = [];
        const deadline = performance.now() + 75_000;
        await Promise.all(
          Array.from({ length: Math.min(8, ranges.length) }, async () => {
            while (next < ranges.length) {
              if (performance.now() > deadline)
                throw new Error('Event scan deadline exceeded');
              const [start, end] = ranges[next++];
              const batch = await this.rpc('eth_getLogs', [
                {
                  address: p.contract_address,
                  fromBlock: '0x' + start.toString(16),
                  toBlock: '0x' + end.toString(16),
                  topics,
                },
              ]);
              if (!Array.isArray(batch))
                throw new Error('Invalid log response');
              found.push(...batch);
              if (found.length > 10_000)
                throw new Error('Event limit exceeded');
            }
          }),
        );
        logs = [
          ...new Map(
            found.map((log) => [`${log.transactionHash}:${log.logIndex}`, log]),
          ).values(),
        ];
        if (!Array.isArray(logs) || logs.length > 10_000)
          throw new Error('Event limit exceeded');
        report.events = logs.map((log) => {
          const decoded = this.abi.parseLog(log)!;
          const args = Object.fromEntries(
            decoded.fragment.inputs.map((input, i) => [
              input.name,
              typeof decoded.args[i] === 'bigint'
                ? decoded.args[i].toString()
                : decoded.args[i],
            ]),
          );
          return {
            name: decoded.name,
            args,
            transaction_hash: log.transactionHash,
            log_index: BigInt(log.logIndex).toString(),
            block_number: BigInt(log.blockNumber).toString(),
            block_hash: log.blockHash,
            status: 'verified',
          };
        });
        const key = (hash: string, index: string) =>
          `${hash.toLowerCase()}:${index}`;
        const eventMap = new Map(
          report.events.map((e) => [
            key(String(e.transaction_hash), String(e.log_index)),
            e,
          ]),
        );
        for (const row of stored) {
          const event = eventMap.get(
            key(row.transaction_hash, String(row.log_index)),
          );
          const same =
            !!event &&
            event.name === row.event_name &&
            event.block_hash === row.block_hash &&
            Object.entries(row.event_args as Record<string, unknown>).every(
              ([k, v]) =>
                String(
                  (event.args as Record<string, unknown>)[k],
                ).toLowerCase() === String(v).toLowerCase(),
            );
          report.comparisons.push({
            field: `governance_event:${row.evidence_id}`,
            database: row.event_name,
            blockchain: event ?? null,
            status: same ? 'verified' : 'mismatched',
          });
        }
        const verifiedCreation = report.events.some(
          (e) => e.name === 'ProposalCreated',
        );
        if (fullRange && verifiedCreation)
          compare(
            'governance_events.count',
            stored.length,
            report.events.length,
          );
        else
          report.comparisons.push({
            field: 'governance_events.historical_coverage',
            database: stored.length,
            blockchain: report.events.length,
            status: 'unverified',
            reason:
              'Historical scan incomplete or proposal creation not verified; maximum 2,000,000 blocks per request.',
          });
        for (const vote of votes) {
          const event = report.events.find(
            (e) =>
              e.name === 'VoteCast' &&
              e.transaction_hash === vote.transaction_hash &&
              String((e.args as any).voter).toLowerCase() ===
                vote.voter_address.toLowerCase(),
          );
          const matches =
            !!event &&
            String((event.args as any).optionIndex) ===
              String(vote.option_index) &&
            event.block_hash === vote.block_hash;
          report.comparisons.push({
            field: `vote:${vote.voter_address}`,
            database: {
              option: vote.option_index,
              transaction_hash: vote.transaction_hash,
            },
            blockchain: event ?? null,
            status: matches ? 'verified' : 'mismatched',
          });
        }
      } catch {
        report.errors.push('Governance logs could not be completely verified.');
        report.comparisons.push({
          field: 'governance_events',
          database: stored.length,
          blockchain: null,
          status: 'unavailable',
        });
      }
      const hashes = [
        ...new Set([
          ...stored.map((e) => e.transaction_hash),
          ...votes.map((v) => v.transaction_hash),
          ...report.events.map((e) => String(e.transaction_hash)),
        ]),
      ];
      if (hashes.length > 200)
        report.errors.push(
          'Transaction verification is limited to 200 proposal transactions. Remaining transactions are unverified.',
        );
      for (const hash of hashes.slice(0, 200)) {
        try {
          const [receipt, transaction] = await Promise.all([
            this.rpc('eth_getTransactionReceipt', [hash]),
            this.rpc('eth_getTransactionByHash', [hash]),
          ]);
          if (!receipt || !transaction) {
            report.transactions.push({ hash, status: 'unavailable' });
            report.errors.push('A proposal transaction or receipt is unavailable.');
            continue;
          }
          const matchingEvents = report.events.filter(
            (e) => e.transaction_hash === hash,
          );
          const ok =
            receipt &&
            transaction &&
            BigInt(receipt.status) === 1n &&
            String(receipt.to).toLowerCase() ===
              p.contract_address.toLowerCase() &&
            BigInt(receipt.blockNumber) <= BigInt(block) &&
            matchingEvents.every((e) => e.block_hash === receipt.blockHash);
          report.transactions.push({
            hash,
            block_number: receipt?.blockNumber
              ? BigInt(receipt.blockNumber).toString()
              : null,
            block_hash: receipt?.blockHash ?? null,
            from: transaction?.from ?? null,
            to: transaction?.to ?? null,
            status: ok ? 'verified' : 'mismatched',
          });
        } catch {
          report.transactions.push({ hash, status: 'unavailable' });
          report.errors.push('A proposal transaction receipt is unavailable.');
        }
      }
      const canonical = await this.rpc('eth_getBlockByNumber', [block, false]);
      if (canonical?.hash !== snapshot.hash) {
        report.errors.push(
          'Snapshot block changed during verification (possible chain reorganization).',
        );
        report.comparisons.forEach((c) => {
          c.status = 'unverified';
        });
        report.events.forEach((e) => {
          e.status = 'unverified';
        });
        report.transactions.forEach((t) => {
          t.status = 'unverified';
        });
        report.status = 'unverified';
      } else if (
        report.comparisons.some((c) => c.status === 'mismatched') ||
        report.transactions.some((t) => t.status === 'mismatched')
      )
        report.status = 'mismatched';
      else if (report.errors.length || !logs) report.status = 'unavailable';
      else if (report.comparisons.some((c) => c.status === 'unverified'))
        report.status = 'unverified';
      else report.status = 'verified';
    } catch {
      report.status = 'unavailable';
      report.errors.push(
        'RPC or contract read unavailable. No on-chain verification is claimed.',
      );
    }
    report.duration_ms = performance.now() - started;
    return report;
  }
}
