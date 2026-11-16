import { describe, expect, it } from 'vitest';
import { createQueue } from '../src/queue';
import type { QueuePlayer } from '../src/queue';
import type { EventName, PlayerState, TrackInfo } from '../src/protocol';

const tracks: TrackInfo[] = [
  { src: 'https://a.test/1.mp3', title: 'One' },
  { src: 'https://a.test/2.mp3', title: 'Two' },
  { src: 'https://a.test/3.mp3', title: 'Three' },
];

function fakePlayer() {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const state = { currentTime: 0, failNext: false };
  const loaded: TrackInfo[] = [];
  const seeks: number[] = [];
  const player: QueuePlayer = {
    async load(track) {
      if (state.failNext) {
        state.failNext = false;
        throw new Error('boom');
      }
      loaded.push(track);
    },
    async getState() {
      return { currentTime: state.currentTime, duration: 10, paused: false, ended: false, volume: 1, muted: false } as PlayerState;
    },
    async seek(seconds) {
      seeks.push(seconds);
    },
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(listener as (data: unknown) => void);
      return () => set.delete(listener as (data: unknown) => void);
    },
  };
  const emit = (name: EventName): void => listeners.get(name)?.forEach((fn) => fn(undefined));
  const count = (name: EventName): number => listeners.get(name)?.size ?? 0;
  return { player, state, loaded, seeks, emit, count };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('createQueue', () => {
  it('needs at least one track and a valid start', () => {
    const { player } = fakePlayer();
    expect(() => createQueue(player, [])).toThrow(/at least one/);
    expect(() => createQueue(player, tracks, { startIndex: 3 })).toThrow(/startIndex/);
    expect(() => createQueue(player, tracks, { startIndex: -1 })).toThrow(/startIndex/);
  });

  it('starts at the given index and loads nothing', () => {
    const { player, loaded } = fakePlayer();
    const queue = createQueue(player, tracks, { startIndex: 1 });
    expect(queue.index).toBe(1);
    expect(queue.current.title).toBe('Two');
    expect(loaded).toHaveLength(0);
  });

  it('next() loads the following track with autoplay on', async () => {
    const { player, loaded } = fakePlayer();
    const queue = createQueue(player, tracks);
    expect(await queue.next()).toBe(true);
    expect(queue.index).toBe(1);
    expect(loaded[0]).toEqual({ autoplay: true, src: 'https://a.test/2.mp3', title: 'Two' });
  });

  it('lets a track or the options turn autoplay off', async () => {
    const { player, loaded } = fakePlayer();
    const queue = createQueue(player, [tracks[0], { ...tracks[1], autoplay: false }, tracks[2]], { autoplay: true });
    await queue.next();
    expect(loaded[0].autoplay).toBe(false);
    const quiet = fakePlayer();
    await createQueue(quiet.player, tracks, { autoplay: false }).next();
    expect(quiet.loaded[0].autoplay).toBe(false);
  });

  it('next() at the end resolves false, or wraps when looping', async () => {
    const a = fakePlayer();
    const plain = createQueue(a.player, tracks, { startIndex: 2 });
    expect(await plain.next()).toBe(false);
    expect(plain.index).toBe(2);
    expect(a.loaded).toHaveLength(0);

    const b = fakePlayer();
    const looping = createQueue(b.player, tracks, { startIndex: 2, loop: true });
    expect(await looping.next()).toBe(true);
    expect(looping.index).toBe(0);
  });

  it('previous() goes back, restarts late in a track, and restarts the first track', async () => {
    const { player, state, loaded, seeks } = fakePlayer();
    const queue = createQueue(player, tracks, { startIndex: 2 });

    state.currentTime = 1;
    expect(await queue.previous()).toBe(true);
    expect(queue.index).toBe(1);
    expect(loaded).toHaveLength(1);

    state.currentTime = 40;
    await queue.previous();
    expect(queue.index).toBe(1);
    expect(seeks).toEqual([0]);

    state.currentTime = 1;
    await queue.previous();
    expect(queue.index).toBe(0);
    await queue.previous();
    expect(queue.index).toBe(0);
    expect(seeks).toEqual([0, 0]);
  });

  it('previous() wraps from the first track when looping', async () => {
    const { player } = fakePlayer();
    const queue = createQueue(player, tracks, { loop: true });
    await queue.previous();
    expect(queue.index).toBe(2);
  });

  it('jump() loads any track and rejects bad indexes', async () => {
    const { player } = fakePlayer();
    const queue = createQueue(player, tracks);
    await queue.jump(2);
    expect(queue.index).toBe(2);
    await expect(queue.jump(3)).rejects.toThrow(/outside the list/);
    await expect(queue.jump(-1)).rejects.toThrow(/outside the list/);
    await expect(queue.jump(1.5)).rejects.toThrow(/outside the list/);
    expect(queue.index).toBe(2);
  });

  it('keeps the old index when a load fails', async () => {
    const { player, state } = fakePlayer();
    const queue = createQueue(player, tracks);
    state.failNext = true;
    await expect(queue.next()).rejects.toThrow(/boom/);
    expect(queue.index).toBe(0);
    expect(await queue.next()).toBe(true);
    expect(queue.index).toBe(1);
  });

  it('moves on by itself when a track ends', async () => {
    const { player, emit } = fakePlayer();
    const queue = createQueue(player, tracks);
    emit('ended');
    await flush();
    expect(queue.index).toBe(1);
  });

  it('can be told not to move on by itself', async () => {
    const { player, emit, count } = fakePlayer();
    const queue = createQueue(player, tracks, { autoAdvance: false });
    expect(count('ended')).toBe(0);
    emit('ended');
    await flush();
    expect(queue.index).toBe(0);
  });

  it('answers next and previous from the lock screen', async () => {
    const { player, emit } = fakePlayer();
    const queue = createQueue(player, tracks);
    emit('nexttrack');
    await flush();
    expect(queue.index).toBe(1);
    emit('previoustrack');
    await flush();
    expect(queue.index).toBe(0);
  });

  it('reports a failed background move through the error event', async () => {
    const { player, state, emit } = fakePlayer();
    const queue = createQueue(player, tracks);
    const errors: string[] = [];
    queue.on('error', (error) => errors.push(error.message));
    state.failNext = true;
    emit('ended');
    await flush();
    expect(errors).toEqual(['boom']);
    expect(queue.index).toBe(0);
  });

  it('fires change after each successful load', async () => {
    const { player } = fakePlayer();
    const queue = createQueue(player, tracks);
    const seen: number[] = [];
    const stop = queue.on('change', (change) => seen.push(change.index));
    await queue.next();
    await queue.jump(2);
    stop();
    await queue.previous();
    expect(seen).toEqual([1, 2]);
  });

  it('runs moves one at a time, in order', async () => {
    const { player } = fakePlayer();
    const queue = createQueue(player, tracks);
    const seen: number[] = [];
    queue.on('change', (change) => seen.push(change.index));
    await Promise.all([queue.next(), queue.next()]);
    expect(queue.index).toBe(2);
    expect(seen).toEqual([1, 2]);
  });

  it('add() appends and does not touch the caller\'s array', async () => {
    const { player } = fakePlayer();
    const mine = [...tracks];
    const queue = createQueue(player, mine);
    queue.add({ src: 'https://a.test/4.mp3', title: 'Four' });
    expect(queue.items).toHaveLength(4);
    expect(mine).toHaveLength(3);
    await queue.jump(3);
    expect(queue.current.title).toBe('Four');
  });

  it('destroy() stops listening and refuses new moves', async () => {
    const { player, emit, count } = fakePlayer();
    const queue = createQueue(player, tracks);
    queue.destroy();
    expect(count('ended')).toBe(0);
    expect(count('nexttrack')).toBe(0);
    emit('ended');
    await flush();
    expect(queue.index).toBe(0);
    await expect(queue.next()).rejects.toThrow(/destroyed/);
  });
});
