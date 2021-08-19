
# Blockchain contracts
Collection of Solidity contracts that can be used standalone or in different projects.

Project is set up with Hardhat, Typechain, Waffle testing, ... and each contract has a bunch of tests. Also set up GitHub actions to build and test on each push to the master branch.

## Interfaces
List of "standardized" interfaces that I thought would be nice for my contracts to stick to:

### [IPaymentAgent](./contracts/interfaces/IPaymentAgent.sol)
An interface meant for the common withdrawal/pull pattern. This interface includes:
- Mandatory event informing addresses they are added as a payee to the contract (with or without payments yet)
- Mandatory event informing that a certain amount of payments have been released to an address
- Optional event informing addresses they received a payment they can withdraw
- Optional event informing that the contract has received a payment
- A function to calculate how much funds can be withdrawn by an address
- A function to withdraw the funds for/to the sender
- A function to withdraw the funds for a certain address to that address

This interface supports EIP-165 and has an interfaceID of `0x79320088`.

## Contracts
List of actual (abstract) contracts in this repository, besides the aforementioned interfaces and some test/uninteresting ones:

### [PaymentShareSplitterBase](./contracts/payment-splitter/PaymentShareSplitterBase.sol)
An abstract contract that allows adding/removing shares at any point:
- Implements `IPaymentAgent` with all its methods and events (except `PaymentRegistered`)
- Payments will be split according to the shares at the time of when the payment was registered
- Shares cann be added/set per address or in bulk at any time
- Each change of shares starts a new PaymentSharePeriod, keeping track of payees/shares, paid funds, ...
- Has tons of internal events and other utility functions

### [PaymentShareSplitter](./contracts/payment-splitter/PaymentShareSplitter.sol)
A contract extending `PaymentShareSplitterBase`:
- On top of the public methods provided by `PaymentShareSplitterBase`, provides other methods too
- Adds an extra `SharesChanged(address indexed payee, uint256 shares)` event
- The admin (who deployed the contract) can add/set shares (in bulk) at any time

### [SimplePaymentSplitter](./contracts/payment-splitter/SimplePaymentSplitter.sol)
Very simple implementation of `IPaymentAgent` where the payees/shares are set once at construction.

### [SimplePaymentSplitterFactory](./contracts/payment-splitter/SimplePaymentSplitterFactory.sol)
A simple contract with a single function to create a `SimplePaymentSplitter`:
- `function create(address[] payees, uint256[] shares) external payable returns (SimplePaymentSplitter)`
- Lower cost than manual deployment (difference = Gtxdatazero and Gtxdatanonzero cost of `SimplePaymentSplitter` deployment bytes)
  - For the 5207 bytes with the current Solidity version/configuration, this results in a 80432 gas (- some slight VM gas cost)

### [ProxyObject](./contracts/proxy/ProxyObject.sol) and [ProxyBeacon](./contracts/proxy/ProxyBeacon.sol)
Based on [EIP-1967](https://eips.ethereum.org/EIPS/eip-1967), a simple proxy system:
- `ProxyBeacon` is simply a contract that stores an implementation address, along with an admin address that can change it
- `ProxyObject` gets constructed with a beacon address. Every call will be proxied to the implementation address stored in the beacon

### [ProxyObjectFactory](./contracts/proxy/ProxyObjectFactory.sol)
A simple contract with a single function to create a `ProxyObject`:
- `function deploy(ProxyBeacon beacon, bytes memory data) external returns (address addr)`
- Lower cost than manual deployment (difference = Gtxdatazero and Gtxdatanonzero cost of `ProxyObject` deployment bytes)
  - For the 282 bytes with the current Solidity version/configuration, this results in a 15880 gas (- some slight VM gas cost)
  
### [ProxySingleton](./contracts/proxy/ProxySingleton.sol)
Based on [EIP-1967](https://eips.ethereum.org/EIPS/eip-1967), a very simple proxy contract:
- Constructed with an implementation address and an initial function call (or 0 bytes to skip)
- Does just one thing: proxy all calls to it to the implementation address it stored during construction
- Can be seen as a verbose Solidity-version of [EIP-1167](https://eips.ethereum.org/EIPS/eip-1167), being a "massive" 129 bytes compared to the EIP's (at most) 45 bytes
