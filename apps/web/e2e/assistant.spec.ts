import { test, expect, type Page } from "@playwright/test";
import { Wallet } from "ethers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// The key remains in the Node test runner. The browser receives only signatures.
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "../../../.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
    }),
);
const wallet = new Wallet(env.ECDSA_PRIVATE_KEY);
async function enter(page: Page) {
  await page.exposeFunction("__signWalletMessage", (hex: string) =>
    wallet.signMessage(Buffer.from(hex.slice(2), "hex")),
  );
  await page.addInitScript(
    ({ address }) => {
      (window as any).ethereum = {
        on() {},
        removeListener() {},
        async request({ method, params }: any) {
          if (method === "eth_requestAccounts" || method === "eth_accounts")
            return [address];
          if (method === "eth_chainId") return "0x4bc";
          if (method === "personal_sign")
            return (window as any).__signWalletMessage(params[0]);
          throw new Error(`Unexpected wallet method ${method}`);
        },
      };
    },
    { address: wallet.address.toLowerCase() },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /MetaMask Standard/ }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "Cyber Testing" })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page.getByRole("tab", { name: "Ask AI" }).click();
  await expect(page.getByLabel("Question text", { exact: true })).toBeVisible();
}
const assistant = (page: Page) =>
  page.getByRole("region", { name: "Proposal AI Assistant" });
async function ask(page: Page, questions: string[]) {
  for (const question of questions) {
    await page.getByLabel("Question text", { exact: true }).fill(question);
    await page.getByLabel("Question text", { exact: true }).press("Control+Enter");
  }
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/ai/assistant/ask/stream"),
  );
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  const stream = await response;
  expect(stream.status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "Processing…", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask AI", exact: true }),
  ).toBeEnabled({ timeout: 220_000 });
  return await stream.text();
}
test("real login, proposal, cited answer, five ordered questions, follow-up and persisted history", async ({
  page,
}) => {
  await enter(page);
  const first = await ask(page, ["What is this proposal about?"]);
  expect(first).toContain("event: question_start");
  expect(first).toContain("event: run_complete");
  await expect(
    assistant(page)
      .getByText(/Sources: \[G/)
      .first(),
  ).toBeVisible();
  await assistant(page)
    .locator("summary")
    .filter({ hasText: /^\[G/ })
    .first()
    .click();
  await expect(
    assistant(page)
      .getByText(/governance-db/)
      .first(),
  ).toBeVisible();
  const five = [
    "What is the proposal title?",
    "What is the proposal status?",
    "When does the proposal start?",
    "When does the proposal end?",
    "What is the proposal purpose?",
  ];
  const batch = await ask(page, five);
  expect(batch).toContain("event: run_complete");
  const cards = assistant(page).locator(
    ".assistant-transcript > .batch-answer-card",
  );
  await expect(cards).toHaveCount(5);
  for (let i = 0; i < five.length; i++)
    await expect(cards.nth(i).getByRole("heading")).toHaveText(five[i]);
  await ask(page, [
    "Based on the previous answer, summarize the proposal purpose.",
  ]);
  const conversation = await page
    .getByLabel("Saved conversations")
    .inputValue();
  expect(conversation).toMatch(/^[0-9a-f-]{36}$/);
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.getByLabel("Saved conversations").selectOption(conversation);
  await expect(
    assistant(page)
      .getByText(
        "Based on the previous answer, summarize the proposal purpose.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await expect(
    assistant(page)
      .getByText(/Sources: \[G/)
      .first(),
  ).toBeVisible();
  // Return after a full page load; all history and evidence must be persisted.
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "Cyber Testing" })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page.getByRole("tab", { name: "Ask AI" }).click();
  await page.getByLabel("Saved conversations").selectOption(conversation);
  await expect(
    assistant(page)
      .getByText(/Sources: \[G/)
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Proposal evidence", exact: true })
    .click();
  await expect(
    assistant(page).getByText(/No documents are linked/),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Question text", { exact: true })).toBeVisible();
  const overflow = await assistant(page).evaluate(
    (el) => el.scrollWidth > el.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "test-results/assistant-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "AI Assistant", exact: true }).click();
  await expect(page.getByLabel("AI proposal")).toHaveValue("onchain-28");
  await expect(page.getByLabel("Question text", { exact: true })).toBeVisible();
});
test("real missing evidence abstains and dependent questions keep order", async ({
  page,
}) => {
  await enter(page);
  const raw = await ask(page, [
    "What does the PDF evidence say about a hypothetical Martian colony?",
    "Based on the previous answer, what does that PDF prove?",
  ]);
  expect(raw).toContain("The available evidence does not establish that.");
  await expect(
    assistant(page)
      .getByText(/Insufficient evidence/)
      .first(),
  ).toBeVisible();
});
test("UI explains expired authentication, timeout and HTTP 500", async ({
  page,
}) => {
  await enter(page);
  const pattern = "**/ai/assistant/ask/stream";
  for (const [status, message] of [
    [401, "AI session expired. Sign in again."],
    [502, "AI server is unavailable or timed out."],
    [500, "AI server failed."],
  ] as const) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ message }),
      }),
    );
    await page
      .getByLabel("Question text", { exact: true })
      .fill("What is this proposal about?");
    await page.getByRole("button", { name: "Ask AI", exact: true }).click();
    await expect(assistant(page).getByRole("alert")).toContainText(message);
    await page.unroute(pattern);
    if (status === 401) {
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Ask AI", exact: true }),
      ).toBeEnabled();
    }
  }
});

