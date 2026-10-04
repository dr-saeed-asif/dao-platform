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
// "dashboard", "my-votes" and "wallet" are kept in DashboardView for
// backward compatibility but intentionally not shown: dashboard renders
// Proposals, my-votes renders Votes with the My Votes tab selected, and
// wallet renders Settings with the Wallet section selected.
const items: { id: DashboardView; label: string; icon: string }[] = [
  { id: "proposals", label: "Proposal", icon: "▤" },
  { id: "votes", label: "Votes", icon: "✓" },
  { id: "decoder", label: "Decoder", icon: "0x" },
  { id: "ai", label: "AI Assistant", icon: "🤖" },
  { id: "members", label: "Members", icon: "♙" },
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
  // Legacy views render inside their unified screens.
  const highlighted =
    active === "dashboard"
      ? "proposals"
      : active === "my-votes"
        ? "votes"
        : active === "wallet"
          ? "settings"
          : active;
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
