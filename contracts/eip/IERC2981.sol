// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.0;

import { IERC165 } from "./IERC165.sol";

///
/// @dev Interface for the NFT Royalty Standard
/// EIP165 interfaceId: 0x2a55205a
///
interface IERC2981 is IERC165 {

    /// @notice Called with the sale price to determine how much royalty
    //          is owed and to whom.
    /// @param _tokenId - the NFT asset queried for royalty information
    /// @param _salePrice - the sale price of the NFT asset specified by _tokenId
    /// @return receiver - address of who should be sent the royalty payment
    /// @return royaltyAmount - the royalty payment amount for _salePrice
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice) external view
        returns (address receiver, uint256 royaltyAmount);

}
