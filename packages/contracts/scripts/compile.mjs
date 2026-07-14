import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const require = createRequire(import.meta.url);
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceName = "contracts/CyberDAOGovernance.sol";
const sourcePath = resolve(packageDirectory, sourceName);

const input = {
  language: "Solidity",
  sources: {
    [sourceName]: { content: readFileSync(sourcePath, "utf8") },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "london",
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "evm.bytecode.object",
          "evm.deployedBytecode.object",
          "metadata",
        ],
      },
    },
  },
};

function resolveImport(importPath) {
  try {
    const resolvedPath = require.resolve(importPath, {
      paths: [packageDirectory],
    });
    return { contents: readFileSync(resolvedPath, "utf8") };
  } catch (error) {
    return { error: `Unable to resolve ${importPath}: ${error.message}` };
  }
}

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: resolveImport }),
);
const diagnostics = output.errors ?? [];
for (const diagnostic of diagnostics) {
  const target = diagnostic.severity === "error" ? console.error : console.warn;
  target(diagnostic.formattedMessage.trim());
}

if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
  process.exitCode = 1;
} else {
  const compiled = output.contracts[sourceName].CyberDAOGovernance;
  const artifact = {
    contractName: "CyberDAOGovernance",
    compilerVersion: solc.version(),
    evmVersion: input.settings.evmVersion,
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
    metadata: JSON.parse(compiled.metadata),
  };
  const artifactDirectory = resolve(packageDirectory, "artifacts");
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(
    resolve(artifactDirectory, "CyberDAOGovernance.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  console.log(
    `Compiled ${artifact.contractName} with ${artifact.compilerVersion} for EVM ${artifact.evmVersion}.`,
  );
}
