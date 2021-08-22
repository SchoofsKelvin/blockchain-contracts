// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "../eip/IERC165.sol";
import "../interfaces/IPaymentAgent.sol";

struct PaymentSharePeriod {
	/** Starts at 1 */
	uint256 id;
	uint256 createdAt;
	uint256 totalShares;
	uint256 totalReceived;
	address[] payees;
	uint256[] shares;
}

/**
 * Based on OpenZeppelin's PaymentSplitter, except it supports modifying the payees/shares without payment distortion.
 * @dev Received Ether payments will be stored in the contract.
 * Payees can claim their share from the contract at any time.
 * Payees can be added/removed (and shares can be increased/decreased) at any time.
 * These payee/share modifications won't affect past payments and the payees/share at the time of those payments.
 */
abstract contract PaymentShareSplitterBase is IERC165, IPaymentAgent {
	using AddressUpgradeable for address;
	using AddressUpgradeable for address payable;

	/* Internal events */

	/**
	 * Called when a payee gets shares for the first time.
	 * PayeeAdded will be emitted by the base contract, don't emit it yourself!
	 */
	function _onPayeeAdded(address payee) internal virtual {}

	/** Called when the shares of a payee changes */
	function _onSharesChanged(address payee, uint256 shares) internal virtual {}

	/**
	 * Called when (a part of) the funds owed to a payee are paid out.
	 * PaymentsReleased will be emitted by the base contract, don't emit it yourself!
	 */
	function _onPaymentsReleased(address payee, uint256 amount) internal virtual {}

	/* Storage */

	uint256 internal _totalPaymentReleased;

	/** @dev Get the total amount that got _paymentReleased to the given payee */
	mapping(address => uint256) internal _paymentReleased;

	// Account => index of last period we checked during the payee's last full release.
	// To know the actual period, use `_paymentReleasePeriod[payee] - mergedPeriods`
	mapping(address => uint256) internal _paymentReleasePeriod;
	// Stores since which period ID an payee became a payee
	mapping(address => uint256) internal _payeeSince;
	// Payee => index in PaymentSharePeriod.payees (and thus PaymentSharePeriod.shares)
	mapping(address => uint256) internal _payeeIndex;

	PaymentSharePeriod[] internal _paymentPeriods;

	// During compacting, we lose some information about owned amount, so store them here
	mapping(address => uint256) internal _paymentPendingOffset;

	constructor() {
		// Create and add the first period
		PaymentSharePeriod storage period = _paymentPeriods.push();
		period.id = 1;
	}

	/* IPaymentAgent */

	function availablePayments(address payee) override external view returns (uint256 amount) {
		if (!_isPayee(payee)) return 0;
		amount = _calculatePendingPaymentsSince(payee, 0);
	}

	function withdrawPayments() override external returns (uint256) {
		return withdrawPaymentsFor(msg.sender);
	}

	function withdrawPaymentsFor(address payee) override public returns (uint256 amount) {
		uint256 previous = _paymentReleasePeriod[payee];
		// Release the owed amount (which handles payment and event logging)
		amount = _releasePaymentsSince(payable(payee), _paymentPeriodIdToIndex(previous));
		// Update this so we know for next time
		_paymentReleasePeriod[payee] = _currentPaymentSharePeriod().id;
	}

	/** @dev Register funds (in this contract) as part of the payments. Emits PaymentReceived */
	function _paymentReceived(address payer, uint256 value) internal {
		_currentPaymentSharePeriod().totalReceived += value;
		emit PaymentReceived(payer, value);
	}

	/* IERC165 */
	function supportsInterface(bytes4 interfaceID) override public pure returns (bool) {
		assert(type(IPaymentAgent).interfaceId == IPaymentAgent_INTERFACE_ID);
		return interfaceID == type(IERC165).interfaceId || interfaceID == IPaymentAgent_INTERFACE_ID;
	}

	/* PaymentSharePeriod information */

	/** @dev Returns a reference to the current PaymentSharePeriod */
	function _currentPaymentSharePeriod() internal view returns (PaymentSharePeriod storage) {
		return _paymentPeriods[_paymentPeriods.length - 1];
	}

	/**
	 * @dev Translates a PaymentSharePeriod ID to its current (compacted) index in the period array
	 * If the PaymentSharePeriod still exists uncompacted, this will return an index > 0.
	 * If the PaymentSharePeriod got compacted (or is ID 0), this will return index 0.
	 */
	function _paymentPeriodIdToIndex(uint256 id) internal view returns (uint256) {
		/* 
            Assuming no merging happened, `id` can be directly returned
            Otherwise, our `_paymentPeriods` array should look something like this:
                [P5, P6, ...] where we merged P0-P5 together
            Given this setup, there are two possibilities:
            - `id <= 5` in which case we return 0 (i.e. the compacted PaymentSharePeriod)
            - `id > 5` in which case we return `id - 5` (i.e. fix the offset)
        */
		uint256 base = _paymentPeriods[0].id;
		return (id > base) ? (id - base) : 0;
	}

	/* Payee information */

	/** @dev Get the current amount of shares the given payee has */
	function _payeeSharesOf(address payee) internal view returns (uint256) {
		if (!_isPayee(payee)) return 0;
		return _currentPaymentSharePeriod().shares[_payeeIndex[payee]];
	}

	/** @dev Returns whether the payee is a payee (possibly with 0 shares) */
	function _isPayee(address payee) internal view returns (bool) {
		// Either the payee got added somewhere after construction (thus periodId > 0)
		// or was added during construction with at least 1 share (which could've been removed later)
		return _payeeSince[payee] > 0;
	}

	/* Payout stuff */

	/**
	 * @dev Calculate the Ether this payee is still owed depending on current/past shares/payments.
	 * @notice The gas cost scales with the amount of SharePeriods, so preferably don't use on the blockchain.
	 * @notice The given index is for the *current* (compacted) _paymentPeriods array. See `_paymentPeriodIdToIndex` and `calculatePendingSinceId`.
	 * @param index The index of the period as seen by `totalSharePeriods` and `getSharePeriod`.
	 */
	function _calculatePendingPaymentsSince(address payee, uint256 index) internal view returns (uint256 total) {
		require(_isPayee(payee), "Given address is not a registered payee");
		// Make sure we don't check periods where the payee didn't exist yet
		uint256 since = _paymentPeriodIdToIndex(_payeeSince[payee]);
		if (since > index) index = since;
		// Do the calculations
		total = _paymentPendingOffset[payee];
		uint256 payeeIndex = _payeeIndex[payee];
		while (index < _paymentPeriods.length) {
			PaymentSharePeriod storage period = _paymentPeriods[index];
			total += (period.totalReceived * period.shares[payeeIndex]) / period.totalShares;
			index++;
		}
		total -= _paymentReleased[payee];
	}

	/**
	 * @dev Releases the pending amount for the given payee to the given payee.
	 * @notice The given index is for the *current* (compacted) _paymentPeriods array. See `_paymentPeriodIdToIndex` and `releaseSinceId`.
	 * @return amount Returns the _paymentReleased amount, in case a contract calling this wants to know.
	 * See `_calculatePendingPaymentsSince` on how the pending amount is calculated.
	 */
	function _releasePaymentsSince(address payable payee, uint256 index) internal returns (uint256 amount) {
		amount = _calculatePendingPaymentsSince(payee, index);
		if (amount == 0) return amount;
		// Update stuff
		_paymentReleased[payee] += amount;
		_totalPaymentReleased += amount;
		// Do the payment and event logging
		payee.sendValue(amount);
		_onPaymentsReleased(payee, amount);
		emit PaymentsReleased(payee, amount);
	}

	/**
	 * @dev Add a new payee to the contract
	 * @notice If the payee already has shares, they are increased, not overwritten!
	 * @return Returns the ID of the new PaymentSharePeriod created due to this modification
	 */
	function _addPaymentShares(address payee, int256 shares) internal returns (uint256) {
		address[] memory payeeA = new address[](1);
		uint256[] memory sharesA = new uint256[](1);
		payeeA[0] = payee;
		uint256 share = _payeeSharesOf(payee);
		if (shares < 0) sharesA[0] = share - uint256(shares);
		else sharesA[0] = share + uint256(shares);
		return _setPaymentSharesBulk(payeeA, sharesA);
	}

	/**
	 * @dev Add new shares to payees in bulk, a much more efficient version of `_addPaymentShares`
	 * @notice Missing values in `shares` will be seen as requiring 1 share to be added
	 */
	function _addPaymentSharesBulk(address[] memory payees, int256[] memory shares) internal returns (uint256) {
		require(shares.length <= payees.length, "Amount of shares higher than amount of payees");
		uint256[] memory newShares = new uint256[](payees.length);
		for (uint256 i = 0; i < payees.length; i++) {
			uint256 share = _payeeSharesOf(payees[i]);
			int256 toAdd = i < shares.length ? shares[i] : int256(1);
			if (toAdd < 0) share -= uint256(toAdd);
			else share += uint256(toAdd);
			newShares[i] = share;
		}
		return _setPaymentSharesBulk(payees, newShares);
	}

	/**
	 * @dev Set the shares of the new/existing payee
	 * @return Returns the ID of the new PaymentSharePeriod created due to this modification
	 */
	function _setPaymentShares(address payee, uint256 shares) internal returns (uint256) {
		address[] memory payeeA = new address[](1);
		uint256[] memory sharesA = new uint256[](1);
		payeeA[0] = payee;
		sharesA[0] = shares;
		return _setPaymentSharesBulk(payeeA, sharesA);
	}

	function _setPaymentSharesBulk(address[] memory payees, uint256[] memory shares) internal returns (uint256) {
		PaymentSharePeriod storage period = _currentPaymentSharePeriod();
		// Create a new period and prepare some fields
		PaymentSharePeriod storage newPeriod = _paymentPeriods.push();
		newPeriod.id = period.id + 1;
		newPeriod.createdAt = block.timestamp;
		uint256 new_totalPaymentShares = period.totalShares;
		// Copy the payees and shares
		for (uint256 i = 0; i < period.payees.length; i++) {
			newPeriod.payees.push(period.payees[i]);
			newPeriod.shares.push(period.shares[i]);
		}
		// Update the new shares
		for (uint256 i = 0; i < payees.length; i++) {
			address payee = payees[i];
			require(payee != address(0), "Cannot have the zero address as payee");
			uint256 share = i < shares.length ? shares[i] : 1;
			if (!_isPayee(payee)) {
				_payeeSince[payee] = newPeriod.id;
				_payeeIndex[payee] = newPeriod.payees.length;
				newPeriod.payees.push(payee);
				newPeriod.shares.push(share);
				new_totalPaymentShares += share;
				_onPayeeAdded(payee);
				emit PayeeAdded(payee);
			} else {
				uint256 index = _payeeIndex[payee];
				new_totalPaymentShares = new_totalPaymentShares - newPeriod.shares[index] + share;
				newPeriod.shares[index] = share;
			}
			_onSharesChanged(payee, share);
		}
		// Store the new PaymentSharePeriod's updated fields
		newPeriod.totalShares = new_totalPaymentShares;
		return newPeriod.id;
	}

}
