const fs = require("fs");
const path = require("path");
const solc = require("solc");

const DIR = path.join(__dirname, "..", "flattened");
for (const name of ["SectoraToken", "SectoraHashMarket", "ValidatorRegistry"]) {
  const file = name + ".flattened.sol";
  const input = {
    language: "Solidity",
    sources: { [file]: { content: fs.readFileSync(path.join(DIR, file), "utf8") } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  let hasError = false;
  if (output.errors) {
    for (const err of output.errors) {
      if (err.severity === "error") {
        hasError = true;
        console.error(name, "ERROR:", err.formattedMessage);
      }
    }
  }
  if (!hasError) {
    const contractNames = Object.keys(output.contracts[file]);
    console.log(name, "OK — contracts in file:", contractNames.join(", "));
  } else {
    process.exitCode = 1;
  }
}
