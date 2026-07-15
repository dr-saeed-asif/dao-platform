import { ConnectWallet } from "@/features/wallet/connect-wallet";
import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">C</span>
          <span>CyberDAO</span>
        </Link>
        <nav>
          <a href="#proposals">Proposals</a>
          <a href="#create">Create</a>
        </nav>
        <ConnectWallet />
      </header>
      <main>{children}</main>
      <footer>
        <span>CyberDAO governance console</span>
        <span>CyberChain · 1212</span>
      </footer>
    </>
  );
}
