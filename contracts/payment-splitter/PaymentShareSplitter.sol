// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { PaymentShareSplitterBase, PaymentSharePeriod } from "./PaymentShareSplitterBase.sol";

/**
 * Based on OpenZeppelin's PaymentSplitter, except it supports modifying the payees/shares without payment distortion.
 * @dev Received Ether payments will be stored in the contract.
 * Payees can claim their share from the contract at any time.
 * Payees can be added/removed (and shares can be increased/decreased) at any time.
 * These payee/share modifications won't affect past payments and the payees/share at the time of those payments.
 */
contract PaymentShareSplitter is PaymentShareSplitterBase {

	// New events on top of those provided by IPaymentAgent (emitted in PaymentShareSplitterBase)
	/** Emitted whenever the shares of a payee changes */
	event SharesChanged(address indexed payee, uint256 shares);

	address public admin;
	modifier onlyAdmin {
		require(msg.sender == admin, "Only the admin can use this method");
		_;
	}

	constructor(address[] memory payees, uint256[] memory shares) payable {
		admin = msg.sender;
		_setPaymentSharesBulk(payees, shares);
		if (msg.value > 0) addPayment();
	}

	/** @dev Returns the current total amount of shares */
	function totalShares() external view returns (uint256) {
		return _currentPaymentSharePeriod().totalShares;
	}

	/** @dev Returns the current total amount of funds released */
	function totalReleased() external view returns (uint256) {
		return _totalPaymentReleased;
	}

	/** @dev Returns the total amount of funds released to a certain payee */
	function released(address payee) external view returns (uint256) {
		return _paymentReleased[payee];
	}

	/* Emit internal events publically */

	function _onPayeeAdded(address payee) internal override {} // Already emits PayeeAdded
	function _onPaymentsReleased(address payee, uint256 amount) internal override {} // Already emits PaymentsReleased

	function _onSharesChanged(address payee, uint256 shares) internal override {
		emit SharesChanged(payee, shares);
	}

	/* PaymentSharePeriod information */

	/** @dev Returns how many SharePeriods currently exist (after compacting) */
	function totalSharePeriods() external view returns (uint256) {
		return _paymentPeriods.length;
	}

	/** @dev Returns the whole array of SharePeriods. Might be a lot of data! */
	function getAllSharePeriods() external view returns (PaymentSharePeriod[] memory) {
		return _paymentPeriods;
	}

	/** @dev Return the PaymentSharePeriod at the given index (after compacting) */
	function getSharePeriod(uint256 index) external view returns (PaymentSharePeriod memory) {
		require(index < _paymentPeriods.length, "Index higher than amount of available periods");
		return _paymentPeriods[index];
	}

	/** @dev Returns the current PaymentSharePeriod */
	function currentSharePeriod() external view returns (PaymentSharePeriod memory) {
		return _currentPaymentSharePeriod();
	}

	/**
	 * @dev Translates a PaymentSharePeriod ID to its current (compacted) index in the period array
	 * If the PaymentSharePeriod still exists uncompacted, this will return an index > 0.
	 * If the PaymentSharePeriod got compacted (or is ID 0), this will return index 0.
	 */
	function periodIdToIndex(uint256 id) external view returns (uint256) {
		return _paymentPeriodIdToIndex(id);
	}

	/* Payee information */

	/** @dev Get the current amount of shares the given payee has */
	function sharesOf(address payee) external view returns (uint256) {
		return _payeeSharesOf(payee);
	}

	/**
	 * @dev Get the `index`th registered payee.
	 * This includes payees that had shares but now have none!
	 * We only guarantee that a payee had shares at some point.
	 */
	function totalPayees() external view returns (uint256) {
		return _currentPaymentSharePeriod().payees.length;
	}

	/**
	 * @dev Get the `index`th registered payee.
	 * This includes payees that had shares but now have none!
	 * We only guarantee that a payee had shares at some point.
	 */
	function getPayee(uint256 index) external view returns (address) {
		PaymentSharePeriod storage period = _currentPaymentSharePeriod();
		require(index < period.payees.length, "Index higher than amount of registered payees");
		return period.payees[index];
	}

	/** @dev Returns whether the payee is a payee (possibly with 0 shares) */
	function isPayee(address payee) external view returns (bool) {
		return _isPayee(payee);
	}

	/* Payout stuff */

	/**
	 * @dev Calculate the Ether this payee is still owed depending on current/past shares/payments.
	 * @notice The gas cost scales with the amount of SharePeriods, so preferably don't use on the blockchain.
	 * @notice The given index is for the *current* (compacted) _paymentPeriods array. See `_paymentPeriodIdToIndex` and `calculatePendingSinceId`.
	 * @param index The index of the period as seen by `totalSharePeriods` and `getSharePeriod`.
	 */
	function calculatePendingSince(address payee, uint256 index) external view returns (uint256 total) {
		return _calculatePendingPaymentsSince(payee, index);
	}

	/** @dev Wrapper for `calculatePendingSince` that translates the given PaymentSharePeriod ID to the proper index */
	function calculatePendingSinceId(address payable payee, uint256 id) external view returns (uint256) {
		return _calculatePendingPaymentsSince(payee, _paymentPeriodIdToIndex(id));
	}

	/** @dev See calculatePendingSince. This method checks since contract creation. */
	function calculatePending(address payee) external view returns (uint256) {
		return _calculatePendingPaymentsSince(payee, 0);
	}

	/**
	 * @dev Releases the pending amount for the given payee to the given payee.
	 * @notice The given index is for the *current* (compacted) _paymentPeriods array. See `_paymentPeriodIdToIndex` and `releaseSinceId`.
	 * @return amount Returns the released amount, in case a contract calling this wants to know.
	 * See `_calculatePendingPaymentsSince` on how the pending amount is calculated.
	 */
	function releaseSince(address payable payee, uint256 index) public returns (uint256 amount) {
		return _releasePaymentsSince(payee, index);
	}

	/** @dev Wrapper for `releaseSince` that translates the given PaymentSharePeriod ID to the proper index */
	function releaseSinceId(address payable payee, uint256 id) external returns (uint256) {
		return _releasePaymentsSince(payee, _paymentPeriodIdToIndex(id));
	}

	/**
	 * @dev Add a new payee to the contract
	 * @notice If the payee already has shares, they are increased, not overwritten!
	 * @return Returns the ID of the new PaymentSharePeriod created due to this modification
	 */
	function addShares(address payee, int256 shares) external onlyAdmin returns (uint256) {
		return _addPaymentShares(payee, shares);
	}

	/**
	 * @dev Add new shares to payees in bulk, a much more efficient version of `addShares`
	 * @notice Missing values in `shares` will be seen as requiring 1 share to be added
	 */
	function addSharesBulk(address[] calldata payees, int256[] calldata shares) external onlyAdmin returns (uint256) {
		return _addPaymentSharesBulk(payees, shares);
	}

	/**
	 * @dev Set the shares of the new/existing payee
	 * @return Returns the ID of the new PaymentSharePeriod created due to this modification
	 */
	function setShares(address payee, uint256 shares) external onlyAdmin returns (uint256) {
		return _setPaymentShares(payee, shares);
	}

	/**
	 * @dev Set shares in bulk, a much more efficient version of `setShares`
	 * @notice Missing or zero values in `shares` will be seen as requiring 1 share to be added
	 */
	function setSharesBulk(address[] calldata payees, uint256[] calldata shares) external onlyAdmin returns (uint256) {
		return _setPaymentSharesBulk(payees, shares);
	}

	/* Receiving payment */

	function addPayment(address from) external payable {
		_paymentReceived(from, msg.value);
	}

	function addPayment() public payable {
		_paymentReceived(msg.sender, msg.value);
	}

	/** @dev Log received payments */
	receive() external payable {
		addPayment();
	}
}
