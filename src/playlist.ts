import type { TrackInfo } from './protocol';

/** The part of a `PlayerUI` the playlist needs. Any object with these members works, which keeps it easy to test. */
export interface PlaylistPlayer {
  element: HTMLElement;
  load(track: TrackInfo): Promise<void>;
}

export interface PlaylistOptions {
  /** Index of the track to show first. Default `0`. The first track is NOT loaded at mount: `load` stays with the host page. */
  startIndex?: number;
  /** Show previous and next buttons above the list. Default `true`. */
  controls?: boolean;
  /** Let the host page's queue drive the highlight (see `follow`). Default `true`. */
  follow?: boolean;
  /** Extra class on the root, for scoping your own styles. */
  className?: string;
}

/** A row the playlist renders for each track. */
export interface PlaylistRow {
  button: HTMLButtonElement;
  index: number;
  track: TrackInfo;
}

/** Which row is playing: set by `follow`, or directly by you with `select`. */
export interface PlaylistActive {
  index: number;
  track: TrackInfo;
}

export interface Playlist {
  element: HTMLElement;
  /** The rows, in order. Rebuilt when `set` is called. */
  readonly rows: readonly PlaylistRow[];
  /** The highlighted row, or `undefined` before the first `select` or `follow` event. */
  readonly active: PlaylistActive | undefined;
  /** Replace the whole list. Active selection resets. */
  set(tracks: TrackInfo[]): void;
  /** Highlight a row without loading anything. Throws when the index is out of range. */
  select(index: number): void;
  /** The previous and next buttons, when `controls` is on. Wire them to your queue yourself. */
  previous?: HTMLButtonElement;
  next?: HTMLButtonElement;
  /** A row was activated (click, Enter, or Space). Fires after the highlight updates. */
  on(event: 'activate', listener: (row: PlaylistRow) => void): () => void;
  /** The highlighted row changed through `select` or `follow`. */
  on(event: 'change', listener: (active: PlaylistActive) => void): () => void;
  destroy(): void;
}

/**
 * Wire a playlist to a `createQueue` instance: rows activate on click, and the
 * queue's `change` events move the highlight.
 *
 * ```ts
 * const queue = createQueue(player, tracks);
 * const list = mountPlaylist(player.element, tracks);
 * list.on('activate', (row) => void queue.jump(row.index));
 * queue.on('change', (c) => list.select(c.index));
 * ```
 */
export function follow(playlist: Playlist, queue: { on(event: 'change', listener: (change: { index: number; track: TrackInfo }) => void): () => void }): () => void {
  const stop = queue.on('change', ({ index }) => playlist.select(index));
  return stop;
}

/**
 * A styled, keyboard-navigable tracklist under a `mountPlayer` card. It stores
 * nothing and loads nothing: `activate` tells you which row the person picked
 * and your code decides what happens (usually `queue.jump(index)`).
 */
