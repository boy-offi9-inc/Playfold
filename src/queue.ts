import type { EventMap, EventName, PlayerState, TrackInfo } from './protocol';

/** The part of a `Player` that the queue uses. Any object with these methods works, which keeps it easy to test. */
export interface QueuePlayer {
  load(track: TrackInfo): Promise<void>;
  getState(): Promise<PlayerState>;
  seek(seconds: number): Promise<void>;
  on<K extends EventName>(name: K, listener: (data: EventMap[K]) => void): () => void;
}

export interface QueueOptions {
  /** Index of the track the player page already shows. Default `0`. Nothing is loaded at the start. */
  startIndex?: number;
  /** Start playing each track the queue loads. Default `true`. A track's own `autoplay` wins. */
  autoplay?: boolean;
  /** Move on by itself when a track ends. Default `true`. */
  autoAdvance?: boolean;
  /** After the last track, go back to the first. Default `false`. */
  loop?: boolean;
}

export interface QueueChange {
  index: number;
  track: TrackInfo;
}

export interface Queue {
  /** A copy of the tracks, in order. */
  readonly items: readonly TrackInfo[];
  /** The track the player page is showing. */
  readonly index: number;
  readonly current: TrackInfo;
  /** Resolves `false` at the end of the list when `loop` is off. */
  next(): Promise<boolean>;
  /** Restarts the current track if more than 3 seconds in, or if it is the first. Otherwise goes back one. */
  previous(): Promise<boolean>;
  /** Load the track at `index`. Rejects if the index is out of range. */
  jump(index: number): Promise<boolean>;
  add(...tracks: TrackInfo[]): void;
  /** `change` fires after a track loads. `error` fires when a move nobody asked for directly fails. */
  on(event: 'change', listener: (change: QueueChange) => void): () => void;
  on(event: 'error', listener: (error: Error) => void): () => void;
  destroy(): void;
}

const RESTART_AFTER = 3;

/**
 * A small play queue on top of `player.load()`. It keeps a list and an index, moves on when a track
 * ends, and answers next and previous from the lock screen. It stores nothing and draws nothing.
 */
export function createQueue(player: QueuePlayer, tracks: TrackInfo[], options: QueueOptions = {}): Queue {
  if (!Array.isArray(tracks) || tracks.length === 0) throw new RangeError('Playfold queue: give at least one track');
  const items = tracks.map((t) => ({ ...t }));
  const start = options.startIndex ?? 0;
  if (!Number.isInteger(start) || start < 0 || start >= items.length) {
    throw new RangeError('Playfold queue: startIndex is outside the list');
  }

  let index = start;
  let destroyed = false;
  let chain: Promise<unknown> = Promise.resolve();
  const listeners = { change: new Set<(change: QueueChange) => void>(), error: new Set<(error: Error) => void>() };

  const fire = <T>(set: Set<(value: T) => void>, value: T): void => {
    for (const listener of [...set]) {
      try {
        listener(value);
      } catch (error) {
        console.error('[playfold] queue listener error', error);
      }
    }
  };

  // One move at a time, so an ending track and a button press cannot race each other.
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    if (destroyed) return Promise.reject(new Error('Playfold queue: destroyed'));
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };

  const load = async (target: number): Promise<boolean> => {
    const track = items[target];
    await player.load({ autoplay: options.autoplay ?? true, ...track });
    index = target;
    fire(listeners.change, { index, track });
    return true;
  };

  const next = (): Promise<boolean> =>
    enqueue(async () => {
      const target = index + 1;
      if (target < items.length) return load(target);
      return options.loop ? load(0) : false;
    });

  const previous = (): Promise<boolean> =>
    enqueue(async () => {
      const { currentTime } = await player.getState();
      if (currentTime > RESTART_AFTER || (index === 0 && !options.loop)) {
        await player.seek(0);
        return true;
      }
      return load(index === 0 ? items.length - 1 : index - 1);
    });

  const jump = (target: number): Promise<boolean> =>
    enqueue(async () => {
      if (!Number.isInteger(target) || target < 0 || target >= items.length) {
        throw new RangeError('Playfold queue: index is outside the list');
      }
      return load(target);
    });

  // Moves that nobody awaits report through the `error` event instead.
  const background = (move: () => Promise<boolean>): void => {
    move().catch((error: unknown) => {
      if (!destroyed) fire(listeners.error, error instanceof Error ? error : new Error(String(error)));
    });
  };

  const stops: Array<() => void> = [];
  if (options.autoAdvance !== false) stops.push(player.on('ended', () => background(next)));
  stops.push(player.on('nexttrack', () => background(next)));
  stops.push(player.on('previoustrack', () => background(previous)));

  return {
    get items() {
      return items.slice();
    },
    get index() {
      return index;
    },
    get current() {
      return items[index];
    },
    next,
    previous,
    jump,
    add(...more: TrackInfo[]) {
      for (const track of more) items.push({ ...track });
    },
    on(event: 'change' | 'error', listener: never): () => void {
      const set = listeners[event] as Set<unknown>;
      set.add(listener);
      return () => set.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stops.forEach((stop) => stop());
      listeners.change.clear();
      listeners.error.clear();
    },
  };
}
