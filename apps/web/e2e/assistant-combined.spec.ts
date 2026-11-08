import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const admin = readFileSync(resolve(__dirname, "../../../.env"), "utf8")
  .match(/^DAO_ADMIN_ADDRESS=(.+)$/m)![1].trim().replace(/^["']|["']$/g, "").toLowerCase();

test("one user message produces one combined answer with internal specialist details", async ({ page }) => {
  test.setTimeout(60000);
  let submitted: unknown;
  const conversation = "11111111-1111-4111-8111-111111111111";
  const question = "Explain EUR 4,500, EUR 2,000, 15000?\nAnd how many votes are stored?";
  const workers = [
    { question_id: "q1.evidence", question, agent: "evidence", status: "completed", answer: "Budget EUR 4,500 [D1].", citations: ["D1"], cited_sources: [], errors: [] },
    { question_id: "q1.governance", question, agent: "governance", status: "failed", answer: null, citations: [], cited_sources: [], errors: ["This check timed out."] },
  ];
  const final = { question_id: "response", question, agent: "analysis", status: "completed",
    answer: "The total budget is EUR 4,500 [D1].\n\nThe voting check could not complete.",
    citations: ["D1"], cited_sources: [{ source_id: "D1", content: "Budget EUR 4,500", metadata: { filename: "Training.pdf", page_number: 1 } }],
    errors: ["Some checks could not complete."], worker_results: workers };
  await page.route("**/api/v1/ai/assistant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/challenge")) return route.fulfill({json:{nonce:"test",message:"UI test only"}});
    if (path.endsWith("/auth/login")) return route.fulfill({json:{token:"mock-ui-token",address:admin,expires:Date.now()+600000}});
    if (path.endsWith("/ask/stream")) {
      submitted=route.request().postDataJSON();
      const events = [
        ["question_plan", { data: { questions: ["Explain budget", "Count votes"], needs_clarification: false } }],
        ["question_start", {question_id:"q1.evidence",data:{agent:"evidence"}}],
        ["question_complete", {question_id:"q1.evidence",data:workers[0]}],
        ["question_error", {question_id:"q1.governance",data:{error:"timeout"}}],
        ["response_progress", {data:{status:"Combining findings"}}],
        ["run_complete", {conversation_id:conversation,status:"partial_failure",results:workers,final_response:final}],
      ].map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
      return route.fulfill({status:200,contentType:"text/event-stream",body:events});
    }
    return route.fulfill({json:[]});
  });
  await page.addInitScript(({address}) => {
    (window as any).ethereum = {on(){},removeListener(){},async request({method}:any) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
      if (method === "eth_chainId") return "0x4bc";
      if (method === "personal_sign") return "0x"+"11".repeat(65);
      throw new Error(`Unexpected wallet operation: ${method}`);
    }};
  }, {address:admin});
  await page.goto("/");
  await page.getByRole("button",{name:"Connect wallet",exact:true}).first().click();
  await page.getByRole("button",{name:/MetaMask Standard/}).click();
  await page.getByRole("row").filter({hasText:"Cyber Testing"}).getByRole("button",{name:"Open",exact:true}).click();
  await page.getByRole("tab",{name:"Ask AI"}).click();
  const input=page.getByLabel("Question text",{exact:true});
  await expect(input).toBeEnabled();
  await input.fill(question);
  await page.getByRole("button",{name:"Ask AI",exact:true}).click();
  const assistant=page.getByRole("region",{name:"Proposal AI Assistant"});
  await expect(assistant.getByText("Partial answer",{exact:true})).toBeVisible();
  expect((submitted as any).question).toEqual([question]);
  await expect(assistant.locator(".assistant-message-assistant .batch-answer-card")).toHaveCount(1);
  await expect(assistant.getByText("Specialist checks · 2",{exact:true})).toBeVisible();
  await expect(assistant.getByText("governance · failed",{exact:true})).not.toBeVisible();
  await assistant.getByText("Specialist checks · 2",{exact:true}).click();
  await expect(assistant.getByText("governance · failed",{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await assistant.evaluate(el=>el.scrollWidth > el.clientWidth+1)).toBe(false);
  await page.screenshot({path:"test-results/assistant-combined-response.png",fullPage:true});
});
