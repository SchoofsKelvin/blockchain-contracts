
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

### Payment splitters

#### [PaymentShareSplitterBase](./contracts/payment-splitter/PaymentShareSplitterBase.sol)
An abstract contract that allows adding/removing shares at any point:
- Implements `IPaymentAgent` with all its methods and events (except `PaymentRegistered`)
- Payments will be split according to the shares at the time of when the payment was registered
- Shares cann be added/set per address or in bulk at any time
- Each change of shares starts a new PaymentSharePeriod, keeping track of payees/shares, paid funds, ...
- Has tons of internal events and other utility functions

#### [PaymentShareSplitter](./contracts/payment-splitter/PaymentShareSplitter.sol)
A contract extending `PaymentShareSplitterBase`:
- On top of the public methods provided by `PaymentShareSplitterBase`, provides other methods too
- Adds an extra `SharesChanged(address indexed payee, uint256 shares)` event
- The admin (who deployed the contract) can add/set shares (in bulk) at any time

#### [SimplePaymentSplitter](./contracts/payment-splitter/SimplePaymentSplitter.sol)
Very simple implementation of `IPaymentAgent` where the payees/shares are set once at construction.

#### [SimplePaymentSplitterFactory](./contracts/payment-splitter/SimplePaymentSplitterFactory.sol)
A simple contract with a single function to create a `SimplePaymentSplitter`:
- `function create(address[] payees, uint256[] shares) external payable returns (SimplePaymentSplitter)`
- Lower cost than manual deployment (difference = Gtxdatazero and Gtxdatanonzero cost of `SimplePaymentSplitter` deployment bytes)
  - For the 5207 bytes with the current Solidity version/configuration, this results in a 80432 gas (- some slight VM gas cost)

### Simple proxies (EIPs 1167 and 1967)

