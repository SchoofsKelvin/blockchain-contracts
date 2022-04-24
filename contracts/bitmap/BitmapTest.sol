// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import { Bitmap, BitmapLibrary } from "./Bitmap.sol";

// Used for testing Bitmap/BitmapLibrary.
// Based on a partial minting scenario that Lost Worlds asked me for advice about.
contract BitmapTest {
    // Make it so we can simply do bitmap.getValue(index) etc
    using BitmapLibrary for Bitmap;

    event Mint(uint256 tokenId);

    Bitmap private _freeIds;

    constructor(uint256 supply) {
        _freeIds.init(supply);
    }

    function totalSupply() public view returns (uint256) {
        return _freeIds.size;
    }

    function exists(uint256 tokenId) external view returns (bool) {
        return _freeIds.getValue(tokenId);
    }

    // Given a random seed, we want to produce a "random" tokenId using the bitmap.
    // Mind that generateFreeIndex is pretty deterministic (in a feature-rich way), the randomness has to come from the given seed
    function mint(uint256 seed) external returns (uint256 tokenId) {
        tokenId = _freeIds.generateFreeIndex(seed);
        _freeIds.setValue(tokenId, true);
        emit Mint(tokenId);
    }

    // Expose bitmap.init for gas reporting purposes during testing
    function init(uint256 size) external {
        _freeIds.init(size);
    }

    // Expose bitmap.count for gas reporting purposes during testing
    function count() external view returns (uint256) {
        return _freeIds.count;
    }

    // Expose bitmap.generateFreeIndex for gas reporting purposes during testing
    function generateFreeIndex(uint256 seed) external view returns (uint256) {
        return _freeIds.generateFreeIndex(seed);
    }

    /// Utility method to set all the bits in the bitmap to the given value
    function setAllBits(bool value) external {
        uint256 size = totalSupply();
        uint256 slots = (size >> 8) + ((size / 256 > 0) ? 1 : 0);
        uint256 slotValue = value ? type(uint256).max : 0;
        for (uint256 i = 0; i < slots; i++) _freeIds._mapping[i] = slotValue;
        _freeIds.count = value ? size : 0;
    }

    /// Utility method to alter the contents of the bitmap, for gas reporting purposes during testing
    function writeBits(uint256[] calldata values, uint256 startSlot) external {
        uint256 newCount = _freeIds.count;
        for (uint256 i = 0; i < values.length; i++) {
            uint256 value = _freeIds._mapping[startSlot + i];
            while (value > 0) {
                if ((value & 1) > 0) newCount--;
                value >>= 1;
            }
            value = values[i];
            _freeIds._mapping[startSlot + i] = value;
            while (value > 0) {
                if ((value & 1) > 0) newCount++;
                value >>= 1;
            }
        }
        _freeIds.count = newCount;
    }

    // Utility method to unset every bit in the bitmap except for the first 256 (i.e. first storage slot)
    function fillBitmapFirstSlot() external {
        uint256 size = totalSupply();
        _freeIds.count = size < 256 ? size : 256;
        uint256 slots = size / 256 + ((size % 256 > 0) ? 1 : 0);
        for (uint256 i = 1; i < slots; i++) _freeIds._mapping[i] = 0;
        _freeIds._mapping[0] = type(uint256).max;
    }

    // Utility method to set every bit in the bitmap except for the very first bit (at index 0)
    function fillBitmapExceptFirstIndex() external {
        uint256 size = totalSupply();
        _freeIds.count = size - 1;
        uint256 slots = (size >> 8) + ((size / 256 > 0) ? 1 : 0);
        for (uint256 i = 1; i < slots; i++) _freeIds._mapping[i] = type(uint256).max;
        _freeIds._mapping[0] = type(uint256).max << 1;
    }
}
