// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../eip/IERC721.sol";
import "./IPaymentAgent.sol";

/** @dev Custom extension of ERC-721 to support buying and selling tokens (using the native currency)
 * ERC-165 identifier for this interface is 0x48849482. */
interface IERC721Sellable is IERC721, IPaymentAgent {

	/** Emitted when token `tokenId` is purchased from `seller` by `buyer` for `price` */
	event Sale(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 price);

	/**
	 * Emitted when `operator` changes the price for token `tokenId` from `oldPrice` to `newPrice`, 0 being off-sale.
	 * The `operator` might not be the actual owner, but an approved operator instead.
	 */
	event PriceUpdate(address indexed operator, uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice);

	/**
	 * Emitted when `operator` changes whether token `tokenId` is for sale or not.
	 * The `operator` might not be the actual owner, but an approved operator instead.
	 */
	event ForSaleUpdate(address indexed operator, uint256 indexed tokenId, bool forSale);

	/** Returns whether the given token is for sale. Reverts for nonexistent token */
	function forSale(uint256 tokenId) external view returns (bool);

	/** Returns the given price for the token (can be an arbitrary value if not for sale).  Reverts for nonexistent token */
	function salesPrice(uint256 tokenId) external view returns (uint256);

	/**
	 * Buys the token indicated by `tokenId`, transfering to the sender.
	 * Requirements:
	 * - `tokenId` must exist.
	 * - Sender must be the owner or an authorized operator
	 * - Sent amount should be equal to or greater than the token's price
	 * - Must emit Sale(...) and Transfer(...) event or revert
	 * Since the sender receives the token, the transfer will be unsafe (no onERC721Received call)
	 */
	function buy(uint256 tokenId) external payable;

	/**
	 * Sets the price for the token indicated by `tokenId`
	 * This will also mark the token for sale, if it isn't yet.
	 * Requirements:
	 * - `tokenId` must exist.
	 * - Sender must be the owner or an authorized operator
	 * - Must emit PriceUpdate(...) if the sell price gets changed
	 * - Must emit ForSaleUpdate(...) if the token was not yet for sale
	 */
	function setForSale(uint256 tokenId, uint256 price) external;

	/**
	 * Marks the token as not for sale anymore.
	 * If the token is already off sale, nothing happens.
	 * Requirements:
	 * - `tokenId` must exist.
	 * - Sender must be the owner or an authorized operator
	 * - Must emit ForSaleUpdate(...) if the token was for sale
	 */
	function setNotForSale(uint256 tokenId) external;
}
