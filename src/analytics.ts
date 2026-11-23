import type { EventMap, EventName, TrackInfo } from './protocol';

/**
 * One analytics event. Names follow what the player does: `play`, `pause`, `ended`, `seek`,
 * `load`, quarter-milestone `progress`, and one final `listen`.
 */
export interface AnalyticsEvent {
  name: 'play' | 'pause' | 'ended' | 'seek' | 'load' | 'progress' | 'listen';
  /** Where the player is mounted: the `data-playfold` path, the `data-analytics` label, or a custom `target`. */
  target?: string;
  /** Position in seconds, where the event has one. */
  currentTime?: number;
  /** Duration in seconds, where the event has one. */
  duration?: number;
  /** Percent played, 0..100. Only on `progress` and `listen`. */
  percent?: number;
}

export type AnalyticsHandler = (event: AnalyticsEvent) => void;

/** The part of a `Player` the analytics hook uses. Any object with these members works. */
export interface AnalyticsPlayer {
  on<K extends EventName>(name: K, listener: (data: EventMap[K]) => void): () => void;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  load?(track: TrackInfo): Promise<void>;
}

export interface AnalyticsOptions {
  /** Called for every event. Handler errors are logged, never raised into the player. */
  handler: AnalyticsHandler;
  /** Report this player under this name. Default: the element's `data-analytics` or `data-playfold`. */
  target?: string;
  /**
   * Fire `progress` when playback crosses 25%, 50% and 75%, and `listen` at 100% or on `ended`.
   * Default `true`.
   */
  milestones?: boolean;
}

const QUARTERS = [25, 50, 75] as const;

/**
 * Turn a player's events into a flat stream of analytics events. It changes nothing about how the
 * player works and returns a stop function, so you can point any sink at it.
 *
 * ```ts
 * const stop = instrument(player, { handler: (e) => plausible.track(e.name, e) });
 * ```
 */
export function instrument(player: AnalyticsPlayer, options: AnalyticsOptions): () => void {
  if (!options || typeof options.handler !== 'function') {
    throw new TypeError('Playfold: instrument needs a handler function');
  }
  const milestones = options.milestones !== false;
  let duration = 0;
  let fired = new Set<number>();
  let listened = false;

  const target = (): string | undefined => {
    if (options.target !== undefined) return options.target;
    const el = (player as { iframe?: HTMLElement }).iframe;
    return el?.dataset?.analytics ?? el?.dataset?.playfold ?? undefined;
  };

  const report = (event: AnalyticsEvent): void => {
    try {
      options.handler(event);
    } catch (error) {
      console.error('[playfold] analytics handler error', error);
    }
  };

  const reset = (): void => {
    fired = new Set<number>();
    listened = false;
  };

  const stops = [
    player.on('play', (state) => report({ name: 'play', target: target(), currentTime: state.currentTime, duration: state.duration })),
    player.on('pause', (state) => report({ name: 'pause', target: target(), currentTime: state.currentTime, duration: state.duration })),
    player.on('ended', (state) => {
      report({ name: 'ended', target: target(), currentTime: state.currentTime, duration: state.duration });
      if (!listened) {
        listened = true;
        report({ name: 'listen', target: target(), currentTime: state.currentTime, duration: state.duration, percent: 100 });
      }
      reset();
    }),
    player.on('durationchange', ({ duration: next }) => {
      duration = next;
    }),
    player.on('timeupdate', ({ currentTime, duration: next }) => {
      if (Number.isFinite(next) && next > 0) duration = next;
      if (!milestones || !(duration > 0)) return;
      const percent = Math.min(100, Math.round((currentTime / duration) * 100));
      for (const mark of QUARTERS) {
        if (percent >= mark && !fired.has(mark)) {
          fired.add(mark);
          report({ name: 'progress', target: target(), currentTime, duration, percent: mark });
        }
      }
      if (percent >= 100 && !listened) {
        listened = true;
        report({ name: 'listen', target: target(), currentTime, duration, percent: 100 });
      }
    }),
    player.on('trackchange', () => reset()),
  ];

  const wrapSeek = player.seek.bind(player);
  player.seek = (seconds: number): Promise<void> => {
    report({ name: 'seek', target: target(), currentTime: seconds, duration });
    return wrapSeek(seconds);
  };
  const wrapLoad = player.load?.bind(player);
  if (wrapLoad) {
    player.load = (track: TrackInfo): Promise<void> => {
      report({ name: 'load', target: target() });
      reset();
      return wrapLoad(track);
    };
  }

  return () => {
    stops.forEach((stop) => stop());
    player.seek = wrapSeek;
    if (wrapLoad) player.load = wrapLoad;
    duration = 0;
    reset();
  };
}
