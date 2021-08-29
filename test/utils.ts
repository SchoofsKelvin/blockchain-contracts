import type { Contract, ContractTransaction } from '@ethersproject/contracts';
import { expect } from 'chai';
import * as ethers from 'ethers';
import * as hre from 'hardhat';
import type { AsyncFunc, Context, Func, Suite } from 'mocha';
import { step } from 'mocha-steps';
import { Connectable, ContractTypeFromConnectables, createUseDiamond, formatEvent, getInterface, StrictContract } from '../scripts/utils';
import { DiamondCoreFacet, DiamondCoreFacet__factory, Diamond__factory, IDiamondCut, IDiamondCut__factory, IDiamondLoupe__factory, IERC165__factory } from '../typechain';

const LOG_EVENTS = (process.env.LOG_EVENTS || '').toLowerCase() === 'true';
if (LOG_EVENTS) console.log('Enabled logging events of registered contracts');

let prevBlockNumber: number;
type StrictContractGen<C extends Contract = Contract> = StrictContract<C> | (() => StrictContract<C>);
type LogEventsArray = [contract: StrictContractGen, name?: string][];
const knownEvents = new Map<string, ethers.utils.EventFragment>();
export async function logEvents(title: string, contract: StrictContract<Contract>, name = 'Contract') {
    if (!LOG_EVENTS || !contract.address) return;
    const _logEventBN = (contract as any)._logEventBN;
    // console.log('-- logEvents', title, name, _logEventBN, 'VS', prevBlockNumber);
    // console.log('\tBN:', await hre.ethers.provider.getBlockNumber());
    const max = _logEventBN ? Math.max(_logEventBN, prevBlockNumber) : prevBlockNumber;
    if (!(contract as any)._logEventBN) logEvents.registerEvents(contract);
    (contract as any)._logEventBN = max;
    let events = await contract.queryFilter({}, max + 1);
    events = events.filter(e => e.blockNumber > max);
    if (!events.length) return;
    (contract as any)._logEventBN = events[events.length - 1].blockNumber;
    console.log(`====== ${name} events during: ${title} ======`);
    events.map(ev => {
        try { return formatEvent(ev, contract.interface.getEvent(ev.event || '')); } catch (e) {
            return formatEvent(ev, knownEvents.get(ev.topics[0]));
        }
    }).forEach(e => console.log('\t- ' + e));
    // console.log('='.repeat(title.length + 30 + name.length));
    console.log();
}
logEvents.forSuite = async function (suite: Suite, title: string) {
    if (!LOG_EVENTS) return;
    const array = (suite as any)._logEventsArray as LogEventsArray;
    //console.log('logEvents.forSuite:', title, suite.title, array?.length);
    if (array) for (let [contract, name] of array) {
        if (typeof contract === 'function') {
            const contr = contract();
            if (contr) contract = contr; else continue;
        }
        await logEvents(title, contract, name);
    }
    if (suite.parent) await logEvents.forSuite(suite.parent, title);
}
logEvents.forContext = async function (context: Context, title?: string) {
    title ||= context.runnable().titlePath().slice(1).join(' > ');
    return logEvents.forSuite(context.runnable().parent!, title);
}
logEvents.registerEvents = (events: ethers.utils.EventFragment[] | Connectable) => {
    if (!Array.isArray(events)) events = Object.values(getInterface(events).events);
    events.forEach(e => knownEvents.set(ethers.utils.keccak256(Buffer.from(e.format('sighash'))), e));
};
logEvents.setup = (contract: StrictContractGen, name?: string) => {
    if (!LOG_EVENTS) return;
    // prevBlockNumber = hre.ethers.provider.blockNumber;
    before('logEvents:before:' + (name || '?'), function (this: Context) {
        const suite = this.runnable().parent!;
        (suite as any)._logEventsArray ||= [];
        ((suite as any)._logEventsArray as LogEventsArray).push([contract, name]);
        //console.log('logEvents:before:' + (name || '?'), suite.title, (suite as any)._logEventsArray.length);
    });
};
before('hre.ethers.provider.ready', async () => {
    await hre.ethers.provider.ready;
    prevBlockNumber = await hre.ethers.provider.getBlockNumber();
});
if (LOG_EVENTS) {
    beforeEach(async () => prevBlockNumber = await hre.ethers.provider.getBlockNumber());
    afterEach(async function (this: Context) {
        await logEvents.forContext(this, this.currentTest!.titlePath().slice(1).join(' > '));
    });
}

