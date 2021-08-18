// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "../interfaces/IERC165.sol";
import "../interfaces/IPaymentAgent.sol";

/**
 * Based on OpenZeppelin's PaymentSplitter, except it supports modifying the payees/sharesOf without payment distortion.
 * @dev Received Ether payments will be stored in the contract.
 * Payees can claim their share from the contract at any time.
 * Payees can be added/removed (and sharesOf can be increased/decreased) at any time.
 * These payee/share modifications won't affect past payments and the payees/share at the time of those payments.
 */
contract SimplePaymentSplitter is IPaymentAgent {
	using AddressUpgradeable for address;
	using AddressUpgradeable for address payable;
	
	uint256 public totalShares;
	uint256 public totalReceived;
	uint256 public totalReleased;
	address[] private _payees;
	mapping(address => uint256) public sharesOf;

	/** @dev Get the total amount that got releasedTo to the given payee */
	mapping(address => uint256) public releasedTo;

	constructor(address[] memory payees, uint256[] memory shares) payable {
		initialize(payees, shares);
	}

	function initialize(address[] memory payees, uint256[] memory shares) public payable {
		require(totalShares == 0, "Cannot initialize a SimplePaymentSplitter twice");
		require(payees.length == shares.length, "Expected same amount of payees as shares entries");
		_payees = payees;
		for (uint256 i = 0; i < _payees.length; i++) {
			address payee = _payees[i];
			require(payee != address(0), "Attempting to add zero address as payee");
			uint256 share = shares[i];
			if (share == 0) continue;
			// Check for existing in case _payees contains duplicates
			uint256 existing = sharesOf[payee];
			if (existing == 0) {
				sharesOf[payee] = share;
				emit PayeeAdded(payee);
			} else {
				sharesOf[payee] += share;
			}
			totalShares += share;
		}
		require(totalShares > 0, "Cannot initialize a SimplePaymentSplitter with no shares");
		addPayment();
	}

	/* Payee information */

	/** @dev Returns whether the payee is a payee */
	function isPayee(address payee) external view returns (bool) {
		return sharesOf[payee] > 0;
	}

	function getPayee(uint256 index) external view returns (address) {
		require(index < _payees.length, "Payee index out of bounds");
		return _payees[index];
	}

	function getPayees() external view returns (address[] memory) {
		return _payees;
	}

	function totalPayees() external view returns (uint256) {
		return _payees.length;
	}

	/* Payout stuff */

	function availablePayments(address payee) override public view returns (uint256) {
		uint256 shares = sharesOf[payee];
		if (shares == 0) return 0;
		return totalReceived * shares / totalShares - releasedTo[payee];
	}

	function withdrawPaymentsFor(address payee) override public returns (uint256 amount) {
		amount = availablePayments(payee);
		if (amount == 0) return amount;
		// Update stuff
		releasedTo[payee] += amount;
		totalReleased += amount;
		// Do the payment and event logging
		payable(payee).sendValue(amount);
		emit PaymentsReleased(payee, amount);
	}

	function withdrawPayments() override external returns (uint256) {
		return withdrawPaymentsFor(payable(msg.sender));
	}

	/* IERC165 */
	function supportsInterface(bytes4 interfaceID) override public pure returns (bool) {
		assert(type(IPaymentAgent).interfaceId == IPaymentAgent_INTERFACE_ID);
		return interfaceID == IERC165_INTERFACE_ID || interfaceID == IPaymentAgent_INTERFACE_ID;
	}

	/* Receiving payment */

	function addPayment(address from) external payable {
		if (msg.value == 0) return;
		totalReceived += msg.value;
		emit PaymentReceived(from, msg.value);
	}

	function addPayment() public payable {
		if (msg.value == 0) return;
		totalReceived += msg.value;
		emit PaymentReceived(msg.sender, msg.value);
	}

	/** @dev Log received payments */
	receive() external payable {
		addPayment();
	}

}
