import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  use: {
    baseURL: process.env.ASSISTANT_WEB_URL ?? "http://127.0.0.1:3005",
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/assistant-results.json" }],
  ],
});

