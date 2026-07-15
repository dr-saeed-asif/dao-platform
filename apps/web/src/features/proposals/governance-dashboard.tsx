"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, type DashboardView } from "@/components/app-shell";
import { ConnectWallet } from "@/features/wallet/connect-wallet";
import { useWallet } from "@/features/wallet/wallet-provider";
import { daoApi } from "@/lib/api/client";
import type { Assignment, Proposal, Vote } from "@/lib/api/types";
import { CreateProposalForm } from "./create-proposal-form";
import { ProposalWorkspace } from "./proposal-workspace";

interface IndexedAssignment extends Assignment {
  proposalTitle: string;
}
interface IndexedVote extends Vote {
  proposalTitle: string;
  optionLabel: string;
}
const adminAddress = (
  process.env.NEXT_PUBLIC_DAO_ADMIN_ADDRESS ??
  "0xb8163f7d6d404f67a400743b90f7952d2d137b8e"
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
  const [loading, setLoading] = useState(true);
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
    void load();
  }, [load]);
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
            />
          )}
          {active === "members" && <MembersView assignments={assignments} />}
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
}: {
  proposals: Proposal[];
  votes: IndexedVote[];
  members: number;
  activeCount: number;
  onOpen(id: string): void;
}) {
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
        </div>
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

function MembersView({ assignments }: { assignments: IndexedAssignment[] }) {
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Proposal</th>
              <th>Status</th>
              <th>Assigned</th>
              <th>Transaction</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((item) => (
              <tr key={`${item.proposalId}-${item.walletAddress}`}>
                <td>
                  <code>{short(item.walletAddress)}</code>
                </td>
                <td>{item.proposalTitle}</td>
                <td>
                  <StatusBadge status="Active" />
                </td>
                <td>{formatDate(item.assignedAt)}</td>
                <td>
                  <code title={item.transactionHash}>
                    {short(item.transactionHash)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                  <code title={vote.transactionHash}>
                    {short(vote.transactionHash)}
                  </code>
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
    wallet: "Wallet",
    settings: "Settings",
  }[view];
}
function subtitleFor(view: DashboardView, role: string) {
  return view === "dashboard"
    ? `Welcome back. You are connected as ${role}.`
    : "Transparent, on-chain governance with a fast indexed read model.";
}
