import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SmartContractInterface,
  Web3RPCClient,
  deploySmartContract,
  privateKeyToAddress,
  privateKeyToMixedAddress,
} from "@cyberchain/smart-contract-wrapper";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageDirectory, "../..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readEnvironment(path) {
  const values = {};
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim();
  }
  return values;
}

function required(values, name) {
  const value = values[name]?.trim();
  if (!value) throw new Error(`Missing required environment value: ${name}`);
  return value;
}

function hexBytes(value) {
  return Buffer.from(value.replace(/^0x/i, ""), "hex");
}

function transactionHash(receipt) {
  return `0x${Buffer.from(receipt.transactionHash).toString("hex")}`;
}

function blockHash(receipt) {
  return `0x${Buffer.from(receipt.blockHash).toString("hex")}`;
}

function updateEnvironment(path, updates) {
  let contents = readFileSync(path, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    contents = pattern.test(contents)
      ? contents.replace(pattern, `${key}=${value}`)
      : `${contents.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync(path, contents);
}

async function main() {
  const environmentPath = resolve(
    argument("--env-file") ?? resolve(repositoryRoot, ".env"),
  );
  const confirmation = argument("--confirm-network");
  if (!confirmation) {
    throw new Error(
      "Refusing deployment without --confirm-network <network-id>.",
    );
  }

  const daoEnvironmentPath = resolve(repositoryRoot, ".env");
  const daoEnvironment = readEnvironment(daoEnvironmentPath);
  const signingEnvironment = readEnvironment(environmentPath);
  const values = { ...daoEnvironment, ...signingEnvironment };
  const rpcURL =
    values.CYBERCHAIN_RPC_URL?.trim() || required(values, "RPC_URL");
  const networkId = (
    await Web3RPCClient.getInstance().getNetworkId({ rpcURL })
  ).toString();

  if (confirmation !== networkId) {
    throw new Error(
      `Network confirmation ${confirmation} does not match RPC network ${networkId}.`,
    );
  }

  const ecdsaKey = {
    type: "ec-dsa",
    key: hexBytes(required(values, "ECDSA_PRIVATE_KEY")),
  };
  const mldsaKey = {
    type: "ml-dsa",
    spec: Number(values.MLDSA_LEVEL || 44),
    publicKey: hexBytes(required(values, "MLDSA_PUBLIC_KEY")),
    secretKey: values.MLDSA_SECRET_KEY
      ? hexBytes(values.MLDSA_SECRET_KEY)
      : new Uint8Array(),
  };
  const signMode = values.SIGN_MODE || "ec-dsa";
  const signKey = signMode === "ml-dsa" ? mldsaKey : ecdsaKey;
  const complementaryAddress =
    signMode === "ml-dsa"
      ? privateKeyToAddress(ecdsaKey)
      : privateKeyToAddress(mldsaKey);
  const sender = privateKeyToMixedAddress(signKey, complementaryAddress);

  if (
    values.EXPECTED_SENDER_ADDRESS &&
    sender.toLowerCase() !== values.EXPECTED_SENDER_ADDRESS.toLowerCase()
  ) {
    throw new Error(
      "Signing material does not derive EXPECTED_SENDER_ADDRESS; deployment stopped.",
    );
  }

  const balance = await Web3RPCClient.getInstance().getBalance(
    sender,
    "latest",
    {
      rpcURL,
    },
  );
  const gasPrice = await Web3RPCClient.getInstance().gasPrice({ rpcURL });
  if (balance === 0n && gasPrice > 0n) {
    throw new Error(
      "The deployment wallet has no balance for transaction fees.",
    );
  }

  const artifactPath = resolve(
    repositoryRoot,
    "packages/contracts/artifacts/CyberDAOGovernance.json",
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const existingTransactionHash = argument("--existing-tx");

  console.log(
    existingTransactionHash
      ? `Recovering CyberDAOGovernance deployment on network ${networkId}.`
      : `Deploying CyberDAOGovernance to network ${networkId}.`,
  );
  console.log(`Deployer/initial owner: ${sender}`);
  console.log(
    `Compiler: ${artifact.compilerVersion}; EVM: ${artifact.evmVersion}`,
  );

  const deployed = existingTransactionHash
    ? await recoverDeployment(existingTransactionHash, rpcURL)
    : await deploySmartContract(artifact.bytecode, artifact.abi, [sender], 0, {
        rpcURL,
        signKey,
        complementaryAddress,
        chainId: networkId,
        isFeeMarket: true,
        receiptWaitTimeout: 120_000,
        logFunction: (message) => {
          if (!message.startsWith("Transaction data:")) {
            console.log(`  ${message}`);
          }
        },
      });

  if (deployed.receipt.status !== 1n || !deployed.result) {
    throw new Error("Governance contract deployment reverted.");
  }

  const contract = new SmartContractInterface(deployed.result, artifact.abi, {
    rpcURL,
  });
  const ownerResult = await contract.callViewMethod("owner", [], {});
  const onChainOwner = String(ownerResult[0]).toLowerCase();
  if (onChainOwner !== sender.toLowerCase()) {
    throw new Error("Deployed contract owner verification failed.");
  }

  const deployment = {
    contractName: artifact.contractName,
    address: deployed.result,
    owner: sender,
    networkId,
    transactionHash: transactionHash(deployed.receipt),
    blockNumber: deployed.receipt.blockNumber.toString(),
    blockHash: blockHash(deployed.receipt),
    gasUsed: deployed.receipt.gasUsed.toString(),
    compilerVersion: artifact.compilerVersion,
    evmVersion: artifact.evmVersion,
    bytecodeSha256: createHash("sha256")
      .update(artifact.bytecode)
      .digest("hex"),
    deployedAt: new Date().toISOString(),
  };

  const deploymentsDirectory = resolve(repositoryRoot, "deployments");
  mkdirSync(deploymentsDirectory, { recursive: true });
  const deploymentPath = resolve(
    deploymentsDirectory,
    `cyber-dao-governance-${networkId}.json`,
  );
  writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
  updateEnvironment(daoEnvironmentPath, {
    CYBERCHAIN_RPC_URL: rpcURL,
    CYBERCHAIN_CHAIN_ID: networkId,
    GOVERNANCE_CONTRACT_ADDRESS: deployed.result,
  });

  console.log(`Deployment verified at ${deployed.result}.`);
  console.log(`Receipt recorded in ${deploymentPath}.`);
}

async function recoverDeployment(hash, rpcURL) {
  const receipt = await Web3RPCClient.getInstance().getTransactionReceipt(
    hash,
    {
      rpcURL,
    },
  );
  if (!receipt) throw new Error(`No receipt found for ${hash}.`);
  if (!receipt.contractAddress) {
    throw new Error(`${hash} is not a contract deployment transaction.`);
  }
  return { receipt, result: receipt.contractAddress };
}

main().catch((error) => {
  console.error(
    "Governance deployment failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
