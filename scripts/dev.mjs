import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = new URL("../", import.meta.url);
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const children = [];
let stopping = false;

function start(args) {
  const child = spawn(npm, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    shell: isWindows,
  });
  children.push(child);
  child.once("error", (error) => {
    console.error(`Could not start ${args.join(" ")}: ${error.message}`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`${args.join(" ")} exited (${signal ?? code ?? "unknown"}).`);
      stop(code ?? 1);
    }
  });
  return child;
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;

  for (const child of children) {
    if (!child.pid) continue;
    if (isWindows) {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.unref();
    } else {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
if (isWindows) process.on("SIGBREAK", () => stop());

async function apiIsHealthy() {
  try {
    const response = await fetch("http://127.0.0.1:3000/v1/health", {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

let apiReady = await apiIsHealthy();
let api;

if (apiReady) {
  console.log("An existing Nest API is healthy. Starting the Next.js web app...");
} else {
  console.log("Starting the Nest API and waiting for PostgreSQL/API health...");
  api = start(["run", "dev:api"]);
  const deadline = Date.now() + 120_000;

  while (!stopping && Date.now() < deadline) {
    if (api.exitCode !== null || api.signalCode !== null) break;
    apiReady = await apiIsHealthy();
    if (apiReady) break;
    // The API is still starting; retry until its health endpoint responds.
    await delay(1_000);
  }
}

if (!apiReady) {
  if (!stopping) {
    console.error("Nest API did not become healthy within 120 seconds. Check API and PostgreSQL logs.");
    stop(1);
  }
} else if (!stopping) {
  if (api) console.log("Nest API is healthy. Starting the Next.js web app...");
  start(["run", "dev:web"]);
}
