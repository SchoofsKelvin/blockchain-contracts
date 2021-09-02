import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { LibraryProxyAlternative, LibraryProxyAlternative__factory, LibraryProxyBase, LibraryProxyBase__factory, LibraryProxyTest, LibraryProxyTest__factory, ProxyBeacon, ProxyBeacon__factory, ProxyObject, ProxyObject__factory } from '../../typechain';
import { logEvents } from '../utils';

const { expect } = chai.use(solidity);

describe('LibraryProxy', () => {
    let signer: SignerWithAddress;

    before('set up signer', async () => [signer] = await ethers.getSigners());

    let libraryBase: LibraryProxyBase;
    let libraryAlt: LibraryProxyAlternative;
    let libraryBeacon: ProxyBeacon;
    let libraryProxy: ProxyObject;
    let libraryTest: LibraryProxyTest;

    step('deploy libraries', async () => {
        const LibraryProxyBase = new LibraryProxyBase__factory(signer);
        const LibraryProxyAlternative = new LibraryProxyAlternative__factory(signer);
        libraryBase = await LibraryProxyBase.deploy();
        libraryAlt = await LibraryProxyAlternative.deploy();
        logEvents.setup(libraryBase, 'LibraryBase');
        logEvents.setup(libraryAlt, 'LibraryAlt');
    })

    step('deploy proxy set to version A', async () => {
        const ProxyBeacon = new ProxyBeacon__factory(signer);
        const ProxyObject = new ProxyObject__factory(signer);
        libraryBeacon = await ProxyBeacon.deploy(libraryBase.address);
        libraryProxy = await ProxyObject.deploy(libraryBeacon.address, '0x');
        logEvents.setup(libraryBeacon, 'LibraryBeacon');
        logEvents.setup(libraryProxy, 'LibraryProxy');
    });

    it('check beacon before', async () => {
        expect(await libraryBeacon.implementation()).to.equal(libraryBase.address);
    });

    it('test BEACON_SLOT on proxy', async () => {
        const slot = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
        expect(await ethers.provider.getStorageAt(libraryProxy.address, slot)).to.hexEqual(libraryBeacon.address);
    });

    it('test getVersion() on proxy', async () => {
        const int = new ethers.utils.Interface(['function version() public returns (string memory)']);
        const trans = await signer.sendTransaction({
            to: libraryProxy.address,
            data: int.encodeFunctionData('version'),
        });
        const castContract = LibraryProxyBase__factory.connect(libraryProxy.address, signer);
        await expect(trans).to.emit(castContract, 'RequestedVersionOnChain').withArgs('LibraryA');
    });

    step('deploy test contract', async () => {
        const LibraryProxyTest = new LibraryProxyTest__factory({
            __$b007ab74740ddaccb83cf0be9bed176941$__: libraryProxy.address,
        }, signer);
        libraryTest = await LibraryProxyTest.deploy();
        logEvents.setup(libraryTest, 'LibraryTest');
    });

    it('test getLibraryAddress() on test contract', async () => {
        expect(await libraryTest.getLibraryAddress()).to.equal(libraryProxy.address);
    });

    it('check test contract before switch', async () => {
        await libraryTest.upgradeVersion();
        expect(await libraryTest.lastVersion()).to.equal('LibraryA');
    });

    step('switch beacon to version B', async () => {
        await libraryBeacon.setImplementation(libraryAlt.address);
    });

    it('check beacon after', async () => {
        expect(await libraryBeacon.implementation()).to.equal(libraryAlt.address);
    });

    it('check test contract after switch', async () => {
        await libraryTest.upgradeVersion();
        expect(await libraryTest.lastVersion()).to.equal('LibraryB');
    });

});
