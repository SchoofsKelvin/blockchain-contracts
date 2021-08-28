import type { Contract } from '@ethersproject/contracts';
import { expect } from 'chai';
import * as hre from 'hardhat';
import { AsyncFunc, Context, Func, Suite, Test } from 'mocha';
import { formatEvent, StrictContract } from '../scripts/utils';

const LOG_EVENTS = (process.env.LOG_EVENTS || '').toLowerCase() === 'true';

let prevBlockNumber: number;
type LogEventsArray = [contract: StrictContract<Contract> | (() => StrictContract<Contract>), name?: string][];
export async function logEvents(title: string, contract: StrictContract<Contract>, name = 'Contract') {
    if (!LOG_EVENTS || !contract.address) return;
    const _logEventBN = (contract as any)._logEventBN;
    // console.log('-- logEvents', title, name, _logEventBN, 'VS', prevBlockNumber);
    // console.log('\tBN:', await hre.ethers.provider.getBlockNumber());
    const max = _logEventBN ? Math.max(_logEventBN, prevBlockNumber) : prevBlockNumber;
    (contract as any)._logEventBN = max;
    let events = await contract.queryFilter({}, max + 1);
    events = events.filter(e => e.blockNumber > max);
    if (!events.length) return;
    (contract as any)._logEventBN = events[events.length - 1].blockNumber;
    console.log(`====== ${name} events during: ${title} ======`);
    events.map(ev => {
        try { return formatEvent(ev, contract.interface.getEvent(ev.event || '')); } catch (e) {
            return formatEvent(ev);
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
logEvents.setup = (contract: StrictContract<Contract> | (() => StrictContract<Contract>), name?: string) => {
    if (!LOG_EVENTS) return;
    prevBlockNumber = hre.ethers.provider.blockNumber;
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
            suite.parent?.tests.push(new Test('--- skipping everything after failed step ---'));
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
