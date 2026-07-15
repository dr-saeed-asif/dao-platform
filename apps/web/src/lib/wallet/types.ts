import type { PreparedTransaction } from "@/lib/api/types";

export type WalletKind = "metamask" | "cyberchain";
export type NetworkStatus = "connected" | "wrong-network" | "disconnected";

export interface WalletConnection {
  kind: WalletKind;
  address: string;
  networkName: string;
  chainId: number;
  networkStatus: NetworkStatus;
}

export interface WalletAdapter {
  connect(): Promise<WalletConnection>;
  submit(transaction: PreparedTransaction): Promise<string>;
  disconnect(): Promise<void>;
}
