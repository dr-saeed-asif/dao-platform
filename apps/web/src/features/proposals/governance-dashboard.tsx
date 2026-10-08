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
import { formatLocalDateTime as formatDate } from "@/lib/date-time";
import { CreateProposalWizard } from "./create-proposal-form";
import { ProposalDetails } from "./proposal-details";
import { TransactionDecoder } from "@/features/decoder/transaction-decoder";
import { AiPanel } from "@/features/ai/ai-panel";

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
  const [active, setActive] = useState<DashboardView>("proposals");
  const [collapsed, setCollapsed] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [assignments, setAssignments] = useState<IndexedAssignment[]>([]);
  const [votes, setVotes] = useState<IndexedVote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposalScreen, setProposalScreen] = useState<
    "list" | "details" | "create"
  >("list");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Backward compatibility: the old Dashboard tab now shows Proposals.
  useEffect(() => {
    if (active === "dashboard") setActive("proposals");
  }, [active]);
  const [votesTab, setVotesTab] = useState<"all" | "mine">("all");
  // Backward compatibility: the old My Votes entry opens Votes preselected.
  useEffect(() => {
    if (active === "my-votes") {
      setActive("votes");
      setVotesTab("mine");
    }
  }, [active]);
  const [settingsTab, setSettingsTab] = useState<
    "general" | "wallet" | "contract"
  >("general");
  // Backward compatibility: the old Wallet entry opens Settings preselected.
  useEffect(() => {
    if (active === "wallet") {
      setActive("settings");
      setSettingsTab("wallet");
    }
  }, [active]);
  function navigate(view: DashboardView) {
    setActive(view);
    if (view === "proposals") setProposalScreen("list");
    if (view === "votes") setVotesTab("all");
    if (view === "settings") setSettingsTab("general");
  }
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

  const isProposals = active === "proposals" || active === "dashboard";
  const showHero = !isProposals || proposalScreen === "list";

  return (
    <AppShell
      active={active}
      onNavigate={navigate}
      collapsed={collapsed}
      onToggle={() => setCollapsed((value) => !value)}
    >
      {showHero && (
        <div className="page-heading">
          <div>
            <span className="eyebrow">CyberChain governance</span>
            <h1>{titleFor(active)}</h1>
            <p>{subtitleFor(active)}</p>
          </div>
          <div className="ref-hero-actions">
            {isProposals && (
              <button
                className="btn-create"
                onClick={() => {
                  if (active !== "proposals") setActive("proposals");
                  setProposalScreen("create");
                }}
              >
                <span className="plus">+</span> Create Proposal
              </button>
            )}
          </div>
        </div>
      )}
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
          {isProposals && proposalScreen === "list" && (
            <ProposalsListView
              proposals={proposals}
              votes={votes}
              members={uniqueMembers}
              activeCount={activeCount}
              onOpen={(id) => {
                setSelectedId(id);
                setProposalScreen("details");
              }}
              canAdmin={role === "Admin"}
              onSync={load}
            />
          )}
          {isProposals && proposalScreen === "details" && selected && (
            <ProposalDetails
              proposal={selected}
              status={proposalStatus(selected, votes)}
              votesCount={
                votes.filter((vote) => vote.proposalId === selected.id).length
              }
              onChanged={load}
              canAdmin={role === "Admin"}
              onBack={() => setProposalScreen("list")}
            />
          )}
          {isProposals && proposalScreen === "details" && !selected && (
            <ProposalsListView
              proposals={proposals}
              votes={votes}
              members={uniqueMembers}
              activeCount={activeCount}
              onOpen={(id) => {
                setSelectedId(id);
                setProposalScreen("details");
              }}
              canAdmin={role === "Admin"}
              onSync={load}
            />
          )}
          {isProposals && proposalScreen === "create" && (
            <CreateProposalWizard
              onCreated={() => {
                void load().then(() => setProposalScreen("list"));
              }}
              onCancel={() => setProposalScreen("list")}
              canAdmin={role === "Admin"}
            />
          )}
          {active === "members" && (
            <MembersView assignments={assignments} votes={votes} />
          )}
          {(active === "votes" || active === "my-votes") && (
            <UnifiedVotesView
              votes={votes}
              myVotes={myVotes}
              tab={active === "my-votes" ? "mine" : votesTab}
              onTabChange={setVotesTab}
              connected={Boolean(wallet.address)}
            />
          )}
{active === "decoder" && <TransactionDecoder proposals={proposals} />}
      {(active === "settings" || active === "wallet") && (
        <SettingsPage
          tab={active === "wallet" ? "wallet" : settingsTab}
          onTabChange={setSettingsTab}
          role={role}
        />
      )}
      {active === "ai" && <AiPanel proposals={proposals} selectedProposalId={selectedId ?? undefined} />}
        </>
      )}
    </AppShell>
  );
}

