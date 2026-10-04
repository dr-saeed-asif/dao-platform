"use client";

import { ConnectWallet } from "@/features/wallet/connect-wallet";

export type DashboardView =
  | "dashboard"
  | "members"
  | "proposals"
  | "votes"
  | "my-votes"
  | "decoder"
  | "wallet"
  | "settings"
  | "ai";
// "dashboard" is kept in DashboardView for backward compatibility but is
// intentionally not shown: the Proposals page is the governance overview.
const items: { id: DashboardView; label: string; icon: string }[] = [
  { id: "proposals", label: "Proposal", icon: "▤" },
  { id: "votes", label: "Votes", icon: "✓" },
  { id: "decoder", label: "Decoder", icon: "0x" },
  { id: "ai", label: "AI Assistant", icon: "🤖" },
  { id: "members", label: "Members", icon: "♙" },
  { id: "my-votes", label: "My Votes", icon: "◎" },
  { id: "wallet", label: "Wallet", icon: "◇" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export function AppShell({
  active,
  onNavigate,
  collapsed,
  onToggle,
  children,
}: {
  active: DashboardView;
  onNavigate(view: DashboardView): void;
  collapsed: boolean;
  onToggle(): void;
  children: React.ReactNode;
}) {
  // Legacy "dashboard" view renders the Proposals overview.
  const highlighted = active === "dashboard" ? "proposals" : active;
  return (
    <div className={collapsed ? "cyber-shell nav-open" : "cyber-shell"}>
      <header className="topnav-pill">
        <div className="topnav-brand">
          <span className="topnav-logo">C</span>
          <span className="topnav-name">
            <strong>
              Cyber<span>DAO</span>
            </strong>
          </span>
          <span className="topnav-sub">
            <small>DAO Governance</small>
            <small>Powered by CyberChain</small>
          </span>
        </div>
        <button
          className="topnav-burger"
          onClick={onToggle}
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <nav className="topnav-tabs" aria-label="Primary">
          {items.map((item) => (
            <button
              key={item.id}
              className={
                highlighted === item.id
                  ? "topnav-tab topnav-tab-active"
                  : "topnav-tab"
              }
              onClick={() => onNavigate(item.id)}
              title={item.label}
            >
              <i aria-hidden>{item.icon}</i>
              <span>{item.label}</span>
              {highlighted === item.id && (
                <em className="topnav-caret" aria-hidden />
              )}
            </button>
          ))}
        </nav>
        <div className="topnav-wallet">
          <ConnectWallet />
        </div>
      </header>
      <main className="page-outer">
        <div className="page-card">{children}</div>
      </main>
    </div>
  );
}
