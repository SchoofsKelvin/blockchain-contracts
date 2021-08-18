// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import "./SimplePaymentSplitter.sol";
import "../proxy/ProxySingleton.sol";

/** Simple factory. Deploy factory once, then easily deploy new */
contract SimplePaymentSplitterFactory {

    address public immutable implementation;

    event SimplePaymentSplitterCreated(address indexed splitter);

    constructor() {
        address[] memory payees = new address[](1);
        payees[0] = msg.sender;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 1;
        implementation = address(new SimplePaymentSplitter(payees, shares));
    }

    function create(address[] calldata payees, uint256[] calldata shares) external payable returns (SimplePaymentSplitter splitter) {
        splitter = SimplePaymentSplitter(payable(new ProxySingleton(implementation, "")));
        splitter.initialize(payees, shares);
        if (msg.value > 0) splitter.addPayment{value: msg.value}(msg.sender);
        emit SimplePaymentSplitterCreated(address(splitter));
    }

}
