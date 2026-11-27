export const PROTOCOL_VERSION = 1;

export type CommandName = 'hello' | 'play' | 'pause' | 'seek' | 'setVolume' | 'setMuted' | 'getState' | 'load';
export type EventName =
  | 'ready'
  | 'play'
  | 'pause'
  | 'ended'
  | 'timeupdate'
  | 'durationchange'
  | 'volumechange'
  | 'trackchange'
  | 'nexttrack'
  | 'previoustrack'
  | 'error';

/** What `player.load()` sends: the next thing to play, and how to label it. */
export interface TrackInfo {
  /** Media file URL. The player page decides which origins it accepts. */
  src: string;
  title?: string;
  subtitle?: string;
  /** Small label above the title. Keeps its previous value when left out. */
  eyebrow?: string;
  /** Cover art for audio, poster frame for video. */
  poster?: string;
  /** Must match what the player was mounted with: audio cannot become video. */
  type?: 'audio' | 'video';
  /** Start playing once loaded. Browsers may still wait for a tap. */
  autoplay?: boolean;
}

export interface PlayerState {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
}

export interface EventMap {
  ready: PlayerState;
  play: PlayerState;
  pause: PlayerState;
  ended: PlayerState;
  timeupdate: { currentTime: number; duration: number };
  durationchange: { duration: number };
  volumechange: { volume: number; muted: boolean };
  /** The player page finished switching to a new track. */
  trackchange: TrackInfo;
  /** The person pressed next or previous on the lock screen or a headset. */
  nexttrack: undefined;
  previoustrack: undefined;
  error: { message: string };
}

export interface CommandMessage {
  playfold: typeof PROTOCOL_VERSION;
  kind: 'command';
  id: string;
  name: CommandName;
  value?: number;
  /** The track for `load`. Validate it with `parseTrack` before use. */
  payload?: unknown;
}

export interface ResponseMessage {
  playfold: typeof PROTOCOL_VERSION;
  kind: 'response';
  id: string;
  ok: boolean;
  data?: PlayerState;
  error?: string;
}

export interface EventMessage {
  playfold: typeof PROTOCOL_VERSION;
  kind: 'event';
  name: EventName;
  data?: unknown;
}

export type Message = CommandMessage | ResponseMessage | EventMessage;

const KINDS = ['command', 'response', 'event'];

export function isMessage(data: unknown): data is Message {
  if (typeof data !== 'object' || data === null) return false;
  const m = data as Record<string, unknown>;
  return m.playfold === PROTOCOL_VERSION && typeof m.kind === 'string' && KINDS.includes(m.kind);
}

const MAX_URL = 4096;
const MAX_TEXT = 500;

/**
 * Check a track that arrived over `postMessage`. It keeps only the known fields, so nothing else
 * from the other page is passed on.
 */
export function parseTrack(value: unknown): TrackInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('load expects a track object');
  }
  const input = value as Record<string, unknown>;

  const text = (name: string, max: number): string | undefined => {
    const v = input[name];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw new TypeError(`track.${name} must be a string`);
    if (v.length > max) throw new RangeError(`track.${name} is longer than ${max} characters`);
    return v;
  };

  const src = text('src', MAX_URL);
  if (!src) throw new TypeError('track.src is required');

  const track: TrackInfo = { src };
  const title = text('title', MAX_TEXT);
  const subtitle = text('subtitle', MAX_TEXT);
  const eyebrow = text('eyebrow', MAX_TEXT);
  const poster = text('poster', MAX_URL);
  if (title !== undefined) track.title = title;
  if (subtitle !== undefined) track.subtitle = subtitle;
  if (eyebrow !== undefined) track.eyebrow = eyebrow;
  if (poster) track.poster = poster;

  if (input.type !== undefined) {
    if (input.type !== 'audio' && input.type !== 'video') throw new TypeError('track.type must be "audio" or "video"');
    track.type = input.type;
  }
  if (input.autoplay !== undefined) {
    if (typeof input.autoplay !== 'boolean') throw new TypeError('track.autoplay must be true or false');
    track.autoplay = input.autoplay;
  }
  return track;
}
