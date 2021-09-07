//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Counter is Initializable {

  uint256 count;

  event CountedTo(uint256 number);

  function initialize(uint256 startCount) public initializer {
    count = startCount;
  }

  function getCount() public view returns (uint256) {
    return count;
  }

  function countUp() public returns (uint256) {
    uint256 newCount = count + 1;
    require(newCount > count, "Uint256 overflow");
    count = newCount;
    emit CountedTo(count);
    return count;
  }

  function countDown() public returns (uint256) {
    uint256 newCount = count - 1;
    require(newCount < count, "Uint256 underflow");
    count = newCount;
    emit CountedTo(count);
    return count;
  }
}
