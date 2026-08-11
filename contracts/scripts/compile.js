const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = path.join(__dirname, "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const OUT_DIR = path.join(ROOT, "artifacts-manual");

const CONTRACT_FILES = ["SectoraToken.sol", "SectoraHashMarket.sol", "ValidatorRegistry.sol"];

function findImport(importPath) {
  const candidates = [
    path.join(ROOT, "node_modules", importPath),
    path.join(CONTRACTS_DIR, importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { contents: fs.readFileSync(c, "utf8") };
  }
  return { error: "File not found: " + importPath };
}

const sources = {};
for (const file of CONTRACT_FILES) {
  sources[file] = { content: fs.readFileSync(path.join(CONTRACTS_DIR, file), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      hasError = true;
      console.error(err.formattedMessage);
    } else {
      console.warn(err.formattedMessage);
    }
  }
}
if (hasError) {
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const file of CONTRACT_FILES) {
  const contractsInFile = output.contracts[file];
  for (const name of Object.keys(contractsInFile)) {
    const c = contractsInFile[name];
    const artifact = {
      contractName: name,
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
    };
    fs.writeFileSync(path.join(OUT_DIR, name + ".json"), JSON.stringify(artifact, null, 2));
    console.log("Compiled", name, "-> artifacts-manual/" + name + ".json", `(${(c.evm.bytecode.object.length / 2)} bytes)`);
  }
}
