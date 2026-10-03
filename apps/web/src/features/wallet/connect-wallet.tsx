"use client";

import { useState } from "react";
import { useWallet } from "./wallet-provider";

const short = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

const adminAddress = (
  process.env.NEXT_PUBLIC_DAO_ADMIN_ADDRESS ??
  "0x43b30c380b465d4fe632cadb7bbf0be8ea53a04b"
).toLowerCase();

export function ConnectWallet({ expanded = false }: { expanded?: boolean }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  if (wallet.connection) {
    const isAdmin =
      wallet.connection.address.toLowerCase() === adminAddress;
    const walletLabel =
      wallet.connection.kind === "cyberchain"
        ? "CyberChain Wallet"
        : "MetaMask";
    if (!expanded) {
      return (
        <div
          className="wallet-summary"
          title={wallet.connection.address}
        >
          <div className="wallet-ident">
            <span className="connection-pulse" />
            <div>
              <strong>{isAdmin ? "Admin" : "Member"}</strong>
              <small>{walletLabel}</small>
            </div>
          </div>
          <button
            className="text-button"
            onClick={() => void wallet.disconnect()}
          >
            Disconnect
          </button>
        </div>
      );
    }
    return (
      <div className="wallet-card connected">
        <div className="wallet-ident">
          <span className="connection-pulse" />
          <div>
            <strong>{short(wallet.connection.address)}</strong>
            <small>{walletLabel}</small>
          </div>
        </div>
        <span
          className={`role-badge wallet-role role-${isAdmin ? "admin" : "member"}`}
          title={isAdmin ? "DAO Administrator" : "DAO Member"}
        >
          {isAdmin ? "Admin" : "Member"}
        </span>
        {expanded && (
          <div className="wallet-metadata">
            <span>
              Network<strong>{wallet.connection.networkName}</strong>
            </span>
            <span>
              Status
              <strong
                className={
                  wallet.connection.networkStatus === "connected"
                    ? "text-success"
                    : "text-danger"
                }
              >
                {wallet.connection.networkStatus.replace("-", " ")}
              </strong>
            </span>
            <span>
              Address<code>{wallet.connection.address}</code>
            </span>
          </div>
        )}
        <button
          className="text-button"
          onClick={() => void wallet.disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <>
      <button className="button button-primary" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      {open && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="modal wallet-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">Identity</span>
                <h2>Connect a wallet</h2>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <p className="modal-copy">
              Choose the wallet that owns your DAO account. You will approve
              every blockchain transaction yourself.
            </p>
            <div className="wallet-options">
              <button
                onClick={() => void wallet.connect("metamask")}
                disabled={wallet.connecting}
              >
                <span className="wallet-logo fox">M</span>
                <span>
                  <strong>MetaMask</strong>
                  <small>Standard injected EVM wallet</small>
                </span>
                <b>→</b>
              </button>
              <button
                onClick={() => void wallet.connect("cyberchain")}
                disabled={wallet.connecting}
              >
                <span className="wallet-logo cyber">C</span>
                <span>
                  <strong>CyberChain Wallet</strong>
                  <small>Hybrid ECDSA / ML-DSA signing</small>
                </span>
                <b>→</b>
              </button>
            </div>
            {wallet.error && (
              <div className="alert alert-error">{wallet.error}</div>
            )}
            <p className="security-note">
              The DApp never receives your private keys.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
