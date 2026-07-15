"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { connectInjectedWallet } from "@/lib/wallet/injected-wallet";

interface WalletContextValue {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect(): Promise<void>;
  disconnect(): void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      setAddress(await connectInjectedWallet());
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Unable to connect wallet.",
      );
    } finally {
      setConnecting(false);
    }
  }, []);
  const value = useMemo(
    () => ({
      address,
      connecting,
      error,
      connect,
      disconnect: () => setAddress(null),
    }),
    [address, connecting, error, connect],
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
