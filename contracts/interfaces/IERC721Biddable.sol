// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../eip/IERC165.sol";
import "../eip/IERC721.sol";
import "./IPaymentAgent.sol";

/** @dev Custom extension of ERC-721 to support bidding on tokens (using the native currency).
 * Meant to be combined with the custom extension ERC721Sellable, even reusing the same `Sale` event.
 * ERC-165 identifier for this interface is 0x8c3f8d59. */
interface IERC721Biddable is IERC165, IERC721, IPaymentAgent {

	/**
	 * Emitted when a token is sold, either by the seller accepting a bid, or other causes, i.e. from ERC721Sellable.
	 * In all cases, emitting this event should also cancel any bid on this token.
	 */
	event Sale(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 price);

	/** Emitted when a bid is placed */
	event PlaceBid(address indexed bidder, uint256 indexed tokenId, uint256 price);

	/** Place a bid on a token. Reverts if the token doesn't exist or already has a bid of the same or a higher price */
	function placeBid(uint256 tokenId) external payable;

	/**
	 * Cancel a bit you placed on a token. Reverts if you don't have the highest bid on that token.
	 * This also directly invokes the `withdrawPayments()` functionality from `IPaymentAgent`.
	 */
	function cancelBid(uint256 tokenId) external;

	/**
	 * Accepts the current highest bid with the given price.
	 * The price will be checked, to prevent sudden underpricing or even unexpected overpricing (in case buyer validation is desired).
	 */
	function acceptBid(uint256 tokenId, uint256 price) external;
	
}
