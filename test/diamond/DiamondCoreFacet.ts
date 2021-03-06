import { FunctionFragment, Interface } from '@ethersproject/abi';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import '@nomiclabs/hardhat-waffle';
import * as chai from 'chai';
import { solidity } from 'ethereum-waffle';
import { ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { step } from 'mocha-steps';
import { createUseDiamond, getInterfaceHash } from '../../scripts/utils';
import { DiamondTestFacet, DiamondTestFacet__factory, Diamond__factory, IDiamondCut__factory, IDiamondLoupe__factory, IERC165__factory } from '../../typechain';
import { before, describeStep, expectFacetsToMatch, logEvents, stepAddFacet, stepRemoveFacet, stepReplaceFacet, useDescribeDiamondWithCore } from '../utils';

const { expect } = chai.use(solidity);

const SEL = {
    // General
    onFallback: '0xe4354586',
    initialize: '0x8129fc1c',
    // IERC165
    supportsInterface: '0x01ffc9a7',
    // IDiamondLoupe
    facets: '0x7a0ed627',
    facetFunctionSelectors: '0xadfca15e',
    facetAddresses: '0x52ef6b2c',
    facetAddress: '0xcdffacc6',
    // IDiamondCut
    diamondCut: '0x1f931c1c',
    // DiamondTestFacet
    deployedBlock: '0x82ea7bfe',
    setValue: '0x6cfd19ea',
    getValue: '0x69843940',
    a: '0xf0fdf834',
    b: '0x4df7e3d0',
    doNothing: '0x2f576f20',
    storeBlockNumber: '0x8ceb50ab',
    getFallbackValues: '0x12b367e7',
    modifiers: '0xd467dd44',
    addModifier1: '0xfdddd1de',
    removeModifier1: '0x46ddd135',
    addModifier2: '0x2d42448c',
    removeModifier2: '0xc8704640',
};

const CORE_SELECTORS = [
    SEL.supportsInterface,
    SEL.facets,
    SEL.facetFunctionSelectors,
    SEL.facetAddresses,
    SEL.facetAddress,
    SEL.diamondCut,
];

describe('DiamondCoreFacet', () => {
    let admin: SignerWithAddress;
    let diamondFactory: Diamond__factory;
    let diamondTestFactory: DiamondTestFacet__factory;

    before('setup signers', async () => {
        [admin] = await ethers.getSigners();
        diamondFactory = new Diamond__factory(admin);
        diamondTestFactory = new DiamondTestFacet__factory(admin);
        console.log('Signer:', admin.address);
    });

    const [describeDiamond, , , getCoreFacet] = useDescribeDiamondWithCore(() => admin, []);

    let testFacet1: DiamondTestFacet;
    let testFacet2: DiamondTestFacet;

    it('coreFacet.selectors()', async () => {
        expect(await getCoreFacet().selectors()).to.have.members(CORE_SELECTORS);
    });

    before('deploy test facets', async () => {
        testFacet1 = await diamondTestFactory.deploy();
        logEvents.setup(() => testFacet1, 'DiamondTestFacet1');
        console.log('DiamondTestFacet1 deployed at', testFacet1.address);
        testFacet2 = await diamondTestFactory.deploy();
        logEvents.setup(() => testFacet2, 'DiamondTestFacet2');
        console.log('DiamondTestFacet2 deployed at', testFacet2.address);
    });

    it('different testFacet.deployedBlock()', async () => {
        expect(await testFacet1.deployedBlock()).to.not.equal(await testFacet2.deployedBlock());
    });

    describe('invalid empty diamond', () => {
        it('deploy diamond([])', async () => {
            expect(diamondFactory.deploy([])).to.be.reverted;
        });
    });

    describe('minimal empty diamond', () => {
        const [diamond, setDiamond] = createUseDiamond(IERC165__factory, IDiamondCut__factory, IDiamondLoupe__factory);
        logEvents.setup(diamond, 'Diamond');

        step('deploy diamond([Core:[supportsInterface,facetAddress]],SELECTORS.initialize)', async () => {
            setDiamond(await diamondFactory.deploy([{
                facet: getCoreFacet().address,
                initializer: SEL.initialize,
                selectors: [SEL.supportsInterface, SEL.facetAddress],
            }]), admin);
        });

        it('construction events', async () => {
            await expect(diamond.deployTransaction).to.emit(diamond, 'DiamondCut');
            const logs = (await diamond.deployTransaction.wait()).logs;
            const eventHash = diamond.interface.getEventTopic('DiamondCut');
            const dcLogs = logs.filter(log => log.topics[0] === eventHash);
            expect(dcLogs, '#dcLogs').to.have.lengthOf(1);
            const event = diamond.interface.parseLog(dcLogs[0]);
            expect(event.args, 'event.args').to.have.deep.members([
                [[getCoreFacet().address, 0, [SEL.supportsInterface, SEL.facetAddress]]], ethers.constants.AddressZero, "0x"
            ]);
        });
    });

    describeDiamond('Diamond with DiamondCoreFacet', diamond => {

        describe('supportsInterface', () => {
            it('IERC165', async () => {
                const hash = getInterfaceHash(IERC165__factory);
                expect(hash).to.equal(SEL.supportsInterface);
                expect(await diamond.supportsInterface(hash)).to.be.true;
            });

            it('IDiamondCut', async () => {
                const hash = getInterfaceHash(IDiamondCut__factory);
                expect(hash).to.equal(SEL.diamondCut);
                expect(await diamond.supportsInterface(hash)).to.be.true;
            });

            it('IDiamondLoupe', async () => {
                const hash = getInterfaceHash(IDiamondLoupe__factory);
                expect(hash).to.equal('0x48e2b093');
                expect(await diamond.supportsInterface(hash)).to.be.true;
            });

            it('random', async () => {
                expect(await diamond.supportsInterface('0x00000000'), '0x00000000').to.be.false;
                expect(await diamond.supportsInterface('0x12345678'), '0x12345678').to.be.false;
                expect(await diamond.supportsInterface('0xFFFFFFFF'), '0xFFFFFFFF').to.be.false;
            });
        });

        describe('IDiamondLoupe', () => {
            it('facets', async () => {
                expectFacetsToMatch(await diamond.facets(), [[getCoreFacet().address, CORE_SELECTORS]]);
            });

            it('facetFunctionSelectors(CoreFacet)', async () => {
                expect(await diamond.facetFunctionSelectors(getCoreFacet().address)).to.have.members(CORE_SELECTORS);
            });
            it('facetFunctionSelectors(Random)', async () => {
                expect(await diamond.facetFunctionSelectors(admin.address)).to.have.members([]);
            });

            it('facetAddresses', async () => {
                expect(await diamond.facetAddresses()).to.have.members([getCoreFacet().address]);
            });

            it('facetAddress(facets)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('facets'));
                expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
            });
            it('facetAddress(supportsInterface)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('supportsInterface'));
                expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
            });
            it('facetAddress(diamondCut)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('diamondCut'));
                expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
            });
            it('facetAddress(random)', async () => {
                expect(await diamond.facetAddress('0x12345678')).to.equal(ethers.constants.AddressZero);
            });
        });
    });

    describe('Diamond with DiamondCoreFacet - empty diamondCut', () => {
        const [diamond, setDiamond] = createUseDiamond(IERC165__factory, IDiamondCut__factory, IDiamondLoupe__factory, DiamondTestFacet__factory);
        logEvents.setup(diamond, 'Diamond');

        step('deploy diamond([Core,Test:getValue],SELECTORS.initialize)', async () => {
            setDiamond(await diamondFactory.deploy([{
                facet: getCoreFacet().address,
                initializer: SEL.initialize,
                selectors: CORE_SELECTORS,
            }, {
                facet: testFacet1.address,
                initializer: "0x",
                selectors: [SEL.getValue],
            }]), admin);
        });

        const key = ethers.utils.keccak256(Buffer.from("setValue key for uniqueValue"));
        const uniqueValue = Date.now();
        const getTrans = stepAddFacet(diamond, () => testFacet1, [], ['setValue', key, uniqueValue]);

        it('should have called passed calldata', async () => {
            const cd = (await testFacet1.populateTransaction.setValue(key, uniqueValue)).data!;
            await expect(getTrans()).to.emit(diamond, 'DiamondCut').withArgs([], testFacet1.address, cd);
            expect(await diamond.getValue(key), 'getValue').to.equal(uniqueValue);
        });

        step('empty diamondCut', async () => {
            await diamond.diamondCut([], ethers.constants.AddressZero, "0x");
        });

        it('facets should be unchanged', async () => {
            expectFacetsToMatch(await diamond.facets(), [
                [getCoreFacet().address, CORE_SELECTORS],
                [testFacet1.address, [SEL.getValue]],
            ]);
        });
    });

    describeDiamond('Diamond with DiamondCoreFacet - Add/Remove testFacet1 for selector 0x00000000', diamond => {
        const data = '0x00000000' + '00112233445566778899aabbccddeeff';

        stepAddFacet(diamond, () => testFacet1, [SEL.getFallbackValues, '0x00000000']);

        it('should return correct facetAddress for 0x00000000', async () => {
            expect(await diamond.facetAddress("0x00000000")).to.equal(testFacet1.address);
        });

        step('should allow calling the 0x00000000 signature', async () => {
            await admin.sendTransaction({ to: diamond.address, data });
        });

        it('should have set lastFallbackCallData', async () => {
            const [fallbackData] = await diamond.getFallbackValues();
            expect(fallbackData).to.equal(data);
        });

        stepRemoveFacet(diamond, ['0x00000000']);

        it('should no longer return a facetAddress for 0x00000000', async () => {
            expect(await diamond.facetAddress("0x00000000")).to.equal(ethers.constants.AddressZero);
        });


        step('should not allow calling the 0x00000000 signature anymore', async () => {
            await expect(admin.sendTransaction({ to: diamond.address, data })).to.be.revertedWith('revert');
        });
    }, DiamondTestFacet__factory);

    describeDiamond('Diamond with DiamondCoreFacet - Add testFacet1 twice at once', diamond => {

        let cutTransaction: ContractTransaction;
        step('add both facets', async () => {
            cutTransaction = await diamond.diamondCut([{
                facetAddress: testFacet1.address,
                action: 0,
                functionSelectors: [SEL.a, SEL.b, SEL.doNothing],
            }, {
                facetAddress: testFacet1.address,
                action: 0,
                functionSelectors: [SEL.setValue, SEL.getValue, SEL.deployedBlock],
            }], testFacet1.address, SEL.initialize);
        });

        it('should emit the correct event', async () => {
            await expect(cutTransaction).to.emit(diamond, 'DiamondCut');
            const logs = (await cutTransaction.wait()).logs;
            const eventHash = diamond.interface.getEventTopic('DiamondCut');
            const dcLogs = logs.filter(log => log.topics[0] === eventHash);
            expect(dcLogs, '#dcLogs').to.have.lengthOf(1);
            const event = diamond.interface.parseLog(dcLogs[0]);
            expect(event.args, 'event.args').to.have.deep.members([[
                [testFacet1.address, 0, [SEL.a, SEL.b, SEL.doNothing]],
                [testFacet1.address, 0, [SEL.setValue, SEL.getValue, SEL.deployedBlock]],
            ], testFacet1.address, SEL.initialize]);
        });

        it('should have a(uint256)', async () => {
            await diamond.a(8);
            expect((await diamond.getValue(ethers.utils.keccak256(Buffer.from("a")))).toNumber(), 'getValue').to.equal(8);
        });

        it('should have b()', async () => {
            await diamond.setValue(ethers.utils.keccak256(Buffer.from("b")), 9);
            expect(await diamond.b(), 'b()').to.deep.equal([[9], [2, 3, 4]]);
        });

        it('should call doNothing() just fine', async () => {
            await diamond.doNothing();
        });

        describe('supportsInterface', () => {
            it('set by testFacet1.initialize', async () => {
                expect(await diamond.supportsInterface('0x11223344')).to.be.true;
            });

            it('random', async () => {
                expect(await diamond.supportsInterface('0x00000000'), '0x00000000').to.be.false;
                expect(await diamond.supportsInterface('0x12345678'), '0x12345678').to.be.false;
                expect(await diamond.supportsInterface('0xFFFFFFFF'), '0xFFFFFFFF').to.be.false;
            });
        });

        describe('IDiamondLoupe', () => {
            it('facets', async () => {
                expectFacetsToMatch(await diamond.facets(), [
                    [getCoreFacet().address, CORE_SELECTORS],
                    [testFacet1.address, [SEL.a, SEL.b, SEL.doNothing, SEL.setValue, SEL.getValue, SEL.deployedBlock]],
                ]);
            });

            it('facetFunctionSelectors(CoreFacet)', async () => {
                expect(await diamond.facetFunctionSelectors(getCoreFacet().address)).to.have.members(CORE_SELECTORS);
            });
            it('facetFunctionSelectors(TestFacet1)', async () => {
                expect(await diamond.facetFunctionSelectors(testFacet1.address)).to.have.members([
                    SEL.a, SEL.b, SEL.doNothing, SEL.setValue, SEL.getValue, SEL.deployedBlock,
                ]);
            });
            it('facetFunctionSelectors(Random)', async () => {
                expect(await diamond.facetFunctionSelectors(admin.address)).to.have.members([]);
            });

            it('facetAddresses', async () => {
                expect(await diamond.facetAddresses()).to.have.members([getCoreFacet().address, testFacet1.address]);
            });

            it('facetAddress(facets)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('facets'));
                expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
            });
            it('facetAddress(a)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('a'));
                expect(await diamond.facetAddress(sig)).to.equal(testFacet1.address);
            });
            it('facetAddress(b)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('b'));
                expect(await diamond.facetAddress(sig)).to.equal(testFacet1.address);
            });
            it('facetAddress(initialize)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('initialize'));
                expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
            });
            it('facetAddress(random)', async () => {
                expect(await diamond.facetAddress('0x12345678')).to.equal(ethers.constants.AddressZero);
            });
        });
    }, DiamondTestFacet__factory);

    describeDiamond('Diamond with DiamondCoreFacet - Add testFacet1 and testFacet2', diamond => {

        let cutTransaction: ContractTransaction;
        step('add both facets', async () => {
            cutTransaction = await diamond.diamondCut([{
                facetAddress: testFacet1.address,
                action: 0,
                functionSelectors: [SEL.a, SEL.b],
            }, {
                facetAddress: testFacet2.address,
                action: 0,
                functionSelectors: [SEL.setValue, SEL.getValue, SEL.deployedBlock],
            }], testFacet1.address, SEL.initialize);
        });

        it('should emit the correct event', async () => {
            await expect(cutTransaction).to.emit(diamond, 'DiamondCut');
            const logs = (await cutTransaction.wait()).logs;
            const eventHash = diamond.interface.getEventTopic('DiamondCut');
            const dcLogs = logs.filter(log => log.topics[0] === eventHash);
            expect(dcLogs, '#dcLogs').to.have.lengthOf(1);
            const event = diamond.interface.parseLog(dcLogs[0]);
            expect(event.args, 'event.args').to.have.deep.members([[
                [testFacet1.address, 0, [SEL.a, SEL.b]],
                [testFacet2.address, 0, [SEL.setValue, SEL.getValue, SEL.deployedBlock]],
            ], testFacet1.address, SEL.initialize]);
        });

        it('should have a(uint256)', async () => {
            await diamond.a(8);
            expect((await diamond.getValue(ethers.utils.keccak256(Buffer.from("a")))).toNumber(), 'getValue').to.equal(8);
        });

        it('should have b()', async () => {
            await diamond.setValue(ethers.utils.keccak256(Buffer.from("b")), 9);
            expect(await diamond.b(), 'b()').to.deep.equal([[9], [2, 3, 4]]);
        });

        it('should have deployedBlock() from facet 2', async () => {
            const bn = await testFacet2.deployedBlock();
            expect(await diamond.deployedBlock()).to.equal(bn);
        });

        describe('IDiamondLoupe', () => {
            it('facets', async () => {
                expectFacetsToMatch(await diamond.facets(), [
                    [getCoreFacet().address, CORE_SELECTORS],
                    [testFacet1.address, [SEL.a, SEL.b]],
                    [testFacet2.address, [SEL.setValue, SEL.getValue, SEL.deployedBlock]],
                ]);
            });

            it('facetFunctionSelectors(CoreFacet)', async () => {
                expect(await diamond.facetFunctionSelectors(getCoreFacet().address)).to.have.members(CORE_SELECTORS);
            });
            it('facetFunctionSelectors(TestFacet1)', async () => {
                expect(await diamond.facetFunctionSelectors(testFacet1.address)).to.have.members([SEL.a, SEL.b]);
            });
            it('facetFunctionSelectors(TestFacet2)', async () => {
                expect(await diamond.facetFunctionSelectors(testFacet2.address)).to.have.members([SEL.setValue, SEL.getValue, SEL.deployedBlock]);
            });
            it('facetFunctionSelectors(Random)', async () => {
                expect(await diamond.facetFunctionSelectors(admin.address)).to.have.members([]);
            });

            it('facetAddresses', async () => {
                expect(await diamond.facetAddresses()).to.have.members([getCoreFacet().address, testFacet1.address, testFacet2.address]);
            });

            it('facetAddress(facets)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('facets'));
                expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
            });
            it('facetAddress(a)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('a'));
                expect(await diamond.facetAddress(sig)).to.equal(testFacet1.address);
            });
            it('facetAddress(deployedBlock)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('deployedBlock'));
                expect(await diamond.facetAddress(sig)).to.equal(testFacet2.address);
            });
            it('facetAddress(initialize)', async () => {
                const sig = Interface.getSighash(diamond.interface.getFunction('initialize'));
                expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
            });
            it('facetAddress(random)', async () => {
                expect(await diamond.facetAddress('0x12345678')).to.equal(ethers.constants.AddressZero);
            });
        });
    }, DiamondTestFacet__factory);

    describe('Diamond with DiamondCoreFacet - Add testFacet1, Replace with testFacet2', () => {
        function describeCombo(name: string, initialSelectors: string[], replacedSelectors: string[]) {
            const remainingSelectors = initialSelectors.filter(sel => !replacedSelectors.includes(sel));
            describeDiamond.step(name, diamond => {
                describeStep('perform initial cut', () => {
                    stepAddFacet(diamond, () => testFacet1, initialSelectors, 'initialize');

                    it('should call doNothing() just fine', async () => {
                        await diamond.doNothing();
                    });
                });

                describeStep('before replace', () => {
                    step('should have deployedBlock() from facet 1', async () => {
                        const bn = await testFacet1.deployedBlock();
                        expect(await diamond.deployedBlock()).to.equal(bn);
                    });

                    describe('IDiamondLoupe', () => {
                        it('facetAddress(deployedBlock)', async () => {
                            expect(await diamond.facetAddress(SEL.deployedBlock)).to.hexEqual(testFacet1.address);
                        });

                        it('facetFunctionSelectors(TestFacet1)', async () => {
                            expect(await diamond.facetFunctionSelectors(testFacet1.address)).to.have.members(initialSelectors);
                        });
                        it('facetFunctionSelectors(TestFacet2)', async () => {
                            expect(await diamond.facetFunctionSelectors(testFacet2.address)).to.have.members([]);
                        });

                        it('facets', async () => {
                            try {
                                expectFacetsToMatch(await diamond.facets(), [
                                    [getCoreFacet().address, CORE_SELECTORS],
                                    [testFacet1.address, initialSelectors],
                                ]);
                            } catch (e) {
                                console.error(e);
                                process.exit(1);
                            }
                        });
                    });
                });

                describeStep('perform replace', () => {
                    stepReplaceFacet(diamond, () => testFacet2, replacedSelectors);
                });

                describeStep('after replace', () => {
                    step('should have deployedBlock() from facet 2', async () => {
                        const bn = await testFacet2.deployedBlock();
                        expect(await diamond.deployedBlock()).to.equal(bn);
                    });

                    describe('IDiamondLoupe', () => {
                        it('facetAddress(deployedBlock)', async () => {
                            expect(await diamond.facetAddress(SEL.deployedBlock)).to.hexEqual(testFacet2.address);
                        });

                        it('facetFunctionSelectors(TestFacet1)', async () => {
                            expect(await diamond.facetFunctionSelectors(testFacet1.address)).to.have.members(remainingSelectors);
                        });
                        it('facetFunctionSelectors(TestFacet2)', async () => {
                            expect(await diamond.facetFunctionSelectors(testFacet2.address)).to.have.members(replacedSelectors);
                        });

                        it('facets', async () => {
                            expectFacetsToMatch(await diamond.facets(), [
                                [getCoreFacet().address, CORE_SELECTORS],
                                [testFacet1.address, remainingSelectors],
                                [testFacet2.address, replacedSelectors],
                            ]);
                        });
                    });
                });
            }, DiamondTestFacet__factory);
        }

        function describeStuff(name: string, index: number, preLength: number, replaced: string[]) {
            const value = [SEL.a, SEL.b, SEL.setValue, SEL.getValue, SEL.doNothing];
            for (let i = value.length; i < preLength; i++) value[i] = ethers.utils.hexZeroPad('0x' + i.toString(16), 4);
            value.splice(index, 0, ...replaced);
            describeCombo(name, value, replaced);
        }

        function describeReplaced(replaced: string[]) {
            function describeLength(length: number) {
                describeStuff('partial:mid', 1, length, replaced);
                describeStuff('partial:end', 7, length, replaced);
            }
            describeStep('length6', () => describeLength(6));
            describeStep('length7', () => describeLength(7));
        }

        describeStep('single', () => describeReplaced([SEL.deployedBlock]));
        describeStep('dual', () => describeReplaced([SEL.deployedBlock, SEL.storeBlockNumber]));
    });

    describeDiamond('Diamond with DiamondCoreFacet - Add testFacet1, remove testFacet1 partially', diamond => {
        const functionSelectors = [SEL.a, SEL.b, SEL.setValue, SEL.getValue, SEL.deployedBlock];
        const remainingSelectors = functionSelectors.filter(s => s !== SEL.b);

        describeStep('perform initial cut', () => {
            stepAddFacet(diamond, () => testFacet1, functionSelectors);
        });

        describeStep('before remove', () => {
            it('should have a(uint256)', async () => {
                await diamond.a(8);
                expect((await diamond.getValue(ethers.utils.keccak256(Buffer.from("a")))).toNumber(), 'getValue').to.equal(8);
            });

            it('should have b()', async () => {
                await diamond.setValue(ethers.utils.keccak256(Buffer.from("b")), 9);
                expect(await diamond.b(), 'b()').to.deep.equal([[9], [2, 3, 4]]);
            });

            describe('IDiamondLoupe', () => {
                it('facets', async () => {
                    expectFacetsToMatch(await diamond.facets(), [
                        [getCoreFacet().address, CORE_SELECTORS],
                        [testFacet1.address, functionSelectors],
                    ]);
                });

                it('facetFunctionSelectors(CoreFacet)', async () => {
                    expect(await diamond.facetFunctionSelectors(getCoreFacet().address)).to.have.members(CORE_SELECTORS);
                });
                it('facetFunctionSelectors(TestFacet1)', async () => {
                    expect(await diamond.facetFunctionSelectors(testFacet1.address)).to.have.members(functionSelectors);
                });
                it('facetFunctionSelectors(Random)', async () => {
                    expect(await diamond.facetFunctionSelectors(admin.address)).to.have.members([]);
                });

                it('facetAddresses', async () => {
                    expect(await diamond.facetAddresses()).to.have.members([getCoreFacet().address, testFacet1.address]);
                });

                it('facetAddress(facets)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('facets'));
                    expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
                });
                it('facetAddress(a)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('a'));
                    expect(await diamond.facetAddress(sig)).to.equal(testFacet1.address);
                });
                it('facetAddress(b)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('b'));
                    expect(await diamond.facetAddress(sig)).to.equal(testFacet1.address);
                });
                it('facetAddress(initialize)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('initialize'));
                    expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
                });
                it('facetAddress(random)', async () => {
                    expect(await diamond.facetAddress('0x12345678')).to.equal(ethers.constants.AddressZero);
                });
            });
        });

        describeStep('perform remove', () => {
            stepRemoveFacet(diamond, [SEL.b]);
        });

        describeStep('after remove', () => {
            it('should have a(uint256)', async () => {
                await diamond.a(8);
                expect((await diamond.getValue(ethers.utils.keccak256(Buffer.from("a")))).toNumber(), 'getValue').to.equal(8);
            });

            it('should not have b()', async () => {
                try { await diamond.b(); } catch (e) { return };
                expect.fail('static call did not revert');
            });

            describe('IDiamondLoupe', () => {
                it('facets', async () => {
                    expectFacetsToMatch(await diamond.facets(), [
                        [getCoreFacet().address, CORE_SELECTORS],
                        [testFacet1.address, remainingSelectors],
                    ]);
                });

                it('facetFunctionSelectors(CoreFacet)', async () => {
                    expect(await diamond.facetFunctionSelectors(getCoreFacet().address)).to.have.members(CORE_SELECTORS);
                });
                it('facetFunctionSelectors(TestFacet1)', async () => {
                    expect(await diamond.facetFunctionSelectors(testFacet1.address)).to.have.members(remainingSelectors);
                });
                it('facetFunctionSelectors(Random)', async () => {
                    expect(await diamond.facetFunctionSelectors(admin.address)).to.have.members([]);
                });

                it('facetAddresses', async () => {
                    expect(await diamond.facetAddresses()).to.have.members([getCoreFacet().address, testFacet1.address]);
                });

                it('facetAddress(facets)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('facets'));
                    expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
                });
                it('facetAddress(a)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('a'));
                    expect(await diamond.facetAddress(sig)).to.equal(testFacet1.address);
                });
                it('facetAddress(b)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('b'));
                    expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
                });
                it('facetAddress(initialize)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('initialize'));
                    expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
                });
                it('facetAddress(random)', async () => {
                    expect(await diamond.facetAddress('0x12345678')).to.equal(ethers.constants.AddressZero);
                });
            });
        });
    }, DiamondTestFacet__factory);

    describe('Diamond with DiamondCoreFacet - Add testFacet1, remove testFacet1', () => {
        function describeCase(name: string, functionSelectors: string[], removingSelectors: string[]) {
            describeDiamond(name, diamond => {
                const remainingSelectors = functionSelectors.filter(s => !removingSelectors.includes(s));

                describeStep('perform initial cut', () => {
                    stepAddFacet(diamond, () => testFacet1, functionSelectors);
                });

                describeStep('before remove', () => {
                    it('facets', async () => {
                        expectFacetsToMatch(await diamond.facets(), [
                            [getCoreFacet().address, CORE_SELECTORS],
                            [testFacet1.address, functionSelectors],
                        ], SEL);
                    });
                });

                describeStep('perform remove', () => {
                    stepRemoveFacet(diamond, removingSelectors);
                });

                describeStep('after remove', () => {
                    it('facets', async () => {
                        expectFacetsToMatch(await diamond.facets(), [
                            [getCoreFacet().address, CORE_SELECTORS],
                            [testFacet1.address, remainingSelectors],
                        ], SEL);
                    });
                });
            });
        }

        describeCase('same/same', [
            SEL.a, SEL.b, SEL.setValue, SEL.getValue, SEL.deployedBlock
        ], [SEL.deployedBlock]);

        describeCase('same/same + same/diff', [
            SEL.a, SEL.b, SEL.setValue, SEL.getValue, SEL.deployedBlock
        ], [SEL.deployedBlock, SEL.b]);

        describeCase('same/diff', [
            SEL.a, SEL.b, SEL.setValue, SEL.getValue, SEL.deployedBlock
        ], [SEL.b]);

        describeCase('same/diff + same/same', [
            SEL.a, SEL.b, SEL.setValue, SEL.getValue, SEL.deployedBlock
            // First remove should moved deployedBlock to b's location
        ], [SEL.b, SEL.deployedBlock]);

        describeCase('same/diff + same/dif', [
            // First remove should moved deployedBlock to b's location
            SEL.a, SEL.b, SEL.setValue, SEL.getValue, SEL.deployedBlock
        ], [SEL.b, SEL.getValue]);

        describeCase('diff', [
            SEL.a, SEL.b,
            ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => `0x0000000${i}`),
            SEL.setValue, SEL.getValue, SEL.deployedBlock
        ], [SEL.b]);

        describeCase('diff + diff', [
            // First remove should move deployedBlock to b's location
            SEL.a, SEL.b,
            ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => `0x0000000${i}`),
            SEL.setValue, SEL.getValue, SEL.deployedBlock
        ], [SEL.b, SEL.deployedBlock]);

        describeCase('diff + same/same', [
            // First remove should move deployedBlock to b's location
            SEL.a, SEL.b,
            ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => `0x0000000${i}`),
            SEL.setValue, SEL.getValue, SEL.deployedBlock
        ], [SEL.b, SEL.getValue]);

        describeCase('diff + same/diff', [
            // First remove should move deployedBlock to b's location
            SEL.a, SEL.b,
            ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => `0x0000000${i}`),
            SEL.setValue, SEL.getValue, SEL.deployedBlock
        ], [SEL.b, SEL.setValue]);
    });

    describeDiamond('Diamond with DiamondCoreFacet - Add testFacet1, remove testFacet1 completely', diamond => {
        const functionSelectors = [SEL.a, SEL.b, SEL.setValue, SEL.getValue, SEL.deployedBlock];
        for (let i = 1; i < 10; i++) functionSelectors.push(ethers.utils.hexZeroPad('0x' + i.toString(16), 4));

        let cutTransaction: ContractTransaction;

        describeStep('perform initial cut', () => {
            stepAddFacet(diamond, () => testFacet1, functionSelectors);
        });

        describeStep('before remove', () => {
            it('should have a(uint256)', async () => {
                await diamond.a(8);
                expect((await diamond.getValue(ethers.utils.keccak256(Buffer.from("a")))).toNumber(), 'getValue').to.equal(8);
            });

            it('should have b()', async () => {
                await diamond.setValue(ethers.utils.keccak256(Buffer.from("b")), 9);
                expect(await diamond.b(), 'b()').to.deep.equal([[9], [2, 3, 4]]);
            });

            describe('IDiamondLoupe', () => {
                it('facets', async () => {
                    expectFacetsToMatch(await diamond.facets(), [
                        [getCoreFacet().address, CORE_SELECTORS],
                        [testFacet1.address, functionSelectors],
                    ]);
                });

                it('facetFunctionSelectors(CoreFacet)', async () => {
                    expect(await diamond.facetFunctionSelectors(getCoreFacet().address)).to.have.members(CORE_SELECTORS);
                });
                it('facetFunctionSelectors(TestFacet1)', async () => {
                    expect(await diamond.facetFunctionSelectors(testFacet1.address)).to.have.members(functionSelectors);
                });
                it('facetFunctionSelectors(Random)', async () => {
                    expect(await diamond.facetFunctionSelectors(admin.address)).to.have.members([]);
                });

                it('facetAddresses', async () => {
                    expect(await diamond.facetAddresses()).to.have.members([getCoreFacet().address, testFacet1.address]);
                });

                it('facetAddress(facets)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('facets'));
                    expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
                });
                it('facetAddress(a)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('a'));
                    expect(await diamond.facetAddress(sig)).to.equal(testFacet1.address);
                });
                it('facetAddress(b)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('b'));
                    expect(await diamond.facetAddress(sig)).to.equal(testFacet1.address);
                });
                it('facetAddress(initialize)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('initialize'));
                    expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
                });
                it('facetAddress(random)', async () => {
                    expect(await diamond.facetAddress('0x12345678')).to.equal(ethers.constants.AddressZero);
                });
            });
        });

        describeStep('perform remove', () => {
            stepRemoveFacet(diamond, functionSelectors);
        });

        describeStep('after remove', () => {
            it('should not have a(uint256)', async () => {
                expect(diamond.a(8)).to.be.revertedWith('');
            });

            it('should not have b()', async () => {
                try { await diamond.b(); } catch (e) { return };
                expect.fail('static call did not revert');
            });

            describe('IDiamondLoupe', () => {
                it('facets', async () => {
                    expectFacetsToMatch(await diamond.facets(), [[getCoreFacet().address, CORE_SELECTORS]]);
                });

                it('facetFunctionSelectors(CoreFacet)', async () => {
                    expect(await diamond.facetFunctionSelectors(getCoreFacet().address)).to.have.members(CORE_SELECTORS);
                });
                it('facetFunctionSelectors(TestFacet1)', async () => {
                    expect(await diamond.facetFunctionSelectors(testFacet1.address)).to.have.members([]);
                });
                it('facetFunctionSelectors(Random)', async () => {
                    expect(await diamond.facetFunctionSelectors(admin.address)).to.have.members([]);
                });

                it('facetAddresses', async () => {
                    expect(await diamond.facetAddresses()).to.have.members([getCoreFacet().address]);
                });

                it('facetAddress(facets)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('facets'));
                    expect(await diamond.facetAddress(sig)).to.equal(getCoreFacet().address);
                });
                it('facetAddress(a)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('a'));
                    expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
                });
                it('facetAddress(b)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('b'));
                    expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
                });
                it('facetAddress(initialize)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('initialize'));
                    expect(await diamond.facetAddress(sig)).to.equal(ethers.constants.AddressZero);
                });
                it('facetAddress(random)', async () => {
                    expect(await diamond.facetAddress('0x12345678')).to.equal(ethers.constants.AddressZero);
                });
            });
        });
    }, DiamondTestFacet__factory);

    describeDiamond('Diamond with DiamondCoreFacet - Test testFacet1 modifiers', diamond => {

        const modifiersFunc = FunctionFragment.fromString('modifiers() external view returns (bytes24[])');
        const modsInterface = new Interface([modifiersFunc]);

        stepAddFacet(diamond, () => testFacet1, [
            SEL.doNothing, SEL.deployedBlock, SEL.modifiers,
            SEL.addModifier1, SEL.addModifier2,
            SEL.removeModifier1, SEL.removeModifier2,
        ], 'initialize');

        step('add modifier1', async () => await diamond.addModifier1());

        it('should list modifier1 as modifiers', async () => {
            const result = await admin.call(await diamond.populateTransaction.modifiers());
            const mods = modsInterface.decodeFunctionResult('modifiers', result);
            expect(mods).to.deep.equal([[testFacet1.address.toLowerCase() + 'f18b0da9']]);
        });

        it('should revert doNothing() due to modifier1', async () => {
            const cd = (await diamond.populateTransaction.doNothing()).data!;
            await expect(diamond.doNothing()).to.be.revertedWith('modifier1: ' + cd);
        });

        step('remove modifier1', async () => await diamond.removeModifier1());

        step('add modifier2', async () => await diamond.addModifier2());

        it('should list modifier2 as modifiers', async () => {
            const result = await admin.call(await diamond.populateTransaction.modifiers());
            const mods = modsInterface.decodeFunctionResult('modifiers', result);
            expect(mods).to.deep.equal([[testFacet1.address.toLowerCase() + '9b2b23e5']]);
        });

        it('should revert doNothing() due to modifier2', async () => {
            await expect(diamond.doNothing()).to.be.revertedWith('Cannot call doNothing()');
        });

        it('should still correctly handle deployedBlock() with modifier2', async () => {
            expect(await diamond.deployedBlock()).to.equal(await testFacet1.deployedBlock());
        });

        step('remove modifier2', async () => await diamond.removeModifier2());

        it('should list no modifiers', async () => {
            const result = await admin.call(await diamond.populateTransaction.modifiers());
            const mods = modsInterface.decodeFunctionResult('modifiers', result);
            expect(mods).to.deep.equal([[]]);
        });

        it('should allow doNothing() again', async () => {
            await expect(diamond.doNothing()).to.not.be.reverted;
        });
    }, DiamondTestFacet__factory);

    describe('send view transactions for gas reporter', () => {
        describeDiamond('Diamond with DiamondCoreFacet - Add testFacet1', diamond => {
            stepAddFacet(diamond, () => testFacet1, [SEL.b, SEL.getValue, SEL.deployedBlock, SEL.doNothing], 'initialize');

            describe('supportsInterface', () => {
                it('IERC165', async () => {
                    const hash = getInterfaceHash(IERC165__factory);
                    await admin.sendTransaction(await diamond.populateTransaction.supportsInterface(hash));
                });
                it('IDiamondCut', async () => {
                    const hash = getInterfaceHash(IDiamondCut__factory);
                    await admin.sendTransaction(await diamond.populateTransaction.supportsInterface(hash));
                });
                it('IDiamondLoupe', async () => {
                    const hash = getInterfaceHash(IDiamondLoupe__factory);
                    await admin.sendTransaction(await diamond.populateTransaction.supportsInterface(hash));
                });
                it('set by testFacet1.initialize', async () => {
                    await admin.sendTransaction(await diamond.populateTransaction.supportsInterface('0x11223344'));
                });
                it('random', async () => {
                    await admin.sendTransaction(await diamond.populateTransaction.supportsInterface('0x00000000'));
                    await admin.sendTransaction(await diamond.populateTransaction.supportsInterface('0x12345678'));
                    await admin.sendTransaction(await diamond.populateTransaction.supportsInterface('0xFFFFFFFF'));
                });
            });

            describe('IDiamondLoupe', () => {
                it('facets', async () => {
                    await admin.sendTransaction(await diamond.populateTransaction.facets());
                });

                it('facetFunctionSelectors(CoreFacet)', async () => {
                    await admin.sendTransaction(await diamond.populateTransaction.facetFunctionSelectors(getCoreFacet().address));
                });
                it('facetFunctionSelectors(TestFacet1)', async () => {
                    await admin.sendTransaction(await diamond.populateTransaction.facetFunctionSelectors(testFacet1.address));
                });
                it('facetFunctionSelectors(Random)', async () => {
                    await admin.sendTransaction(await diamond.populateTransaction.facetFunctionSelectors(admin.address));
                });

                it('facetAddresses', async () => {
                    await admin.sendTransaction(await diamond.populateTransaction.facetAddresses());
                });

                it('facetAddress(facets)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('facets'));
                    await admin.sendTransaction(await diamond.populateTransaction.facetAddress(sig));
                });
                it('facetAddress(a)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('a'));
                    await admin.sendTransaction(await diamond.populateTransaction.facetAddress(sig));
                });
                it('facetAddress(b)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('b'));
                    await admin.sendTransaction(await diamond.populateTransaction.facetAddress(sig));
                });
                it('facetAddress(initialize)', async () => {
                    const sig = Interface.getSighash(diamond.interface.getFunction('initialize'));
                    await admin.sendTransaction(await diamond.populateTransaction.facetAddress(sig));
                });
                it('facetAddress(random)', async () => {
                    await admin.sendTransaction(await diamond.populateTransaction.facetAddress('0x12345678'));
                });
            });

            describe('DiamondTestFacet', () => {
                it('getValue', async () => {
                    const trans = await testFacet1.populateTransaction.getValue(ethers.constants.HashZero);
                    await admin.sendTransaction({ ...trans, to: diamond.address });
                });
                it('b', async () => {
                    const trans = await testFacet1.populateTransaction.b();
                    await admin.sendTransaction({ ...trans, to: diamond.address });
                });
                it('doNothing', async () => {
                    const trans = await testFacet1.populateTransaction.doNothing();
                    await admin.sendTransaction({ ...trans, to: diamond.address });
                });
            });
        }, DiamondTestFacet__factory);
    });
});
