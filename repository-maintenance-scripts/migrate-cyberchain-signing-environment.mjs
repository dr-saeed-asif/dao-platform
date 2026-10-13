import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnvironment(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function updateEnvironment(path, updates) {
  let contents = readFileSync(path, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    if (!value) continue;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    contents = pattern.test(contents)
      ? contents.replace(pattern, `${key}=${value}`)
      : `${contents.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync(path, contents);
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(
  process.argv[2] ??
    resolve(repositoryRoot, "../cyberchain-smart-contract-wrapper/.env"),
);
const targetPath = resolve(repositoryRoot, ".env");
const source = readEnvironment(sourcePath);

updateEnvironment(targetPath, {
  CYBERCHAIN_RPC_URL: source.RPC_URL,
  SIGN_MODE: source.SIGN_MODE,
  ECDSA_PRIVATE_KEY: source.ECDSA_PRIVATE_KEY,
  MLDSA_PUBLIC_KEY: source.MLDSA_PUBLIC_KEY,
  MLDSA_LEVEL: source.MLDSA_LEVEL,
  MLDSA_SECRET_KEY: source.MLDSA_SECRET_KEY,
  EXPECTED_SENDER_ADDRESS: source.EXPECTED_SENDER_ADDRESS,
});

console.log("SDK configuration migrated to dao-platform/.env (values hidden).");
