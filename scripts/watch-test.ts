
import * as hre from 'hardhat';
import * as path from 'path';
import { onlyOneActive, startWatcher } from './watcher';

const rootHooks = (hre.config.mocha.rootHooks ??= {});
const afterEach = typeof rootHooks.afterEach === 'function' ? [rootHooks.afterEach] : rootHooks.afterEach ?? [];
(rootHooks.afterEach = afterEach).push(function (this: Mocha.Context) {
    const { currentTest } = this;
    if (!currentTest?.isFailed() || !currentTest.err) return;
    console.log(`Test failed: ${currentTest.fullTitle()}`);
    let firstMatch: string | undefined;
    for (const stackEntry of currentTest.err.stack?.split('\n') ?? []) {
        const match = stackEntry.match(/\((.*?):(\d+):(\d+)\)$/);
        if (!match) continue;
        const [, loc, line, column] = match;
        if (!currentTest.file?.endsWith(loc)) {
            firstMatch ||= `at ${currentTest.file}:${line}:${column}`;
            continue;
        };
        console.log(`at ${currentTest.file}:${line}:${column}`);
        return;
    }
    console.log(`at ${firstMatch || 'unknown:1:1'}`);
});

function unloadDirectory(directory: string) {
    for (const id in require.cache) {
        if (!id.startsWith(directory)) continue;
        delete require.cache[id];
    }
}

console.log(`[WATCH] Listening for .ts changes in ${hre.config.typechain.outDir}`);
let grep = '';
const onlyOnce = onlyOneActive(async () => {
    console.log(`[WATCH] Running tests...`);
    await hre.run('test', { noCompile: true, grep });
    unloadDirectory(path.join(__dirname, '../test'));
    unloadDirectory(path.join(__dirname, '../typechain'));
    console.log(`[WATCH] Testing finished`);
});
let auto = true;
startWatcher({
    directory: hre.config.typechain.outDir,
    extension: 'ts',
    gracePeriod: 3e3,
}, () => { auto && onlyOnce() });
startWatcher({
    directory: hre.config.paths.tests,
    extension: 'ts',
}, () => { auto && onlyOnce() });

function handleCommand(cmd: string) {
    if (!cmd.trim()) return;
    if (cmd === '?') {
        console.log('[WATCH] ?      - Print this help');
        console.log('[WATCH] test   - Run tests or queue a rerun (if not yet queued)');
        console.log('[WATCH] grep   - Set the grep to filter tests on');
        console.log('[WATCH] on/off - Enable/disable auto-queueing tests on file changes');
    } else if (cmd === 'test') {
        onlyOnce();
    } else if (cmd.startsWith('grep')) {
        grep = cmd.substring(5).trim();
        if (grep) {
            console.log(`[WATCH] Grep pattern changed to ${grep}`);
        } else {
            console.log(`[WATCH] Grep pattern cleared`);
        }
    } else if (cmd === 'on') {
        auto = true;
        console.log('[WATCH] Auto-queueing tests enabled');
    } else if (cmd === 'off') {
        auto = false;
        console.log('[WATCH] Auto-queueing tests disabled');
    } else {
        console.log(`[WATCH] Unknown command: ${cmd}`);
        console.log('[WATCH] Type "?" for help');
    }
}
let line = '';
process.stdin.on('data', (data: string) => {
    data = data.toString().replace(/\r/g, '');
    if (data.includes('\n')) {
        const split = data.toString().split('\n');
        const last = data.endsWith('\n') ? split.pop()! : '';
        for (const segment of split) {
            line += segment;
            handleCommand(line);
            line = '';
        }
        line = last;
    } else {
        line += data;
    }
});
