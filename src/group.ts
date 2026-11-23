import type { EventName, PlayerState } from './protocol';

/** The part of a `Player` the group uses. Any object with these members works, which keeps it easy to test. */
export interface GroupPlayer {
  play(): Promise<void>;
  pause(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  on(name: EventName, listener: (data: PlayerState) => void): () => void;
}

export interface GroupOptions {
  /**
   * Pause every other player when one starts. Default `true`. This is what most pages want: one
   * thing audible at a time. Set `false` to let players overlap.
   */
  exclusive?: boolean;
  /** Volume applied to every player, from 0 to 1. `setVolume` changes it later. */
  volume?: number;
}

export interface Group {
  /** A copy of the players, in the order they joined. */
  readonly players: readonly GroupPlayer[];
  /** The player that most recently started playing, or null when none is playing. */
  readonly current: GroupPlayer | null;
  /** Add a player. Applies the current group volume to it. */
  add(player: GroupPlayer): void;
  /** Remove a player and stop listening to it. */
  remove(player: GroupPlayer): void;
  /** Pause every player. */
  pauseAll(): void;
  /** Set the volume of every player, including ones added later. */
  setVolume(volume: number): Promise<void>;
  /**
   * `current` fires when the player that is playing changes. `error` fires when pausing another
   * player fails, so one broken embed cannot stop the rest.
   */
  on(event: 'current', listener: (current: GroupPlayer | null) => void): () => void;
  on(event: 'error', listener: (error: Error) => void): () => void;
  destroy(): void;
}

/**
 * Coordinate several embedded players on one page: pause the rest when one starts, pause or mute
 * everything at once, and know which player is playing. It stores nothing and draws nothing.
 */
export function createGroup(players: GroupPlayer[], options: GroupOptions = {}): Group {
  const list: GroupPlayer[] = [...players];
  const exclusive = options.exclusive !== false;
  let volume = options.volume ?? 1;
  let current: GroupPlayer | null = null;
  let destroyed = false;
  const listeners = {
    current: new Set<(current: GroupPlayer | null) => void>(),
    error: new Set<(error: Error) => void>(),
  };

  const fire = <T>(set: Set<(value: T) => void>, value: T): void => {
    for (const listener of [...set]) {
      try {
        listener(value);
      } catch (error) {
        console.error('[playfold] group listener error', error);
      }
    }
  };

  const stops = new Map<GroupPlayer, () => void>();

  const listen = (player: GroupPlayer): void => {
    if (stops.has(player)) return;
    const offPlay = player.on('play', () => {
      if (destroyed) return;
      if (current !== player) {
        current = player;
        fire(listeners.current, current);
      }
      if (!exclusive) return;
      for (const other of list) {
        if (other === player) continue;
        other.pause().catch((error: unknown) => {
          if (!destroyed) {
            fire(listeners.error, error instanceof Error ? error : new Error(String(error)));
          }
        });
      }
    });
    const offPause = player.on('pause', () => {
      if (destroyed || current !== player) return;
      current = null;
      fire(listeners.current, current);
    });
    stops.set(player, () => {
      offPlay();
      offPause();
    });
  };

  for (const player of list) {
    listen(player);
    void player.setVolume(volume).catch(() => undefined);
  }

  const stopAll = (): void => {
    for (const stop of stops.values()) stop();
    stops.clear();
  };

  return {
    get players() {
      return list.slice();
    },
    get current() {
      return current;
    },
    add(player: GroupPlayer) {
      if (destroyed) throw new Error('Playfold group: destroyed');
      if (!player || typeof player.play !== 'function') {
        throw new TypeError('Playfold group: player is missing a play() method');
      }
      if (list.includes(player)) return;
      list.push(player);
      listen(player);
      void player.setVolume(volume).catch(() => undefined);
    },
    remove(player: GroupPlayer) {
      const index = list.indexOf(player);
      if (index === -1) return;
      list.splice(index, 1);
      stops.get(player)?.();
      stops.delete(player);
      if (current === player) {
        current = null;
        fire(listeners.current, null);
      }
    },
    pauseAll() {
      for (const player of list) void player.pause().catch(() => undefined);
    },
    async setVolume(next: number) {
      if (!Number.isFinite(next) || next < 0 || next > 1) {
        throw new RangeError('Playfold group: volume must be between 0 and 1');
      }
      volume = next;
      await Promise.all(list.map((player) => player.setVolume(volume).catch(() => undefined)));
    },
    on(event: 'current' | 'error', listener: never): () => void {
      const set = listeners[event] as Set<unknown>;
      set.add(listener);
      return () => set.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopAll();
      list.length = 0;
      listeners.current.clear();
      listeners.error.clear();
    },
  };
}
