// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Sectora Hash Market
/// @notice Real on-chain purchase of test hash power, paid in the Sectora
/// test token. Two purchase paths mirror the real-world products Sectora
/// sells: renting hash online, or buying physical validator node hardware.
/// This is a testnet demo — no real compute is provisioned; the purchase
/// itself and the resulting hashPower balance are real on-chain state.
contract SectoraHashMarket is Ownable {
    using SafeERC20 for IERC20;

    enum PackageKind {
        Online,
        Physical
    }

    struct Package {
        string name;
        PackageKind kind;
        uint256 priceInToken; // in stakeToken's smallest unit (18 decimals)
        uint256 hashPower; // arbitrary hash-power units granted per purchase
        bool active;
    }

    IERC20 public immutable paymentToken;
    address public treasury;

    Package[] public packages;
    mapping(address => uint256) public hashPower;
    mapping(address => uint256) public purchaseCount;

    event PackageAdded(uint256 indexed packageId, string name, PackageKind kind, uint256 priceInToken, uint256 hashPower);
    event PackageStatusChanged(uint256 indexed packageId, bool active);
    event HashPurchased(address indexed buyer, uint256 indexed packageId, uint256 hashPowerAdded, uint256 pricePaid);

    constructor(address _paymentToken, address _treasury) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
        treasury = _treasury;

        // Online hash — rented compute, priced per unit, no bulk discount floor.
        _addPackage("Starter Hash", PackageKind.Online, 100 ether, 10);
        _addPackage("Pro Hash", PackageKind.Online, 450 ether, 50);
        _addPackage("Enterprise Hash", PackageKind.Online, 1800 ether, 220);

        // Physical validator node hardware — bigger upfront cost, better
        // hash-per-token rate since it's dedicated owned equipment.
        _addPackage("Home Validator Kit", PackageKind.Physical, 300 ether, 45);
        _addPackage("Pro Rack Node", PackageKind.Physical, 1200 ether, 200);
        _addPackage("Datacenter Node", PackageKind.Physical, 5000 ether, 950);
    }

    function _addPackage(string memory name, PackageKind kind, uint256 price, uint256 power) internal {
        packages.push(Package(name, kind, price, power, true));
        emit PackageAdded(packages.length - 1, name, kind, price, power);
    }

    function packageCount() external view returns (uint256) {
        return packages.length;
    }

    function purchase(uint256 packageId) external {
        require(packageId < packages.length, "SectoraHashMarket: bad package id");
        Package storage pkg = packages[packageId];
        require(pkg.active, "SectoraHashMarket: package inactive");

        paymentToken.safeTransferFrom(msg.sender, treasury, pkg.priceInToken);
        hashPower[msg.sender] += pkg.hashPower;
        purchaseCount[msg.sender] += 1;

        emit HashPurchased(msg.sender, packageId, pkg.hashPower, pkg.priceInToken);
    }

    function addPackage(string calldata name, PackageKind kind, uint256 price, uint256 power) external onlyOwner {
        _addPackage(name, kind, price, power);
    }

    function setPackageActive(uint256 packageId, bool active) external onlyOwner {
        require(packageId < packages.length, "SectoraHashMarket: bad package id");
        packages[packageId].active = active;
        emit PackageStatusChanged(packageId, active);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
}
