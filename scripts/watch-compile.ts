
import * as hre from 'hardhat';
import { onlyOneActive, startWatcher } from './watcher';

console.log(`[WATCH] Listening for .sol changes in ${hre.config.paths.sources}`);
let force = true;
const onlyOnce = onlyOneActive(async () => {
    console.log(`[WATCH] Compiling solidity${force ? ' forcefully' : ''}...`);
    await hre.run('compile', { force });
    console.log(`[WATCH] Compiling finished`);
    force = false;
});
onlyOnce();
startWatcher({
    directory: hre.config.paths.sources,
    extension: 'sol',
}, onlyOnce);
