const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const ARTIFACTS = path.join(__dirname, "..", "artifacts-manual");
function loadArtifact(name) {
  return JSON.parse(fs.readFileSync(path.join(ARTIFACTS, name + ".json"), "utf8"));
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  ok:", msg);
}

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  // Hardhat Network's built-in unlocked dev accounts (test-only) — using the
  // node's own signer avoids needing to hardcode any private key.
  const deployer = await provider.getSigner(0);
  const treasury = await provider.getSigner(1);
  const alice = await provider.getSigner(2);
  const bob = await provider.getSigner(3);

  console.log("Deployer: ", deployer.address);
  console.log("Treasury: ", treasury.address);
  console.log("Alice:    ", alice.address);
  console.log("Bob:      ", bob.address);

  const tokenArt = loadArtifact("SectoraToken");
  const marketArt = loadArtifact("SectoraHashMarket");
  const registryArt = loadArtifact("ValidatorRegistry");

  console.log("\n== Deploying SectoraToken ==");
  const TokenFactory = new ethers.ContractFactory(tokenArt.abi, tokenArt.bytecode, deployer);
  const initialSupply = ethers.parseEther("1000000"); // 1,000,000 tSECT
  const token = await TokenFactory.deploy(initialSupply);
  await token.waitForDeployment();
  console.log("SectoraToken deployed at", await token.getAddress());

  assert((await token.totalSupply()) === initialSupply, "initial supply minted correctly");
  assert((await token.balanceOf(deployer.address)) === initialSupply, "deployer holds initial supply");

  console.log("\n== Deploying SectoraHashMarket ==");
  const MarketFactory = new ethers.ContractFactory(marketArt.abi, marketArt.bytecode, deployer);
  const market = await MarketFactory.deploy(await token.getAddress(), treasury.address);
  await market.waitForDeployment();
  console.log("SectoraHashMarket deployed at", await market.getAddress());

  const pkgCount = await market.packageCount();
  assert(pkgCount === 6n, "6 default packages seeded (3 online + 3 physical)");
  const starter = await market.packages(0);
  assert(starter.name === "Starter Hash", "package 0 is Starter Hash");
  assert(starter.kind === 0n, "package 0 is Online kind");
  const homeKit = await market.packages(3);
  assert(homeKit.name === "Home Validator Kit", "package 3 is Home Validator Kit");
  assert(homeKit.kind === 1n, "package 3 is Physical kind");

  console.log("\n== Deploying ValidatorRegistry (min 40 hash power to validate) ==");
  const MIN_HASH = 40;
  const RegistryFactory = new ethers.ContractFactory(registryArt.abi, registryArt.bytecode, deployer);
  const registry = await RegistryFactory.deploy(await market.getAddress(), MIN_HASH);
  await registry.waitForDeployment();
  console.log("ValidatorRegistry deployed at", await registry.getAddress());

  console.log("\n== Faucet: Alice and Bob claim test tokens ==");
  const tokenAsAlice = token.connect(alice);
  const tokenAsBob = token.connect(bob);
  await (await tokenAsAlice.faucet()).wait();
  await (await tokenAsBob.faucet()).wait();
  const faucetAmount = await token.FAUCET_AMOUNT();
  assert((await token.balanceOf(alice.address)) === faucetAmount, "Alice received faucet amount");
  assert((await token.balanceOf(bob.address)) === faucetAmount, "Bob received faucet amount");

  console.log("\n== Bob tries to register WITHOUT buying hash first (must fail) ==");
  const registryAsBob = registry.connect(bob);
  let blockedWithoutHash = false;
  try {
    await (await registryAsBob.register("Bob's Node", -34603700, -58381600)).wait();
  } catch (e) {
    blockedWithoutHash = true;
  }
  assert(blockedWithoutHash, "registration reverts with zero hash power");

  console.log("\n== Alice buys 'Starter Hash' (online, 10 hash power) — below the 40 minimum ==");
  const marketAsAlice = market.connect(alice);
  await (await tokenAsAlice.approve(await market.getAddress(), ethers.parseEther("100"))).wait();
  await (await marketAsAlice.purchase(0)).wait();
  assert((await market.hashPower(alice.address)) === 10n, "Alice has 10 hash power after Starter Hash purchase");

  console.log("\n== Alice tries to register with only 10 hash power (must still fail) ==");
  const registryAsAlice = registry.connect(alice);
  let blockedInsufficientHash = false;
  try {
    await (await registryAsAlice.register("Alice's Node", -34603700, -58381600)).wait();
  } catch (e) {
    blockedInsufficientHash = true;
  }
  assert(blockedInsufficientHash, "registration reverts with insufficient hash power (10 < 40)");

  console.log("\n== Bob buys 'Home Validator Kit' (physical, 45 hash power) ==");
  const marketAsBob = market.connect(bob);
  await (await tokenAsBob.approve(await market.getAddress(), ethers.parseEther("300"))).wait();
  const treasuryBalBefore = await token.balanceOf(treasury.address);
  await (await marketAsBob.purchase(3)).wait();
  const treasuryBalAfter = await token.balanceOf(treasury.address);
  assert((await market.hashPower(bob.address)) === 45n, "Bob has 45 hash power after Home Validator Kit purchase");
  assert(treasuryBalAfter - treasuryBalBefore === ethers.parseEther("300"), "treasury received the 300 tSECT payment");

  console.log("\n== Bob registers as a validator (45 >= 40 minimum) ==");
  await (await registryAsBob.register("Sectora Node BA-1", -34603700, -58381600)).wait();
  assert((await registry.validatorCount()) === 1n, "validator count is 1 after registration");
  const v = await registry.validators(0);
  assert(v.operator === bob.address, "registered validator operator matches Bob");
  assert(v.name === "Sectora Node BA-1", "registered validator name matches");
  assert(v.hashPowerAtRegistration === 45n, "validator's hash power snapshot recorded correctly");
  assert(v.active === true, "registered validator is active");

  console.log("\n== Alice tops up with 'Pro Hash' (online, 50 more) to cross the threshold ==");
  await (await tokenAsAlice.approve(await market.getAddress(), ethers.parseEther("450"))).wait();
  await (await marketAsAlice.purchase(1)).wait();
  assert((await market.hashPower(alice.address)) === 60n, "Alice has 60 total hash power (10 + 50)");
  await (await registryAsAlice.register("Alice's Node", 40712800, -74006000)).wait();
  assert((await registry.validatorCount()) === 2n, "validator count is 2 after Alice registers");

  console.log("\n== Bob deactivates his validator ==");
  await (await registryAsBob.deactivate()).wait();
  assert((await registry.activeValidatorCount()) === 1n, "active validator count is 1 after Bob deactivates");
  assert((await registry.validatorCount()) === 2n, "total validator count unchanged after deactivation");

  console.log("\n== getValidators pagination ==");
  const page = await registry.getValidators(0, 10);
  assert(page.length === 2, "getValidators returns both registered validators");

  console.log("\n== Owner can add a new package and deactivate an old one ==");
  await (await market.addPackage("Mega Hash", 0, ethers.parseEther("9000"), 1200)).wait();
  assert((await market.packageCount()) === 7n, "package count is 7 after adding Mega Hash");
  await (await market.setPackageActive(0, false)).wait();
  let purchaseBlockedWhenInactive = false;
  try {
    await (await tokenAsBob.approve(await market.getAddress(), ethers.parseEther("100"))).wait();
    await (await marketAsBob.purchase(0)).wait();
  } catch (e) {
    purchaseBlockedWhenInactive = true;
  }
  assert(purchaseBlockedWhenInactive, "purchasing a deactivated package reverts");

  console.log("\nALL LOCAL TESTS PASSED");
  console.log(
    JSON.stringify(
      {
        token: await token.getAddress(),
        hashMarket: await market.getAddress(),
        registry: await registry.getAddress(),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
