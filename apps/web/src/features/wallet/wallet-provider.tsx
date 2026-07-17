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
const walletConnectionKey = "cyberdao.wallet.connection.v1";

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
      const connected = await selected.connect();
      setConnection(connected);
      setAdapter(selected);
      window.localStorage.setItem(walletSessionKey, kind);
      window.localStorage.setItem(
        walletConnectionKey,
        JSON.stringify(connected),
      );
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
        const cached = cachedConnection();
        const kind = (cached?.kind ??
          window.localStorage.getItem(walletSessionKey)) as WalletKind | null;
        if (kind !== "cyberchain" && kind !== "metamask") return;
        const selected: WalletAdapter =
          kind === "cyberchain"
            ? new CyberChainWalletAdapter()
            : new MetaMaskWalletAdapter();
        // A cached connection contains only public information. Restoring it
        // avoids extension permission prompts on every page refresh. Signing
        // still verifies the live provider account and network.
        const restored = cached ?? (await selected.restore());
        if (!active) return;
        if (restored) {
          setConnection(restored);
          setAdapter(selected);
          window.localStorage.setItem(
            walletConnectionKey,
            JSON.stringify(restored),
          );
        } else {
          window.localStorage.removeItem(walletSessionKey);
          window.localStorage.removeItem(walletConnectionKey);
        }
      } catch {
        window.localStorage.removeItem(walletSessionKey);
        window.localStorage.removeItem(walletConnectionKey);
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
    try {
      await adapter?.disconnect();
    } finally {
      setConnection(null);
      setAdapter(null);
      setError(null);
      window.localStorage.removeItem(walletSessionKey);
      window.localStorage.removeItem(walletConnectionKey);
    }
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

function cachedConnection(): WalletConnection | null {
  const serialized = window.localStorage.getItem(walletConnectionKey);
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as Partial<WalletConnection>;
    if (
      (value.kind !== "cyberchain" && value.kind !== "metamask") ||
      typeof value.address !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(value.address) ||
      typeof value.networkName !== "string" ||
      typeof value.chainId !== "number" ||
      (value.networkStatus !== "connected" &&
        value.networkStatus !== "wrong-network" &&
        value.networkStatus !== "disconnected")
    )
      return null;
    return {
      kind: value.kind,
      address: value.address.toLowerCase(),
      networkName: value.networkName,
      chainId: value.chainId,
      networkStatus: value.networkStatus,
    };
  } catch {
    return null;
  }
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context)
    throw new Error("useWallet must be used inside WalletProvider.");
  return context;
}