#### [ProxyObject](./contracts/proxy/ProxyObject.sol) and [ProxyBeacon](./contracts/proxy/ProxyBeacon.sol)
Based on [EIP-1967](https://eips.ethereum.org/EIPS/eip-1967), a simple proxy system:
- `ProxyBeacon` is simply a contract that stores an implementation address, along with an admin address that can change it
- `ProxyObject` gets constructed with a beacon address. Every call will be proxied to the implementation address stored in the beacon

**Note**: As specified by EIP-1967, `ProxyObject` uses the beacon in storage at `BEACON_SLOT`. If this is the zero address (e.g. we're in a `DELEGATECALL`), it will instead use the beacon passed to the `ProxyObject` constructor. Read [this EIP-1967 comment](https://ethereum-magicians.org/t/eip-1967-standard-proxy-storage-slots/3185/11?u=morlega) as to why I do this, as this seems to be quite a big issue in EIP-1967 I discovered.

#### [ProxyObjectFactory](./contracts/proxy/ProxyObjectFactory.sol)
A simple contract with a single function to create a `ProxyObject`:
- `function deploy(ProxyBeacon beacon, bytes memory data) external returns (address addr)`
- Lower cost than manual deployment (difference = Gtxdatazero and Gtxdatanonzero cost of `ProxyObject` deployment bytes)
  - For the 282 bytes with the current Solidity version/configuration, this results in a 15880 gas (- some slight VM gas cost)
  
#### [ProxySingleton](./contracts/proxy/ProxySingleton.sol)
Based on [EIP-1967](https://eips.ethereum.org/EIPS/eip-1967), a very simple proxy contract:
- Constructed with an implementation address and an initial function call (or 0 bytes to skip)
- Does just one thing: proxy all calls to it to the implementation address it stored during construction
- Can be seen as a verbose Solidity-version of [EIP-1167](https://eips.ethereum.org/EIPS/eip-1167), being a "massive" 129 bytes compared to the EIP's (at most) 45 bytes

### Diamonds, Multi-facet proxy (EIP 2535)

**DANGER**: The whole implementation is heavily tested in [`DiamondCoreFacet`](./test/diamond/DiamondCoreFacet.ts), but it is uncertain whether every single edge case is covered yet.

My implementation of the diamond pattern, based on the [2nd reference implementation](https://github.com/mudgen/diamond-2-hardhat). I wrote it from scratch, but similarly to mudgen's implementation I pack 8 selectors into single bytes32 slots. Some differences and extra features:
- Querying facet data (through the `IDiamoundLoupe` interface) is generally cheaper as a bit more data is stored
- Due to this, `diamondCut` is slightly more expensive. See the section about gas costs below
- My implementation has a custom fallback selector (mapped to `onFallback()`) that defines a facet which should act as the fallback function. Mind that `msg.sig` remains the original one, so `onFallback()` isn't what actually gets called on the targeted facet.
- My implementation has the concept of modifiers, similar to Solidity, explained below

The core parts of my implementation are `Diamond`, `DiamondLibrary` and `DiamondCoreFacet`. Together they form a diamond, with complete `IERC165`, `IDiamondLoupe` and `IDiamondCut` support. While `Diamond` and `DiamondCoreFacet` make use of `DiamondLibrary`, all three are more or less standalone components.

#### [Diamond](./contracts/diamond/Diamond.sol)
Part 1 (of 3) of my [EIP-2535](https://eips.ethereum.org/EIPS/eip-2535) implementation:
- Contains a constructor that wraps `diamondCut` but with the ability to perform a delegate call during each cut
- Contains the `fallback()` function that hooks into `DiamondLibrary`

#### [DiamondLibrary](./contracts/diamond/DiamondLibrary.sol)
Part 2 (of 3) of my [EIP-2535](https://eips.ethereum.org/EIPS/eip-2535) implementation:
- Declares several types and functions, including `DiamondStorage` containing all diamond-related data
- Tons of utility/important functions, i.e. `addModifier`, `facetAddress`, `diamondCut`, ...
- Comes with EIP-165 support, providing `setSupportsInterface` and (an internal) `supportsInterface`

#### [DiamondCoreFacet](./contracts/diamond/DiamondCoreFacet.sol)
Part 3 (of 3) of my [EIP-2535](https://eips.ethereum.org/EIPS/eip-2535) implementation:
- Comes with initializer to `setSupportsInterface` for `IERC165`,`IDiamondLoupe` and `IDiamondCut`
- Exports all functions from the above interfaces, mostly linking directly into the `DiamondLibrary`
- Comes with a `selectors()` function returning a `bytes4[]` with the "supposed facet selectors" it has

#### Modifiers
Modifier functions can be freely added/removed, represented as a `function(bytes calldata) external`. Whenever a function succesfully gets mapped to a facet (including "`onFallback()` exists"), every registered modifier gets delegate called first with `msg.data` as argument.

The modifier can read/modify storage, and if the modifier reverts, the whole diamond's function call will also immediately revert with the same revert data. Mostly meant as a way to (dynamically) add certain functionalities such as RBAC, pausing the diamond, etc.

**Note**: Might change to allow more than just (changing storage) and reverting (which are mutually exclusive, since a revert reverts storage modifications), to e.g. allow multi-sig functionality where you want the modifier to not revert, yet prevent the actual function from being called.

**Note**: Modifiers are executed in the order they got added:
- There is currently no support to reorder modifiers (apart from removing them and readding them in order)
- Modifiers can currently only modify storage or revert. Reverting would affect all modifiers. Therefore the order of (unrelated) modifiers should have no effect in the end
- The only reason for custom ordering would be that modifiers that revert often (e.g. access control) would be better off getting called first, as reverting would prevent the other modifiers from being called, saving some gas there

#### Gas costs
My implementation focuses on cheap but constant gas costs. The numbers below are based on what's reported by `hardhat-gas-reporter` in the [`DiamondCoreFacet`](./test/diamond/DiamondCoreFacet.ts) test. All results had 21k gas substracted to account for 
- Calling `diamondCut` ranged from 12k to 450k gas for all the tests, including multi-cuts with initializer calls
- Calling `facetAddress` **(view)** has a constant cost of 10.1k gas
- `facetAddresses` and `facetFunctionSelectors` **(view)** have similar starter costs, but increase depending on the number of facets and the number of selectors in the targeted facets, respectively
- `facets` grows similarly in cost. It cost 30k gas for two facets with 9 selectors in total
- `supportsInterface` has a constant cost of 10k gas
- Adding a modifier has a constant cost of 50k gas, but does not check whether that modifier is already present (same targeted address/selector)
- Removing a modifier has a minimum gas cost of 11k gas, but increases with the number of modifiers (linear search)
- Calling an empty function (with Solidity overhead) costs about 7.5k gas
- Deploying the `Diamond` contract (with `DiamondCoreFacet`) cost about 650k gas. Need to still write a cheap factory for this

#### TODO
- Create a `DiamondFactory`, perhaps even combined with EIP-1167. Investigate pre-calculating storage changes due to cutting
- Selector data has 76 unused bits. Investigate if this can be used to make cheap selector-selective modifiers possible
- Selector data has 76 unused bits. Consider using a bit to disable modifiers completely for that selector
- Similarly, modifiers are `function(bytes memory) external`, which use 24 bytes, therefore 64 bits left. Good use?
  - Perhaps combine with bits in selector data to only call modifiers where there is at least one matching bit
    - i.e. each bit is a modifier group. Any overlap between selector groups and modifier groups means "use modifier"
  - Perhaps use certain bits to differentiate modifier types, i.e. if returning `0x1` counts as "interrupt main call"
    - "true to cancel", "return modifier result if prefixed with certain prefix", "run after main call", ...
- Write a `DiamondRBACFacet` to add role-based access controls to diamonds using the modifier system
- Investigate if `diamondCut` can be made cheaper, especially when adding/removing several selectors at once

### BitmapHolder and seed-based random mint for Lost Worlds
Created to help the Lost Worlds team with a minting issue.

- Added a [`BitmapHolder`](./contracts/lost-worlds/BitmapHolder.sol) implementation:
  - Eager but relatively cheap initialisation (costs `n/256` (+1 for 256-off numbers) storage slots)
  - Allows setting and getting any index very cheaply, as you might expect
  - Allows getting the first free index using a seed (which could be passed `0` to get the first empty index)
- Added a [`LWRandomMint`](./contracts/lost-worlds/LWRandomMint.sol) which [tests](./test/lost-worlds/LWRandomMint.ts) the `BitmapHolder`'s get-free-index-using-seed system
