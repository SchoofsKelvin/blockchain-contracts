import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { BitmapTest, BitmapTest__factory } from '../../typechain';
import { logEvents } from '../utils';

const { expect } = chai.use(solidity);

describe('Bitmap', () => {
    let signer: SignerWithAddress;

    before('set up signer', async () => [signer] = await ethers.getSigners());

    let contract: BitmapTest;

    before('deploy BitmapTest', async () => {
        const BitmapTest = new BitmapTest__factory(signer);
        contract = await BitmapTest.deploy(11000);
        logEvents.setup(contract, 'BitmapTest');
    });

    it('should have correct totalSupply', async () => {
        expect(await contract.totalSupply()).to.eq(11000);
    });

    it('should not have tokenId 1', async () => {
        expect(await contract.exists(1)).to.be.false;
    });

    it('should revert for OutOfBounds', async () => {
        expect(contract.exists(11000)).to.be.revertedWith('Bitmap OutOfBounds');
    });

    it('send exists() transaction for gas reporter', async () => {
        await signer.sendTransaction(await contract.populateTransaction.exists(1));
    });

    describe('scenario 1 (empty)', () => {
        step('mint #1', async () => {
            const mintTransaction = await contract.mint(1);
            await expect(mintTransaction).to.emit(contract, 'Mint').withArgs(1);
            expect(await contract.exists(1)).to.be.true;
            expect(await contract.count()).to.eq(1);
        });

        step('mint #2', async () => {
            await expect(await contract.mint(1)).to.emit(contract, 'Mint').withArgs(2);
            expect(await contract.count()).to.eq(2);
        });

        step('mint #3', async () => {
            await expect(await contract.mint(0)).to.emit(contract, 'Mint').withArgs(0);
            expect(await contract.count()).to.eq(3);
        });

        step('mint #4', async () => {
            await expect(await contract.mint(1000)).to.emit(contract, 'Mint').withArgs(1000);
            expect(await contract.count()).to.eq(4);
        });
    });

    describe('scenario 2 (fillBitmapFirstSlot)', () => {
        before('fillBitmapFirstSlot', async () => {
            await contract.fillBitmapFirstSlot();
            expect(await contract.exists(0)).to.be.true;
            expect(await contract.exists(1)).to.be.true;
            expect(await contract.exists(255)).to.be.true;
            expect(await contract.exists(256)).to.be.false;
            expect(await contract.exists(257)).to.be.false;
        });

        step('mint #1', async () => {
            await expect(await contract.mint(1)).to.emit(contract, 'Mint').withArgs(256);
            expect(await contract.exists(256)).to.be.true;
        });

        step('mint #2', async () => {
            await expect(await contract.mint(1)).to.emit(contract, 'Mint').withArgs(257);
            expect(await contract.exists(257)).to.be.true;
        });
    });

    describe('scenario 3 (fillBitmapExceptFirstIndex)', () => {
        before('fillBitmapExceptFirstIndex', async () => {
            await contract.fillBitmapExceptFirstIndex();
            expect(await contract.exists(0)).to.be.false;
            expect(await contract.exists(1)).to.be.true;
            expect(await contract.exists(255)).to.be.true;
            expect(await contract.exists(256)).to.be.true;
            expect(await contract.exists(10999)).to.be.true;
        });

        step('mint #1', async () => {
            await expect(await contract.mint(1)).to.emit(contract, 'Mint').withArgs(0);
        });

        step('mint #2', async () => {
            await expect(contract.mint(1)).to.be.revertedWith('Bitmap full');
        });
    });

    describe('generateFreeIndex complexity', () => {
        function reportCost(title: string, seed: BigNumberish, expected: number): void {
            it(title, async () => {
                const trans = await contract.populateTransaction.generateFreeIndex(seed);
                await (await signer.sendTransaction(trans)).wait();
                expect(await contract.generateFreeIndex(seed)).to.eq(expected);
            });
        }

        describe('with size 10k', () => {
            before(() => contract.init(10e3));

            describe('and empty', () => {
                before(() => contract.setAllBits(false));

                it('should have the correct count', async () => {
                    expect(await contract.count()).to.eq(0);
                });

                reportCost('index 0', 0, 0);
                reportCost('index 5000', 5000, 5000);
                reportCost('index 9999', 9999, 9999);
                reportCost('index 10000', 10000, 0);
            });

            describe('and first 50% full', () => {
                before(async () => {
                    await contract.setAllBits(false);
                    const values: BigNumberish[] = [];
                    for (let i = 0; i < 19; i++) values[i] = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
                    values.push('0x000000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
                    await contract.writeBits(values, 0);
                });

                it('should have the correct count', async () => {
                    expect(await contract.count()).to.eq(5e3);
                });

                reportCost('index 0', 0, 5000);
                reportCost('index 4000', 4000, 5000);
                reportCost('index 5000', 5000, 5000);
                reportCost('index 9999', 9999, 9999);
                reportCost('index 10000', 10000, 5000);
            });

            describe('and staggered 50% full', () => {
                before(async () => {
                    await contract.setAllBits(false);
                    const values: BigNumberish[] = [];
                    for (let i = 0; i < 39; i++) values[i] = '0x5555555555555555555555555555555555555555555555555555555555555555'
                    values.push("0x0000000000000000000000000000000000000000000000000000000000005555");
                    await contract.writeBits(values, 0);
                });

                it('should have the correct count', async () => {
                    expect(await contract.count()).to.eq(5e3);
                });

                reportCost('index 0', 0, 1);
                reportCost('index 1', 1, 1);
                reportCost('index 5000', 5000, 5001);
                reportCost('index 9999', 9999, 9999);
                reportCost('index 10000', 10000, 1);
            });

            describe('and full except for the first bit', () => {
                before(() => contract.fillBitmapExceptFirstIndex());

                it('should have the correct count', async () => {
                    expect(await contract.count()).to.eq(9999);
                });

                reportCost('index 0', 0, 0);
                reportCost('index 1 (worst case)', 1, 0);
                reportCost('index 5000', 5000, 0);
                reportCost('index 9999', 9999, 0);
                reportCost('index 10000', 10000, 0);
            });

        });

        describe('with size 100k', () => {
            before(() => contract.init(100e3));

            describe('and empty', () => {
                before(() => contract.setAllBits(false));

                it('should have the correct count', async () => {
                    expect(await contract.count()).to.eq(0);
                });

                reportCost('index 0', 0, 0);
                reportCost('index 50000', 50000, 50000);
                reportCost('index 99999', 99999, 99999);
                reportCost('index 100000', 100000, 0);
            });

            describe('and full except for the first bit', () => {
                before(() => contract.fillBitmapExceptFirstIndex());

                it('should have the correct count', async () => {
                    expect(await contract.count()).to.eq(99999);
                });

                reportCost('index 0', 0, 0);
                reportCost('index 1 (worst case)', 1, 0);
                reportCost('index 50000', 50000, 0);
                reportCost('index 99999', 99999, 0);
                reportCost('index 100000', 100000, 0);
            });

        });
    });

});
