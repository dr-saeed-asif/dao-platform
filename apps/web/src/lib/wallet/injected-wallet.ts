import type { PreparedTransaction } from "@/lib/api/types";
import type { WalletAdapter, WalletConnection } from "./types";

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const chainId = Number(process.env.NEXT_PUBLIC_CYBERCHAIN_CHAIN_ID ?? 1212);
const chainHex = `0x${chainId.toString(16)}`;

export function injectedProvider() {
  return typeof window === "undefined" ? undefined : window.ethereum;
}

export async function connectInjectedWallet(): Promise<string> {
  const provider = injectedProvider();
  if (!provider)
    throw new Error(
      "No injected wallet found. Install MetaMask or a CyberChain-compatible wallet.",
    );
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts[0]) throw new Error("The wallet did not return an account.");
  await ensureCyberChain(provider);
  return accounts[0].toLowerCase();
}

async function ensureCyberChain(provider: EthereumProvider): Promise<void> {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current.toLowerCase() === chainHex) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainHex,
          chainName: process.env.NEXT_PUBLIC_CYBERCHAIN_NAME ?? "CyberChain",
          nativeCurrency: {
            name: "CyberChain token",
            symbol:
              process.env.NEXT_PUBLIC_CYBERCHAIN_CURRENCY_SYMBOL ?? "CYBER",
            decimals: 18,
          },
          rpcUrls: [
            process.env.NEXT_PUBLIC_CYBERCHAIN_RPC_URL ??
              "http://cyberchain-bc.bisite.es:8545",
          ],
        },
      ],
    });
  }
}

export async function submitPreparedTransaction(
  transaction: PreparedTransaction,
): Promise<string> {
  const provider = injectedProvider();
  if (!provider) throw new Error("Connect an injected wallet first.");
  await ensureCyberChain(provider);
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];
  if (accounts[0]?.toLowerCase() !== transaction.from.toLowerCase()) {
    throw new Error(
      `Switch the wallet to the assigned account ${transaction.from}.`,
    );
  }
  try {
    return (await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: transaction.from,
          to: transaction.to,
          data: transaction.data,
          value: "0x0",
        },
      ],
    })) as string;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Wallet submission failed.";
    throw new Error(
      `${message} CyberChain mixed-signature transactions may require a compatible wallet.`,
    );
  }
}

export class MetaMaskWalletAdapter implements WalletAdapter {
  async connect(): Promise<WalletConnection> {
    const address = await connectInjectedWallet();
    const provider = injectedProvider();
    const current = provider
      ? ((await provider.request({ method: "eth_chainId" })) as string)
      : "0x0";
    return {
      kind: "metamask",
      address,
      networkName:
        Number(current) === chainId ? "CyberChain" : `Chain ${Number(current)}`,
      chainId: Number(current),
      networkStatus:
        Number(current) === chainId ? "connected" : "wrong-network",
    };
  }
  async restore(): Promise<WalletConnection | null> {
    const provider = injectedProvider();
    if (!provider) return null;
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    if (!accounts[0]) return null;
    await ensureCyberChain(provider);
    const current = (await provider.request({
      method: "eth_chainId",
    })) as string;
    return {
      kind: "metamask",
      address: accounts[0].toLowerCase(),
      networkName:
        Number(current) === chainId ? "CyberChain" : `Chain ${Number(current)}`,
      chainId: Number(current),
      networkStatus:
        Number(current) === chainId ? "connected" : "wrong-network",
    };
  }
  submit(transaction: PreparedTransaction) {
    return submitPreparedTransaction(transaction);
  }
  async disconnect(): Promise<void> {
    /* Injected wallets do not expose programmatic disconnect. */
  }
}
