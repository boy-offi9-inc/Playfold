import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrument } from '../src/analytics';
import type { AnalyticsEvent, AnalyticsPlayer } from '../src/analytics';
import type { EventName } from '../src/protocol';

type Listener = (data: unknown) => void;

function fakePlayer(): AnalyticsPlayer & { emit(name: EventName, data?: unknown): void } {
  const listeners = new Map<EventName, Set<Listener>>();
  return {
    play: async () => undefined,
    pause: async () => undefined,
    seek: async () => undefined,
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(listener as Listener);
      return () => set.delete(listener as Listener);
    },
    emit(name, data) {
      listeners.get(name)?.forEach((fn) => fn(data));
    },
  };
}

const timeupdate = (currentTime: number, duration: number): { currentTime: number; duration: number } => ({ currentTime, duration });

describe('instrument', () => {
  let events: AnalyticsEvent[];
  let handler: (event: AnalyticsEvent) => void;

  beforeEach(() => {
    events = [];
    handler = (event) => events.push(event);
  });

  it('reports play, pause and ended with state', () => {
    const player = fakePlayer();
    instrument(player, { handler, target: 'hero' });
    player.emit('play', { currentTime: 0, duration: 100, paused: false, ended: false, volume: 1, muted: false });
    player.emit('pause', { currentTime: 12, duration: 100, paused: true, ended: false, volume: 1, muted: false });
    player.emit('ended', { currentTime: 100, duration: 100, paused: true, ended: true, volume: 1, muted: false });
    expect(events.map((e) => e.name)).toEqual(['play', 'pause', 'ended', 'listen']);
    expect(events[1]).toMatchObject({ target: 'hero', currentTime: 12, duration: 100 });
    expect(events[3]).toMatchObject({ name: 'listen', percent: 100 });
  });

  it('fires quarter progress marks once each', () => {
    const player = fakePlayer();
    instrument(player, { handler, target: 'x' });
    player.emit('durationchange', { duration: 100 });
    player.emit('timeupdate', timeupdate(10, 100));
    player.emit('timeupdate', timeupdate(26, 100));
    player.emit('timeupdate', timeupdate(55, 100));
    player.emit('timeupdate', timeupdate(80, 100));
    player.emit('timeupdate', timeupdate(99, 100));
    expect(events.filter((e) => e.name === 'progress').map((e) => e.percent)).toEqual([25, 50, 75]);
    expect(events.filter((e) => e.name === 'listen')).toHaveLength(0);
    player.emit('timeupdate', timeupdate(100, 100));
    expect(events.at(-1)).toMatchObject({ name: 'listen', percent: 100 });
  });

  it('reports seek and load through the wrapped methods', async () => {
    const player = fakePlayer();
    player.load = async () => undefined;
    const stop = instrument(player, { handler, target: 'x' });
    await player.seek(30);
    await player.load({ src: 'https://a.test/b.mp3' });
    expect(events.map((e) => e.name)).toEqual(['seek', 'load']);
    expect(events[0]).toMatchObject({ currentTime: 30 });
    stop();
    await player.seek(9);
    expect(events.map((e) => e.name)).toEqual(['seek', 'load']);
  });

  it('resets milestones on trackchange and ends a listen once', () => {
    const player = fakePlayer();
    instrument(player, { handler, target: 'x' });
    player.emit('durationchange', { duration: 100 });
    player.emit('timeupdate', timeupdate(100, 100));
    player.emit('trackchange', { src: 'https://a.test/b.mp3' });
    player.emit('durationchange', { duration: 100 });
    player.emit('timeupdate', timeupdate(100, 100));
    player.emit('ended', { currentTime: 100, duration: 100, paused: true, ended: true, volume: 1, muted: false });
    const listens = events.filter((e) => e.name === 'listen');
    expect(listens).toHaveLength(2);
    expect(events.filter((e) => e.name === 'progress').map((e) => e.percent)).toEqual([25, 50, 75, 25, 50, 75]);
  });

  it('reads the target from data attributes on the iframe', () => {
    const player = fakePlayer();
    (player as unknown as { iframe: unknown }).iframe = {
      dataset: { analytics: 'promo-audio' },
    };
    instrument(player, { handler });
    player.emit('play', { currentTime: 0, duration: 10, paused: false, ended: false, volume: 1, muted: false });
    expect(events[0].target).toBe('promo-audio');
  });

  it('swallows handler errors', () => {
    const player = fakePlayer();
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    instrument(player, { handler: () => { throw new Error('sink down'); }, target: 'x' });
    player.emit('play', { currentTime: 0, duration: 10, paused: false, ended: false, volume: 1, muted: false });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('needs a handler', () => {
    const player = fakePlayer();
    expect(() => instrument(player, {} as never)).toThrow(/handler/);
  });

  it('reports every event of a full listen once, in order', () => {
    const player = fakePlayer();
    instrument(player, { handler, target: 'full' });
    player.emit('durationchange', { duration: 100 });
    player.emit('play', { currentTime: 0, duration: 100, paused: false, ended: false, volume: 1, muted: false });
    player.emit('timeupdate', timeupdate(30, 100));
    player.emit('timeupdate', timeupdate(60, 100));
    player.emit('timeupdate', timeupdate(90, 100));
    player.emit('ended', { currentTime: 100, duration: 100, paused: true, ended: true, volume: 1, muted: false });
    expect(events.map((e) => `${e.name}@${e.percent ?? ''}`)).toEqual([
      'play@',
      'progress@25',
      'progress@50',
      'progress@75',
      'ended@',
      'listen@100',
    ]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
