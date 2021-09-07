// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { IERC165 } from "../eip/IERC165.sol";

bytes4 constant IPaymentAgent_INTERFACE_ID = 0x79320088;

/**
 * Represents an interface to unify queryable data and events for contracts using a withdrawal system.
 * The goal is to make it easy for users to track contracts that might owe them money.
 * @dev interfaceID = 0x79320088
 */
interface IPaymentAgent is IERC165 {

	/**
	 * Emitted whenever an address gets first added as a payee
	 * @param payee The address that was added as a payee
	 */
	event PayeeAdded(address indexed payee);

	/**
	 * Emitted whenever (a part of) the funds owed to an address are paid out
	 * @param payee The address that the payment was released to
	 * @param amount The amount that was paid out
	 */
	event PaymentsReleased(address indexed payee, uint256 amount);

	/**
	 * **OPTIONAL**: Emitted whenever a payment is made available to an address
	 * @param payer The address that paid the payment. Could be the zero address for unknown/mixed origin.
	 * @param payee The address that the payment was made available to
	 * @param amount The amount that was paid
	 */
	event PaymentRegistered(address indexed payer, address indexed payee, uint256 amount);

	/**
	 * **OPTIONAL**: Emitted whenever a payment is made to this contract.
	 * Mostly meant for payment splitters (e.g. using shares), where emitting `PaymentRegistered` for
	 * every shareholder would get quite expensive. This is more of a "I got paid!" shout by the contract.
	 * @param payer The address that paid the payment. Could be the zero address for unknown/mixed origin.
	 * @param amount The amount that was paid
	 */
	event PaymentReceived(address indexed payer, uint256 amount);

	/**
	 * Returns the current amount of funds owed to an address
	 * @param payee The address to check the amount of funds owed to
	 * @return amount The amount of funds owed to the address
	 */
	function availablePayments(address payee) external view returns (uint256 amount);
	// ^ bytes4(keccak256('availablePayments(address)')) = 0xb8f3d920

	/**
	 * Transfers (part of) the funds this contract owes the sender to the sender.
	 * @return amount The payed out amount (or 0 if nothing got paid out)
	 */
	function withdrawPayments() external returns (uint256 amount);
	// ^ bytes4(keccak256('withdrawPayments()')) = 0x6103d70b

	/**
	 * Transfers (part of) the funds this contract owes the given address to that address.
	 * @param payee The address that should (a part of) its owed funds be paid out to
	 * @return amount The payed out amount (or 0 if nothing got paid out)
	 */
	function withdrawPaymentsFor(address payee) external returns (uint256 amount);
	// ^ bytes4(keccak256('withdrawPayments(address)')) = 0xa0c20ea3
	
}
