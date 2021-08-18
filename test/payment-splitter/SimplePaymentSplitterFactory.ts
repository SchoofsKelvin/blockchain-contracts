import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import type { ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { SimplePaymentSplitter, SimplePaymentSplitterFactory, SimplePaymentSplitterFactory__factory, SimplePaymentSplitter__factory } from '../../typechain';
import { before, logEvents } from '../utils';

const { expect } = chai.use(solidity);

describe('SimplePaymentSplitterFactory', () => {
    let admin: SignerWithAddress;
    let payee0: SignerWithAddress;
    let payee1: SignerWithAddress;
    let Factory: SimplePaymentSplitterFactory__factory;
    let factory: SimplePaymentSplitterFactory;

    before('setup signers', async () => {
        [admin, payee0, payee1] = await ethers.getSigners();
        Factory = new SimplePaymentSplitterFactory__factory(admin);
    });

    before('setup factory', async () => {
        factory = await Factory.deploy();
        console.log('factory:', factory.address);
    });

    describe('simple splitter', () => {
        let splitter: SimplePaymentSplitter;
        let contractTrans: ContractTransaction;

        logEvents.setup(() => splitter, 'Splitter');

        step('create', async () => {
            contractTrans = await factory.create([payee0.address, payee1.address], [5, 1], { value: 60 });
            const deployReceipt = await contractTrans.wait();
            // First two logs are PayeeAdded, third is PaymentReceived and fourth one is SimplePaymentSplitterCreated
            expect(deployReceipt.events?.length, "#events").to.equal(4);
            const splitterAddr: string = deployReceipt.events?.[3].args?.[0];
            expect(splitterAddr, 'splitterAddr').to.be.a.properAddress;
            splitter = SimplePaymentSplitter__factory.connect(splitterAddr, admin);
            console.log('splitterAddr:', splitter.address);
        });

        it('create events', async () => {
            await expect(contractTrans, 'contactTrans')
                .to.emit(splitter, 'PaymentReceived').withArgs(admin.address, 60)
                .and.to.emit(splitter, 'PayeeAdded').withArgs(payee0.address)
                .and.to.emit(splitter, 'PayeeAdded').withArgs(payee1.address)
                .and.to.emit(factory, 'SimplePaymentSplitterCreated').withArgs(splitter.address);
        });

        describe('Public fields', () => {
            it('totalShares', async () => {
                expect(await splitter.totalShares()).to.equal(6);
            });

            it('totalReleased', async () => {
                expect(await splitter.totalReleased()).to.equal(0);
            });

            it('releasedTo', async () => {
                expect(await splitter.releasedTo(admin.address), 'admin').to.equal(0);
                expect(await splitter.releasedTo(payee0.address), 'payee0').to.equal(0);
                expect(await splitter.releasedTo(payee1.address), 'payee1').to.equal(0);
            });
        });

        describe('Payee information', () => {
            it('totalPayees', async () => {
                expect(await splitter.totalPayees()).to.equal(2);
            });

            it('getPayee', async () => {
                expect(await splitter.getPayee(0), 'getPayee(0)').to.equal(payee0.address);
                expect(await splitter.getPayee(1), 'getPayee(1)').to.equal(payee1.address);
                await expect(splitter.getPayee(2), 'invalid')
                    .to.be.revertedWith('Payee index out of bounds');
            });

            it('isPayee', async () => {
                expect(await splitter.isPayee(admin.address), 'admin').to.be.false;
                expect(await splitter.isPayee(payee0.address), 'payee0').to.be.true;
                expect(await splitter.isPayee(payee1.address), 'payee1').to.be.true;
            });
        })

        describe('Payout information', () => {
            it('availablePayments', async () => {
                expect(await splitter.availablePayments(admin.address), 'admin').to.equal(0);
                expect(await splitter.availablePayments(payee0.address), 'payee0').to.equal(50);
                expect(await splitter.availablePayments(payee1.address), 'payee1').to.equal(10);
            });
        });
    });
});