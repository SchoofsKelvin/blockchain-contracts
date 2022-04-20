
import * as chokidar from 'chokidar';
import * as path from 'path';

export interface WatcherOptions {
    directory: string;
    extension: string;
    gracePeriod?: number;
}

export function startWatcher(options: WatcherOptions, callback: () => void): void {
    const watcher = chokidar.watch(path.join(options.directory, `**/*.${options.extension}`), {
        atomic: true,
        ignoreInitial: true,
        interval: 250,
    });
    let lastTime = 0;
    watcher.on('all', () => {
        const time = lastTime = Date.now();
        setTimeout(() => time === lastTime && callback(), options.gracePeriod || 550);
    });
}

export function onlyOneActive(callback: () => Promise<void> | void): () => void {
    let active = false;
    let queued = false;
    return async (): Promise<void> => {
        queued = true;
        if (active) return;
        active = true;
        while (queued) {
            queued = false;
            try {
                await callback();
            } catch (e) {
                console.error(e);
            }
        }
        active = false;
    };
}
