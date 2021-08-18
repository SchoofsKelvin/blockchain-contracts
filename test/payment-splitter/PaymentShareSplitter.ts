import { ContractTransaction } from '@ethersproject/contracts';
import { TransactionResponse } from '@ethersproject/providers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import '@nomiclabs/hardhat-waffle';
import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ethers } from 'hardhat';
import type { Suite } from 'mocha';
import { PaymentShareSplitter, PaymentShareSplitter__factory } from '../../typechain';
import { before, logEvents } from '../utils';

const { expect } = chai.use(solidity);

describe('PaymentShareSplitter', () => {
    let admin: SignerWithAddress;
    let payee0: SignerWithAddress;
    let payee1: SignerWithAddress;
    let payee2: SignerWithAddress;
    let splitterFactory: PaymentShareSplitter__factory;

    before('setup signers', async () => {
        [admin, payee0, payee1, payee2] = await ethers.getSigners();
        splitterFactory = new PaymentShareSplitter__factory(admin);
        console.log('Signer:', admin.address);
    });

    describe('simple splitter', () => {
        let splitter: PaymentShareSplitter;

        logEvents.setup(() => splitter, 'Splitter');

        before('create splitter', async function () {
            splitter = await (await splitterFactory.deploy([
                payee0.address, payee1.address,
            ], [5], { value: 60 })).deployed();
            console.log('simple splitter:', splitter.address);
        });

        it('construction events', async () => {
            await expect(splitter.deployTransaction)
                .to.emit(splitter, 'PaymentReceived').withArgs(admin.address, 60)
                .and.to.emit(splitter, 'PayeeAdded').withArgs(payee0.address)
                .and.to.emit(splitter, 'PayeeAdded').withArgs(payee1.address)
                .and.to.emit(splitter, 'SharesChanged').withArgs(payee0.address, 5)
                .and.to.emit(splitter, 'SharesChanged').withArgs(payee1.address, 1);
        });

        describe('Public fields', () => {
            it('totalShares', async () => {
                expect(await splitter.totalShares()).to.equal(6);
            });

            it('totalReleased', async () => {
                expect(await splitter.totalReleased()).to.equal(0);
            });

            it('released', async () => {
                expect(await splitter.released(admin.address), 'admin').to.equal(0);
                expect(await splitter.released(payee0.address), 'payee0').to.equal(0);
                expect(await splitter.released(payee1.address), 'payee1').to.equal(0);
            });
        });

        describe('SharePeriod information', () => {
            it('totalSharePeriods', async () => {
                expect(await splitter.totalSharePeriods()).to.equal(2);
            });

            it('getAllSharePeriods', async () => {
                const periods = await splitter.getAllSharePeriods();
                expect(periods.length == 1);
            });

            it('getSharePeriod(0)', async () => {
                const period = await splitter.getSharePeriod(0);
                expect(period.id, 'id').to.equal(1);
                expect(period.totalShares, 'totalShares').to.equal(0);
                expect(period.totalReceived, 'totalReceived').to.equal(0);
                expect(period.payees.length, 'payees.length').to.equal(0);
                expect(period.shares.length, 'shares.length').to.equal(0);
            });

            it('getSharePeriod(1)', async () => {
                const period = await splitter.getSharePeriod(1);
                expect(period.id, 'id').to.equal(2);
                expect(period.totalShares, 'totalShares').to.equal(6);
                expect(period.totalReceived, 'totalReceived').to.equal(60);
                expect(period.payees.length, 'payees.length').to.equal(2);
                expect(period.shares.length, 'shares.length').to.equal(2);
                expect(period.payees[0], 'payees[0]').to.equal(payee0.address);
                expect(period.payees[1], 'payees[1]').to.equal(payee1.address);
            });

            it('getSharePeriod(2)', async () => {
                await expect(splitter.getSharePeriod(2), 'invalid')
                    .to.be.revertedWith('Index higher than amount of available periods');
            });

            it('currentSharePeriod', async () => {
                const period = await splitter.currentSharePeriod();
                expect(period.id, 'id').to.equal(2);
                expect(period.totalShares, 'totalShares').to.equal(6);
                expect(period.totalReceived, 'totalReceived').to.equal(60);
                expect(period.payees.length, 'payees.length').to.equal(2);
                expect(period.shares.length, 'shares.length').to.equal(2);
                expect(period.payees[0], 'payees[0]').to.equal(payee0.address);
                expect(period.payees[1], 'payees[1]').to.equal(payee1.address);
            });
        });

        describe('Payee information', () => {
            it('sharesOf', async () => {
                expect(await splitter.sharesOf(admin.address), 'admin').to.equal(0);
                expect(await splitter.sharesOf(payee0.address), 'payee0').to.equal(5);
                expect(await splitter.sharesOf(payee1.address), 'payee1').to.equal(1);
            });

            it('totalPayees', async () => {
                expect(await splitter.totalPayees()).to.equal(2);
            });

            it('getPayee', async () => {
                expect(await splitter.getPayee(0), 'getPayee(0)').to.equal(payee0.address);
                expect(await splitter.getPayee(1), 'getPayee(1)').to.equal(payee1.address);
                await expect(splitter.getPayee(2), 'invalid')
                    .to.be.revertedWith('Index higher than amount of registered payees');
            });

            it('isPayee', async () => {
                expect(await splitter.isPayee(admin.address), 'admin').to.be.false;
                expect(await splitter.isPayee(payee0.address), 'payee0').to.be.true;
                expect(await splitter.isPayee(payee1.address), 'payee1').to.be.true;
            });
        })

        describe('Payout information', () => {
            it('calculatePendingSince', async () => {
                await expect(splitter.calculatePendingSince(admin.address, 0), 'admin')
                    .to.be.revertedWith('Given address is not a registered payee');
                expect(await splitter.calculatePendingSince(payee0.address, 0), 'payee0').to.equal(50);
                expect(await splitter.calculatePendingSince(payee1.address, 0), 'payee1').to.equal(10);
            });

            it('calculatePendingSinceId', async () => {
                expect(await splitter.calculatePendingSinceId(payee0.address, 0), 'payee0').to.equal(50);
            });

            it('calculatePending', async () => {
                expect(await splitter.calculatePending(payee0.address), 'payee0').to.equal(50);
            });
        });
    });

    describe('simple splitter - release by payee0', () => {
        let splitter: PaymentShareSplitter;
        let releaseTx: ContractTransaction;

        logEvents.setup(() => splitter, 'Splitter');

        before('create splitter', async function () {
            splitter = await (await splitterFactory.deploy([
                payee0.address, payee1.address,
            ], [5], { value: 60 })).deployed();
            console.log('simple splitter:', splitter.address);
        });

        before('first release', async () => {
            releaseTx = await splitter.release(payee0.address);
        });

        it('should change payee balance', async () => {
            await expect(releaseTx).to.changeEtherBalance(payee0, 50);
        });

        it('should emit an event', async () => {
            await expect(releaseTx)
                .to.emit(splitter, 'PaymentReleased')
                .withArgs(payee0.address, 50);
        });

        it('should have updated totalReleased', async () => {
            expect(await splitter.totalReleased()).to.equal(50);
        });

        it('should have updated released', async () => {
            expect(await splitter.released(payee0.address)).to.equal(50);
        });

        it('should do nothing for a second release', async () => {
            await expect(await splitter.release(payee0.address))
                .to.changeEtherBalance(payee0, 0)
                .and.to.not.emit(splitter, 'PaymentReleased');
            expect(await splitter.totalReleased()).to.equal(50);
            expect(await splitter.released(payee0.address)).to.equal(50);
        });

        describe('Payout information', () => {
            it('calculatePendingSince', async () => {
                await expect(splitter.calculatePendingSince(admin.address, 0), 'admin')
                    .to.be.revertedWith('Given address is not a registered payee');
                expect(await splitter.calculatePendingSince(payee0.address, 0), 'payee0').to.equal(0);
                expect(await splitter.calculatePendingSince(payee1.address, 0), 'payee1').to.equal(10);
            });

            it('calculatePendingSinceId', async () => {
                expect(await splitter.calculatePendingSinceId(payee0.address, 0), 'payee0').to.equal(0);
            });

            it('calculatePending', async () => {
                expect(await splitter.calculatePending(payee0.address), 'payee0').to.equal(0);
            });
        });
    });

    describe('simple splitter - release by both', () => {
        let splitter: PaymentShareSplitter;
        let release0Tx: ContractTransaction;
        let release1Tx: ContractTransaction;

        logEvents.setup(() => splitter, 'Splitter');

        before('create splitter', async function () {
            splitter = await (await splitterFactory.deploy([
                payee0.address, payee1.address,
            ], [5], { value: 60 })).deployed();
            console.log('simple splitter:', splitter.address);
        });

        before('releases', async () => {
            release0Tx = await splitter.release(payee0.address);
            release1Tx = await splitter.release(payee1.address);
        });

        it('should change payee balances', async () => {
            await expect(release0Tx, 'release0Tx').to.changeEtherBalance(payee0, 50);
            await expect(release1Tx, 'release1Tx').to.changeEtherBalance(payee1, 10);
        });

        it('should emit events', async () => {
            await expect(release0Tx, 'release0Tx')
                .to.emit(splitter, 'PaymentReleased')
                .withArgs(payee0.address, 50);
            await expect(release1Tx, 'release1Tx')
                .to.emit(splitter, 'PaymentReleased')
                .withArgs(payee1.address, 10);
        });

        it('should have updated totalReleased', async () => {
            expect(await splitter.totalReleased()).to.equal(60);
        });

        it('should have updated released', async () => {
            expect(await splitter.released(payee0.address)).to.equal(50);
            expect(await splitter.released(payee1.address)).to.equal(10);
        });

        it('should do nothing for a second release', async () => {
            await expect(await splitter.release(payee0.address))
                .to.changeEtherBalance(payee0, 0)
                .and.to.not.emit(splitter, 'PaymentReleased');
            expect(await splitter.totalReleased()).to.equal(60);
            expect(await splitter.released(payee0.address)).to.equal(50);
            await expect(await splitter.release(payee1.address))
                .to.changeEtherBalance(payee1, 0)
                .and.to.not.emit(splitter, 'PaymentReleased');
            expect(await splitter.totalReleased()).to.equal(60);
            expect(await splitter.released(payee1.address)).to.equal(10);
        });

        it('calculatePending', async () => {
            expect(await splitter.calculatePending(payee0.address), 'payee0').to.equal(0);
            expect(await splitter.calculatePending(payee1.address), 'payee1').to.equal(0);
        });
    });

    describe('complex splitter', () => {
        // Start with { payee0: 2, payee1: 1 } and a payment of 150

        let splitter: PaymentShareSplitter;
        logEvents.setup(() => splitter, 'Splitter');

        function describeSplitter(name: string, cb: (this: Suite) => void) {
            describe(name, function () {
                const suite = this;
                before('create splitter', async function () {
                    splitter = await (await splitterFactory.deploy([
                        payee0.address, payee1.address,
                    ], [2], { value: 150 })).deployed();
                    console.log('Set splitter to', splitter.address, 'for', name, 'in', suite.fullTitle());
                });
                cb.call(this);
            });
        }

        describeSplitter('basic test', () => {
            it('construction events', async () => {
                await expect(splitter.deployTransaction)
                    .to.emit(splitter, 'PaymentReceived').withArgs(admin.address, 150)
                    .and.to.emit(splitter, 'PayeeAdded').withArgs(payee0.address)
                    .and.to.emit(splitter, 'PayeeAdded').withArgs(payee1.address)
                    .and.to.emit(splitter, 'SharesChanged').withArgs(payee0.address, 2)
                    .and.to.emit(splitter, 'SharesChanged').withArgs(payee1.address, 1);
            });
        });

        describe('payee0 +2 shares | +50 payment', () => {

            describeSplitter('validation', () => {
                let addSharesTx: ContractTransaction;
                let addPaymentTx: TransactionResponse;
                before('add shares', async function () {
                    addSharesTx = await splitter.addShares(payee0.address, 2);
                    await addSharesTx.wait();
                });

                before('add payment', async function () {
                    addPaymentTx = await admin.sendTransaction({
                        to: splitter.address,
                        value: 50,
                    });
                    await addPaymentTx.wait();
                });

                it('should emit share events', async () => {
                    await expect(addSharesTx)
                        .to.emit(splitter, 'SharesChanged').withArgs(payee0.address, 4)
                        .and.to.not.emit(splitter, 'PayeeAdded');
                });

                it('should emit payment event', async () => {
                    await expect(addPaymentTx)
                        .to.emit(splitter, 'PaymentReceived').withArgs(admin.address, 50);
                });

                it('sharesOf', async () => {
                    expect(await splitter.sharesOf(payee0.address), 'payee0').to.equal(4);
                    expect(await splitter.sharesOf(payee1.address), 'payee1').to.equal(1);
                });

                it('totalPayees', async () => {
                    expect(await splitter.totalPayees()).to.equal(2);
                });

                it('totalShares', async () => {
                    console.log('Checking totalShares');
                    expect(await splitter.totalShares()).to.equal(5);
                });

                it('totalSharePeriods', async () => {
                    expect(await splitter.totalSharePeriods()).to.equal(3);
                });

                it('getSharePeriod(0)', async () => {
                    const period = await splitter.getSharePeriod(0);
                    expect(period.id, 'id').to.equal(1);
                    expect(period.totalShares, 'totalShares').to.equal(0);
                    expect(period.totalReceived, 'totalReceived').to.equal(0);
                    expect(period.payees, 'payees').to.deep.equal([]);
                    expect(period.shares.map(b => b.toNumber()), 'shares').to.deep.equal([]);
                });

                it('getSharePeriod(1)', async () => {
                    const period = await splitter.getSharePeriod(1);
                    expect(period.id, 'id').to.equal(2);
                    expect(period.totalShares, 'totalShares').to.equal(3);
                    expect(period.totalReceived, 'totalReceived').to.equal(150);
                    expect(period.payees, 'payees').to.deep.equal([payee0.address, payee1.address]);
                    expect(period.shares.map(b => b.toNumber()), 'shares').to.deep.equal([2, 1]);
                });

                it('getSharePeriod(2)', async () => {
                    const period = await splitter.getSharePeriod(2);
                    expect(period.id, 'id').to.equal(3);
                    expect(period.totalShares, 'totalShares').to.equal(5);
                    expect(period.totalReceived, 'totalReceived').to.equal(50);
                    expect(period.payees, 'payees').to.deep.equal([payee0.address, payee1.address]);
                    expect(period.shares.map(b => b.toNumber()), 'shares').to.deep.equal([4, 1]);
                });

                it('calculatePending', async () => {
                    // payee0: 150*(2/3) + 50*(4/5) = 140
                    expect(await splitter.calculatePending(payee0.address), 'payee0').to.equal(140);
                    // payee1: 150*(1/3) + 50*(1/5) = 60
                    expect(await splitter.calculatePending(payee1.address), 'payee1').to.equal(60);
                });

                it('calculatePendingSince(2)', async () => {
                    // payee0: 50*(4/5) = 40
                    expect(await splitter.calculatePendingSince(payee0.address, 2), 'payee0').to.equal(40);
                    // payee1: 50*(1/5) = 10
                    expect(await splitter.calculatePendingSince(payee1.address, 2), 'payee1').to.equal(10);
                });
            });

            describeSplitter('payee0 full release', () => {
                before('add shares', () => splitter.addShares(payee0.address, 2));
                before('add payment', () => admin.sendTransaction({ to: splitter.address, value: 50 }));

                let releaseTx: ContractTransaction;
                before('release', async () => {
                    releaseTx = await splitter.release(payee0.address);
                });

                it('should emit events', async () => {
                    await expect(releaseTx)
                        .to.emit(splitter, 'PaymentReleased')
                        .withArgs(payee0.address, 140)
                        .and.to.changeEtherBalance(payee0, 140);
                });

                it('totalReleased', async () => {
                    expect(await splitter.totalReleased()).to.equal(140);
                });

                it('released', async () => {
                    expect(await splitter.released(payee0.address)).to.equal(140);
                    expect(await splitter.released(payee1.address)).to.equal(0);
                });

                it('calculatePending', async () => {
                    // payee0: 150*(2/3) + 50*(4/5) - 140 = 0
                    expect(await splitter.calculatePending(payee0.address), 'payee0').to.equal(0);
                    // payee1: 150*(1/3) + 50*(1/5) - 0   = 60
                    expect(await splitter.calculatePending(payee1.address), 'payee1').to.equal(60);
                });
            });

            describeSplitter('payee0 release since 2', () => {
                before('add shares', () => splitter.addShares(payee0.address, 2));
                before('add payment', () => admin.sendTransaction({ to: splitter.address, value: 50 }));

                let releaseTx: ContractTransaction;
                before('release', async () => {
                    releaseTx = await splitter.releaseSince(payee0.address, 2);
                });

                it('should emit events', async () => {
                    await expect(releaseTx)
                        .to.emit(splitter, 'PaymentReleased')
                        .withArgs(payee0.address, 40)
                        .and.to.changeEtherBalance(payee0, 40);
                });

                it('totalReleased', async () => {
                    expect(await splitter.totalReleased()).to.equal(40);
                });

                it('released', async () => {
                    expect(await splitter.released(payee0.address)).to.equal(40);
                    expect(await splitter.released(payee1.address)).to.equal(0);
                });

                it('calculatePending', async () => {
                    // payee0: 150*(2/3) + 50*(4/5) - 40 = 100
                    expect(await splitter.calculatePending(payee0.address), 'payee0').to.equal(100);
                    // payee1: 150*(1/3) + 50*(1/5) - 0  = 60
                    expect(await splitter.calculatePending(payee1.address), 'payee1').to.equal(60);
                });
            });

            describeSplitter('payee0 release since 2 | payee0 full release', () => {
                before('add shares', () => splitter.addShares(payee0.address, 2));
                before('add payment', () => admin.sendTransaction({ to: splitter.address, value: 50 }));

                let release1Tx: ContractTransaction;
                let release2Tx: ContractTransaction;
                before('release', async () => {
                    release1Tx = await splitter.releaseSince(payee0.address, 2);
                    release2Tx = await splitter.release(payee0.address);
                });

                it('should emit events', async () => {
                    await expect(release1Tx, 'release1Tx')
                        .to.emit(splitter, 'PaymentReleased')
                        .withArgs(payee0.address, 40)
                        .and.to.changeEtherBalance(payee0, 40);
                    await expect(release2Tx, 'release2Tx')
                        .to.emit(splitter, 'PaymentReleased')
                        .withArgs(payee0.address, 100)
                        .and.to.changeEtherBalance(payee0, 100);
                });

                it('totalReleased', async () => {
                    expect(await splitter.totalReleased()).to.equal(140);
                });

                it('released', async () => {
                    expect(await splitter.released(payee0.address)).to.equal(140);
                    expect(await splitter.released(payee1.address)).to.equal(0);
                });

                it('calculatePending', async () => {
                    // payee0: 150*(2/3) + 50*(4/5) - 140 = 0
                    expect(await splitter.calculatePending(payee0.address), 'payee0').to.equal(0);
                    // payee1: 150*(1/3) + 50*(1/5) - 0  = 60
                    expect(await splitter.calculatePending(payee1.address), 'payee1').to.equal(60);
                });
            });

        });
    });
});