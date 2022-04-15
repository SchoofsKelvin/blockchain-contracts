// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

// External
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./BitmapHolder.sol";

contract LWRandomMint {
    /* Libraries */
    using Math for *;
    using BitmapHolderLibrary for BitmapHolder;

    event Mint(uint256 tokenId);

    BitmapHolder private _freeIds;

    constructor(uint256 supply) {
        _freeIds.init(supply);
    }

    function totalSupply() public view returns (uint256) {
        return _freeIds.size;
    }

    function exists(uint256 tokenId) external view returns (bool) {
        return _freeIds.getValue(tokenId);
    }

    function mint(uint256 seed) external returns (uint256 tokenId) {
        tokenId = _freeIds.generateFreeIndex(seed);
        _freeIds.setValue(tokenId, true);
        emit Mint(tokenId);
    }

    function fillBitmapFirstSlot() external {
        uint256 size = totalSupply();
        _freeIds.count = size < 256 ? size : 256;
        uint256 slots = size / 256 + ((size % 256 > 0) ? 1 : 0);
        for (uint256 i = 1; i < slots; i++) _freeIds._mapping[i] = 0;
        _freeIds._mapping[0] = type(uint256).max;
    }

    function fillBitmapExceptFirstIndex() external {
        uint256 size = totalSupply();
        _freeIds.count = size - 1;
        uint256 slots = (size >> 8) + ((size / 256 > 0) ? 1 : 0);
        for (uint256 i = 1; i < slots; i++) _freeIds._mapping[i] = type(uint256).max;
        _freeIds._mapping[0] = type(uint256).max << 1;
    }
}
