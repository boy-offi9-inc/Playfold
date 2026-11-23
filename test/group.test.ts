import { describe, expect, it, vi } from 'vitest';
import { createGroup } from '../src/group';
import type { GroupPlayer } from '../src/group';

function fakePlayer(): GroupPlayer & { pause: ReturnType<typeof vi.fn>; setVolume: ReturnType<typeof vi.fn> } {
  return {
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    on: (() => () => undefined) as GroupPlayer['on'],
  };
}

function wiredPlayer(): GroupPlayer & {
  emitPlay(): void;
  emitPause(): void;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
} {
  const listeners = new Map<string, Set<() => void>>();
  return {
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      listeners.set(name, set);
      set.add(listener as () => void);
      return () => set.delete(listener as () => void);
    },
    emitPlay() {
      listeners.get('play')?.forEach((fn) => fn());
    },
    emitPause() {
      listeners.get('pause')?.forEach((fn) => fn());
    },
  };
}

describe('createGroup', () => {
  it('pauses the others when one starts, by default', () => {
    const a = wiredPlayer();
    const b = wiredPlayer();
    const group = createGroup([a, b]);
    a.emitPlay();
    expect(b.pause).toHaveBeenCalledOnce();
    expect(group.current).toBe(a);
    group.destroy();
  });

  it('lets players overlap with exclusive off', () => {
    const a = wiredPlayer();
    const b = wiredPlayer();
    const group = createGroup([a, b], { exclusive: false });
    a.emitPlay();
    expect(b.pause).not.toHaveBeenCalled();
    group.destroy();
  });

  it('fires current with null when that player pauses', () => {
    const a = wiredPlayer();
    const changes: unknown[] = [];
    const group = createGroup([a]);
    group.on('current', (c) => changes.push(c));
    a.emitPlay();
    a.emitPause();
    expect(changes).toEqual([a, null]);
    expect(group.current).toBeNull();
    group.destroy();
  });

  it('reports pausing failures through the error event', async () => {
    const a = wiredPlayer();
    const b = wiredPlayer();
    b.pause.mockRejectedValueOnce(new Error('boom'));
    const errors: Error[] = [];
    const group = createGroup([a, b]);
    group.on('error', (error) => errors.push(error));
    a.emitPlay();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('boom');
    group.destroy();
  });

  it('sets the volume of every player and of players added later', async () => {
    const a = fakePlayer();
    const b = fakePlayer();
    const c = fakePlayer();
    const group = createGroup([a, b], { volume: 0.4 });
    expect(a.setVolume).toHaveBeenCalledWith(0.4);
    group.add(c);
    expect(c.setVolume).toHaveBeenCalledWith(0.4);
    await group.setVolume(0.8);
    expect(a.setVolume).toHaveBeenLastCalledWith(0.8);
    expect(b.setVolume).toHaveBeenLastCalledWith(0.8);
    await expect(group.setVolume(2)).rejects.toThrow(/between 0 and 1/);
    group.destroy();
  });

  it('add, remove and pauseAll behave', () => {
    const a = wiredPlayer();
    const b = wiredPlayer();
    const group = createGroup([]);
    expect(group.players).toHaveLength(0);
    group.add(a);
    group.add(a);
    expect(group.players).toHaveLength(1);
    group.add(b);
    expect(group.players).toHaveLength(2);
    group.pauseAll();
    expect(a.pause).toHaveBeenCalledOnce();
    expect(b.pause).toHaveBeenCalledOnce();
    group.remove(b);
    expect(group.players).toEqual([a]);
    a.emitPlay();
    expect(b.pause).toHaveBeenCalledOnce();
    group.remove(a);
    expect(group.current).toBeNull();
    expect(() => group.add({} as GroupPlayer)).toThrow(/play\(\)/);
    group.destroy();
    expect(() => group.add(a)).toThrow(/destroyed/);
  });
});
