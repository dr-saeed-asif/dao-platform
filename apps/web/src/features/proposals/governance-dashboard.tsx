"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, type DashboardView } from "@/components/app-shell";
import {
  CopyableHash,
  CopyValueButton,
} from "@/components/copy-value-button";
import { ConnectWallet } from "@/features/wallet/connect-wallet";
import { useWallet } from "@/features/wallet/wallet-provider";
import { daoApi } from "@/lib/api/client";
import type { Assignment, Proposal, Vote } from "@/lib/api/types";
import { CreateProposalForm } from "./create-proposal-form";
import { ProposalWorkspace } from "./proposal-workspace";
import { TransactionDecoder } from "@/features/decoder/transaction-decoder";

interface IndexedAssignment extends Assignment {
  proposalTitle: string;
}
interface IndexedVote extends Vote {
  proposalTitle: string;
  optionLabel: string;
}
const adminAddress = (
  process.env.NEXT_PUBLIC_DAO_ADMIN_ADDRESS ??
  "0x43b30c380b465d4fe632cadb7bbf0be8ea53a04b"
).toLowerCase();
const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-5)}`;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function proposalStatus(proposal: Proposal, votes: IndexedVote[]) {
  if (proposal.status === "CANCELLED") return "Cancelled";
  if (proposal.status === "EXECUTED") return "Executed";
  const now = Date.now();
  if (!proposal.onChainId) return "Pending";
  if (now < Date.parse(proposal.startsAt)) return "Pending";
  if (now < Date.parse(proposal.endsAt)) return "Active";
  const proposalVotes = votes.filter((vote) => vote.proposalId === proposal.id);
  if (!proposalVotes.length) return "Voting Ended";
  const approve = proposalVotes.filter((vote) => vote.optionIndex === 0).length;
  const reject = proposalVotes.filter((vote) => vote.optionIndex === 1).length;
  return approve > reject ? "Approved" : "Rejected";
}

export function GovernanceDashboard() {
  const wallet = useWallet();
  const [active, setActive] = useState<DashboardView>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [assignments, setAssignments] = useState<IndexedAssignment[]>([]);
  const [votes, setVotes] = useState<IndexedVote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listed = (await daoApi.listProposals()).items;
      const records = await Promise.all(
        listed.map(async (proposal) => {
          const [members, proposalVotes] = await Promise.all([
            daoApi.listMembers(proposal.id),
            daoApi.listVotes(proposal.id),
          ]);
          return {
            members: members.map((member) => ({
              ...member,
              proposalTitle: proposal.title,
            })),
            votes: proposalVotes.map((vote) => ({
              ...vote,
              proposalTitle: proposal.title,
              optionLabel:
                proposal.options.find(
                  (option) => option.index === vote.optionIndex,
                )?.label ?? `Option ${vote.optionIndex}`,
            })),
          };
        }),
      );
      setProposals(listed);
      setAssignments(records.flatMap((record) => record.members));
      setVotes(records.flatMap((record) => record.votes));
      setSelectedId((current) => current ?? listed[0]?.id ?? null);
      setError(null);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Unable to load governance data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (wallet.address) void load();
  }, [load, wallet.address]);
  const role =
    wallet.address?.toLowerCase() === adminAddress ? "Admin" : "Member";
  const selected = proposals.find((proposal) => proposal.id === selectedId);
  const uniqueMembers = new Set(assignments.map((item) => item.walletAddress))
    .size;
  const myVotes = votes.filter(
    (vote) => vote.voterAddress.toLowerCase() === wallet.address?.toLowerCase(),
  );
  const activeCount = proposals.filter(
    (proposal) => proposalStatus(proposal, votes) === "Active",
  ).length;

  if (wallet.restoring) return <WalletRestoring />;
  if (!wallet.connection) return <WalletGate />;

  return (
    <AppShell
      active={active}
      onNavigate={setActive}
      collapsed={collapsed}
      onToggle={() => setCollapsed((value) => !value)}
    >
      <div className="page-heading">
        <div>
          <span className="eyebrow">CyberChain governance</span>
          <h1>{titleFor(active)}</h1>
          <p>{subtitleFor(active, role)}</p>
        </div>
        <div className={`role-badge role-${role.toLowerCase()}`}>{role}</div>
      </div>
      {error && (
        <div className="alert alert-error">
          <strong>Could not load dashboard</strong>
          <span>{error}</span>
          <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {active === "dashboard" && (
            <DashboardView
              proposals={proposals}
              votes={votes}
              members={uniqueMembers}
              activeCount={activeCount}
              onOpen={(id) => {
                setSelectedId(id);
                setActive("proposals");
              }}
              canAdmin={role === "Admin"}
              onSync={load}
            />
          )}
          {active === "members" && (
            <MembersView assignments={assignments} votes={votes} />
          )}
          {active === "proposals" && (
            <ProposalsView
              proposals={proposals}
              votes={votes}
              selected={selected}
              onSelect={setSelectedId}
              onChanged={load}
              canAdmin={role === "Admin"}
            />
          )}
          {active === "votes" && <VotesView votes={votes} />}
          {active === "my-votes" && (
            <VotesView
              votes={myVotes}
              mine
              emptyMessage={
                wallet.address
                  ? "You have not voted yet."
                  : "Connect your wallet to see your votes."
              }
            />
          )}
          {active === "decoder" && <TransactionDecoder proposals={proposals} />}
          {active === "wallet" && <WalletView role={role} />}
          {active === "settings" && <SettingsView />}
        </>
      )}
    </AppShell>
  );
}

function DashboardView({
  proposals,
  votes,
  members,
  activeCount,
  onOpen,
  canAdmin,
  onSync,
}: {
  proposals: Proposal[];
  votes: IndexedVote[];
  members: number;
  activeCount: number;
  onOpen(id: string): void;
  canAdmin: boolean;
  onSync(): Promise<void>;
}) {
  const { address } = useWallet();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  async function synchronize(full = false) {
    if (!address) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      await daoApi.syncGovernance(address, full);
      await onSync();
      setSyncMessage(full ? "Full governance history rebuilt from the deployment block." : "New on-chain governance activity synchronized into the local database.");
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Synchronization failed.",
      );
    } finally {
      setSyncing(false);
    }
  }
  async function clearLocalData() {
    if (!address) return;
    if (
      !window.confirm(
        "Delete every local proposal, assignment, vote and transaction from SQLite? CyberChain will not be changed.",
      )
    )
      return;
    if (
      window.prompt(
        'Type DELETE LOCAL DATA to confirm. Confirmed records remain recoverable with "Full reindex".',
      ) !== "DELETE LOCAL DATA"
    )
      return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      await daoApi.clearGovernanceData(address);
      await onSync();
      setSyncMessage(
        'Local SQLite governance data deleted. Click "Full reindex" to rebuild it from CyberChain.',
      );
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Local data deletion failed.",
      );
    } finally {
      setSyncing(false);
    }
  }
  return (
    <>
      <div className="metric-grid">
        <Metric
          label="Total proposals"
          value={proposals.length}
          icon="▤"
          tone="blue"
        />
        <Metric label="Active votes" value={activeCount} icon="✓" tone="cyan" />
        <Metric
          label="Eligible members"
          value={members}
          icon="♙"
          tone="violet"
        />
        <Metric
          label="Votes recorded"
          value={votes.length}
          icon="◎"
          tone="green"
        />
      </div>
      <section className="dashboard-card">
        <div className="card-header">
          <div>
            <h2>Recent proposals</h2>
            <p>Live governance activity indexed from CyberChain</p>
          </div>
          {/* {canAdmin && (
            <button
              className="button button-secondary"
              disabled={syncing}
              onClick={() => void synchronize(false)}
            >
              {syncing ? "Synchronizing…" : "Sync blockchain data"}
            </button>
          )} */}
          {canAdmin && (
            <button
              className="button button-secondary"
              disabled={syncing}
              onClick={() => {
                if (window.confirm("Replay all governance events from the contract deployment block?")) void synchronize(true);
              }}
            >
              Full reindex
            </button>
          )}
          {canAdmin && (
            <button
              className="button button-danger"
              disabled={syncing}
              onClick={() => void clearLocalData()}
            >
              Delete local data
            </button>
          )}
        </div>
        {syncMessage && <p className="form-message">{syncMessage}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Status</th>
                <th>Voting period</th>
                <th>Votes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {proposals.slice(0, 6).map((proposal) => (
                <tr key={proposal.id}>
                  <td>
                    <strong>{proposal.title}</strong>
                    <small>
                      #{proposal.onChainId ?? "draft"} ·{" "}
                      {proposal.type.replaceAll("_", " ")}
                    </small>
                  </td>
                  <td>
                    <StatusBadge status={proposalStatus(proposal, votes)} />
                  </td>
                  <td>{formatDate(proposal.endsAt)}</td>
                  <td>
                    {
                      votes.filter((vote) => vote.proposalId === proposal.id)
                        .length
                    }
                  </td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() => onOpen(proposal.id)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!proposals.length && (
          <EmptyState
            title="No proposals yet"
            copy="Create the first proposal to start governing."
          />
        )}
      </section>
    </>
  );
}

function WalletGate() {
  return (
    <main className="wallet-gate">
      <section className="wallet-gate-card">
        <span className="brand-symbol">C</span>
        <span className="eyebrow">CyberChain governance</span>
        <h1>Connect your wallet to enter CyberDAO</h1>
        <p>
          Your connected address determines your DAO role and permissions. The
          administrator wallet can manage proposals, members, voting, audit
          activity, and blockchain synchronization.
        </p>
        <ConnectWallet />
        <small>CyberChain network · Chain ID 1212</small>
      </section>
    </main>
  );
}

function WalletRestoring() {
  return (
    <main className="wallet-gate">
      <section className="wallet-gate-card">
        <span className="brand-symbol">C</span>
        <h1>Restoring wallet session</h1>
        <p>Checking your existing CyberDAO wallet connection…</p>
      </section>
    </main>
  );
}

function ProposalsView({
  proposals,
  votes,
  selected,
  onSelect,
  onChanged,
  canAdmin,
}: {
  proposals: Proposal[];
  votes: IndexedVote[];
  selected?: Proposal;
  onSelect(id: string): void;
  onChanged(): void;
  canAdmin: boolean;
}) {
  return (
    <div className="view-stack">
      <section className="dashboard-card">
        <div className="card-header">
          <div>
            <h2>All proposals</h2>
            <p>Select a proposal to manage eligibility and voting.</p>
          </div>
        </div>
        <div className="proposal-card-grid">
          {proposals.map((proposal) => (
            <button
              key={proposal.id}
              className={
                selected?.id === proposal.id
                  ? "governance-proposal selected"
                  : "governance-proposal"
              }
              onClick={() => onSelect(proposal.id)}
            >
              <div>
                <StatusBadge status={proposalStatus(proposal, votes)} />
                <span>#{proposal.onChainId ?? "draft"}</span>
              </div>
              <h3>{proposal.title}</h3>
              <p>{proposal.purpose}</p>
              <footer>
                <span>{proposal.options.length} options</span>
                <span>Ends {formatDate(proposal.endsAt)}</span>
              </footer>
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <ProposalWorkspace
          proposal={selected}
          onChanged={onChanged}
          canAdmin={canAdmin}
        />
      )}
      {canAdmin && <CreateProposalForm onCreated={onChanged} />}
    </div>
  );
}

function MembersView({
  assignments,
  votes,
}: {
  assignments: IndexedAssignment[];
  votes: IndexedVote[];
}) {
  const members = Array.from(
    assignments.reduce((grouped, assignment) => {
      const address = assignment.walletAddress.toLowerCase();
      const existing = grouped.get(address) ?? [];
      existing.push(assignment);
      grouped.set(address, existing);
      return grouped;
    }, new Map<string, IndexedAssignment[]>()),
  ).map(([walletAddress, memberAssignments]) => ({
    walletAddress,
    assignments: memberAssignments,
    votes: votes.filter(
      (vote) => vote.voterAddress.toLowerCase() === walletAddress,
    ),
  }));
  const explorerBase =
    process.env.NEXT_PUBLIC_CYBERCHAIN_EXPLORER_URL ??
    "https://cyberchain.bisite.es";

  return (
    <section className="dashboard-card">
      <div className="card-header">
        <div>
          <h2>Proposal eligibility</h2>
          <p>
            Membership is scoped to each on-chain proposal by the deployed
            contract.
          </p>
        </div>
        <span className="info-chip">
          {new Set(assignments.map((item) => item.walletAddress)).size} unique
          wallets
        </span>
      </div>
      <div className="member-directory">
        {members.map((member) => (
          <article className="member-directory-card" key={member.walletAddress}>
            <div className="member-wallet-header">
              <div>
                <span>Member wallet address</span>
                <code>{member.walletAddress}</code>
              </div>
              <div className="member-wallet-actions">
                <CopyValueButton
                  value={member.walletAddress}
                  label="Copy wallet address"
                />
                <a
                  className="wallet-view-link"
                  href={`${explorerBase}/accounts/${member.walletAddress}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on explorer ↗
                </a>
              </div>
            </div>
            <details className="member-participation">
              <summary>
                <span>
                  Assigned to {member.assignments.length} proposal
                  {member.assignments.length === 1 ? "" : "s"}
                </span>
                <span>
                  Participated in {member.votes.length}
                </span>
              </summary>
              <div className="member-proposal-list">
                {member.assignments.map((assignment) => {
                  const vote = member.votes.find(
                    (item) => item.proposalId === assignment.proposalId,
                  );
                  return (
                    <div
                      className="member-proposal-row"
                      key={`${member.walletAddress}-${assignment.proposalId}`}
                    >
                      <div>
                        <strong>{assignment.proposalTitle}</strong>
                        <small>
                          Assigned {formatDate(assignment.assignedAt)}
                        </small>
                      </div>
                      <span
                        className={
                          vote
                            ? "member-participation-status voted"
                            : "member-participation-status"
                        }
                      >
                        {vote ? `Voted: ${vote.optionLabel}` : "Assigned only"}
                      </span>
                      <CopyableHash
                        value={
                          vote?.transactionHash ?? assignment.transactionHash
                        }
                        display={short(
                          vote?.transactionHash ??
                            assignment.transactionHash,
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          </article>
        ))}
      </div>
      {!assignments.length && (
        <EmptyState
          title="No eligible members"
          copy="Open a published proposal to assign its voting members."
        />
      )}
    </section>
  );
}

function VotesView({
  votes,
  mine = false,
  emptyMessage = "No votes have been indexed yet.",
}: {
  votes: IndexedVote[];
  mine?: boolean;
  emptyMessage?: string;
}) {
  return (
    <section className="dashboard-card">
      <div className="card-header">
        <div>
          <h2>{mine ? "My voting history" : "Voting activity"}</h2>
          <p>
            Confirmed on-chain ballots with auditable transaction references.
          </p>
        </div>
        <span className="info-chip">{votes.length} confirmed</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Proposal</th>
              <th>Voter</th>
              <th>Selection</th>
              <th>Block</th>
              <th>Transaction</th>
              <th>Confirmed</th>
            </tr>
          </thead>
          <tbody>
            {votes.map((vote) => (
              <tr key={vote.transactionHash}>
                <td>
                  <strong>{vote.proposalTitle}</strong>
                </td>
                <td>
                  <code>{short(vote.voterAddress)}</code>
                </td>
                <td>
                  <span className="vote-choice">{vote.optionLabel}</span>
                </td>
                <td>{vote.blockNumber}</td>
                <td>
                  <CopyableHash
                    value={vote.transactionHash}
                    display={short(vote.transactionHash)}
                  />
                </td>
                <td>{formatDate(vote.confirmedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!votes.length && (
        <EmptyState title="Nothing to show" copy={emptyMessage} />
      )}
    </section>
  );
}

function WalletView({ role }: { role: string }) {
  return (
    <div className="settings-grid">
      <section className="dashboard-card padded">
        <div className="card-header">
          <div>
            <h2>Connected wallet</h2>
            <p>Your signing identity and CyberChain connection.</p>
          </div>
        </div>
        <ConnectWallet expanded />
      </section>
      <section className="dashboard-card padded">
        <h2>Permissions</h2>
        <div className="permission-list">
          <span>
            <b>Role</b>
            <strong>{role}</strong>
          </span>
          <span>
            <b>Network</b>
            <strong>CyberChain · 1212</strong>
          </span>
          <span>
            <b>Transaction signing</b>
            <strong>Wallet controlled</strong>
          </span>
          <span>
            <b>Private key custody</b>
            <strong>Never shared</strong>
          </span>
        </div>
      </section>
    </div>
  );
}
function SettingsView() {
  return (
    <div className="settings-grid">
      <section className="dashboard-card padded">
        <h2>Network configuration</h2>
        <div className="permission-list">
          <span>
            <b>DAO API</b>
            <code>/api/v1</code>
          </span>
          <span>
            <b>Chain ID</b>
            <code>1212</code>
          </span>
          <span>
            <b>Indexer</b>
            <strong>30-second incremental sync</strong>
          </span>
          <span>
            <b>Database</b>
            <strong>SQLite local read model</strong>
          </span>
        </div>
      </section>
      <section className="dashboard-card padded">
        <h2>Contract capabilities</h2>
        <div className="capability-list">
          <span className="supported">✓ Create and cancel proposals</span>
          <span className="supported">✓ Assign proposal members</span>
          <span className="supported">✓ Vote and finalize results</span>
          <span className="unsupported">
            — Arbitrary proposal execution is not in contract v1
          </span>
          <span className="unsupported">
            — Global member activation is not in contract v1
          </span>
        </div>
      </section>
    </div>
  );
}
function Metric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: string;
  tone: string;
}) {
  return (
    <div className="metric-card">
      <span className={`metric-icon ${tone}`}>{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      <small>Live</small>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`governance-status status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}
function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="table-empty">
      <span>◇</span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}
function LoadingState() {
  return (
    <div className="metric-grid">
      {[1, 2, 3, 4].map((item) => (
        <div className="metric-card skeleton" key={item} />
      ))}
    </div>
  );
}
function titleFor(view: DashboardView) {
  return {
    dashboard: "Governance overview",
    members: "DAO members",
    proposals: "Proposals",
    votes: "All votes",
    "my-votes": "My votes",
    decoder: "Transaction decoder",
    wallet: "Wallet",
    settings: "Settings",
  }[view];
}
function subtitleFor(view: DashboardView, role: string) {
  if (view === "decoder")
    return "Decode CyberChain calldata, receipts and governance events with the contract ABI.";
  return view === "dashboard"
    ? `Welcome back. You are connected as ${role}.`
    : "Transparent, on-chain governance with a fast indexed read model.";
}
