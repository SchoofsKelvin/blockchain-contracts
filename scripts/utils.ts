import type { Contract, ContractFactory, Event } from '@ethersproject/contracts';
import type { Provider } from '@ethersproject/providers';
import type { Signer } from 'ethers';
import * as ethers from 'ethers';

export interface Connectable<C extends Contract = Contract> { connect(address: string, _?: any): C }
const isConnectable = (obj: any): obj is Connectable => obj && 'connect' in obj;
export type ConvertableToInterface = ContractFactory | Contract | Connectable;
function getInterface(holder: ConvertableToInterface): ethers.utils.Interface {
    if (isConnectable(holder)) holder = holder.connect(ethers.constants.AddressZero);
    if (!(holder as Contract)?.interface) throw new Error('Not a ConvertableToInterface');
    return (holder as Contract).interface;
}
function isFragmentFunction(fragment: ethers.utils.Fragment): fragment is ethers.utils.FunctionFragment {
    return fragment.type === 'function';
}
export function getInterfaceHash(holder: ConvertableToInterface, ...extendedInterfaces: ConvertableToInterface[]): string {
    const inst = getInterface(holder);
    let inHolder = ('name' in holder && typeof holder.name === 'string') ? ` in ${holder.name}` : '';
    if (inHolder?.endsWith('__factory')) inHolder = inHolder.slice(0, -9);
    let funcs = inst.fragments.filter(isFragmentFunction);
    const removedFuncs: ethers.utils.FunctionFragment[] = [];
    for (const neg of extendedInterfaces) {
        const negInterface = getInterface(neg);
        for (const negFunc of negInterface.fragments.filter(isFragmentFunction)) {
            const func = funcs.find(f => f.format('sighash') === negFunc.format('sighash'));
            if (func) {
                funcs = funcs.filter(f => f !== func);
                removedFuncs.push(func);
                continue;
            }
            const removed = removedFuncs.find(f => f.format('sighash') === negFunc.format('sighash'));
            if (removed) continue;
            let from = ('name' in neg && typeof neg.name === 'string') ? ` from ${neg.name}` : '';
            if (from?.endsWith('__factory')) from = from.slice(0, -9);
            throw new Error(`Missing "${negFunc.format('minimal')}"${from}${inHolder}`);
        }
    }
    const hashedFuncs = funcs
        .map(f => f.format('sighash'))
        .map(ethers.utils.id)
        .map(h => parseInt(h.substring(0, 10)) >>> 0);
    const hash = hashedFuncs.reduce((a, b) => (a ^ b) >>> 0, 0 >>> 0).toString(16);
    /*const funcs_debug = inst.fragments
        .filter(f => f.type === 'function')
        .map(f => [f.format('minimal'), f.format('sighash')])
        .map(([n, h]) => [n, ethers.utils.id(h).substr(0, 10)]);
    console.log(funcs_debug);
    console.log(inst.fragments.filter(f => f.type === 'function').map(v => JSON.stringify(v, null, 4))[1]);
    console.log('=>', '0x' + '0'.repeat(8 - hash.length) + hash);*/
    return '0x' + '0'.repeat(8 - hash.length) + hash;
}

export type SignerMirage<C extends Contract> = (signer: ethers.Signer) => C;
export function createSignerMirrage<C extends Contract>(contract: C): SignerMirage<C> {
    const cache = new Map<ethers.Signer, C>();
    return signer => {
        let view = cache.get(signer);
        if (view) return view;
        view = contract.connect(signer) as C;
        cache.set(signer, view);
        return view;
    };
}

export function formatParamValue(value: any, type?: ethers.utils.ParamType | string): string {
    if (!type) return JSON.stringify(value);
    if (typeof type === 'string') return `${type}=${JSON.stringify(value)}`;
    if (type.baseType === 'array') {
        const strings = value.map((v: any) => formatParamValue(v, type.arrayChildren));
        return `[${strings.join(', ')}]`;
    } else if (type.baseType === 'tuple') {
        const strings = (value as any[]).map((v, i) => {
            const subType = type.components[i];
            const val = formatParamValue(v, subType);
            return subType.name ? `${subType.name}: ${val}` : val;
        });
        return `{${strings.join(', ')}`;
    } else if (type.baseType === 'address') {
        return value;
    }
    return JSON.stringify(value);
}

export function formatParam(value: any, type?: ethers.utils.ParamType | string): string {
    if (!type) return JSON.stringify(value);
    if (typeof type === 'string') return `${type}=${JSON.stringify(value)}`;
    return `${type.type}${type.indexed ? ' indexed' : ''} ${type.name}: ${formatParamValue(value, type)}`;
}

export function formatEvent(event: Event, fragment?: ethers.utils.EventFragment): string {
    const { args, event: name, decodeError } = event;
    if (decodeError) return `${name}(ERR: ${decodeError})`;
    if (!args) return `${name}()`;
    const keys = Object.keys(args).slice(args.length);
    const zipped = keys.map((k, i) => formatParam(args[i], fragment?.inputs[i] || k));
    return `${event.event}(${zipped.join(', ')}) [block#${event.blockNumber}|trans#${event.transactionIndex}]`;
}
