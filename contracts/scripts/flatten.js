const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const OUT_DIR = path.join(ROOT, "flattened");

function resolveImportPath(importPath, fromFile) {
  if (importPath.startsWith(".")) {
    return path.normalize(path.join(path.dirname(fromFile), importPath));
  }
  return path.join(ROOT, "node_modules", importPath);
}

function flatten(entryFile) {
  const visited = new Set();
  const licenses = new Set();
  const pragmas = new Set();
  let body = "";

  function visit(file) {
    const real = fs.realpathSync(file);
    if (visited.has(real)) return;
    visited.add(real);

    const src = fs.readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (const line of lines) {
      const importMatch = line.match(/^\s*import\s+(?:"([^"]+)"|'([^']+)'|.*from\s+["']([^"']+)["'])/);
      const licenseMatch = line.match(/SPDX-License-Identifier:\s*(\S+)/);
      const pragmaMatch = line.match(/^\s*pragma\s+solidity\s+([^;]+);/);

      if (licenseMatch) {
        licenses.add(licenseMatch[1]);
        continue;
      }
      if (pragmaMatch) {
        pragmas.add(pragmaMatch[1].trim());
        continue;
      }
      if (importMatch) {
        const importPath = importMatch[1] || importMatch[2] || importMatch[3];
        visit(resolveImportPath(importPath, file));
        continue;
      }
      body += line + "\n";
    }
    body += "\n";
  }

  visit(entryFile);

  const licenseLine = "// SPDX-License-Identifier: " + Array.from(licenses)[0];
  const pragmaLine = "pragma solidity " + Array.from(pragmas)[0] + ";";
  return licenseLine + "\n" + pragmaLine + "\n\n" + body;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const name of ["SectoraToken", "SectoraHashMarket", "ValidatorRegistry"]) {
  const out = flatten(path.join(CONTRACTS_DIR, name + ".sol"));
  fs.writeFileSync(path.join(OUT_DIR, name + ".flattened.sol"), out);
  console.log("Flattened", name, "->", "flattened/" + name + ".flattened.sol", `(${out.length} chars)`);
}
