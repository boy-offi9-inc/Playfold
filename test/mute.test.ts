import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectHost, mediaAdapter } from '../src/host';
import { PROTOCOL_VERSION } from '../src/protocol';
import type { CommandMessage, EventMessage, ResponseMessage } from '../src/protocol';

type Posted = ResponseMessage | EventMessage;

/**
 * Drives `connectHost` in Node: a fake embedding window as `parent`, a stub
 * global `window`, and a media element stub good enough for `mediaAdapter`.
 */
function setup(adapterOverrides: Partial<Parameters<typeof connectHost>[0]> & object = {}) {
  const posted: Posted[] = [];
  const parent = { postMessage: (m: Posted) => posted.push(m) } as unknown as Window;
  const listeners: Array<(e: MessageEvent) => void> = [];
  vi.stubGlobal('window', {
    parent,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: () => undefined,
  });
  const el = {
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    ended: false,
    volume: 1,
    muted: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLMediaElement;

  const connection = connectHost(
    Object.keys(adapterOverrides).length ? { ...mediaAdapter(el), ...adapterOverrides } : mediaAdapter(el),
    { parent },
  );

  const send = (name: CommandMessage['name'], value?: number): ResponseMessage => {
    const command: CommandMessage = { playfold: PROTOCOL_VERSION, kind: 'command', id: '1', name, value };
    listeners.forEach((fn) => fn({ data: command, source: parent } as MessageEvent));
    const response = posted.find((m) => m.kind === 'response' && (m as ResponseMessage).id === '1') as ResponseMessage;
    posted.length = 0;
    return response;
  };

  return { connection, send, el, posted };
}

describe('setMuted over the wire', () => {
  beforeEach(() => vi.stubGlobal('window', { parent: { postMessage() {} }, addEventListener() {}, removeEventListener() {} }));

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mutes and unmutes a media element adapter', () => {
    const { send, el, connection } = setup();
    expect(send('setMuted', 1).ok).toBe(true);
    expect(el.muted).toBe(true);
    expect(send('setMuted', 0).ok).toBe(true);
    expect(el.muted).toBe(false);
    connection.destroy();
  });

  it('answers a clean error on a player without mute support', () => {
    const { send, connection } = setup({ setMuted: undefined });
    const response = send('setMuted', 1);
    expect(response.ok).toBe(false);
    expect(response.error).toContain('does not support mute');
    connection.destroy();
  });

  it('rejects a value that is neither 0 nor 1', () => {
    const { send, connection } = setup();
    expect(send('setMuted', 2).ok).toBe(false);
    expect(send('setMuted', undefined).ok).toBe(false);
    connection.destroy();
  });

  it('leaves the volume level alone while muting', () => {
    const { send, el, connection } = setup();
    send('setVolume', 0.4);
    send('setMuted', 1);
    expect(el.volume).toBe(0.4);
    expect(el.muted).toBe(true);
    connection.destroy();
  });
});
