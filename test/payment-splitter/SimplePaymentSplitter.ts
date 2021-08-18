import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import type { ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { IERC165__factory, IPaymentAgent__factory, SimplePaymentSplitter, SimplePaymentSplitter__factory } from '../../typechain';
import { before, logEvents } from '../utils';
import { getInterfaceHash } from '../../scripts/utils';

const { expect } = chai.use(solidity);

describe('SimplePaymentSplitter', () => {
    let admin: SignerWithAddress;
    let payee0: SignerWithAddress;
    let payee1: SignerWithAddress;
    let payee2: SignerWithAddress;
    let splitterFactory: SimplePaymentSplitter__factory;

    before('setup signers', async () => {
        [admin, payee0, payee1, payee2] = await ethers.getSigners();
        splitterFactory = new SimplePaymentSplitter__factory(admin);
        console.log('Signer:', admin.address);
    });

    describe('simple splitter', () => {
        let splitter: SimplePaymentSplitter;

        logEvents.setup(() => splitter, 'Splitter');

        before('create splitter', async function () {
            splitter = await (await splitterFactory.deploy([
                payee0.address, payee1.address,
            ], [5, 1], { value: 60 })).deployed();
            console.log('simple splitter:', splitter.address);
        });

        it('construction events', async () => {
            await expect(splitter.deployTransaction)
                .to.emit(splitter, 'PaymentReceived').withArgs(admin.address, 60)
                .and.to.emit(splitter, 'PayeeAdded').withArgs(payee0.address)
                .and.to.emit(splitter, 'PayeeAdded').withArgs(payee1.address);
        });

        describe('supportsInterface', () => {
            it('validate IERC165 with util', async () => {
                const calculated = getInterfaceHash(IERC165__factory);
                expect(calculated).to.equal('0x01ffc9a7');
            });
            it('IERC165', async () => {
                expect(await splitter.supportsInterface('0x01ffc9a7')).to.be.true;
            });

            it('validate IPaymentAgent with util', async () => {
                const calculated = getInterfaceHash(IPaymentAgent__factory, IERC165__factory);
                expect(calculated).to.equal('0x79320088');
            });
            it('IPaymentAgent', async () => {
                expect(await splitter.supportsInterface('0x79320088')).to.be.true;
            });

            it('random', async () => {
                expect(await splitter.supportsInterface('0x00000000'), '0x00000000').to.be.false;
                expect(await splitter.supportsInterface('0x12345678'), '0x12345678').to.be.false;
                expect(await splitter.supportsInterface('0xFFFFFFFF'), '0xFFFFFFFF').to.be.false;
            });
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

            it('payees', async () => {
                expect(await splitter.getPayee(0), 'payees(0)').to.equal(payee0.address);
                expect(await splitter.getPayee(1), 'payees(1)').to.equal(payee1.address);
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

    describe('simple splitter - withdrawPayments by payee0', () => {
        let splitter: SimplePaymentSplitter;
        let releaseTx: ContractTransaction;

        logEvents.setup(() => splitter, 'Splitter');

        before('create splitter', async function () {
            splitter = await (await splitterFactory.deploy([
                payee0.address, payee1.address,
            ], [5, 1], { value: 60 })).deployed();
            splitter = splitter.connect(payee0);
            console.log('simple splitter:', splitter.address);
        });

        step('withdrawPayments', async () => {
            releaseTx = await splitter.withdrawPayments();
        });

        it('should change payee balance', async () => {
            await expect(releaseTx).to.changeEtherBalance(payee0, 50);
        });

        it('should emit an event', async () => {
            await expect(releaseTx)
                .to.emit(splitter, 'PaymentsReleased')
                .withArgs(payee0.address, 50);
        });

        it('should have updated totalReleased', async () => {
            expect(await splitter.totalReleased()).to.equal(50);
        });

        it('should have updated releasedTo', async () => {
            expect(await splitter.releasedTo(payee0.address)).to.equal(50);
        });

        it('should do nothing for a second release', async () => {
            await expect(await splitter.withdrawPayments())
                .to.changeEtherBalance(payee0, 0)
                .and.to.not.emit(splitter, 'PaymentsReleased');
            expect(await splitter.totalReleased()).to.equal(50);
            expect(await splitter.releasedTo(payee0.address)).to.equal(50);
        });

        it('availablePayments', async () => {
            expect(await splitter.availablePayments(admin.address), 'admin').to.equal(0);
            expect(await splitter.availablePayments(payee0.address), 'payee0').to.equal(0);
            expect(await splitter.availablePayments(payee1.address), 'payee1').to.equal(10);
        });
    });

    describe('simple splitter - withdrawPayments by admin for payee0', () => {
        let splitter: SimplePaymentSplitter;
        let releaseTx: ContractTransaction;

        logEvents.setup(() => splitter, 'Splitter');

        before('create splitter', async function () {
            splitter = await (await splitterFactory.deploy([
                payee0.address, payee1.address,
            ], [5, 1], { value: 60 })).deployed();
            console.log('simple splitter:', splitter.address);
        });

        step('withdrawPaymentsFor', async () => {
            releaseTx = await splitter.withdrawPaymentsFor(payee0.address);
        });

        it('should change payee balance', async () => {
            await expect(releaseTx).to.changeEtherBalance(payee0, 50);
        });

        it('should emit an event', async () => {
            await expect(releaseTx)
                .to.emit(splitter, 'PaymentsReleased')
                .withArgs(payee0.address, 50);
        });

        it('should have updated totalReleased', async () => {
            expect(await splitter.totalReleased()).to.equal(50);
        });

        it('should have updated releasedTo', async () => {
            expect(await splitter.releasedTo(payee0.address)).to.equal(50);
        });

        it('should do nothing for a second release', async () => {
            await expect(await splitter.withdrawPaymentsFor(payee0.address))
                .to.changeEtherBalance(payee0, 0)
                .and.to.not.emit(splitter, 'PaymentsReleased');
            expect(await splitter.totalReleased()).to.equal(50);
            expect(await splitter.releasedTo(payee0.address)).to.equal(50);
        });

        it('availablePayments', async () => {
            expect(await splitter.availablePayments(admin.address), 'admin').to.equal(0);
            expect(await splitter.availablePayments(payee0.address), 'payee0').to.equal(0);
            expect(await splitter.availablePayments(payee1.address), 'payee1').to.equal(10);
        });
    });

    describe('simple splitter - withdrawPayments by both', () => {
        let splitter: SimplePaymentSplitter;
        let splitter0: SimplePaymentSplitter;
        let splitter1: SimplePaymentSplitter;
        let release0Tx: ContractTransaction;
        let release1Tx: ContractTransaction;

        logEvents.setup(() => splitter, 'Splitter');

        before('create splitter', async function () {
            splitter = await (await splitterFactory.deploy([
                payee0.address, payee1.address,
            ], [5, 1], { value: 60 })).deployed();
            splitter0 = splitter.connect(payee0);
            splitter1 = splitter.connect(payee1);
            console.log('simple splitter:', splitter.address);
        });

        step('withdrawPayments', async () => {
            release0Tx = await splitter0.withdrawPayments();
            release1Tx = await splitter1.withdrawPayments();
        });

        it('should change payee balances', async () => {
            await expect(release0Tx, 'release0Tx').to.changeEtherBalance(payee0, 50);
            await expect(release1Tx, 'release1Tx').to.changeEtherBalance(payee1, 10);
        });

        it('should emit events', async () => {
            await expect(release0Tx, 'release0Tx')
                .to.emit(splitter, 'PaymentsReleased')
                .withArgs(payee0.address, 50);
            await expect(release1Tx, 'release1Tx')
                .to.emit(splitter, 'PaymentsReleased')
                .withArgs(payee1.address, 10);
        });

        it('should have updated totalReleased', async () => {
            expect(await splitter.totalReleased()).to.equal(60);
        });

        it('should have updated released', async () => {
            expect(await splitter.releasedTo(payee0.address)).to.equal(50);
            expect(await splitter.releasedTo(payee1.address)).to.equal(10);
        });

        it('should do nothing for a second release', async () => {
            await expect(await splitter0.withdrawPayments(), 'splitter0')
                .to.changeEtherBalance(payee0, 0)
                .and.to.not.emit(splitter0, 'PaymentsReleased');
            expect(await splitter.totalReleased()).to.equal(60);
            expect(await splitter.releasedTo(payee0.address)).to.equal(50);
            await expect(await splitter1.withdrawPayments(), 'splitter1')
                .to.changeEtherBalance(payee1, 0)
                .and.to.not.emit(splitter1, 'PaymentsReleased');
            expect(await splitter.totalReleased()).to.equal(60);
            expect(await splitter.releasedTo(payee1.address)).to.equal(10);
        });

        it('calculatePending', async () => {
            expect(await splitter.availablePayments(payee0.address), 'payee0').to.equal(0);
            expect(await splitter.availablePayments(payee1.address), 'payee1').to.equal(0);
        });
    });
});