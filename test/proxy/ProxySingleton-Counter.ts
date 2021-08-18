import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { Counter, Counter__factory, ProxySingleton, ProxySingleton__factory } from '../../typechain';
import { logEvents, pushContract } from '../utils';

const { expect } = chai.use(solidity);

describe('Counter using proxy beacon system', () => {

    let Counter: Counter__factory;
    let ProxySingleton: ProxySingleton__factory;

    before('set up everything', async () => {
        const [signer] = await ethers.getSigners();
        Counter = new Counter__factory(signer);
        ProxySingleton = new ProxySingleton__factory(signer);
    })

    let counterImpl: Counter;
    let counter1: Counter;
    let counter2: Counter;

    logEvents.setup(() => counterImpl, 'counterImpl');
    logEvents.setup(() => counter1, 'counter1');
    logEvents.setup(() => counter2, 'counter2');

    step('should deploy implementation', async () => {
        counterImpl = await (await Counter.deploy()).deployed();
        console.log('Counter implementation:', counterImpl.address);
        await pushContract({ address: counterImpl.address, name: 'Counter' }, 'Counter-Impl');
    });

    step('should deploy counter 1', async () => {
        const CounterInterface = Counter.interface as Counter['interface'];
        const initialize = CounterInterface.encodeFunctionData('initialize', [5]);
        const object = await (await ProxySingleton.deploy(counterImpl.address, initialize)).deployed();
        counter1 = Counter.attach(object.address);
        console.log('counter1:', counter1.address);
        await pushContract({ address: counter1.address, name: 'Counter' }, 'Counter1');
    });

    step('should test counter 1', async () => {
        expect(await counter1.getCount()).to.equal(5);
        await (await counter1.countDown()).wait();
        expect(await counter1.getCount()).to.equal(4);
    });

    step('should deploy counter 2', async () => {
        const CounterInterface = Counter.interface as Counter['interface'];
        const initialize = CounterInterface.encodeFunctionData('initialize', [8]);
        const object = await (await ProxySingleton.deploy(counterImpl.address, initialize)).deployed();
        counter2 = Counter.attach(object.address);
        console.log('counter2:', counter2.address);
        await pushContract({ address: counter2.address, name: 'Counter' }, 'Counter2');
    });

    step('should test counter 2', async () => {
        expect(await counter2.getCount()).to.equal(8);
        await (await counter2.countDown()).wait();
        expect(await counter2.getCount()).to.equal(7);
    });

    step('should retest counter 1 after counter 2', async () => {
        expect(await counter1.getCount()).to.equal(4);
    });
});