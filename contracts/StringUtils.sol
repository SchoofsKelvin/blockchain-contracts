// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

library StringUtils {

    bytes16 private constant HEX_ALPHABET = "0123456789abcdef";

    function concat(string memory a, string memory b) internal pure returns (string memory) {
        return string(abi.encodePacked(a, b));
    }

    /* https://ethereum.stackexchange.com/a/58341 */
    function toString(address account) internal pure returns(string memory) {
        return toHexString(abi.encodePacked(account));
    }

    function toHexString4(bytes4 value) internal pure returns(string memory) {
        return toHexString(abi.encodePacked(value));
    }

    function toHexString(bytes32 value) internal pure returns(string memory) {
        return toHexString(abi.encodePacked(value));
    }

    function toHexString(bytes memory data) internal pure returns(string memory) {
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint i = 0; i < data.length; i++) {
            str[2+i*2] = HEX_ALPHABET[uint(uint8(data[i] >> 4))];
            str[3+i*2] = HEX_ALPHABET[uint(uint8(data[i] & 0x0f))];
        }
        return string(str);
    }

    /* @openzeppelin\contracts-upgradeable\utils\StringsUpgradeable.sol */

    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function toHexString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0x00";
        uint256 temp = value;
        uint256 length = 0;
        while (temp != 0) {
            length++;
            temp >>= 8;
        }
        return toHexString(value, length);
    }

    function toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = HEX_ALPHABET[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return string(buffer);
    }
}
