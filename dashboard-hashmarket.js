/* ---- Sectora Hash Market: real on-chain wiring for the "Become a
   Validator" dashboard section. Reads window.SectoraWallet (set up by
   dashboard-wallet.js) for the connected EIP-1193 provider/account, and
   talks to the 3 testnet contracts via the self-hosted ethers.js bundle.

   CONTRACTS below starts as all-zero placeholder addresses. Swap in the
   real deployed Sepolia addresses once available — nothing else in this
   file needs to change. ---- */
(function () {
  "use strict";

  const CONTRACTS = {
    chainId: "0xaa36a7", // Sepolia
    token: "0x0000000000000000000000000000000000000000",
    hashMarket: "0x0000000000000000000000000000000000000000",
    registry: "0x0000000000000000000000000000000000000000",
  };

  const TOKEN_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function faucet()",
    "function lastFaucetClaim(address) view returns (uint256)",
    "function FAUCET_COOLDOWN() view returns (uint256)",
    "function FAUCET_AMOUNT() view returns (uint256)",
  ];
  const MARKET_ABI = [
    "function packages(uint256) view returns (string name, uint8 kind, uint256 priceInToken, uint256 hashPower, bool active)",
    "function hashPower(address) view returns (uint256)",
    "function purchase(uint256 packageId)",
  ];
  const REGISTRY_ABI = [
    "function minHashToValidate() view returns (uint256)",
    "function validatorIndexPlusOne(address) view returns (uint256)",
    "function validators(uint256) view returns (address operator, string name, int32 latMicro, int32 lonMicro, uint256 hashPowerAtRegistration, uint64 registeredAt, bool active)",
    "function register(string name, int32 latMicro, int32 lonMicro)",
    "function deactivate()",
    "function reactivate()",
  ];

  // Mirrors SectoraHashMarket's hardcoded default packages exactly, so the
  // grid renders correctly even before a wallet is connected / before the
  // contracts are live. Once deployed + connected, on-chain reads for
  // price/hash/active take over (see refreshPackagesFromChain).
  const PACKAGE_DEFAULTS = [
    { id: 0, kind: 0, name: "Starter Hash", price: "100", hash: 10 },
    { id: 1, kind: 0, name: "Pro Hash", price: "450", hash: 50 },
    { id: 2, kind: 0, name: "Enterprise Hash", price: "1800", hash: 220 },
    { id: 3, kind: 1, name: "Home Validator Kit", price: "300", hash: 45 },
    { id: 4, kind: 1, name: "Pro Rack Node", price: "1200", hash: 200 },
    { id: 5, kind: 1, name: "Datacenter Node", price: "5000", hash: 950 },
  ];
  const DEFAULT_MIN_HASH = 40;

  const isDeployed =
    CONTRACTS.token !== ethers.ZeroAddress &&
    CONTRACTS.hashMarket !== ethers.ZeroAddress &&
    CONTRACTS.registry !== ethers.ZeroAddress;

  const $ = (id) => document.getElementById(id);
  const notDeployedEl = $("dhmNotDeployed");
  const balanceEl = $("dhmTokenBalance");
  const faucetBtn = $("dhmFaucetBtn");
  const tabOnline = $("dhmTabOnline");
  const tabPhysical = $("dhmTabPhysical");
  const packagesEl = $("dhmPackages");
  const hashPowerEl = $("dhmHashPower");
  const hashRequiredEl = $("dhmHashRequired");
  const progressFillEl = $("dhmProgressFill");
  const registerForm = $("dhmRegisterForm");
  const nodeNameInput = $("dhmNodeName");
  const latInput = $("dhmLat");
  const lonInput = $("dhmLon");
  const geoBtn = $("dhmGeoBtn");
  const registerBtn = $("dhmRegisterBtn");
  const hintEl = $("dhmHint");
  const registeredStatus = $("dhmRegisteredStatus");
  const registeredNameEl = $("dhmRegisteredName");
  const deactivateBtn = $("dhmDeactivateBtn");
  const howItWorksBtn = $("dhmHowItWorksBtn");
  const modalOverlay = $("dhmModalOverlay");
  const modalClose = $("dhmModalClose");
  const modalGotIt = $("dhmModalGotIt");

  if (!packagesEl) return; // section not present on this page

  if (notDeployedEl) notDeployedEl.hidden = isDeployed;

  let packages = PACKAGE_DEFAULTS.slice();
  let activeKind = 0;
  let minHash = DEFAULT_MIN_HASH;
  let currentHashPower = 0;
  let account = null;
  let ethProvider = null; // ethers.BrowserProvider
  let signer = null;
  let tokenRO = null, marketRO = null, registryRO = null; // provider-bound (reads)
  let tokenRW = null, marketRW = null, registryRW = null; // signer-bound (writes)

  function fmtAmount(weiBig) {
    const n = Number(ethers.formatEther(weiBig));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function setHint(msg, kind) {
    if (!hintEl) return;
    hintEl.textContent = msg || "";
    hintEl.classList.toggle("is-error", kind === "error");
    hintEl.classList.toggle("is-success", kind === "success");
  }

  function parseTxError(err) {
    if (!err) return "Something went wrong.";
    if (err.code === "ACTION_REJECTED" || err.code === 4001) return "Request rejected in wallet.";
    const raw = err.shortMessage || err.reason || err.message || String(err);
    const m = /reverted with reason string ['"](.+?)['"]/.exec(raw) || /execution reverted: (.+?)("|$)/.exec(raw);
    let text = m ? m[1] : raw;
    text = text.replace(/^SectoraHashMarket: /, "").replace(/^ValidatorRegistry: /, "").replace(/^SectoraToken: /, "");
    return text.length > 140 ? text.slice(0, 140) + "…" : text;
  }

  function bestIdForKind(kind) {
    const inKind = packages.filter((p) => p.kind === kind);
    if (!inKind.length) return -1;
    let best = inKind[0];
    for (const p of inKind) {
      if (Number(p.price) / p.hash < Number(best.price) / best.hash) best = p;
    }
    return best.id;
  }

  function packageCardHTML(pkg, bestId) {
    const kindLabel = pkg.kind === 0 ? "Online" : "Physical";
    const disabled = !isDeployed || !account || pkg.active === false;
    return (
      '<div class="dhm-package-card' + (pkg.id === bestId ? " is-best" : "") + '" data-id="' + pkg.id + '">' +
      (pkg.id === bestId ? '<span class="dhm-package-badge">Best value</span>' : "") +
      '<span class="dhm-package-name">' + pkg.name + "</span>" +
      '<div class="dhm-package-stats">' +
      '<div class="dhm-package-row"><span class="dhm-package-row-label">Type</span><span class="dhm-package-row-value">' + kindLabel + "</span></div>" +
      '<div class="dhm-package-row"><span class="dhm-package-row-label">Price</span><span class="dhm-package-row-value">' + pkg.price + " tSECT</span></div>" +
      '<div class="dhm-package-row"><span class="dhm-package-row-label">Hash power</span><span class="dhm-package-row-value is-hash">+' + pkg.hash + "</span></div>" +
      "</div>" +
      '<button class="dhm-package-buy-btn" type="button" data-buy="' + pkg.id + '"' + (disabled ? " disabled" : "") + ">" +
      (pkg.active === false ? "Unavailable" : isDeployed ? "Buy" : "Coming soon") +
      "</button>" +
      "</div>"
    );
  }

  function renderPackages() {
    const filtered = packages.filter((p) => p.kind === activeKind);
    const bestId = bestIdForKind(activeKind);
    packagesEl.innerHTML = filtered.map((p) => packageCardHTML(p, bestId)).join("");
    packagesEl.querySelectorAll("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => buyPackage(Number(btn.getAttribute("data-buy"))));
    });
  }

  function setTab(kind) {
    activeKind = kind;
    tabOnline.classList.toggle("is-active", kind === 0);
    tabOnline.setAttribute("aria-selected", kind === 0 ? "true" : "false");
    tabPhysical.classList.toggle("is-active", kind === 1);
    tabPhysical.setAttribute("aria-selected", kind === 1 ? "true" : "false");
    renderPackages();
  }
  if (tabOnline) tabOnline.addEventListener("click", () => setTab(0));
  if (tabPhysical) tabPhysical.addEventListener("click", () => setTab(1));

  function updateProgress() {
    if (hashPowerEl) hashPowerEl.textContent = String(currentHashPower);
    if (hashRequiredEl) hashRequiredEl.textContent = String(minHash);
    const pct = minHash > 0 ? Math.min(100, (currentHashPower / minHash) * 100) : 100;
    if (progressFillEl) {
      progressFillEl.style.width = pct + "%";
      progressFillEl.classList.toggle("is-complete", currentHashPower >= minHash);
    }
    if (registerBtn) registerBtn.disabled = !isDeployed || !account || currentHashPower < minHash;
  }

  async function refreshPackagesFromChain() {
    if (!isDeployed || !marketRO) return;
    try {
      const fresh = [];
      for (const p of PACKAGE_DEFAULTS) {
        const onchain = await marketRO.packages(p.id);
        fresh.push({
          id: p.id,
          kind: Number(onchain.kind),
          name: onchain.name,
          price: fmtAmount(onchain.priceInToken),
          hash: Number(onchain.hashPower),
          active: onchain.active,
        });
      }
      packages = fresh;
      renderPackages();
    } catch (e) {
      // fall back silently to the hardcoded defaults already rendered
    }
  }

  async function refreshBalance() {
    if (!isDeployed || !tokenRO || !account) {
      if (balanceEl) balanceEl.textContent = "—";
      return;
    }
    try {
      const bal = await tokenRO.balanceOf(account);
      if (balanceEl) balanceEl.textContent = fmtAmount(bal) + " tSECT";
    } catch (e) {
      if (balanceEl) balanceEl.textContent = "—";
    }
  }

  async function refreshFaucetState() {
    if (!faucetBtn) return;
    if (!isDeployed || !account) {
      faucetBtn.disabled = !account;
      return;
    }
    try {
      const [last, cooldown] = await Promise.all([
        tokenRO.lastFaucetClaim(account),
        tokenRO.FAUCET_COOLDOWN(),
      ]);
      const nextClaim = Number(last) + Number(cooldown);
      const now = Math.floor(Date.now() / 1000);
      faucetBtn.disabled = now < nextClaim;
    } catch (e) {
      faucetBtn.disabled = false;
    }
  }

  async function refreshHashPower() {
    if (!isDeployed || !marketRO || !account) {
      currentHashPower = 0;
      updateProgress();
      return;
    }
    try {
      const power = await marketRO.hashPower(account);
      currentHashPower = Number(power);
    } catch (e) {
      currentHashPower = 0;
    }
    updateProgress();
  }

  async function refreshMinHash() {
    if (!isDeployed || !registryRO) {
      minHash = DEFAULT_MIN_HASH;
      updateProgress();
      return;
    }
    try {
      const m = await registryRO.minHashToValidate();
      minHash = Number(m);
    } catch (e) {
      minHash = DEFAULT_MIN_HASH;
    }
    updateProgress();
  }

  async function refreshRegistration() {
    if (!isDeployed || !registryRO || !account) {
      registerForm.hidden = false;
      registeredStatus.hidden = true;
      return;
    }
    try {
      const idxPlusOne = await registryRO.validatorIndexPlusOne(account);
      if (Number(idxPlusOne) === 0) {
        registerForm.hidden = false;
        registeredStatus.hidden = true;
        return;
      }
      const v = await registryRO.validators(Number(idxPlusOne) - 1);
      registerForm.hidden = true;
      registeredStatus.hidden = false;
      if (registeredNameEl) registeredNameEl.textContent = v.name;
      if (nodeNameInput) nodeNameInput.value = v.name;
      if (latInput) latInput.value = (Number(v.latMicro) / 1e6).toString();
      if (lonInput) lonInput.value = (Number(v.lonMicro) / 1e6).toString();
      deactivateBtn.textContent = v.active ? "Deactivate" : "Reactivate";
      deactivateBtn.dataset.active = v.active ? "1" : "0";
    } catch (e) {
      registerForm.hidden = false;
      registeredStatus.hidden = true;
    }
  }

  async function refreshAll() {
    await Promise.all([
      refreshPackagesFromChain(),
      refreshBalance(),
      refreshFaucetState(),
      refreshHashPower(),
      refreshMinHash(),
      refreshRegistration(),
    ]);
  }

  async function ensureSepoliaAndSigner() {
    if (!isDeployed) throw new Error("Contracts not deployed yet.");
    if (!ethProvider) throw new Error("No wallet connected.");
    const network = await ethProvider.getNetwork();
    if ("0x" + network.chainId.toString(16) !== CONTRACTS.chainId) {
      throw new Error("Switch your wallet to the Sepolia test network.");
    }
    if (!signer) signer = await ethProvider.getSigner();
    if (!tokenRW) tokenRW = new ethers.Contract(CONTRACTS.token, TOKEN_ABI, signer);
    if (!marketRW) marketRW = new ethers.Contract(CONTRACTS.hashMarket, MARKET_ABI, signer);
    if (!registryRW) registryRW = new ethers.Contract(CONTRACTS.registry, REGISTRY_ABI, signer);
  }

  async function buyPackage(id) {
    if (!isDeployed) { setHint("Contracts are deploying to testnet — check back shortly.", "error"); return; }
    if (!account) { setHint("Connect your wallet first.", "error"); return; }
    const pkg = packages.find((p) => p.id === id);
    if (!pkg) return;
    try {
      await ensureSepoliaAndSigner();
      const price = ethers.parseEther(pkg.price);
      const allowance = await tokenRO.allowance(account, CONTRACTS.hashMarket);
      if (allowance < price) {
        setHint("Approving tSECT spend…");
        const approveTx = await tokenRW.approve(CONTRACTS.hashMarket, price);
        await approveTx.wait();
      }
      setHint("Confirm the purchase in your wallet…");
      const tx = await marketRW.purchase(id);
      await tx.wait();
      setHint("Purchased " + pkg.name + " — +" + pkg.hash + " hash power.", "success");
      await refreshAll();
    } catch (e) {
      setHint(parseTxError(e), "error");
    }
  }

  if (faucetBtn) {
    faucetBtn.addEventListener("click", async () => {
      if (!isDeployed) { setHint("Contracts are deploying to testnet — check back shortly.", "error"); return; }
      if (!account) { setHint("Connect your wallet first.", "error"); return; }
      try {
        await ensureSepoliaAndSigner();
        setHint("Claiming faucet…");
        const tx = await tokenRW.faucet();
        await tx.wait();
        setHint("Claimed 1,000 tSECT.", "success");
        await refreshAll();
      } catch (e) {
        setHint(parseTxError(e), "error");
      }
    });
  }

  if (geoBtn) {
    geoBtn.addEventListener("click", () => {
      if (!navigator.geolocation) { setHint("Geolocation isn't available in this browser.", "error"); return; }
      geoBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          latInput.value = pos.coords.latitude.toFixed(6);
          lonInput.value = pos.coords.longitude.toFixed(6);
          geoBtn.disabled = false;
        },
        () => { setHint("Couldn't read your location.", "error"); geoBtn.disabled = false; },
        { timeout: 8000 }
      );
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", async () => {
      if (!isDeployed) { setHint("Contracts are deploying to testnet — check back shortly.", "error"); return; }
      if (!account) { setHint("Connect your wallet first.", "error"); return; }
      const name = (nodeNameInput.value || "").trim();
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);
      if (!name) { setHint("Enter a node name.", "error"); return; }
      if (Number.isNaN(lat) || lat < -90 || lat > 90) { setHint("Enter a valid latitude.", "error"); return; }
      if (Number.isNaN(lon) || lon < -180 || lon > 180) { setHint("Enter a valid longitude.", "error"); return; }
      try {
        await ensureSepoliaAndSigner();
        setHint("Confirm registration in your wallet…");
        const latMicro = Math.round(lat * 1e6);
        const lonMicro = Math.round(lon * 1e6);
        const tx = await registryRW.register(name, latMicro, lonMicro);
        await tx.wait();
        setHint("Registered as validator.", "success");
        await refreshAll();
      } catch (e) {
        setHint(parseTxError(e), "error");
      }
    });
  }

  if (deactivateBtn) {
    deactivateBtn.addEventListener("click", async () => {
      try {
        await ensureSepoliaAndSigner();
        const reactivating = deactivateBtn.dataset.active === "0";
        const tx = reactivating ? await registryRW.reactivate() : await registryRW.deactivate();
        await tx.wait();
        await refreshAll();
      } catch (e) {
        setHint(parseTxError(e), "error");
      }
    });
  }

  async function onWalletChange(nextAccount, rawProvider) {
    account = nextAccount || null;
    signer = null;
    tokenRW = marketRW = registryRW = null;

    if (!account || !rawProvider || !isDeployed) {
      ethProvider = null;
      tokenRO = marketRO = registryRO = null;
      updateProgress();
      renderPackages();
      await refreshAll();
      return;
    }

    try {
      ethProvider = new ethers.BrowserProvider(rawProvider);
      tokenRO = new ethers.Contract(CONTRACTS.token, TOKEN_ABI, ethProvider);
      marketRO = new ethers.Contract(CONTRACTS.hashMarket, MARKET_ABI, ethProvider);
      registryRO = new ethers.Contract(CONTRACTS.registry, REGISTRY_ABI, ethProvider);
      await refreshAll();
    } catch (e) {
      ethProvider = null;
    }
  }

  function openModal() {
    if (!modalOverlay) return;
    modalOverlay.hidden = false;
    requestAnimationFrame(() => modalOverlay.classList.add("is-open"));
    document.addEventListener("keydown", onModalKeydown);
  }
  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("is-open");
    document.removeEventListener("keydown", onModalKeydown);
    setTimeout(() => { modalOverlay.hidden = true; }, 220);
  }
  function onModalKeydown(e) {
    if (e.key === "Escape") closeModal();
  }
  if (howItWorksBtn) howItWorksBtn.addEventListener("click", openModal);
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalGotIt) modalGotIt.addEventListener("click", closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  setTab(0);
  updateProgress();
  if (registerBtn) registerBtn.disabled = true;

  if (window.SectoraWallet && typeof window.SectoraWallet.onChange === "function") {
    window.SectoraWallet.onChange(onWalletChange);
  }
})();
