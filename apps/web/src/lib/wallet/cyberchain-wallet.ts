import type { PreparedTransaction } from "@/lib/api/types";
import type { WalletAdapter, WalletConnection } from "./types";

interface CyberChainWalletProvider {
  connect(): Promise<{ success: boolean; address: string }>;
  requestWalletAddress(): Promise<{ connected: boolean; address: string }>;
  sign(transaction: Record<string, unknown>): Promise<string | null>;
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

  async restore(): Promise<WalletConnection | null> {
    const result = await this.provider().requestWalletAddress();
    if (!result.connected || !result.address) return null;
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
    const role = await rpc<string>("eth_getRole", [transaction.from, "latest"]);
    if (role.toUpperCase() === "READER") {
      throw new Error(
        `CyberChain account ${transaction.from} has network role READER. A CyberChain ROLE_MANAGER or ADMIN must grant it WRITER before it can submit votes.`,
      );
    }
    const nonce = await rpc<string>("eth_getTransactionCount", [
      transaction.from,
      "pending",
    ]);
    const rpcChainId = await rpc<string>("eth_chainId", []);
    const preparedChainId = BigInt(transaction.chainId);
    if (BigInt(rpcChainId) !== preparedChainId) {
      throw new Error(
        `CyberChain network mismatch: API prepared chain ${preparedChainId}, RPC reports ${BigInt(rpcChainId)}.`,
      );
    }
    const signed = await provider.sign({
      to: transaction.to,
      data: transaction.data.replace(/^0x/, ""),
      dataDisplayFormat: "hex",
      // CyberChain Wallet 1.0.0 normalizes quantities by adding a 0x prefix,
      // so quantities must already use canonical RPC hexadecimal notation.
      chainId: `0x${preparedChainId.toString(16)}`,
      nonce,
    });
    if (typeof signed !== "string" || !signed.trim()) {
      throw new Error(
        "CyberChain Wallet did not return a signed transaction. Unlock the wallet and approve the signing request.",
      );
    }
    return rpc<string>("eth_sendRawTransaction", [
      signed.startsWith("0x") ? signed : `0x${signed}`,
    ]);
  }

  async disconnect(): Promise<void> {
    await this.provider().lock();
  }
}
