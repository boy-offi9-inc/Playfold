import { connectHost } from './host';
import { mountPlayer, playerCss, readParams } from './ui';
import { mountPlaylist, follow } from './playlist';
import { playlistCss } from './playlist-css';
import { VERSION } from './version';

const api = { mountPlayer, readParams, playerCss, mountPlaylist, follow, playlistCss, connectHost, version: VERSION };

(globalThis as unknown as { PlayfoldUI: typeof api }).PlayfoldUI = api;
