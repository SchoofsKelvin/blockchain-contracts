// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

contract ProxyBeacon {
	event Upgraded(address indexed implementation);
	event AdminChanged(address indexed previousAdmin, address indexed newAdmin);

	address public implementation;
	address public admin;

	constructor(address impl) {
		implementation = impl;
		admin = msg.sender;
	}

	function setImplementation(address impl) external {
		require(msg.sender == admin, "Only the admin can alter this beacon");
		implementation = impl;
		emit Upgraded(impl);
	}

	function setAdmin(address newAdmin) external {
		address current = admin;
		require(msg.sender == current, "Only the admin can alter this beacon");
		admin = newAdmin;
		emit AdminChanged(current, newAdmin);
	}
}
