// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)


// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)


/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}



/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}



interface IHashMarket {
    function hashPower(address account) external view returns (uint256);
}

/// @title Sectora Validator Registry
/// @notice Real on-chain registry of testnet validator nodes. Becoming a
/// validator requires having purchased hash power from SectoraHashMarket
/// first (online rental or physical node hardware) — registration is
/// gated on that real on-chain balance, not a token stake.
contract ValidatorRegistry is Ownable {
    struct Validator {
        address operator;
        string name;
        int32 latMicro; // latitude * 1e6
        int32 lonMicro; // longitude * 1e6
        uint256 hashPowerAtRegistration;
        uint64 registeredAt;
        bool active;
    }

    IHashMarket public hashMarket;
    uint256 public minHashToValidate;

    Validator[] public validators;
    mapping(address => uint256) public validatorIndexPlusOne; // 0 = not registered

    event ValidatorRegistered(
        address indexed operator,
        string name,
        int32 latMicro,
        int32 lonMicro,
        uint256 hashPower,
        uint256 index
    );
    event ValidatorUpdated(address indexed operator, string name, int32 latMicro, int32 lonMicro, uint256 hashPower);
    event ValidatorDeactivated(address indexed operator);
    event ValidatorReactivated(address indexed operator);
    event HashMarketUpdated(address hashMarket);
    event MinHashToValidateUpdated(uint256 minHash);

    constructor(address _hashMarket, uint256 _minHashToValidate) Ownable(msg.sender) {
        hashMarket = IHashMarket(_hashMarket);
        minHashToValidate = _minHashToValidate;
    }

    function register(string calldata name, int32 latMicro, int32 lonMicro) external {
        require(bytes(name).length > 0 && bytes(name).length <= 64, "ValidatorRegistry: bad name length");
        require(latMicro >= -90_000_000 && latMicro <= 90_000_000, "ValidatorRegistry: bad lat");
        require(lonMicro >= -180_000_000 && lonMicro <= 180_000_000, "ValidatorRegistry: bad lon");

        uint256 power = hashMarket.hashPower(msg.sender);
        require(power >= minHashToValidate, "ValidatorRegistry: not enough hash power, buy hash first");

        uint256 existing = validatorIndexPlusOne[msg.sender];
        if (existing != 0) {
            Validator storage v = validators[existing - 1];
            v.name = name;
            v.latMicro = latMicro;
            v.lonMicro = lonMicro;
            v.hashPowerAtRegistration = power;
            v.active = true;
            emit ValidatorUpdated(msg.sender, name, latMicro, lonMicro, power);
            return;
        }

        validators.push(
            Validator({
                operator: msg.sender,
                name: name,
                latMicro: latMicro,
                lonMicro: lonMicro,
                hashPowerAtRegistration: power,
                registeredAt: uint64(block.timestamp),
                active: true
            })
        );
        validatorIndexPlusOne[msg.sender] = validators.length;
        emit ValidatorRegistered(msg.sender, name, latMicro, lonMicro, power, validators.length - 1);
    }

    function deactivate() external {
        uint256 idx = validatorIndexPlusOne[msg.sender];
        require(idx != 0, "ValidatorRegistry: not registered");
        validators[idx - 1].active = false;
        emit ValidatorDeactivated(msg.sender);
    }

    function reactivate() external {
        uint256 idx = validatorIndexPlusOne[msg.sender];
        require(idx != 0, "ValidatorRegistry: not registered");
        validators[idx - 1].active = true;
        emit ValidatorReactivated(msg.sender);
    }

    function validatorCount() external view returns (uint256) {
        return validators.length;
    }

    function activeValidatorCount() external view returns (uint256 count) {
        uint256 len = validators.length;
        for (uint256 i = 0; i < len; i++) {
            if (validators[i].active) count++;
        }
    }

    function getValidators(uint256 offset, uint256 limit) external view returns (Validator[] memory page) {
        uint256 len = validators.length;
        if (offset >= len) return new Validator[](0);
        uint256 end = offset + limit;
        if (end > len) end = len;
        page = new Validator[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = validators[i];
        }
    }

    function setHashMarket(address _hashMarket) external onlyOwner {
        hashMarket = IHashMarket(_hashMarket);
        emit HashMarketUpdated(_hashMarket);
    }

    function setMinHashToValidate(uint256 _minHash) external onlyOwner {
        minHashToValidate = _minHash;
        emit MinHashToValidateUpdated(_minHash);
    }
}


