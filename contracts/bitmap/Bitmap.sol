// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

/*
    Bitmap/BitmapLibrary by Kelvin Schoofs
    https://github.com/SchoofsKelvin/blockchain-contracts

    The internal data structure of the Bitmap contains:
    - size: The max amount of bits this bitmap can have
    - count: The current amount of bits this bitmap has set (to true)
    - _mapping: The actual bitmap, implemented as a mapping(uint256 => uint256)

    The internal workings of the bitmap are as follows:
    - The index is a uint256 where (0 <= index < size) holds true
    - The index is bitwise split into:
        <------------------ index (256 bits) ------------------->
        <---- slot id (248 bits) ----><-- slot index (8 bits) -->
    - The slot id represents the storage slot of the bitmap, i.e. the key of the _mapping
    - The slot index represents which bit in the slot the index represents
        - This value is 8 bits which corresponsd with 256 possible values
        - Therefore, 8 bits is enough to index every bit of a uint256, which is the size of our values in storage
    - Example: (index 0x123456) => (slot id 0x1234=4660, slot index 0x56=86) => 87th bit in storage slot 4660
        - This corresponds with (_mapping[4660] >> 86)
        - Generalized, the bit for `index` is stored at `(mapping[index >> 8] >> (index & 0xFF))`
        - Mind that there are probably still be other bits in the value, i.e. the value can be 0bAAAAAB while we only care about B
        - We can simply solve this by masking it with `& 1` for reading and something similar for modifying
    - For most of the code below, instead of shifting the slot value, we instead create a bit mask:
        - For e.g. slot index 5 (i.e. the 6th bit, since we start 0), we create a bit mask by doing (1 << 5)
        - This results in a bit mask of 000..000100000 (and as you can see, there are 5 other bits to the right of that)
        - This makes it very easy to read/manipulate the slot value for our targeted bit (by slot index)
    - See the code of the methods below for more implementation details
*/

struct Bitmap {
    uint256 size;
    uint256 count;
    mapping(uint256 => uint256) _mapping;
}
library BitmapLibrary {
    
    // This corresponds with 0b1000..000 and is the mask that's used to access the last (256th) bit in a storage slot
    uint256 private constant MAX_MASK = 1 << 255;
    
    /**
        Assumes that there wasn't an existing non-empty bitmap at the same location
        (in other words, you can't re-initialize a Bitmap unless it's already empty)
        To simply resize, you can change the .size property, but with a few caveats:
        - The set bits beyond the new size will still be there, meaning resizing to a bigger size later on might "recover" them
        - Similar to the ^ previous problem, the .count property will be wrong if shrinking the Bitmap cuts off any set bits
        In other words, making the Bitmap larger is completely fine, but shrinking it is not if it shrinks past set bits.
    */
    function init(Bitmap storage holder, uint256 size) internal {
        holder.size = size;
    }

    /// Returns whether the bit with the given index is set in the given bitmap
    function getValue(Bitmap storage holder, uint256 index) internal view returns (bool) {
        require(index < holder.size, "Bitmap OutOfBounds");
        // We get the correct storage slot value with: holder._mapping[index >> 8]
        // We produce the mask for our targeted bit with: 1 << (index & 0xFF)
        // By AND'ing them, we either get something like 0b000100 or 0b000000, so convert to boolean with > 0
        return (holder._mapping[index >> 8] & (1 << (index & 0xFF))) > 0 ;
    }

    /// Sets the bit with the given index to the given value in the given bitmap
    function setValue(Bitmap storage holder, uint256 index, bool value) internal {
        require(index < holder.size, "Bitmap OutOfBounds");
        uint256 current = holder._mapping[index >> 8];
        uint256 mask = 1 << (index & 0xFF);
        // Barely costs any gas to check whether the wanted value is already stored
        // If so, just return, instead of wasting a lot of gas updating the storage
        bool oldValue = (current & mask) > 0;
        if (value == oldValue) return;
        // We can OR with the mask to set the bit or AND with the inverted mask to unset the bit
        current = value ? (current | mask) : (current & ~mask);
        holder._mapping[index >> 8] = current;
        // And of course we need to update the count value
        holder.count = value ? (holder.count + 1) : (holder.count - 1);
    }

    /**
        Returns the index of the first unset bit starting at the given index in the given bitmap.
        The given index will be modulo'd with the bitmap size. If no free bit can be found after the given
        index in the bitmap, it will wrap around and start looking from the start.
        
        For a bitmap of size N, this will at most read N/256+1 storage slots. The tests includes a worst-case demo.
        The worst case would be if index 0 is the ONLY unset bit in the bitmap and this method is called for index 1.
        Example: for a bitmap with a size of 100k, this'll be at most 391 storage reads.
        This alone would cost 821k gas (cold storage). Tests show it's about 984k gas due to conditions, bit shifts, ...
        So realistically
    */
    function generateFreeIndex(Bitmap storage holder, uint256 index) internal view returns (uint256) {
        uint256 size = holder.size;
        // If the bitmap is already full, revert early instead of going into an infinite loop
        require(holder.count < size, "Bitmap full");

        // Modulo the given index with the bitmap size, allowing the index to act like a "seed" for RNG bit index calculation
        index = index % size;

        // The bit mask for the current index
        uint256 mask = 1 << (index & 0xFF);
        // Loop over the storage slots, starting at the required slot for the given index
        // Mind that this will at most iterate size/256 times, as we are guaranteed to find an index before completely looping around
        while (true) {
            uint256 current = holder._mapping[index >> 8];
            if (current == type(uint256).max) {
                // Current bitmap slot is already full, skip it:
                // We'll look at the first bit of the next storage slot
                mask = 1;
                // We increase the slot id by 1 and (due to left-shifting by 8) set the slot index to 0
                index = (((index >> 8) + 1) << 8);
                // Check if we need to wrap back to the start of the bitmap
                if (index >= size) index = 0;
                // Go ahead to the next iteration of the outer loop
                continue;
            }
            // Loop over the (at most 256) bits in the current storage slot, starting at the current index
            while (true) {
                // Check if the current index is free, and if so, return it
                if ((current & mask) == 0) return index;
                if (mask == MAX_MASK) {
                    // No more free indices in the current slot, skip to the first bit of the next slot
                    mask = 1;
                    index = (((index >> 8) + 1) << 8);
                    if (index >= size) index = 0;
                    break; // break inner loop, continue outer loop
                } else {
                    // Check the next bit in the current slot
                    mask <<= 1;
                    index += 1;
                }
            }
        }
        // The code will never reach this point
        revert();
    }
}
