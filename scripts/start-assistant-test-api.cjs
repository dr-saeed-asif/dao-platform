const fs = require("fs");
const { spawn } = require("child_process");
const { Wallet } = require("ethers");
const dotenv = require("dotenv");
const env = dotenv.parse(fs.readFileSync(".env"));
const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...env,
    PORT: "3004",
    API_HOST: "127.0.0.1",
    AI_SERVER_URL: "http://127.0.0.1:8001",
    DAO_ADMIN_ADDRESS: new Wallet(env.ECDSA_PRIVATE_KEY).address,
    VOTE_INDEXER_ENABLED: "false",
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
