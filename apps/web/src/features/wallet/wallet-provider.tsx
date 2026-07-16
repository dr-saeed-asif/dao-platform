"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useState,
} from "react";
import { MetaMaskWalletAdapter } from "@/lib/wallet/injected-wallet";
import { CyberChainWalletAdapter } from "@/lib/wallet/cyberchain-wallet";
import type {
  WalletAdapter,
  WalletConnection,
  WalletKind,
} from "@/lib/wallet/types";

interface WalletContextValue {
  connection: WalletConnection | null;
  address: string | null;
  connecting: boolean;
  restoring: boolean;
  error: string | null;
  connect(kind: WalletKind): Promise<void>;
  disconnect(): Promise<void>;
  submit(
    transaction: import("@/lib/api/types").PreparedTransaction,
  ): Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const walletSessionKey = "cyberdao.wallet.kind";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<WalletConnection | null>(null);
  const [adapter, setAdapter] = useState<WalletAdapter | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const connect = useCallback(async (kind: WalletKind) => {
    setConnecting(true);
    setError(null);
    try {
      const selected: WalletAdapter =
        kind === "cyberchain"
          ? new CyberChainWalletAdapter()
          : new MetaMaskWalletAdapter();
      setConnection(await selected.connect());
      setAdapter(selected);
      window.localStorage.setItem(walletSessionKey, kind);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Unable to connect wallet.",
      );
    } finally {
      setConnecting(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const kind = window.localStorage.getItem(
          walletSessionKey,
        ) as WalletKind | null;
        if (kind !== "cyberchain" && kind !== "metamask") return;
        const selected: WalletAdapter =
          kind === "cyberchain"
            ? new CyberChainWalletAdapter()
            : new MetaMaskWalletAdapter();
        const restored = await selected.restore();
        if (!active) return;
        if (restored) {
          setConnection(restored);
          setAdapter(selected);
        } else {
          window.localStorage.removeItem(walletSessionKey);
        }
      } catch {
        window.localStorage.removeItem(walletSessionKey);
      } finally {
        if (active) setRestoring(false);
      }
    }
    void restoreSession();
    return () => {
      active = false;
    };
  }, []);
  const disconnect = useCallback(async () => {
    await adapter?.disconnect();
    setConnection(null);
    setAdapter(null);
    setError(null);
    window.localStorage.removeItem(walletSessionKey);
  }, [adapter]);
  const submit = useCallback(
    async (transaction: import("@/lib/api/types").PreparedTransaction) => {
      if (!adapter) throw new Error("Connect a wallet first.");
      return adapter.submit(transaction);
    },
    [adapter],
  );
  const value = useMemo(
    () => ({
      connection,
      address: connection?.address ?? null,
      connecting,
      restoring,
      error,
      connect,
      disconnect,
      submit,
    }),
    [connection, connecting, restoring, error, connect, disconnect, submit],
  );
  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context)
    throw new Error("useWallet must be used inside WalletProvider.");
  return context;
}