export function before(name: string | Func | AsyncFunc, fn?: Func | AsyncFunc) {
    const origFn: any = fn || name;
    async function wrapFn(this: Context) {
        await origFn.apply(this);
        await logEvents.forContext(this);
    }
    if (fn) fn = wrapFn; else name = wrapFn;
    (global as any).before(name, fn);
    fn ||= name as Func | AsyncFunc;
};

export const pushContract = (() => {
    const ethernal = (hre as any).ethernal;
    if (!ethernal) return () => Promise.resolve();
    (global as any).before('Setup ethernal environment', async () => ethernal.setLocalEnvironment());
    let replaceName: string | undefined;
    const eth = ethernal as any;
    const gFA: Function = eth.getFormattedArtifact;
    type ContractInput = Parameters<(typeof ethernal)['push']>[0];
    eth.getFormattedArtifact = async function (input: ContractInput) {
        const repName = replaceName;
        const result = await gFA.call(this, input);
        if (!result.artifact) throw new Error(`Arfifact not found for ${JSON.stringify(input)}`);
        if (repName) result.name = repName;
        return result;
    }
    return (input: ContractInput, wantedName: string) => {
        replaceName = wantedName;
        return ethernal.push(input);
    };
})();

function _describeStep(desc: (typeof describe)['skip'], name: string, func: (this: Suite) => void) {
    desc(name, function () {
        const suite = this;
        this.afterEach('describeStep:after', function () {
            if (!this.currentTest) return;
            if (!this.currentTest.isFailed()) return;
            let seen = false;
            suite.parent?.suites.forEach(s => {
                if (s === suite) return seen = true;
                if (!seen) return;
                s.pending = true;
                s.suites = [];
                s.tests = [];
            });
            suite.parent?.tests.forEach(t => t.pending = true);
        });
        func.apply(this);
    });
}
export function describeStep(name: string, func: (this: Suite) => void) {
    return _describeStep(describe, name, func);
}
describeStep.skip = _describeStep.bind(null, describe.skip);
describeStep.only = _describeStep.bind(null, describe.only);

export function expectFacetsToMatch(expected: [string, string[]][], actual: [string, string[]][]) {
    if (actual?.length !== expected?.length) return false;
    const expectedMap = new Map<string, string[]>();
    expected.forEach(([k, v]) => expectedMap.set(k, v));
    expect(actual.map(v => v[0]), 'addresses').to.have.members(expected.map(v => v[0]));
    for (const [k, v] of actual) {
        expect(v, `facet:${k}`).to.have.members(expectedMap.get(k)!);
    }
};

export function useDescribeDiamondWithCore<FS extends Connectable<any>[]>(signer: ethers.Signer | (() => ethers.Signer), extraFactories: FS) {
    const defaultFactories = [IERC165__factory, IDiamondCut__factory, IDiamondLoupe__factory] as const;
    defaultFactories.forEach(logEvents.registerEvents);
    extraFactories.forEach(logEvents.registerEvents);
    const [diamondProxy, setDiamond] = createUseDiamond(...defaultFactories, ...extraFactories);
    logEvents.setup(diamondProxy, 'Diamond');

    const getSigner = () => typeof signer === 'function' ? signer() : signer;

    let coreFacet: DiamondCoreFacet;
    before('useDescribeDiamondWithCore:DiamondCoreFacet', async () => {
        const factory = new DiamondCoreFacet__factory(getSigner());
        coreFacet = await factory.deploy();
        logEvents.setup(coreFacet, 'DiamondCoreFacet');
    });

    let diamondFactory: Diamond__factory;
    before('useDescribeDiamondWithCore:diamondFactory', () => {
        diamondFactory = new Diamond__factory(getSigner());
    });

    function describeDiamond<CS extends Connectable<any>[]>(name: string,
        cb: (this: Suite, dia: StrictContract<ContractTypeFromConnectables<[...CS, ...typeof defaultFactories, ...FS]>>) => void, ...contracts: CS) {
        describeDiamond.suite(name, function () {
            step('deploy diamond', async function () {
                const S = (name: string) => coreFacet.interface.getSighash(name);
                const diamond = await diamondFactory.deploy([{
                    facet: coreFacet.address,
                    initializer: S('initialize'),
                    selectors: [
                        S('supportsInterface'), S('diamondCut'), S('facets'),
                        S('facetFunctionSelectors'), S('facetAddresses'), S('facetAddress'),
                    ],
                }]);
                logEvents.setup(diamond, 'diamond for ' + name);
                logEvents(name, diamond, 'Diamond');
                setDiamond(diamond, getSigner(), ...contracts);
            });
            cb.call(this, diamondProxy as any);
        });
        describeDiamond.suite = describe;
    }
    describeDiamond.suite = describe as Mocha.PendingSuiteFunction;
    const w = (f: any): typeof describeDiamond => ((...a: any) => { const o = describeDiamond.suite; describeDiamond.suite = f; (describeDiamond as any)(...a); describeDiamond.suite = o; }) as any;
    describeDiamond.skip = w(describe.skip); describeDiamond.only = w(describe.only); describeDiamond.step = w(describeStep);
    return [describeDiamond, diamondProxy, setDiamond, () => coreFacet] as const;
}

