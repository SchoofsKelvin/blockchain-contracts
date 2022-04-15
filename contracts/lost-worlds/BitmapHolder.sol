// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

struct BitmapHolder {
    uint256 size;
    uint256 count;
    uint256[] _mapping;
}
library BitmapHolderLibrary {
    using BitmapHolderLibrary for BitmapHolder;

    uint256 private constant MAX_MASK = 1 << 255;
    
    function init(BitmapHolder storage holder, uint256 size) internal {
        holder.size = size;
        holder.count = 0;
        holder._mapping = new uint256[]((size >> 8) + ((size % 256 > 0) ? 1 : 0));
    }
    function getValue(BitmapHolder storage holder, uint256 index) internal view returns (bool) {
        return (holder._mapping[index >> 8] & (1 << (index & 0xFF))) > 0;
    }
    function setValue(BitmapHolder storage holder, uint256 index, bool value) internal {
        uint256 current = holder._mapping[index >> 8];
        uint256 mask = 1 << (index & 0xFF);
        bool oldValue = (current & mask) > 0;
        if (value == oldValue) return;
        current = value ? (current | mask) : (current & ~mask);
        holder._mapping[index >> 8] = current;
        holder.count = value ? (holder.count + 1) : (holder.count - 1);
    }
    function generateFreeIndex(BitmapHolder storage holder, uint256 seed) internal view returns (uint256) {
        uint256 size = holder.size;
        require(holder.count < size, "Bitmap full");

        uint256 index = seed % size;
        uint256 mask = 1 << (index & 0xFF);
        while (true) {
            uint256 current = holder._mapping[index >> 8];
            if (current == type(uint256).max) {
                // Current bitmap slot is already full, skip it
                mask = 1;
                index = (((index >> 8) + 1) << 8);
                if (index >= size) index = 0;
                continue;
            }
            while (true) {
                // Check if the current index is free, and if so, return it
                if ((current & mask) == 0) return index;
                if (mask == MAX_MASK) {
                    // No more free indices in the current slot
                    mask = 1;
                    index = (((index >> 8) + 1) << 8);
                    if (index >= size) index = 0;
                    break; // continue outer loop
                } else {
                    // Check the next bit in the current slot
                    mask <<= 1;
                    index += 1;
                }
            }
        }
        // Should never hit this point!
        assert(false);
        return 0;
    }
}