function ProposalsListView({
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
      <StatsRow
        proposals={proposals}
        votes={votes}
        members={members}
        activeCount={activeCount}
      />
      {canAdmin && (
        <section className="dashboard-card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div>
              <h2 style={{ fontSize: 18 }}>Blockchain sync</h2>
              <p>Manual maintenance for the local indexed read model</p>
            </div>
            <div className="table-toolbar">
              <button
                className="button button-secondary"
                disabled={syncing}
                onClick={() => {
                  if (
                    window.confirm(
                      "Replay all governance events from the contract deployment block?",
                    )
                  )
                    void synchronize(true);
                }}
              >
                Full reindex
              </button>
              <button
                className="button button-danger"
                disabled={syncing}
                onClick={() => void clearLocalData()}
              >
                Delete local data
              </button>
            </div>
          </div>
          {syncMessage && (
            <p className="form-message" style={{ padding: "0 24px 16px" }}>
              {syncMessage}
            </p>
          )}
        </section>
      )}
      {!canAdmin && syncMessage && <p className="form-message">{syncMessage}</p>}
      <ProposalsTable proposals={proposals} votes={votes} onOpen={onOpen} />
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

function UnifiedVotesView({
  votes,
  myVotes,
  tab,
  onTabChange,
  connected,
}: {
  votes: IndexedVote[];
  myVotes: IndexedVote[];
  tab: "all" | "mine";
  onTabChange(tab: "all" | "mine"): void;
  connected: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState("All");
  const source = tab === "mine" ? myVotes : votes;
  const selections = ["All", ...Array.from(new Set(votes.map((vote) => vote.optionLabel)))];
  const q = query.trim().toLowerCase();
  const filtered = source.filter((vote) => {
    if (selection !== "All" && vote.optionLabel !== selection) return false;
    if (!q) return true;
    return (
      vote.proposalTitle.toLowerCase().includes(q) ||
      vote.voterAddress.toLowerCase().includes(q)
    );
  });
  return (
    <section className="dashboard-card">
      <div className="card-header">
        <div
          className="details-tabs"
          role="tablist"
          aria-label="Vote history scope"
        >
          <button
            role="tab"
            aria-selected={tab === "all"}
            className={tab === "all" ? "details-tab active" : "details-tab"}
            onClick={() => onTabChange("all")}
          >
            All Votes
            <span className="details-tab-count">{votes.length}</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === "mine"}
            className={tab === "mine" ? "details-tab active" : "details-tab"}
            onClick={() => onTabChange("mine")}
          >
            My Votes
            <span className="details-tab-count">{myVotes.length}</span>
          </button>
        </div>
        <div className="table-toolbar">
          <label className="search-box">
            <span aria-hidden>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search proposal or wallet..."
              aria-label="Search votes"
            />
          </label>
          <select
            className="status-select"
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
            aria-label="Filter by selection"
          >
            {selections.map((option) => (
              <option key={option} value={option}>
                {option === "All" ? "All selections" : option}
              </option>
            ))}
          </select>
          <span className="votes-count-badge">
            <strong>{filtered.length}</strong>
            <span>confirmed</span>
          </span>
        </div>
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
            {filtered.map((vote) => (
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
      {!filtered.length && (
        <EmptyState
          title="Nothing to show"
          copy={
            votes.length && (q || selection !== "All")
              ? "Try a different search or selection filter."
              : tab === "mine"
                ? connected
                  ? "You have not voted yet."
                  : "Connect your wallet to see your votes."
                : "No votes have been indexed yet."
          }
        />
      )}
    </section>
  );
}

type SettingsTab = "general" | "wallet" | "contract";

function SettingsPage({
  tab,
  onTabChange,
  role,
}: {
  tab: SettingsTab;
  onTabChange(tab: SettingsTab): void;
  role: string;
}) {
  return (
    <div className="view-stack">
      <div
        className="details-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        <button
          role="tab"
          aria-selected={tab === "general"}
          className={tab === "general" ? "details-tab active" : "details-tab"}
          onClick={() => onTabChange("general")}
        >
          General / Network
        </button>
        <button
          role="tab"
          aria-selected={tab === "wallet"}
          className={tab === "wallet" ? "details-tab active" : "details-tab"}
          onClick={() => onTabChange("wallet")}
        >
          Wallet & Permissions
        </button>
        <button
          role="tab"
          aria-selected={tab === "contract"}
          className={tab === "contract" ? "details-tab active" : "details-tab"}
          onClick={() => onTabChange("contract")}
        >
          Contract Capabilities
        </button>
      </div>

      {tab === "general" && (
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
      )}

      {tab === "wallet" && (
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
      )}

      {tab === "contract" && (
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
      )}
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
    dashboard: "Proposals",
    members: "DAO members",
    proposals: "Proposals",
    votes: "Votes",
    "my-votes": "Votes",
    decoder: "Transaction decoder",
    wallet: "Settings",
    settings: "Settings",
    ai: "AI Assistant",
  }[view];
}
function subtitleFor(view: DashboardView) {
  if (view === "decoder")
    return "Decode CyberChain calldata, receipts and governance events with the contract ABI.";
  if (view === "dashboard" || view === "proposals")
    return "Create, explore, and participate in governance proposals for CyberDAO.";
  if (view === "votes" || view === "my-votes")
    return "View all on-chain voting activity and your personal voting history.";
  return "Transparent, on-chain governance with a fast indexed read model.";
}

function filterProposals(
  proposals: Proposal[],
  votes: IndexedVote[],
  query: string,
  statusFilter: string,
) {
  const q = query.trim().toLowerCase();
  return proposals.filter((proposal) => {
    const status = proposalStatus(proposal, votes);
    if (statusFilter !== "All" && status !== statusFilter) return false;
    if (!q) return true;
    return (
      proposal.title.toLowerCase().includes(q) ||
      proposal.purpose.toLowerCase().includes(q) ||
      String(proposal.onChainId ?? "draft").toLowerCase().includes(q)
    );
  });
}

function StatsRow({
  proposals,
  votes,
  members,
  activeCount,
}: {
  proposals: Proposal[];
  votes: IndexedVote[];
  members: number;
  activeCount: number;
}) {
  return (
    <div className="metric-grid">
      <Metric
        label="Total proposals"
        value={proposals.length}
        icon="▤"
        tone="blue"
      />
      <Metric label="Active votes" value={activeCount} icon="✓" tone="cyan" />
      <Metric label="Eligible members" value={members} icon="♙" tone="violet" />
      <Metric label="Votes recorded" value={votes.length} icon="◎" tone="green" />
    </div>
  );
}

function ProposalsTable({
  proposals,
  votes,
  onOpen,
  selectedId,
  showSearch = true,
}: {
  proposals: Proposal[];
  votes: IndexedVote[];
  onOpen(id: string): void;
  selectedId?: string | null;
  showSearch?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const filtered = filterProposals(proposals, votes, query, statusFilter);
  return (
    <section className="dashboard-card">
      <div className="card-header">
        <div>
          <h2>All Proposals</h2>
          <p>Governance proposals created by the CyberDAO community</p>
        </div>
        {showSearch && (
          <div className="table-toolbar">
            <label className="search-box">
              <span aria-hidden>⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search proposals..."
                aria-label="Search proposals"
              />
            </label>
            <select
              className="status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="All">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Active">Active</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Voting Ended">Voting Ended</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Executed">Executed</option>
            </select>
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Proposal</th>
              <th>Status</th>
              <th>Voting period</th>
              <th>Votes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((proposal) => (
              <tr
                key={proposal.id}
                style={
                  selectedId === proposal.id
                    ? { background: "#eff6ff" }
                    : undefined
                }
              >
                <td className="proposal-cell">
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
      {!filtered.length && (
        <EmptyState
          title={proposals.length ? "No matching proposals" : "No proposals yet"}
          copy={
            proposals.length
              ? "Try a different search or status filter."
              : "Create the first proposal to start governing."
          }
        />
      )}
    </section>
  );
}