function stepFacetAction(action: number, diamond: StrictContract<IDiamondCut>, facet: () => Contract, facetSelectors: string[] | (() => string[]), initialize?: string | [string, ...any[]]): () => ContractTransaction {
    let cutTransaction: ContractTransaction;
    const getFacet = () => typeof facet === 'function' ? facet() : facet;
    const getSelectors = () => typeof facetSelectors === 'function' ? facetSelectors() : facetSelectors;
    const getInitializeStuff = () => {
        try {
            const initializeAddr = initialize?.length ? getFacet().address : ethers.constants.AddressZero;
            const initializeData = initialize ? (getFacet().interface.encodeFunctionData as any)(
                ...(typeof initialize === 'string' ? [initialize] : [initialize[0], initialize.slice(1)])) : '0x';
            console.log('=>', initializeAddr, initializeData);
            return [initializeAddr, initializeData] as const;
        } catch (e) {
            console.error(e);
            const arr = typeof initialize === 'string' ? [initialize] : initialize;
            expect.fail(`Could not encode function data for [${arr?.map(v => JSON.stringify(v)).join(', ')}]`);
            throw e;
        }
    };
    step(`${['add', 'replace', 'remove'][action]} facet`, async () => {
        console.log('Adding facet to', diamond.address);
        const functionSelectors = getSelectors();
        if (!Array.isArray(functionSelectors)) expect.fail('No string array (generator) passed as facetSelectors');
        cutTransaction = await diamond.diamondCut([{
            action, functionSelectors,
            facetAddress: action === 2 ? ethers.constants.AddressZero : getFacet().address,
        }], ...getInitializeStuff());
    });

    it('should emit the correct diamondCut event', async () => {
        await expect(cutTransaction).to.emit(diamond, 'DiamondCut');
        const logs = (await cutTransaction.wait()).logs;
        const eventHash = diamond.interface.getEventTopic('DiamondCut');
        const dcLogs = logs.filter(log => log.topics[0] === eventHash);
        expect(dcLogs, '#dcLogs').to.have.lengthOf(1);
        const event = diamond.interface.parseLog(dcLogs[0]);
        expect(event.args, 'event.args').to.deep.equal([[
            [action === 2 ? ethers.constants.AddressZero : getFacet().address, action, getSelectors()],
        ], ...getInitializeStuff()]);
    });
    return () => cutTransaction;
}

export const stepAddFacet = stepFacetAction.bind(null, 0);
export const stepReplaceFacet = stepFacetAction.bind(null, 1);
export function stepRemoveFacet(diamond: StrictContract<IDiamondCut>, functionSelectors: string[] | (() => string[])): () => ContractTransaction
export function stepRemoveFacet(diamond: StrictContract<IDiamondCut>, facet: () => Contract, functionSelectors: string[] | (() => string[]), initialize?: string | [string, ...any[]]): () => ContractTransaction
export function stepRemoveFacet(diamond: StrictContract<IDiamondCut>, facetOrFunctionSelectors: string[] | (() => Contract | string[]), functionSelectors?: string[] | (() => string[]), initialize?: string | [string, ...any[]]): () => ContractTransaction {
    if (functionSelectors) return stepFacetAction(2, diamond, facetOrFunctionSelectors as () => Contract, functionSelectors, initialize);
    return stepFacetAction(2, diamond, undefined!, facetOrFunctionSelectors as () => string[]);
}
