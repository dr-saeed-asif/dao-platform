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
  | "settings";
const items: { id: DashboardView; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "members", label: "Members", icon: "♙" },
  { id: "proposals", label: "Proposals", icon: "▤" },
  { id: "votes", label: "Votes", icon: "✓" },
  { id: "my-votes", label: "My Votes", icon: "◎" },
  { id: "decoder", label: "Decoder", icon: "0x" },
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
  return (
    <div
      className={
        collapsed ? "dashboard-shell sidebar-collapsed" : "dashboard-shell"
      }
    >
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-symbol">C</span>
          {!collapsed && (
            <span>
              Cyber<span>DAO</span>
            </span>
          )}
          <button onClick={onToggle}>{collapsed ? "›" : "‹"}</button>
        </div>
        <nav>
          {items.map((item) => (
            <button
              key={item.id}
              className={active === item.id ? "active" : ""}
              onClick={() => onNavigate(item.id)}
              title={item.label}
            >
              <i>{item.icon}</i>
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        {!collapsed && (
          <div className="sidebar-foot">
            <span className="connection-pulse" />
            <div>
              <strong>CyberChain</strong>
              <small>Chain ID 1212</small>
            </div>
          </div>
        )}
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <button className="mobile-menu" onClick={onToggle}>
              ☰
            </button>
            <span className="breadcrumb">DAO Governance /</span>
            <strong>{items.find((item) => item.id === active)?.label}</strong>
          </div>
          <ConnectWallet />
        </header>
        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