export function mountPlaylist(target: HTMLElement | string, tracks: TrackInfo[], options: PlaylistOptions = {}): Playlist {
  if (!Array.isArray(tracks)) throw new TypeError('Playfold playlist: tracks must be an array');
  if (!Array.isArray(tracks) || tracks.length === 0) throw new RangeError('Playfold playlist: give at least one track');
  const start = options.startIndex ?? 0;
  if (!Number.isInteger(start) || start < 0 || start >= tracks.length) {
    throw new RangeError('Playfold playlist: startIndex is outside the list');
  }

  const container = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!container) throw new Error(`Playfold playlist: no element matches "${String(target)}"`);

  const ac = new AbortController();
  const { signal } = ac;
  const on = <T extends EventTarget>(node: T, name: string, handler: (event: Event) => void): void =>
    node.addEventListener(name, handler, { signal });

  const listeners = {
    activate: new Set<(row: PlaylistRow) => void>(),
    change: new Set<(active: PlaylistActive) => void>(),
  };

  const fire = <T>(set: Set<(value: T) => void>, value: T): void => {
    for (const listener of [...set]) {
      try {
        listener(value);
      } catch (error) {
        console.error('[playfold] playlist listener error', error);
      }
    }
  };

  const root = document.createElement('nav');
  root.className = `pf-plist${options.className ? ` ${options.className}` : ''}`;
  root.setAttribute('aria-label', 'Track list');

  let rows: PlaylistRow[] = [];
  let activeIndex = -1;

  const paintActive = (): void => {
    for (const row of rows) {
      if (row.index === activeIndex) row.button.setAttribute('aria-current', 'true');
      else row.button.removeAttribute('aria-current');
    }
  };

  const setActive = (index: number): PlaylistActive => {
    activeIndex = index;
    paintActive();
    const active = { index, track: tracks[index] };
    fire(listeners.change, active);
    return active;
  };

  const set = (next: TrackInfo[]): void => {
    if (!Array.isArray(next) || next.length === 0) throw new RangeError('Playfold playlist: give at least one track');
    tracks = next.map((t) => ({ ...t }));
    root.querySelector('ol')?.remove();
    const list = document.createElement('ol');
    list.className = 'pf-plist-items';
    rows = tracks.map((track, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      const label = document.createElement('span');
      label.className = 'pf-plist-title';
      label.textContent = track.title || track.src;
      const sub = track.subtitle ? document.createElement('small') : null;
      if (sub) {
        sub.className = 'pf-plist-sub';
        sub.textContent = track.subtitle ?? null;
      }
      button.append(label, ...(sub ? [sub] : []));
      on(button, 'click', () => {
        setActive(index);
        fire(listeners.activate, { button, index, track: tracks[index] });
      });
      const item = document.createElement('li');
      item.appendChild(button);
      list.appendChild(item);
      return { button, index, track: tracks[index] };
    });
    activeIndex = -1;
    root.appendChild(list);
  };

  set(tracks);

  // Jump to a row with the keyboard: ArrowUp and ArrowDown move, Home and End reach the ends.
  on(root, 'keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
    if (!step && key !== 'Home' && key !== 'End') return;
    event.preventDefault();
    const current = rows.findIndex((row) => row.button === document.activeElement);
    const from = current === -1 ? Math.max(activeIndex, 0) : current;
    const target = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, from + step));
    rows[target]?.button.focus();
  });

  let controls: HTMLElement | undefined;
  if (options.controls !== false) {
    controls = document.createElement('div');
    controls.className = 'pf-plist-controls';
    const make = (label: string, text: string): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pf-plist-skip';
      button.setAttribute('aria-label', label);
      button.textContent = text;
      return button;
    };
    const previous = make('Previous track', '\u23EE');
    const next = make('Next track', '\u23ED');
    on(previous, 'click', () => {
      const target = activeIndex > 0 ? activeIndex - 1 : rows.length - 1;
      setActive(target);
      fire(listeners.activate, rows[target]);
    });
    on(next, 'click', () => {
      const target = activeIndex < rows.length - 1 ? activeIndex + 1 : 0;
      setActive(target);
      fire(listeners.activate, rows[target]);
    });
    controls.append(previous, next);
    root.insertBefore(controls, root.firstElementChild);
  }

  container.appendChild(root);

  return {
    element: root,
    get rows() {
      return rows.slice();
    },
    get active() {
      return activeIndex === -1 ? undefined : { index: activeIndex, track: tracks[activeIndex] };
    },
    set,
    select(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= tracks.length) {
        throw new RangeError('Playfold playlist: index is outside the list');
      }
      setActive(index);
    },
    get previous() {
      return controls?.querySelectorAll<HTMLButtonElement>('.pf-plist-skip')[0];
    },
    get next() {
      return controls?.querySelectorAll<HTMLButtonElement>('.pf-plist-skip')[1];
    },
    on(event: 'activate' | 'change', listener: never): () => void {
      const set = listeners[event] as Set<unknown>;
      set.add(listener);
      return () => set.delete(listener);
    },
    destroy() {
      ac.abort();
      listeners.activate.clear();
      listeners.change.clear();
      root.remove();
    },
  };
}
