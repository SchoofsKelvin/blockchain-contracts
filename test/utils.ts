import type { Contract } from '@ethersproject/contracts';
import * as hre from 'hardhat';
import type { AsyncFunc, Context, Func, Suite } from 'mocha';
import { formatEvent } from '../scripts/utils';

let prevBlockNumber: number;
type LogEventsArray = [contract: Contract | (() => Contract | undefined), name?: string][];
export async function logEvents(title: string, contract: Contract, name = 'Contract') {
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
    events.map(formatEvent).forEach(e => console.log('\t- ' + e));
    // console.log('='.repeat(title.length + 30 + name.length));
    console.log();
}
logEvents.forSuite = async function (suite: Suite, title: string) {
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
logEvents.setup = (contract: Contract | (() => Contract), name?: string) => {
    prevBlockNumber = hre.ethers.provider.blockNumber;
    before('logEvents:before:' + (name || '?'), function (this: Context) {
        const suite = this.runnable().parent!;
        (suite as any)._logEventsArray ||= [];
        ((suite as any)._logEventsArray as LogEventsArray).push([contract, name]);
        //console.log('logEvents:before:' + (name || '?'), suite.title, (suite as any)._logEventsArray.length);
    });
    beforeEach(async () => prevBlockNumber = await hre.ethers.provider.getBlockNumber());
    afterEach(async function (this: Context) {
        await logEvents.forContext(this, this.currentTest!.titlePath().slice(1).join(' > '));
    });
};
before('hre.ethers.provider.ready', async () => {
    await hre.ethers.provider.ready;
    prevBlockNumber = await hre.ethers.provider.getBlockNumber();
});

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
