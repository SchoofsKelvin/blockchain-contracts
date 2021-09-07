// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { IERC165 } from "../eip/IERC165.sol";
import { IDiamondCut, IDiamondLoupe } from "../eip/IERC2535.sol";

import { StringUtils } from "../StringUtils.sol";

import { DiamondLibrary } from "./DiamondLibrary.sol";

contract Diamond {
    using StringUtils for *;

    struct DiamondFacetInit {
        address facet;
        bytes4[] selectors;
        bytes initializer;
    }

    bytes4 constant ON_FALLBACK_SELECTOR = bytes4(keccak256("onFallback()"));

    constructor(DiamondFacetInit[] memory _inits) {
        require(_inits.length > 0, "Requires at least one FacetInit (IDiamondCut)");
        IDiamondCut cutter = IDiamondCut(_inits[0].facet);

        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](_inits.length);
        for (uint256 i = 0; i < _inits.length; i++) {
            cut[i] = IDiamondCut.FacetCut({
                facetAddress: _inits[i].facet, 
                action: IDiamondCut.FacetCutAction.Add, 
                functionSelectors: _inits[i].selectors
            });
        }

        (bool success, bytes memory result) = address(cutter).delegatecall(
            abi.encodeWithSelector(IDiamondCut.diamondCut.selector, cut, address(0), ""));
        require(success, string(result));

        for (uint256 i = 0; i < _inits.length; i++) {
            bytes memory initializer = _inits[i].initializer;
            if (initializer.length == 0) continue;
            (success, result) = _inits[i].facet.delegatecall(initializer);
            if (!success) revert("init#".concat(i.toString()).concat(": ").concat(string(result)));
        }

        require(DiamondLibrary.supportsInterface(type(IERC165).interfaceId), "Not IERC165");
        require(DiamondLibrary.supportsInterface(type(IDiamondLoupe).interfaceId), "Not IDiamondLoupe");
        address loupe = DiamondLibrary.facetAddress(IDiamondLoupe.facetAddress.selector);
        require(loupe != address(0), "Incorrect IDiamondLoupe");
    }

    fallback() external payable {
        // get facet from function selector
        address facet = DiamondLibrary.facetAddress(msg.sig);
        if (facet == address(0)) facet = DiamondLibrary.facetAddress(ON_FALLBACK_SELECTOR);
        require(facet != address(0), "Unknown selector and no fallback");
        // Execute modifiers
        DiamondLibrary.invokeModifiers();
        // Execute external function from facet using delegatecall and return any value.
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {revert(0, returndatasize())}
            default {return (0, returndatasize())}
        }
    }

}
