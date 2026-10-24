import { test, expect } from "@playwright/test";
import { Wallet } from "ethers";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "../../../.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
const root = "/api/v1/ai/assistant";
test("real proxy rejects forged/expired auth, unauthorized proposals and conversation scope", async ({
  request,
}) => {
  const signIn = async (wallet: {
    address: string;
    signMessage: (m: string) => Promise<string>;
  }) => {
    const challenge = await (
      await request.post(root + "/auth/challenge", {
        data: { address: wallet.address },
      })
    ).json();
    const response = await request.post(root + "/auth/login", {
      data: {
        nonce: challenge.nonce,
        signature: await wallet.signMessage(challenge.message),
      },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).token as string;
  };
  const question = {
    proposalId: "onchain-28",
    question: ["What is the proposal title?"],
  };
  expect(
    (
      await request.post(root + "/ask", {
        data: question,
        headers: { "x-wallet-address": env.DAO_ADMIN_ADDRESS },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(root + "/ask", {
        data: question,
        headers: { Authorization: "Bearer invalid.token" },
      })
    ).status(),
  ).toBe(401);
  const stranger = Wallet.createRandom(),
    token = await signIn(stranger);
  expect(
    (
      await request.post(root + "/ask", {
        data: question,
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(403);
  const payload = Buffer.from(
    JSON.stringify({
      address: stranger.address.toLowerCase(),
      expires: Date.now() - 1000,
    }),
  ).toString("base64url");
  const mac = createHmac("sha256", env.JWT_SECRET)
    .update(`ai-session:${payload}`)
    .digest("base64url");
  expect(
    (
      await request.post(root + "/ask", {
        data: question,
        headers: { Authorization: `Bearer ${payload}.${mac}` },
      })
    ).status(),
  ).toBe(401);
  const ownerToken = await signIn(new Wallet(env.ECDSA_PRIVATE_KEY)),
    headers = { Authorization: `Bearer ${ownerToken}` };
  expect(
    (
      await request.post(root + "/ask", {
        data: { ...question, dao_id: "forged-dao" },
        headers,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(root + "/ask", {
        data: { ...question, proposalId: "missing-proposal" },
        headers,
      })
    ).status(),
  ).toBe(404);
  const created = await request.post(root + "/conversations", {
    data: { proposalId: question.proposalId, title: "Access isolation test" },
    headers,
  });
  expect(created.status()).toBe(200);
  const conversation = await created.json();
  expect(
    (
      await request.get(
        root +
          `/conversations/${conversation.id}?proposalId=d29a8227-da76-4a40-80a8-33300e1c4f04`,
        { headers },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(
        root +
          `/conversations/${conversation.id}/messages?proposalId=${question.proposalId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(root + "/runs?proposalId=onchain-28", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(root + "/proposals/onchain-28/verification", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(
        "/api/v1/ai/internal/proposals/onchain-28/verification?dao_id=cyber-test",
      )
    ).status(),
  ).toBe(401);
  const upstreamHeaders = {
    Authorization: `Bearer ${env.AI_SERVER_TOKEN}`,
    "X-DAO-User": stranger.address.toLowerCase(),
  };
  const upstream = process.env.ASSISTANT_AI_URL ?? "http://127.0.0.1:8001";
  expect(
    (
      await request.get(`${upstream}/rag/conversations/${conversation.id}`, {
        headers: upstreamHeaders,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(
        `${upstream}/rag/conversations/${conversation.id}/messages`,
        { headers: upstreamHeaders },
      )
    ).status(),
  ).toBe(404);
  const listed = await (
    await request.get(`${upstream}/rag/conversations?dao_id=cyber-test`, {
      headers: upstreamHeaders,
    })
  ).json();
  expect(listed.some((c: { id: string }) => c.id === conversation.id)).toBe(
    false,
  );
});
