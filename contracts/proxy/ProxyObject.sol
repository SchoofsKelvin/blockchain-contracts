// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./ProxyBeacon.sol";

contract ProxyObject {
	// bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1)
	bytes32 constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;

	constructor(ProxyBeacon beacon, bytes memory data) {
		assembly {
			sstore(BEACON_SLOT, beacon)
		}
		if (data.length > 0) {
			(bool success, ) = beacon.implementation().delegatecall(data);
			require(success, "Construction failed");
		}
	}

	fallback() external payable {
		ProxyBeacon beacon;
		assembly {
			beacon := sload(BEACON_SLOT)
		}
		address implementation = beacon.implementation();
		assembly {
			// Copy msg.data. We take full control of memory in this inline assembly
			// block because it will not return to Solidity code. We overwrite the
			// Solidity scratch pad at memory position 0.
			calldatacopy(0, 0, calldatasize())

			// Call the implementation.
			// out and outsize are 0 because we don't know the size yet.
			let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)

			// Copy the returned data.
			returndatacopy(0, 0, returndatasize())

			switch result
				// delegatecall returns 0 on error.
				case 0 {
					revert(0, returndatasize())
				}
				default {
					return(0, returndatasize())
				}
		}
	}
}
