import type { PreparedTransaction } from "@/lib/api/types";
import type { WalletAdapter, WalletConnection } from "./types";

interface CyberChainWalletProvider {
  connect(): Promise<{ success: boolean; address: string }>;
  requestWalletAddress(): Promise<{ connected: boolean; address: string }>;
  sign(transaction: Record<string, unknown>): Promise<string>;
  lock(): Promise<{ success: boolean }>;
  watchWalletAddress?(
    listener: (state: { connected: boolean; address: string }) => void,
  ): Promise<unknown>;
}

declare global {
  interface Window {
    CyberChainWallet?: CyberChainWalletProvider;
  }
}

const chainId = Number(process.env.NEXT_PUBLIC_CYBERCHAIN_CHAIN_ID ?? 1212);

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch("/api/cyberchain/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const body = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (!response.ok || body.error)
    throw new Error(body.error?.message ?? "CyberChain RPC request failed.");
  return body.result as T;
}

export class CyberChainWalletAdapter implements WalletAdapter {
  private provider() {
    const provider =
      typeof window === "undefined" ? undefined : window.CyberChainWallet;
    if (!provider)
      throw new Error(
        "CyberChain Wallet is not installed. Install the official browser extension first.",
      );
    return provider;
  }

  async connect(): Promise<WalletConnection> {
    const result = await this.provider().connect();
    if (!result.success || !result.address)
      throw new Error("CyberChain Wallet connection was rejected.");
    return {
      kind: "cyberchain",
      address: result.address.toLowerCase(),
      networkName: "CyberChain",
      chainId,
      networkStatus: "connected",
    };
  }

  async submit(transaction: PreparedTransaction): Promise<string> {
    const provider = this.provider();
    const wallet = await provider.requestWalletAddress();
    if (
      !wallet.connected ||
      wallet.address.toLowerCase() !== transaction.from.toLowerCase()
    ) {
      throw new Error(
        `Select the assigned CyberChain wallet ${transaction.from}.`,
      );
    }
    const nonce = await rpc<string>("eth_getTransactionCount", [
      transaction.from,
      "pending",
    ]);
    const signed = await provider.sign({
      to: transaction.to,
      data: transaction.data.replace(/^0x/, ""),
      dataDisplayFormat: "hex",
      chainId: transaction.chainId,
      nonce: BigInt(nonce).toString(),
    });
    return rpc<string>("eth_sendRawTransaction", [
      signed.startsWith("0x") ? signed : `0x${signed}`,
    ]);
  }

  async disconnect(): Promise<void> {
    await this.provider().lock();
  }
}
