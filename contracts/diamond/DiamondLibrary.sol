// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../eip/IERC2535.sol";
import "../StringUtils.sol";

library DiamondLibrary {
    using StringUtils for *;

    /* StoredFacet */

    struct StoredFacet {
        address facetAddress;
        uint16 facetIndex;
        uint16 selectorCount;
        mapping(uint256 => bytes32) selectorArray;
    }

    function selectors(StoredFacet storage facet) internal view returns (bytes4[] memory result) {
        uint256 count = facet.selectorCount;
        result = new bytes4[](count);
        if (count == 0) return result;
        uint256 arrayCount = (count - 1) >> 3;
        // count=0 [0, 0] | count=8 [0, 0] | count=9 [0, 1]
        for (uint256 i = 0; i <= arrayCount; i++) {
            uint8 subCount = i == arrayCount ? uint8(count & 7) : 8;
            if (subCount == 0) subCount = 8;
            bytes32 packedSelectors = facet.selectorArray[i];
            for (uint8 j = 0; j < subCount; j++) {
                result[i*8 + j] = bytes4(packedSelectors << (j << 5));
            }
        }
    }

    function addSelectors(StoredFacet storage facet, bytes4[] memory _selectors) internal {
        DiamondStorage storage ds = getStorage();
        address facetAddr = facet.facetAddress;
        uint16 length = uint16(_selectors.length);
        uint16 currentCount = facet.selectorCount;
        uint16 newCount = currentCount + length;
        // Calculate selectorArray bounds/length
        uint16 boundStart = (currentCount + 1) >> 3;
        uint16 boundEnd = newCount >> 3;
        uint16 boundLength = boundEnd - boundStart + 1;
        // Create our temporary array
        bytes32[] memory tempArray = new bytes32[](boundLength);
        for (uint16 i = 0; i < boundLength; i++) {
            tempArray[i] = facet.selectorArray[i + boundStart];
        }
        // Update temporary array
        for (uint16 i = 0; i < length; i++) {
            bytes4 selector = _selectors[i];
            uint16 selIndex = currentCount + i;
            uint256 tIndex = selIndex >> 3;
            uint256 tOffset = (selIndex & 7) << 5;
            tempArray[tIndex] = tempArray[tIndex] | (bytes32(selector) >> tOffset);
            ds.selectors[selector] = packSelector(selector, selIndex, facetAddr);
        }
        // Save the temporary array and updated the selectorCount
        for (uint16 i = 0; i < boundLength; i++) {
            facet.selectorArray[i + boundStart] = tempArray[i];
        }
        facet.selectorCount = newCount;
    }

    bytes32 constant BYTES32_4F = bytes32(bytes4(0xffffffff));

    function removeSelector(StoredFacet storage facet, uint16 _selectorIndex) internal {
        DiamondStorage storage ds = getStorage();
        uint16 currentCount = facet.selectorCount;
        if (currentCount == 1) {
            // If we're removing the last selector, remove the whole facet
            // (and reset its fields in case the facet gets readded later)
            facet.selectorArray[0] = bytes32(0);
            facet.selectorCount = 0;
            uint256 facetIndex = facet.facetIndex;
            uint256 lastIndex = ds.facetsArray.length - 1;
            ds.facetsArray[facetIndex] = ds.facetsArray[lastIndex];
            ds.facetsArray.pop();
            return;
        }
        uint16 selLocation = _selectorIndex >> 3;
        uint16 curLocation = (currentCount - 1) >> 3;
        uint16 selIndex = (_selectorIndex & 7) << 5;
        uint16 curIndex = ((currentCount - 1) & 7) << 5;
        bytes32 curBytes = facet.selectorArray[curLocation];
        bytes4 curSelector = bytes4(curBytes << curIndex);
        if (selLocation == curLocation) {
            // We are working within the last slot
            if (selIndex == curIndex) {
                // Our targeted slot is the last selector, so clear it
                facet.selectorArray[curLocation] = curBytes & ~(BYTES32_4F >> selIndex);
            } else {
                // Our targeted slot is not the last selector, so shift the last selector
                curBytes = (curBytes & ~(BYTES32_4F >> selIndex)) | (bytes32(curSelector) >> selIndex);
                // And clear the old selector
                curBytes = curBytes & ~(BYTES32_4F >> curIndex);
                // Save the updated bytes32 value
                facet.selectorArray[curLocation] = curBytes;
                // Update selectorIndex of moved selector
                ds.selectors[curSelector] = packSelector(curSelector, _selectorIndex, facet.facetAddress);
            }
        } else {
            // We are moving from the last slot to another slot
            bytes32 selBytes = facet.selectorArray[selLocation];
            // Shift the last selector to the replaced slot
            selBytes = selBytes & ~(BYTES32_4F >> selIndex) | (bytes32(curSelector) >> selIndex);
            // Clear the last selector from its previous slot
            curBytes = curBytes & ~(BYTES32_4F >> curIndex);
            // Save the updated bytes32 values
            facet.selectorArray[selLocation] = selBytes;
            facet.selectorArray[curLocation] = curBytes;
            // Update selectorIndex of moved selector
            ds.selectors[curSelector] = packSelector(curSelector, _selectorIndex, facet.facetAddress);
        }
        facet.selectorCount = currentCount - 1;
    }

    /* DiamondStorage */

    struct DiamondStorage {

        // bytes4 => (bytes4 selector, uint16 selectorIndex, address facet)
        //   | 0-159 address facet | 160-175 uint16 selectorIndex | 176-179 bytes4 selector | 180-256 unused |
        mapping(bytes4 => bytes32) selectors;

        mapping(address => StoredFacet) facets;
        address[] facetsArray;

        mapping(bytes4 => bool) supportsInterface;

        /// Gets called with the full calldata, including the function selector.
        /// Return result is ignored, but a revert will propagate to the whole function call.
        function(bytes memory) external[] modifiers;
    }

    function getStorage() internal pure returns (DiamondStorage storage ds) {
        bytes32 DIAMOND_STORAGE_SLOT = keccak256("diamond.storage.DiamondLibrary");
        assembly { ds.slot := DIAMOND_STORAGE_SLOT }
    }

    function selectorAddress(bytes32 _selector) internal pure returns (address) {
        return address(uint160(uint256(_selector)));
    }
    function selectorIndex(bytes32 _selector) internal pure returns (uint16) {
        return uint16(uint256(_selector) >> 160);
    }
    function selectorSelector(bytes32 _selector) internal pure returns (bytes4) {
        return bytes4(uint32(uint256(_selector) >> 176));
    }

    function packSelector(bytes4 _selector, uint16 _selectorIndex, address _facet) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(_facet))
            | (uint256(_selectorIndex) << 160)
            | (uint256(uint32(_selector)) << 176));
    }

    function invokeModifiers() internal {
        DiamondLibrary.DiamondStorage storage ds = getStorage();
        uint256 length = ds.modifiers.length;
        if (length == 0) return;
        for (uint256 i = 0; i < length; i++) {
            function(bytes memory) external mod = ds.modifiers[i];
            (bool success, bytes memory result) = mod.address.delegatecall(
                abi.encodeWithSelector(mod.selector, msg.data));
            if (!success) revert(string(result));
        }
    }

    function addModifier(function(bytes memory) external mod) internal {
        getStorage().modifiers.push(mod);
    }

    // TODO: Test for all cases
    function removeModifier(function(bytes memory) external mod) internal {
        DiamondLibrary.DiamondStorage storage ds = getStorage();
        uint256 length = ds.modifiers.length;
        if (length == 0) return;
        bool seen = false;
        for (uint256 i = 0; i < length; i++) {
            function(bytes memory) external m = ds.modifiers[i];
            if (seen) {
                if (i == length - 1) break;
                ds.modifiers[i - 1] = m;
            } else if (m.address == mod.address && m.selector == mod.selector) {
                seen = true;
            }
        }
        require(seen, "Modifier not found");
        ds.modifiers.pop();
    }

    /* IDiamondLoupe */

    function facetAddress(bytes4 _selector) internal view returns (address) {
        DiamondLibrary.DiamondStorage storage ds = getStorage();
        bytes32 selector = ds.selectors[_selector];
        // if (selectorSelector(selector) != _selector) return address(0);
        return selectorAddress(selector);
    }

    /* diamondCut */

    event DiamondCut(IDiamondCut.FacetCut[] _diamondCut, address _init, bytes _calldata);

    function diamondCut(IDiamondCut.FacetCut[] memory _cuts, address _addr, bytes memory _calldata) internal {
        DiamondStorage storage ds = getStorage();
        for (uint256 i = 0; i < _cuts.length; i++) {
            IDiamondCut.FacetCut memory cut = _cuts[i];
            bytes4[] memory functionSelectors = cut.functionSelectors;
            if (functionSelectors.length == 0) continue;
            address facetAddr = cut.facetAddress;
            IDiamondCut.FacetCutAction action = cut.action;
            if (action == IDiamondCut.FacetCutAction.Add) {
                require(facetAddr != address(0), "Zero FacetCut address for Add");
                StoredFacet storage facet = ds.facets[facetAddr];
                // If it's a brand new facet, register it
                if (facet.facetAddress != facetAddr) {
                    facet.facetAddress = facetAddr;
                    facet.facetIndex = uint16(ds.facetsArray.length);
                    ds.facetsArray.push(facetAddr);
                }
                // Register the selectors globally (and validate they aren't present yet)
                for (uint16 j = 0; j < functionSelectors.length; j++) {
                    bytes4 selector = functionSelectors[j];
                    address existing = selectorAddress(ds.selectors[selector]);
                    if (existing == address(0)) continue;
                    revert("Selector ".concat(selector.toHexString4())
                        .concat(" already registered to ").concat(existing.toString()));
                }
                // Add the selectors to the facet
                addSelectors(facet, functionSelectors);
            } else if (action == IDiamondCut.FacetCutAction.Replace) {
                require(facetAddr != address(0), "Zero FacetCut address for Replace");
                StoredFacet storage newFacet = ds.facets[facetAddr];
                // If it's a brand new facet, register it
                if (newFacet.facetAddress != facetAddr) {
                    newFacet.facetAddress = facetAddr;
                    newFacet.facetIndex = uint16(ds.facetsArray.length);
                    ds.facetsArray.push(facetAddr);
                }
                // Swap the selectors globally (and validate they are already present)
                for (uint16 j = 0; j < functionSelectors.length; j++) {
                    bytes4 selector = functionSelectors[j];
                    bytes32 currentSelector = ds.selectors[selector];
                    if (selectorAddress(ds.selectors[selector]) == address(0))
                        revert(string(abi.encodePacked("Selector ", selector.toHexString4(), " doesn't exists")));
                    if (selectorAddress(currentSelector) == facetAddr)
                        revert(string(abi.encodePacked("Selector ", selector.toHexString4(), " already uses targeted facet")));
                    // Remove old selector from its facet
                    // TODO: Make this cheaper? I.e. replace selector with free unexisting selector, compact afterwards
                    removeSelector(ds.facets[selectorAddress(currentSelector)], selectorIndex(currentSelector));
                }
                // Add the selectors to the facet
                // TODO: Perhaps optimize/combine with the removeSelector in the above loop?
                addSelectors(newFacet, functionSelectors);
            } else if (action == IDiamondCut.FacetCutAction.Remove) {
                require(facetAddr == address(0), "Non-zero FacetCut address for Remove");
                // Remove the selectors globally (and validate they are already present)
                for (uint16 j = 0; j < functionSelectors.length; j++) {
                    bytes4 selector = functionSelectors[j];
                    bytes32 currentSelector = ds.selectors[selector];
                    if (selectorSelector(currentSelector) != selector)
                        revert(string(abi.encodePacked("Selector ", selector.toHexString4(), " doesn't exists")));
                    // Remove old selector from its facet
                    // TODO: Make this cheaper? I.e. replace selector with free unexisting selector, compact afterwards
                    removeSelector(ds.facets[selectorAddress(currentSelector)], selectorIndex(currentSelector));
                    // Update the global selector data
                    ds.selectors[selector] = bytes32(0);
                }
            } else {
                revert("Unknown action");
            }
        }
        if (_addr != address(0)) {
            require(_calldata.length > 0, "Got initializer address but no calldata");
            (bool success, bytes memory result) = _addr.delegatecall(_calldata);
            if (!success) {
                require(result.length > 0, "Initializer call failed");
                revert(string(result));
            }
        } else {
            require(_calldata.length == 0, "Got initializer calldata but no address");
        }
        emit DiamondCut(_cuts, _addr, _calldata);
    }

    /* IERC165 */

    function setSupportsInterface(bytes4 _interfaceId, bool _supported) internal {
        getStorage().supportsInterface[_interfaceId] = _supported;
    }

    function supportsInterface(bytes4 _interfaceId) internal view returns (bool) {
        return getStorage().supportsInterface[_interfaceId];
    }

}
