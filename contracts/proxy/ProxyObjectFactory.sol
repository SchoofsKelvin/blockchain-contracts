// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import { ProxyBeacon } from "./ProxyBeacon.sol";
import { ProxyObject } from "./ProxyObject.sol";

contract ProxyObjectFactory {

	event Deployed(ProxyBeacon indexed beacon, address indexed object);

	function deploy(ProxyBeacon beacon, bytes memory data) external returns (address addr) {
		addr = address(new ProxyObject(beacon, data));
		emit Deployed(beacon, addr);
	}

}
