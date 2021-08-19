import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { Counter, Counter__factory, ProxyBeacon, ProxyBeacon__factory, ProxyObjectFactory, ProxyObjectFactory__factory } from '../../typechain';
import { logEvents, pushContract } from '../utils';

const { expect } = chai.use(solidity);

describe('Counter using proxy beacon system with factory', () => {

    let Counter: Counter__factory;
    let ProxyBeacon: ProxyBeacon__factory;
    let ProxyObjectFactory: ProxyObjectFactory__factory;

    before('set up everything', async () => {
        const [signer] = await ethers.getSigners();
        Counter = new Counter__factory(signer);
        ProxyBeacon = new ProxyBeacon__factory(signer);
        ProxyObjectFactory = new ProxyObjectFactory__factory(signer);
    })

    let factory: ProxyObjectFactory;
    let counterImpl: Counter;
    let beacon: ProxyBeacon;
    let counter: Counter;

    logEvents.setup(() => factory, 'factory');
    logEvents.setup(() => counterImpl, 'counterImpl');
    logEvents.setup(() => beacon, 'beacon');
    logEvents.setup(() => counter, 'counter');

    step('should deploy the factory', async () => {
        factory = await (await ProxyObjectFactory.deploy()).deployed();
        const { gasUsed } = await factory.deployTransaction.wait();
        console.log('ProxyObjectFactory:', factory.address, 'which needed', gasUsed.toString(), 'gas to deploy');
        await pushContract({ address: factory.address, name: 'ProxyObjectFactory' }, 'ProxyObjectFactory');
    });

    step('should deploy implementation 1', async () => {
        counterImpl = await (await Counter.deploy()).deployed();
        const { gasUsed } = await counterImpl.deployTransaction.wait();
        console.log('Counter implementation:', counterImpl.address, 'which needed', gasUsed.toString(), 'gas to deploy');
    });

    step('should deploy the beacon', async () => {
        beacon = await (await ProxyBeacon.deploy(counterImpl.address)).deployed();
        const { gasUsed } = await beacon.deployTransaction.wait();
        console.log('Beacon:', beacon.address, 'which needed', gasUsed.toString(), 'gas to deploy');
        expect(await beacon.implementation()).to.equal(counterImpl.address);
    });

    step('should deploy counter', async () => {
        const CounterInterface = Counter.interface as Counter['interface'];
        const initialize = CounterInterface.encodeFunctionData('initialize', [5]);
        const contractTrans = await factory.deploy(beacon.address, initialize);
        await expect(contractTrans, 'contractTrans')
            .to.emit(factory, 'Deployed').withArgs(beacon.address, []);
        const contractReceipt = await contractTrans.wait();
        const objAddr = contractReceipt.events?.[0]?.args?.[1];
        expect(objAddr, 'objAddr').to.be.a.properAddress;
        counter = Counter.attach(objAddr);
        console.log('counter:', counter.address, 'which needed', contractReceipt.gasUsed.toString(), 'gas to deploy');
        await pushContract({ address: counter.address, name: 'Counter' }, 'Counter1');
    });

    step('should test counter 1', async () => {
        expect(await counter.getCount()).to.equal(5);
        await (await counter.countDown()).wait();
        expect(await counter.getCount()).to.equal(4);
    });

});