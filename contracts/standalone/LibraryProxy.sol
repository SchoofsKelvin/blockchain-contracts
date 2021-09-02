// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

library LibraryProxyBase {
    event RequestedVersionOnChain(string version);
    function version() public returns (string memory) {
        emit RequestedVersionOnChain("LibraryA");
        return "LibraryA";
    }
}

library LibraryProxyAlternative {
    event RequestedVersionOnChain(string version);
    function version() public returns (string memory) {
        emit RequestedVersionOnChain("LibraryB");
        return "LibraryB";
    }
}

contract LibraryProxyTest {
    string public lastVersion;

    function getLibraryAddress() public pure returns (address) {
        return address(LibraryProxyBase);
    }

    function upgradeVersion() external {
        lastVersion = LibraryProxyBase.version();
    }
}
