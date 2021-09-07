// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { IERC165 } from "../eip/IERC165.sol";
import { StringUtils } from "../StringUtils.sol";
import { DiamondLibrary } from "./DiamondLibrary.sol";

/// For testing purposes only. It is (only) used by the tests.
contract DiamondTestFacet {
    using StringUtils for *;

    // 0x82ea7bfe
    uint256 immutable public deployedBlock = block.number;
    DiamondTestFacet immutable implementation = this;

    struct DiamondTestStorage {
        mapping(bytes32 => uint256) values;
        bytes lastFallbackCallData;
        bytes lastOnFallbackCallData;
        uint256 blockNumber;
    }

    function getStorage() internal pure returns (DiamondTestStorage storage ds) {
        bytes32 DIAMOND_STORAGE_SLOT = keccak256("diamond.storage.DiamondTestFacet");
        assembly { ds.slot := DIAMOND_STORAGE_SLOT }
    }

    function initialize() external {
        DiamondLibrary.setSupportsInterface(0x11223344, true);
        getStorage().values[keccak256("initialize")] = 0x55667788;
    }

    // 0x6cfd19ea
    function setValue(bytes32 key, uint256 value) external {
        getStorage().values[key] = value;
    }

    // 0x69843940
    function getValue(bytes32 key) external view returns (uint256 value) {
        return getStorage().values[key];
    }

    // 0xf0fdf834
    function a(uint256 arg) external returns (uint256) {
        getStorage().values[keccak256(bytes("a"))] = arg;
        return arg + 5;
    }

    // 0x4df7e3d0
    function b() external view returns (uint8[][] memory) {
        uint8[][] memory result = new uint8[][](2);
        result[0] = new uint8[](1);
        result[0][0] = uint8(getStorage().values[keccak256(bytes("b"))]);
        result[1] = new uint8[](3);
        result[1][0] = 2;
        result[1][1] = 3;
        result[1][2] = 4;
        return result;
    }

    // 0x2f576f20
    function doNothing() external {}

    // 0x8ceb50ab
    function storeBlockNumber() external {
        getStorage().blockNumber = block.number;
    }

    /* Modifiers */

    function modifiers() external view returns (function(bytes memory) external[] memory) {
        function(bytes memory) external[] storage mods = DiamondLibrary.getStorage().modifiers;
        function(bytes memory) external[] memory result = new function(bytes memory) external[](mods.length);
        for (uint256 i = 0; i < mods.length; i++) result[i] = mods[i];
        return result;
    }
    
    function modifier1(bytes calldata cd) external pure {
        if (bytes4(cd[0:4]) == this.modifiers.selector) return;
        if (bytes4(cd[0:4]) == this.removeModifier1.selector) return;
        revert(string(abi.encodePacked("modifier1: ", cd.toHexString())));
    }
    function addModifier1() external {
        DiamondLibrary.addModifier(implementation.modifier1);
    }
    function removeModifier1() external {
        DiamondLibrary.removeModifier(implementation.modifier1);
    }
    
    function modifier2(bytes calldata cd) external pure {
        require(bytes4(cd[0:4]) != this.doNothing.selector, "Cannot call doNothing()");
    }
    function addModifier2() external {
        DiamondLibrary.addModifier(implementation.modifier2);
    }
    function removeModifier2() external {
        DiamondLibrary.removeModifier(implementation.modifier2);
    }

    /* Fallback */

    // 0xe4354586
    function onFallback() external {
        getStorage().lastOnFallbackCallData = msg.data;
    }

    fallback() external {
        getStorage().lastFallbackCallData = msg.data;
    }

    // 0x12b367e7
    function getFallbackValues() external view returns (bytes memory fallbackData, bytes memory onFallbackData) {
        return (getStorage().lastFallbackCallData, getStorage().lastOnFallbackCallData);
    }
}
