// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { IERC165 } from "../eip/IERC165.sol";
import { IDiamondCut, IDiamondLoupe } from "../eip/IERC2535.sol";

import { DiamondLibrary } from "./DiamondLibrary.sol";

/// Combines IDiamondLoupe, IDiamondCut and IERC165
contract DiamondCoreFacet is IERC165, IDiamondLoupe, IDiamondCut {
    using DiamondLibrary for DiamondLibrary.StoredFacet;

    function initialize() external {
        DiamondLibrary.setSupportsInterface(type(IERC165).interfaceId, true);
        DiamondLibrary.setSupportsInterface(type(IDiamondLoupe).interfaceId, true);
        DiamondLibrary.setSupportsInterface(type(IDiamondCut).interfaceId, true);
    }

    function selectors() external pure returns (bytes4[] memory result) {
        result = new bytes4[](6);
        result[0] = IERC165.supportsInterface.selector;
        result[1] = IDiamondLoupe.facets.selector;
        result[2] = IDiamondLoupe.facetFunctionSelectors.selector;
        result[3] = IDiamondLoupe.facetAddresses.selector;
        result[4] = IDiamondLoupe.facetAddress.selector;
        result[5] = IDiamondCut.diamondCut.selector;
    }

    function facets() external view override returns (IDiamondLoupe.Facet[] memory result) {
        DiamondLibrary.DiamondStorage storage ds = DiamondLibrary.getStorage();
        uint256 length = ds.facetsArray.length;
        result = new IDiamondLoupe.Facet[](length);
        for (uint256 i = 0; i < length; i++) {
            address facetAddr = ds.facetsArray[i];
            result[i] = IDiamondLoupe.Facet({
                facetAddress: facetAddr,
                functionSelectors: ds.facets[facetAddr].selectors()
            });
        }
    }

    function facetFunctionSelectors(address _facet) external view override returns (bytes4[] memory) {
        DiamondLibrary.DiamondStorage storage ds = DiamondLibrary.getStorage();
        DiamondLibrary.StoredFacet storage facet = ds.facets[_facet];
        if (facet.facetAddress != _facet) return new bytes4[](0);
        return facet.selectors();
    }

    function facetAddresses() external view override returns (address[] memory) {
        return DiamondLibrary.getStorage().facetsArray;
    }

    function facetAddress(bytes4 _selector) external view override returns (address) {
        return DiamondLibrary.facetAddress(_selector);
    }

    function diamondCut(FacetCut[] calldata _diamondCut, address _init, bytes calldata _calldata) external override {
        DiamondLibrary.diamondCut(_diamondCut, _init, _calldata);
    }

    function supportsInterface(bytes4 _interfaceId) external view override returns (bool) {
        return DiamondLibrary.supportsInterface(_interfaceId);
    }

}
