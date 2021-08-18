// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

contract ProxySingleton {
	// bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
	bytes32 constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

	constructor(address implementation, bytes memory data) {
		assembly {
			sstore(IMPLEMENTATION_SLOT, implementation)
		}
		if (data.length > 0) {
			(bool success, bytes memory returnData) = implementation.delegatecall(data);
			require(success, string(returnData));
		}
	}

	fallback() external payable {
		assembly {
			// Copy msg.data. We take full control of memory in this inline assembly
			// block because it will not return to Solidity code. We overwrite the
			// Solidity scratch pad at memory position 0.
			calldatacopy(0, 0, calldatasize())

			let implementation := sload(IMPLEMENTATION_SLOT)

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
