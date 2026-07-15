"use client";

import { useWallet } from "./wallet-provider";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export function ConnectWallet() {
  const wallet = useWallet();
  return (
    <div className="wallet-area">
      {wallet.address ? (
        <>
          <span className="network-dot" />
          <button className="wallet-chip" onClick={wallet.disconnect}>
            {short(wallet.address)}
          </button>
        </>
      ) : (
        <button
          className="button button-primary"
          disabled={wallet.connecting}
          onClick={() => void wallet.connect()}
        >
          {wallet.connecting ? "Connecting…" : "Connect wallet"}
        </button>
      )}
      {wallet.error && (
        <span className="wallet-error" title={wallet.error}>
          Wallet error
        </span>
      )}
    </div>
  );
}