test("real execution details, blockchain comparison and persistent metric exports", async ({
  page,
}) => {
  await enter(page);
  const raw = await ask(page, [
    "What is the proposal title?",
    "Verify on-chain voting status and vote counts against the database.",
  ]);
  expect(raw).toContain("event: execution_update");
  expect(raw).toContain("compare_on_chain_off_chain");
  const panel = assistant(page);
  const result = panel
    .locator(".assistant-transcript > .batch-answer-card")
    .last();
  await result
    .locator("summary")
    .filter({ hasText: "Execution Details" })
    .click();
  await expect(result.locator(".execution-details")).toContainText(
    "compare_on_chain_off_chain",
  );
  await expect(result.locator(".execution-details")).toContainText("qwen");
  await expect(result.locator(".blockchain-verification")).toContainText(
    "1212",
  );
  await expect(result.locator(".blockchain-verification")).toContainText(
    "Snapshot block",
  );
  await expect(result.locator(".blockchain-verification")).toContainText(
    "public.votes.count",
  );
  const capture = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export metrics (JSON)", exact: true })
    .click();
  const download = await capture;
  const runs = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(
    runs.some((run: any) =>
      run.results.some(
        (r: any) => r.agent === "blockchain" && r.execution?.trace?.length > 0,
      ),
    ),
  ).toBe(true);
  const csvCapture = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export metrics (CSV)", exact: true })
    .click();
  const csv = await csvCapture;
  const contents = readFileSync((await csv.path())!, "utf8");
  expect(contents).toContain("input_tokens");
  expect(contents).toContain("blockchain_status");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/observability-mobile.png",
    fullPage: true,
  });
});


test("question composer queues, edits, splits pasted lists and validates limits", async ({ page }) => {
  await enter(page);
  const draft = page.getByLabel("Question text", { exact: true });
  const queue = page.getByRole("list", { name: "Questions to send" });
  await draft.fill("What is the purpose?");
  await draft.press("Control+Enter");
  await expect(queue.locator("li")).toHaveCount(1);
  await expect(draft).toHaveValue("");
  await page.getByRole("button", {name:"Edit question 1",exact:true}).click();
  await expect(draft).toHaveValue("What is the purpose?");
  await page.getByRole("button", {name:"Add question",exact:true}).click();
  await draft.fill('1. "What is its title?"\n2. "When does voting end?"');
  await draft.press("Control+Enter");
  await expect(queue.locator("li")).toHaveCount(3);
  await expect(queue.locator("li").nth(1)).toContainText("What is its title?");
  await page.getByRole("button", {name:"Remove question 2",exact:true}).click();
  await expect(queue.locator("li")).toHaveCount(2);
  await draft.fill(Array.from({length:19},(_,i)=>`Question ${i}?`).join("\n"));
  await draft.press("Control+Enter");
  await expect(assistant(page).getByRole("alert")).toContainText("up to 20 questions");
  await expect(queue.locator("li")).toHaveCount(2);
  await draft.fill('"How many members are assigned?"');
  let submitted: string[] = [];
  await page.route("**/ai/assistant/ask/stream", async route => {
    submitted = route.request().postDataJSON().question;
    await route.fulfill({status:200,contentType:"text/event-stream",body:'event: run_complete\ndata: {"data":{"status":"completed"}}\n\n'});
  });
  await page.getByRole("button", {name:"Ask AI",exact:true}).click();
  await expect.poll(()=>submitted.length).toBe(3);
  expect(submitted).toEqual(["What is the purpose?","When does voting end?","How many members are assigned?"]);
});
