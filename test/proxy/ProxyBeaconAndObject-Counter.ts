import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { Counter, CounterV2, CounterV2__factory, Counter__factory, ProxyBeacon, ProxyBeacon__factory, ProxyObject__factory } from '../../typechain';
import { logEvents, pushContract } from '../utils';

const { expect } = chai.use(solidity);
const ethernal = undefined as any;

describe('Counter using proxy beacon system', () => {

    let Counter: Counter__factory;
    let CounterV2: CounterV2__factory;
    let ProxyBeacon: ProxyBeacon__factory;
    let ProxyObject: ProxyObject__factory;

    before('set up everything', async () => {
        const setUpEthernal = ethernal && (ethernal as any).setLocalEnvironment();
        const [signer] = await ethers.getSigners();
        expect(signer).to.exist;
        Counter = new Counter__factory(signer);
        CounterV2 = new CounterV2__factory(signer);
        ProxyBeacon = new ProxyBeacon__factory(signer);
        ProxyObject = new ProxyObject__factory(signer);
        await setUpEthernal;
    })

    const promises: Promise<any>[] = [];
    after('wait for promises', async function () {
        this.timeout(60e3);
        await Promise.all(promises);
    });

    let counterImpl: Counter;
    let counterV2Impl: CounterV2;
    let counter: Counter;
    let counterV2: CounterV2;
    let beacon: ProxyBeacon;

    logEvents.setup(() => counterImpl, 'counterImpl');
    logEvents.setup(() => counterV2Impl, 'counterV2Impl');
    logEvents.setup(() => counter, 'counter');
    logEvents.setup(() => beacon, 'beacon');

    step('should deploy implementation 1', async () => {
        counterImpl = await (await Counter.deploy()).deployed();
        const { gasUsed } = await counterImpl.deployTransaction.wait();
        console.log('Counter implementation:', counterImpl.address, 'which needed', gasUsed.toString(), 'gas to deploy');
        promises.push(pushContract({ address: counterImpl.address, name: 'Counter' }, 'Counter-Impl'));
    });

    step('should deploy the beacon', async () => {
        beacon = await (await ProxyBeacon.deploy(counterImpl.address)).deployed();
        const { gasUsed } = await beacon.deployTransaction.wait();
        console.log('Beacon:', beacon.address, 'which needed', gasUsed.toString(), 'gas to deploy');
        expect(await beacon.implementation()).to.equal(counterImpl.address);
        promises.push(pushContract({ address: beacon.address, name: 'ProxyBeacon' }, 'ProxyBeacon'));
    });

    step('should deploy the object', async () => {
        const CounterInterface = Counter.interface as Counter['interface'];
        const initialize = CounterInterface.encodeFunctionData('initialize', [5]);
        const object = await (await ProxyObject.deploy(beacon.address, initialize)).deployed();
        const { gasUsed } = await object.deployTransaction.wait();
        counter = Counter.attach(object.address);
        counterV2 = CounterV2.attach(object.address);
        console.log('Counter object:', counter.address, 'which needed', gasUsed.toString(), 'gas to deploy');
        promises.push(pushContract({ address: counter.address, name: 'CounterV2' }, 'Counter-Object'));
    });

    step('should test the object pre-reconfiguration', async () => {
        expect(await counter.getCount()).to.equal(5);
        await (await counter.countDown()).wait();
        expect(await counter.getCount()).to.equal(4);
        await expect(counterV2.setCount(123)).to.be.reverted;
        expect(await counter.getCount()).to.equal(4);
    });

    step('should deploy implementation 2', async () => {
        counterV2Impl = await (await CounterV2.deploy()).deployed();
        const { gasUsed } = await counterV2Impl.deployTransaction.wait();
        console.log('CounterV2 implementation:', counterV2Impl.address, 'which needed', gasUsed.toString(), 'gas to deploy');
        promises.push(pushContract({ address: counterV2Impl.address, name: 'CounterV2' }, 'CounterV2-Impl'));
    });

    step('should reconfigure beacon', async () => {
        await (await beacon.setImplementation(counterV2Impl.address)).wait();
        expect(await beacon.implementation()).to.equal(counterV2Impl.address);
    });

    step('should test the object post-reconfiguration', async () => {
        expect(await counter.getCount()).to.equal(4);
        await (await counterV2.setCount(123)).wait();
        expect(await counter.getCount()).to.equal(123);
    });
});