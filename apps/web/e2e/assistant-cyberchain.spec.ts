import { test, expect } from "@playwright/test";
import { Common } from "@ethereumjs/common";
import { Address } from "@ethereumjs/util";
import { FeeMarketEIP1559Transaction } from "@cyberchain/tx";
import { privateKeyToMixedAddress } from "@cyberchain/smart-contract-wrapper";
import { ml_dsa44 } from "@noble/post-quantum/ml-dsa";

const pair = ml_dsa44.keygen(new Uint8Array(32).fill(7));
const key = {
  type: "ml-dsa" as const,
  spec: 44 as const,
  publicKey: pair.publicKey,
  secretKey: pair.secretKey,
};
const complement = "0x" + "11".repeat(20);
const address = privateKeyToMixedAddress(key, complement);
test("connected CyberChain wallet verifies automatically without reconnecting or MetaMask", async ({
  page,
}) => {
  let signatures = 0;
  await page.exposeFunction(
    "__nativeSign",
    (transaction: Record<string, string>) => {
      signatures++;
      expect(BigInt(transaction.chainId)).not.toBe(BigInt(1212));
      expect(transaction.value).toBe("0x0");
      const chainId = BigInt(transaction.chainId);
      const common = Common.custom(
        { chainId, networkId: chainId },
        { hardfork: "london" },
      );
      // Match installed Wallet 1.0.0: sanitized input drops gas/value fields,
      // and its signer always emits typed transactions with 6,000,000 gas.
      const signed = FeeMarketEIP1559Transaction.fromTxData(
        {
          chainId,
          nonce: BigInt(transaction.nonce),
          to: Address.fromString(transaction.to),
          gasLimit: BigInt(6_000_000),
          maxFeePerGas: BigInt(0),
          maxPriorityFeePerGas: BigInt(0),
          data: Buffer.from(transaction.data, "hex"),
        },
        { common },
      ).sign(key, Address.fromString(complement));
      return "0x" + Buffer.from(signed.serialize()).toString("hex");
    },
  );
  await page.addInitScript(
    ({ address }) => {
      const connection = {
        kind: "cyberchain",
        address,
        networkName: "CyberChain",
        chainId: 1212,
        networkStatus: "connected",
      };
      localStorage.setItem(
        "cyberdao.wallet.connection.v1",
        JSON.stringify(connection),
      );
      localStorage.setItem("cyberdao.wallet.kind.v1", "cyberchain");
      (window as any).__reconnects = 0;
      (window as any).CyberChainWallet = {
        connect() {
          (window as any).__reconnects++;
          throw new Error("Connected wallet must never reconnect");
        },
        async requestWalletAddress() {
          return { connected: true, address };
        },
        sign(transaction: Record<string, string>) {
          return (window as any).__nativeSign(transaction);
        },
        async lock() {
          return { success: true };
        },
      };
      delete (window as any).ethereum;
    },
    { address },
  );
  // Native login goes to the actual DAO backend and verifies real ML-DSA.
  // History is isolated here because this generated test wallet has no DAO assignment.
  await page.route("**/ai/assistant/conversations?*", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.goto("/");
  await page
    .getByRole("row")
    .filter({ hasText: "Cyber Testing" })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  const login = page.waitForResponse((r) =>
    r.url().endsWith("/ai/assistant/auth/login"),
  );
  await page.getByRole("tab", { name: "Ask AI" }).click();
  expect((await login).status()).toBe(200);
  await expect(page.getByLabel("Question text", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to AI", exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__reconnects)).toBe(0);
  expect(signatures).toBe(1);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByRole("tab", { name: "Ask AI", exact: true }).click();
  await expect(page.getByLabel("Question text", { exact: true })).toBeVisible();
  expect(signatures).toBe(1);
  expect(await page.evaluate(() => (window as any).__reconnects)).toBe(0);
});
