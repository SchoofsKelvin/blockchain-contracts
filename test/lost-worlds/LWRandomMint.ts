import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { LWRandomMint, LWRandomMint__factory } from '../../typechain';
import { logEvents } from '../utils';

const { expect } = chai.use(solidity);

describe('LWRandomMint', () => {
    let signer: SignerWithAddress;

    before('set up signer', async () => [signer] = await ethers.getSigners());

    let contract: LWRandomMint;

    function logGas(title: string, fn: () => Promise<void>): Mocha.Test {
        return step(title, async () => {
            const startBlock = (await ethers.provider.getBlockNumber()) + 1;
            await fn();
            let totalGas = BigNumber.from(0);
            const from = ethers.utils.hexlify(signer.address);
            const endBlock = await ethers.provider.getBlockNumber();
            for (let i = startBlock; i <= endBlock; i++) {
                const block = await ethers.provider.getBlockWithTransactions(startBlock);
                for (const trans of block.transactions.filter(t => ethers.utils.hexlify(t.from) === from)) {
                    totalGas = totalGas.add(await trans.wait().then(r => r.gasUsed).catch(() => BigNumber.from(0)));
                }
            }
            console.log(`Gas used during ${title}:`, totalGas.toString());
        });
    }

    logGas('deploy LWRandomMint', async () => {
        const LWRandomMint = new LWRandomMint__factory(signer);
        contract = await LWRandomMint.deploy(11000);
        logEvents.setup(contract, 'LWRandomMint');
    });

    step("should have correct totalSupply", async () => {
        expect(await contract.totalSupply()).to.eq(11000);
    });

    step("should not have tokenId 1", async () => {
        expect(await contract.exists(1)).to.be.false;
    });

    logGas("mint #1.1", async () => {
        const mintTransaction = await contract.mint(1);
        await expect(mintTransaction).to.emit(contract, 'Mint').withArgs(1);
        expect(await contract.exists(1)).to.be.true;
        console.log("Gas used:", (await mintTransaction.wait()).gasUsed.toString());
    });

    logGas("mint #1.2", async () => {
        await expect(await contract.mint(1)).to.emit(contract, 'Mint').withArgs(2);
    });

    logGas("mint #1.3", async () => {
        await expect(await contract.mint(0)).to.emit(contract, 'Mint').withArgs(0);
    });

    logGas("mint #1.4", async () => {
        await expect(await contract.mint(1000)).to.emit(contract, 'Mint').withArgs(1000);
    });

    step("fillBitmapFirstSlot", async () => {
        await contract.fillBitmapFirstSlot();
        expect(await contract.exists(0)).to.be.true;
        expect(await contract.exists(1)).to.be.true;
        expect(await contract.exists(255)).to.be.true;
        expect(await contract.exists(256)).to.be.false;
        expect(await contract.exists(257)).to.be.false;
    });

    logGas("mint #2.1", async () => {
        await expect(await contract.mint(1)).to.emit(contract, 'Mint').withArgs(256);
        expect(await contract.exists(256)).to.be.true;
    });

    logGas("mint #2.2", async () => {
        await expect(await contract.mint(1)).to.emit(contract, 'Mint').withArgs(257);
        expect(await contract.exists(257)).to.be.true;
    });

    step("fillBitmapExceptFirstIndex", async () => {
        await contract.fillBitmapExceptFirstIndex();
        expect(await contract.exists(0)).to.be.false;
        expect(await contract.exists(1)).to.be.true;
        expect(await contract.exists(255)).to.be.true;
        expect(await contract.exists(256)).to.be.true;
        expect(await contract.exists(10999)).to.be.true;
    });

    logGas("mint #3.1", async () => {
        await expect(await contract.mint(1)).to.emit(contract, 'Mint').withArgs(0);
    });

    step("mint #3.2", async () => {
        await expect(contract.mint(1)).to.be.revertedWith("Bitmap full");
    });

});
