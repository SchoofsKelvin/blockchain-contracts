// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { IERC165 } from "../eip/IERC165.sol";
import { IERC721 } from "../eip/IERC721.sol";
import { IPaymentAgent } from "./IPaymentAgent.sol";
import { IERC721Sellable } from "./IERC721Sellable.sol";

/** @dev Custom extension of ERC-721 to support bidding on tokens (using the native currency).
 * Extension to ERC721Sellable. Reuses the `Sale` event.
 * ERC-165 identifier for this interface is 0x8c3f8d59. */
interface IERC721Biddable is IERC165, IERC721, IPaymentAgent, IERC721Sellable {

	/** Emitted when a bid is placed. A price of 0 means the bid is cancelled instead */
	event PlaceBid(address indexed bidder, uint256 indexed tokenId, uint256 price);

	/** Place a bid on a token. Reverts if the token doesn't exist or already has a bid of the same or a higher price */
	function placeBid(uint256 tokenId) external payable;

	/**
	 * Cancel a bit you placed on a token. Reverts if you don't have the highest bid on that token.
	 * This also directly invokes the `withdrawPayments()` functionality from `IPaymentAgent`.
	 */
	function cancelBid(uint256 tokenId) external;

	/**
	 * Accepts the current highest bid with the given price, emitting a `Sale` event.
	 * The price will be checked, to prevent sudden underpricing or even unexpected overpricing (in case buyer validation is desired).
	 * An address approved for a token should also be able to accept bids for that token.
	 * The funds gained from accepting the bid will be owed to the token owner, not the accepter.
	 * Invokes `withdrawPayments()` (similar to `cancelBid()`) if the acceptor is the token owner.
	 */
	function acceptBid(uint256 tokenId, uint256 price) external;
	
}
