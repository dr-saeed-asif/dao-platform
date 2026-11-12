import { GOVERNANCE_INDEXER_VERSION } from '../database/governance-indexer-version';
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
import { ProposalStatus } from '@dao-platform/domain';

type ContractState = 'Pending' | 'Active' | 'Closed' | 'Cancelled';
export const DATABASE_STATE_MAP = {
  DRAFT: null,
  PENDING: null,
  PENDING_ON_CHAIN: null,
  FAILED: null,
  ACTIVE: 'Active',
  VOTING_OPEN: 'Active',
  VOTING_CLOSED: 'Closed',
  CLOSED: 'Closed',
  EXECUTED: null,
  FINALIZED: 'Closed',
  CANCELLED: 'Cancelled',
} as const satisfies Record<
  ProposalStatus | 'PENDING' | 'FINALIZED' | 'VOTING_OPEN',
  ContractState | null
>;

interface IndexerCheckpoint {
  indexer_name: string;
  indexer_version: string;
  status:
    'current' | 'lagging' | 'ahead' | 'missing' | 'invalid' | 'unavailable';
  processed_block_number?: string;
  processed_block_hash?: string | null;
  lag_blocks?: string;
  updated_at?: string;
  reason: string;
}

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
  event_scan?: {
    from_block: string;
    target_block: string;
    page_size: number;
    completed_ranges: number;
    scanned_through?: string;
    next_block?: string;
    status: 'complete' | 'partial' | 'unavailable';
    reason?: string;
  };
  indexer_checkpoint?: IndexerCheckpoint;
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
          local == null || live == null
            ? 'unverified'
            : String(local).toLowerCase() === String(live).toLowerCase()
              ? 'verified'
              : 'mismatched',
        ...(reason
          ? { reason }
          : local == null
            ? {
                reason:
                  'Database value is missing; the on-chain value was read successfully.',
              }
            : {}),
      });
    if (p.on_chain_id == null) {
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
      if (
        !snapshot?.hash ||
        snapshot.number == null ||
        BigInt(snapshot.number) !== BigInt(block)
      )
        throw new Error('Snapshot block unavailable or inconsistent');
      report.block_number = BigInt(block).toString();
      report.block_hash = snapshot.hash;
      const checkpoint: IndexerCheckpoint = {
        indexer_name: 'governance-full',
        indexer_version: GOVERNANCE_INDEXER_VERSION,
        status: 'missing',
        reason: 'No checkpoint for this chain, contract and indexer version.',
      };
      report.indexer_checkpoint = checkpoint;
      try {
        const row = await db
          .selectFrom('indexer_checkpoints')
          .selectAll()
          .where('chain_id', '=', p.chain_id)
          .where('contract_address', '=', p.contract_address)
          .where('indexer_name', '=', 'governance-full')
          .where('indexer_version', '=', GOVERNANCE_INDEXER_VERSION)
          .executeTakeFirst();
        if (row) {
          const height = String(row.processed_block_number);
          checkpoint.status = 'invalid';
          checkpoint.reason = 'Invalid checkpoint height or hash.';
          if (/^(0|[1-9][0-9]*)$/.test(height)) {
            checkpoint.processed_block_number = height;
            if (row.updated_at != null) {
              const updated = new Date(row.updated_at);
              if (Number.isFinite(updated.getTime()))
                checkpoint.updated_at = updated.toISOString();
            }
            checkpoint.processed_block_hash = row.processed_block_hash;
            const delta = BigInt(block) - BigInt(height);
            checkpoint.lag_blocks = delta.toString();
            checkpoint.status =
              delta < 0n ? 'ahead' : delta > 0n ? 'lagging' : 'current';
            checkpoint.reason =
              delta < 0n
                ? 'SQL is newer than the pinned block; historical SQL is unavailable.'
                : delta > 0n
                  ? 'Indexer has not covered the pinned block.'
                  : 'Indexer scan height equals the pinned block; this does not establish event completeness.';
            if (row.processed_block_hash != null) {
              const anchor =
                delta === 0n
                  ? snapshot
                  : await this.rpc('eth_getBlockByNumber', [
                      toBeHex(BigInt(height)),
                      false,
                    ]);
              if (
                !/^0x[0-9a-f]{64}$/i.test(row.processed_block_hash) ||
                !anchor?.hash ||
                anchor.number == null ||
                BigInt(anchor.number) !== BigInt(height) ||
                anchor.hash.toLowerCase() !==
                  row.processed_block_hash.toLowerCase()
              ) {
                checkpoint.status = 'invalid';
                checkpoint.reason =
                  'Checkpoint hash is invalid or differs from the canonical chain.';
              }
            } else
              checkpoint.reason +=
                ' Checkpoint hash not recorded; canonical anchoring unavailable.';
          }
        }
      } catch {
        checkpoint.status = 'unavailable';
        checkpoint.reason = 'Checkpoint query or canonical block read failed.';
      }
      report.comparisons.push({
        field: 'indexer_checkpoint',
        database: checkpoint,
        blockchain: report.block_number,
        status: checkpoint.status === 'current' ? 'verified' : 'unverified',
        reason: checkpoint.reason,
      });
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
      const key = p.status as keyof typeof DATABASE_STATE_MAP;
      let localState: ContractState | null = Object.hasOwn(
        DATABASE_STATE_MAP,
        key,
      )
        ? DATABASE_STATE_MAP[key]
        : null;
      // Publication persists ACTIVE even for scheduled proposals. Derive the
      // temporal state using SQL times and the pinned chain clock.
      if (key === 'ACTIVE' || key === 'VOTING_OPEN') {
        const now =
          snapshot.timestamp == null ? NaN : Number(BigInt(snapshot.timestamp));
        const start = new Date(p.starts_at).getTime() / 1000;
        const end = new Date(p.ends_at).getTime() / 1000;
        localState =
          Number.isFinite(now) &&
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          end > start
            ? now < start
              ? 'Pending'
              : now < end
                ? 'Active'
                : 'Closed'
            : null;
      }
      if (localState == null)
        report.comparisons.push({
          field: 'voting_status',
          database: p.status,
          blockchain: state,
          status: 'unverified',
          reason:
            'Unknown, unsupported or unpublished SQL status, or missing pinned clock; no contract state inferred.',
        });
      else compare('voting_status', localState, state);
      compare('metadata_hash', p.metadata_hash, live.metadataHash);
      compare('metadata_uri', p.metadata_uri, live.metadataURI);
      compare(
        'starts_at',
        Math.floor(new Date(p.starts_at).getTime() / 1000).toString(),
        live.startsAt,
      );
      compare(
        'ends_at',
        Math.floor(new Date(p.ends_at).getTime() / 1000).toString(),
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
      const assignments = await db
        .selectFrom('proposal_assignments')
        .selectAll()
        .where('proposal_id', '=', id)
        .where('assigned', '=', true)
        .execute();
      compare(
        'public.proposal_assignments.count',
        assignments.length,
        live.assignedMemberCount,
      );
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
        const pageSize = 1000n;
        const target = BigInt(block);
        const maxPages = 5000;
        const progress: NonNullable<VerificationReport['event_scan']> = {
          from_block: from.toString(),
          target_block: target.toString(),
          page_size: Number(pageSize),
          completed_ranges: 0,
          next_block: from.toString(),
          status: 'partial',
        };
        report.event_scan = progress;
        if (from < 0n || from > target)
          throw new Error('Invalid event scan bounds');
        const deadline = performance.now() + 75_000;
        const found = new Map<string, any>();
        let cursor = from;
        while (cursor <= target && progress.completed_ranges < maxPages) {
          if (performance.now() >= deadline) {
            progress.reason = 'Event scan time budget exhausted.';
            break;
          }
          const window: Array<[bigint, bigint]> = [];
          for (
            let start = cursor;
            start <= target &&
            window.length < 8 &&
            progress.completed_ranges + window.length < maxPages;
            start += pageSize
          ) {
            const end = start + pageSize - 1n;
            window.push([start, end < target ? end : target]);
          }
          const pages = await Promise.allSettled(
            window.map(async ([start, end]) => {
              const batch = await this.rpc('eth_getLogs', [
                {
                  address: p.contract_address,
                  fromBlock: '0x' + start.toString(16),
                  toBlock: '0x' + end.toString(16),
                  topics,
                },
              ]);
              if (!Array.isArray(batch) || batch.length > 10_000)
                throw new Error('Invalid or oversized log page');
              for (const log of batch) {
                if (
                  log?.removed ||
                  log?.blockNumber == null ||
                  log?.logIndex == null ||
                  !/^0x[0-9a-f]{64}$/i.test(log.transactionHash) ||
                  !/^0x[0-9a-f]{64}$/i.test(log.blockHash) ||
                  BigInt(log.blockNumber) < start ||
                  BigInt(log.blockNumber) > end ||
                  BigInt(log.logIndex) < 0n ||
                  (log.address != null &&
                    String(log.address).toLowerCase() !==
                      p.contract_address.toLowerCase()) ||
                  log.topics?.[1]?.toLowerCase() !== String(topics[1]).toLowerCase() ||
                  !this.abi.parseLog(log)
                )
                  throw new Error('Invalid event in log page');
              }
              return batch;
            }),
          );
          for (const [i, page] of pages.entries()) {
            if (page.status === 'rejected') {
              progress.reason =
                'A required RPC log range failed or returned invalid data.';
              throw new Error(progress.reason);
            }
            for (const log of page.value) {
              const key = `${log.transactionHash.toLowerCase()}:${BigInt(log.logIndex)}`;
              const previous = found.get(key);
              if (
                previous &&
                (previous.blockHash !== log.blockHash ||
                  previous.blockNumber !== log.blockNumber ||
                  previous.data !== log.data ||
                  JSON.stringify(previous.topics) !==
                    JSON.stringify(log.topics))
              )
                throw new Error('Conflicting duplicate log');
              found.set(key, log);
              if (found.size > 10_000)
                throw new Error('Event scan record budget exhausted');
            }
            cursor = window[i][1] + 1n;
            progress.completed_ranges++;
            progress.scanned_through = (cursor - 1n).toString();
            progress.next_block = cursor.toString();
          }
        }
        const fullRange = cursor > target;
        if (fullRange) {
          progress.status = 'complete';
          delete progress.next_block;
        } else {
          progress.reason ??= 'Event scan page budget exhausted.';
        }
        logs = [...found.values()].sort(
          (a, b) =>
            Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) ||
            Number(BigInt(a.logIndex) - BigInt(b.logIndex)),
        );
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
        const storedKeys = new Set(
          stored.map((row) => key(row.transaction_hash, String(row.log_index))),
        );
        const scannedThrough =
          progress.scanned_through == null
            ? undefined
            : BigInt(progress.scanned_through);
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
            database: {
              name: row.event_name,
              transaction_hash: row.transaction_hash,
              log_index: String(row.log_index),
              block_number: String(row.block_number),
              block_hash: row.block_hash,
              args: row.event_args,
            },
            blockchain: event ?? null,
            status: same
              ? 'verified'
              : event ||
                  (scannedThrough !== undefined &&
                    BigInt(String(row.block_number)) >= from &&
                    BigInt(String(row.block_number)) <= scannedThrough)
                ? 'mismatched'
                : 'unverified',
          });
        }
        for (const event of report.events) {
          const eventKey = key(
            String(event.transaction_hash),
            String(event.log_index),
          );
          if (!storedKeys.has(eventKey)) {
            report.comparisons.push({
              field: `governance_event:${eventKey}`,
              database: null,
              blockchain: event,
              status:
                (checkpoint.status === 'current' ||
                  checkpoint.status === 'lagging') &&
                BigInt(String(event.block_number)) <=
                  BigInt(checkpoint.processed_block_number!)
                  ? 'mismatched'
                  : 'unverified',
              reason:
                'Chain event has no indexed counterpart. A discrepancy requires validated checkpoint coverage.',
            });
          }
        }
        const verifiedCreation = report.events.some(
          (e) => e.name === 'ProposalCreated',
        );
        if (
          fullRange &&
          verifiedCreation &&
          (checkpoint.status === 'current' || checkpoint.status === 'lagging')
        ) {
          const covered =
            BigInt(checkpoint.processed_block_number!) < BigInt(block)
              ? BigInt(checkpoint.processed_block_number!)
              : BigInt(block);
          compare(
            'governance_events.count',
            stored.filter(
              (e) =>
                BigInt(String(e.block_number)) >= from &&
                BigInt(String(e.block_number)) <= covered,
            ).length,
            report.events.filter(
              (e) => BigInt(String(e.block_number)) <= covered,
            ).length,
            'Only the fully scanned, checkpoint-covered interval is compared.',
          );
          if (checkpoint.status === 'lagging') {
            const pending = report.events.filter(
              (e) =>
                BigInt(String(e.block_number)) > covered &&
                !storedKeys.has(
                  key(String(e.transaction_hash), String(e.log_index)),
                ),
            );
            const deltas: Record<string, number> = {
              'public.votes.count': pending.filter((e) => e.name === 'VoteCast')
                .length,
              'public.proposals.total_votes': pending.filter(
                (e) => e.name === 'VoteCast',
              ).length,
              'public.proposal_assignments.count':
                pending.filter((e) => e.name === 'MemberAssigned').length -
                pending.filter((e) => e.name === 'MemberUnassigned').length,
            };
            report.vote_counts.forEach((_, i) => {
              deltas[`option_${i}_vote_count`] = pending.filter(
                (e) =>
                  e.name === 'VoteCast' &&
                  String((e.args as Record<string, unknown>).optionIndex) ===
                    String(i),
              ).length;
            });
            for (const comparison of report.comparisons) {
              const delta = deltas[comparison.field];
              // Do not blanket suppress mismatches when an indexer lags. Only
              // an exact, independently observed event delta explains a count.
              if (
                comparison.status === 'mismatched' &&
                delta != null &&
                delta !== 0 &&
                BigInt(String(comparison.blockchain)) -
                  BigInt(String(comparison.database)) ===
                  BigInt(delta)
              ) {
                comparison.status = 'unverified';
                comparison.reason =
                  'Exact count difference explained by canonical events after the indexer checkpoint; indexing lag, not proven divergence.';
              }
            }
          }
        } else
          report.comparisons.push({
            field: 'governance_events.historical_coverage',
            database: stored.length,
            blockchain: report.events.length,
            status: 'unverified',
            reason:
              'Historical scan incomplete, creation not verified, or checkpoint missing/invalid/ahead; consult event_scan for bounded coverage and the first unchecked block.',
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
            status: matches
              ? 'verified'
              : event ||
                  (scannedThrough !== undefined &&
                    BigInt(String(vote.block_number)) >= from &&
                    BigInt(String(vote.block_number)) <= scannedThrough)
                ? 'mismatched'
                : 'unverified',
          });
        }
      } catch {
        if (report.event_scan) {
          report.event_scan.status = 'unavailable';
          report.event_scan.reason ??=
            'The event scan could not validate the returned log data.';
        }
        logs = null;
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
            report.errors.push(
              'A proposal transaction or receipt is unavailable.',
            );
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
