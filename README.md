<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-wordmark-dark.svg">
    <img src="assets/logo-wordmark-light.svg" alt="Playfold" width="360">
  </picture>
</h1>
<p align="center">
  <a href="https://www.npmjs.com/package/@boy-offi9-inc/playfold"><img src="https://img.shields.io/npm/v/%40boy-offi9-inc%2Fplayfold?style=for-the-badge&label=npm&color=f97316&labelColor=0b1020" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@boy-offi9-inc/playfold"><img src="https://img.shields.io/npm/dm/%40boy-offi9-inc%2Fplayfold?style=for-the-badge&label=downloads&color=f97316&labelColor=0b1020" alt="npm downloads per month"></a>
  <a href="https://github.com/boy-offi9-inc/Playfold/actions"><img src="https://img.shields.io/github/actions/workflow/status/boy-offi9-inc/Playfold/ci.yml?branch=main&style=for-the-badge&label=CI&labelColor=0b1020" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/boy-offi9-inc/Playfold?style=for-the-badge&color=f97316&labelColor=0b1020" alt="MIT License"></a>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-ready-3178C6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=0b1020" alt="TypeScript">
  <img src="https://img.shields.io/badge/dependencies-0-22c55e?style=for-the-badge&labelColor=0b1020" alt="Zero dependencies">
  <img src="https://img.shields.io/badge/modules-ESM%20%2B%20CJS-f97316?style=for-the-badge&labelColor=0b1020" alt="ESM and CJS">
  <img src="https://img.shields.io/badge/link%20previews-Open%20Graph%20%2B%20oEmbed-f97316?style=for-the-badge&labelColor=0b1020" alt="Open Graph and oEmbed link previews">
</p>
<p align="center">
  <strong>Tiny media embeds. Simple control.</strong><br>
  A framework-agnostic SDK for embedding a media player in an iframe and controlling it through a typed, promise-based API.
</p>

---

## What is playfold?

playfold connects a page that embeds a player with the player page itself. A thin client and host layer sits on top of an iframe and `postMessage`, so your site gets a simple API for media served from another page.

```
 Your site                               Player page (iframe)
┌─────────────────────┐                 ┌──────────────────────┐
│  playfold client    │  ── command ──▶ │  playfold host       │
│  player.play()      │  ◀─ response ── │  <audio> / <video>   │
│  player.on('ended') │  ◀── event ──── │  or a custom player  │
└─────────────────────┘   postMessage   └──────────────────────┘
```

You provide the player page and the media. playfold does not include a media backend, storage, transcoding or a hosted player.

## Features

- About 11 KB minified (about 4 KB gzipped) for the script-tag build, less when you import only what you use. No runtime dependencies
- Core client, host runtime, React wrapper and a script-tag build
- Works with `<audio>`, `<video>` or any custom player through an adapter
- Promise-based commands and typed events
- Switch tracks in the same iframe with `load()`, plus a small queue helper
- Origin-checked messaging over a small versioned protocol
- Unit tests and cross-origin browser tests

## Install

```bash
npm install @boy-offi9-inc/playfold
```

Or load the script-tag build (pin the version in production):

```html
<script src="https://cdn.jsdelivr.net/npm/@boy-offi9-inc/playfold@1.3.1/dist/playfold.global.js"></script>
```

The script exposes a global `Playfold` object (`createPlayer`, `configure`, `scan`, `createQueue`, `connectHost`, `version`) and mounts `[data-playfold]` elements on page load.

## Quick start

### HTML

```html
<div
  data-playfold="/embed/track/42"
  data-base-url="https://player.example.com"
  data-param-theme="dark"
>
  <a href="https://player.example.com/embed/track/42">Listen</a>
</div>

<script src="https://cdn.jsdelivr.net/npm/@boy-offi9-inc/playfold@1.3.1/dist/playfold.global.js"></script>
```

With JavaScript, the element's content is replaced by the player. Without it, the link stays as a fallback.

### JavaScript / TypeScript

```ts
import { configure, createPlayer } from '@boy-offi9-inc/playfold';

configure({ baseUrl: 'https://player.example.com', height: 152 });

const player = createPlayer('#player', {
  path: '/embed/track/42',
  params: { theme: 'dark' },
});

player.on('timeupdate', ({ currentTime, duration }) => {
  console.log(currentTime, duration);
});

await player.ready;
await player.play();
await player.seek(30);
```

### React

React 17 or newer is an optional peer dependency.

```tsx
import { PlayfoldPlayer } from '@boy-offi9-inc/playfold/react';

export function Player() {
  return (
    <PlayfoldPlayer
      baseUrl="https://player.example.com"
      path="/embed/track/42"
      onEnded={() => next()}
    />
  );
}
```

Pass a `ref` to call `play()`, `pause()`, `seek()`, `setVolume()`, `getState()` and `load()`. `onTrackChange` fires when the player page switches track. The component remounts when its options change.

## Player page (host)

Call `connectHost` on the page that is loaded inside the iframe.

```ts
import { connectHost } from '@boy-offi9-inc/playfold/host';

const connection = connectHost(document.querySelector('audio')!, {
  allowedOrigins: ['https://example.com'], // default: '*'
});

// later: connection.destroy();
```

For a media element, playfold announces `ready`, forwards `play`, `pause`, `ended`, `timeupdate` (throttled to 250 ms), `durationchange`, `volumechange` and `error`, and handles every command except `load`, which you switch on yourself (see [Playlists and queues](#playlists-and-queues)).

### Custom players

Anything that is not a media element can implement `HostAdapter`:

```ts
import { connectHost, type HostAdapter } from '@boy-offi9-inc/playfold/host';

const adapter: HostAdapter = {
  play: () => customPlayer.play(),
  pause: () => customPlayer.pause(),
  seek: (seconds) => customPlayer.seek(seconds),
  setVolume: (volume) => customPlayer.setVolume(volume),
  getState: () => customPlayer.getState(),
  subscribe: (emit) =>
    customPlayer.onChange((state) => emit(state.paused ? 'pause' : 'play', state)),
};

connectHost(adapter);
```

`subscribe` receives `emit(name, data)` and returns a function that stops listening.

## Client API

| Member | Description |
| --- | --- |
| `configure(defaults)` | Defaults shared by every player (`baseUrl`, `height`, `params`, and so on). |
| `createPlayer(target, options)` | Mount an iframe into an element or selector and return a `Player`. |
| `scan(root?, selector?)` | Mount every `[data-playfold]` element. Runs automatically in the script-tag build. |
| `player.ready` | Promise that resolves when the player page announces `ready`. |
| `player.play()` `pause()` `seek(seconds)` `setVolume(0..1)` `getState()` | Commands. Each resolves with the current `PlayerState` and rejects on timeout or invalid input. |
| `player.load(track)` | Switch the player page to another track without reloading the iframe. See [Playlists and queues](#playlists-and-queues). |
| `createQueue(player, tracks, options?)` | A small play queue on top of `load()`. |
| `player.on(event, fn)` | Subscribe and get back an unsubscribe function. `once` and `off` are also available. |
| `player.destroy()` | Remove the iframe and all listeners. |

### Events

| Event | Payload |
| --- | --- |
| `ready`, `play`, `pause`, `ended` | `PlayerState` |
| `timeupdate` | `{ currentTime, duration }` |
| `durationchange` | `{ duration }` |
| `volumechange` | `{ volume, muted }` |
| `trackchange` | `TrackInfo`, after the player page switched track |
| `nexttrack`, `previoustrack` | none: the person pressed next or previous on the lock screen or a headset |
| `error` | `{ message }`, also emitted if the page never announces `ready` |

`PlayerState` is `{ currentTime, duration, paused, ended, volume, muted }`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `baseUrl` | none | Origin of the player site. Required here or through `configure`. |
| `path` | none | Player page path. Must stay on the `baseUrl` origin. |
| `params` | `{}` | Query parameters added to the player URL. |
| `width` | `100%` | Number (px) or CSS size. |
| `height` | `152` | Number (px) or CSS size. Ignored when `aspectRatio` is set. |
| `maxWidth` | none | Number (px) or CSS size. |
| `aspectRatio` | none | For video, for example `16 / 9`. |
| `title` | `Embedded player` | Accessible iframe title. |
| `allow` | `autoplay; encrypted-media; picture-in-picture` | iframe `allow` attribute. |
| `allowFullscreen` | `true` | Allow fullscreen. |
| `lazy` | `true` | Native lazy loading. |
| `timeout` | `5000` | Milliseconds before a command is rejected. |
| `readyTimeout` | `15000` | Milliseconds to wait for `ready` after the iframe loads. |

For declarative use, options map to `data-base-url`, `data-width`, `data-height`, `data-max-width`, `data-aspect-ratio`, `data-title` and `data-param-*`.

## Protocol

playfold speaks a small versioned `postMessage` protocol, so any page that implements it can be controlled, with or without this SDK.

```jsonc
// client → player page
{ "playfold": 1, "kind": "command", "id": "42", "name": "seek", "value": 30 }

// player page → client
{ "playfold": 1, "kind": "response", "id": "42", "ok": true,
  "data": { "currentTime": 30, "duration": 180, "paused": false, "ended": false, "volume": 1, "muted": false } }

// player page → client
{ "playfold": 1, "kind": "event", "name": "timeupdate", "data": { "currentTime": 30, "duration": 180 } }
```

Commands: `hello`, `play`, `pause`, `seek`, `setVolume`, `getState`, `load`. `load` carries a track in a `payload` field:

```jsonc
{ "playfold": 1, "kind": "command", "id": "43", "name": "load",
  "payload": { "src": "https://media.example.com/b.mp3", "title": "Next song", "autoplay": true } }
```

A page that does not support `load` answers with `"ok": false`, so adding it did not need a new protocol version. Events: `ready`, `play`, `pause`, `ended`, `timeupdate`, `durationchange`, `volumechange`, `trackchange`, `nexttrack`, `previoustrack`, `error`. The client sends `hello` when the iframe loads and the page replies with a `ready` event. Failed responses carry `"ok": false` and an `"error"` string.

## Security

The client:

- accepts messages only from its own iframe, and only from the player origin
- requires an `http` or `https` `baseUrl`
- rejects any `path` that resolves outside the `baseUrl` origin

The host:

- can restrict who may control it with `allowedOrigins`
- validates commands: `seek` must be a non-negative number, and volume is clamped to `0..1`
- ignores `load` unless the player page passes a `load` handler, and keeps only the known fields of a track, with length limits
- leaves the choice of allowed media sources to that handler. The default player UI requires `allowedSrcOrigins` before it will turn `load` on

Your player page must be embeddable. Do not send `X-Frame-Options: DENY`. To choose who may embed it, use a CSP header such as:

```
Content-Security-Policy: frame-ancestors https://example.com
```

`allowedOrigins` limits who can control the player, and `frame-ancestors` limits who can embed it. Use both when you need both.

## Link previews

When someone pastes your link into WhatsApp, Telegram, Discord, Slack or X, the platform's **server** fetches the URL and reads the `<meta>` tags in the raw HTML. It never runs JavaScript, so a client-rendered page shows a blank card. `@boy-offi9-inc/playfold/meta` generates the tags, an oEmbed response and a request handler. It runs on the server and has no dependencies.

```ts
import express from 'express';
import { createMetaHandler } from '@boy-offi9-inc/playfold/meta';

const app = express();

app.use(
  createMetaHandler({
    origin: 'https://music.example.com',
    siteName: 'Example Music',
    crawlersOnly: true, // browsers fall through to your app
    resolve: async (url) => {
      const track = await db.tracks.findBySlug(url.pathname.split('/').pop()!);
      if (!track) return null;
      return {
        title: track.title,
        url: url.href,
        description: `${track.artist} on Example Music`,
        image: { url: track.coverUrl, width: 600, height: 600 },
        audio: track.mp3Url, // direct file: best chance of native inline playback
        playerUrl: `https://music.example.com/embed/${track.id}`, // your Playfold player page
        author: track.artist,
        duration: track.seconds,
      };
    },
  }),
);
```

The handler serves the tags to crawlers, serves oEmbed JSON at `/oembed` (with the discovery `<link>` added for you), and calls `next()` for browsers and unknown pages. It also works with Node's `http` module. For other frameworks, use `getMetaTags(track)`, `renderMetaTags(track)`, `renderMetaPage(track)` and `buildOEmbed(track)` directly.

### Caching resolves

Link-preview crawlers arrive in bursts and ask for the same page again and again, and each request runs your `resolve` twice (page and oEmbed). `cachedResolve` wraps it: same URL, one lookup for the TTL. Missing pages are cached too, so a dead link costs one database hit instead of one per crawler; a lookup that throws is not cached, so a temporary failure retries.

```ts
import { cachedResolve, createMetaHandler } from '@boy-offi9-inc/playfold/meta';

app.use(
  createMetaHandler({
    origin: 'https://music.example.com',
    siteName: 'Example Music',
    resolve: cachedResolve({ resolve: lookup, ttlSeconds: 600, maxEntries: 1000 }),
  }),
);
```

Options: `ttlSeconds` (default `300`), `maxEntries` (default `500`, oldest evicted first). It is a pure Node function with no timers and no DOM, so it works in serverless runtimes.

### What to expect from platforms

Tags only *offer* a player. Each platform decides whether to show it, and for iframe players it generally limits that to providers it has integrated. A new site with perfect tags usually gets a rich card, not an inline player.

- A **direct audio or video file** (`audio` / `video`) has the best chance of playing inline on platforms that support it.
- An **iframe player** (`playerUrl`) is offered through `og:video` (`text/html`) and `twitter:player`. It works where the platform allows it.
- **WhatsApp** shows a static card. Keep the image small, ideally under about 300 KB.

Behavior changes over time, so test each platform with a real link.

### Check a link

```bash
npx playfold-check https://music.example.com/track/42
```

The checker fetches the page as the Telegram, WhatsApp, Discord, X, Facebook and Slack crawlers do, then reports missing or relative tags, non-https media, oversized images, servers without range requests, and player pages that block framing. It exits with code 1 when it finds an error, so you can use it in CI. In code: `import { checkUrl } from '@boy-offi9-inc/playfold/check'`.

It also checks each crawler on its own. A crawler that is refused (HTTP 401, 403 or 404) is an error, because that platform will show no preview at all. A rate limit (429), a server error (5xx) or a request that fails outright is a warning, since it may pass on its own. Sites that block one platform's crawler are common, so this is worth a look even when your tags are perfect.

### Retrying rate-limited crawlers

`checkUrl` takes your own `fetch`, so you can add retries without Playfold depending on anything. This example uses [reqkit](https://github.com/boy-offi9-inc/reqkit), which waits as long as the server's `Retry-After` header asks:

```js
import { checkUrl } from '@boy-offi9-inc/playfold/check';
import { retryAfterAware, withTimeout } from '@boy-offi9-inc/reqkit';

const politeFetch = (url, init = {}) => {
  // checkUrl passes a one-shot timeout signal. Drop it so every retry gets a fresh one.
  const { signal, ...rest } = init;
  return retryAfterAware(
    () => withTimeout((s) => fetch(url, { ...rest, signal: s }), 10_000),
    { retries: 2 },
  );
};

const report = await checkUrl('https://music.example.com/track/42', { fetch: politeFetch });
```

Any retry helper works the same way. The command-line `playfold-check` does not retry.

## Default player UI

You can build your own player page, or use the optional one. `@boy-offi9-inc/playfold/ui` builds an accessible audio or video card inside the page you embed, and connects it to the host for you, so the Playfold client controls it with no extra code.

```ts
import { mountPlayer } from '@boy-offi9-inc/playfold/ui';

mountPlayer('#app', {
  src: 'https://cdn.example.com/track.mp3',
  title: 'Night Drive',
  subtitle: 'Artist',
  eyebrow: 'Example Music', // small label above the title
  poster: 'https://cdn.example.com/cover.jpg',
  accent: '#f97316',
  theme: 'dark', // 'dark' | 'light' | 'auto'
});
```

For a page without a bundler, load the script and call `PlayfoldUI.mountPlayer(...)`:

```html
<script src="https://cdn.jsdelivr.net/npm/@boy-offi9-inc/playfold@1.3.1/dist/playfold-ui.global.js"></script>
```

 `examples/player.html` is a complete player page that reads `?src=&title=&theme=` from its URL. It only accepts media from its own origin until you add your media host to `MEDIA_ORIGINS`.

What you get: a play/pause button, a seek bar with elapsed and total time, mute, and full screen for video. The controls are real buttons and a range input, so keyboard and screen readers work. Arrow keys skip 5 seconds, Home and End jump to the ends, and lock-screen controls use the Media Session API where the browser supports it. Titles and other text are inserted as text, never as HTML.

**Colors.** Pass `accent` for a quick brand color, or `colors` for more control:

```ts
mountPlayer('#app', {
  src,
  colors: { accent: '#16a34a', background: '#052e16', text: '#ecfdf5', muted: '#86efac' },
});
```

You only need to give the colors you care about. The play-button icon, the small label and the seek bar are worked out from `accent` so they stay readable: a very dark accent gets a white icon and a lightened label, a bright one gets a dark icon. Pass `onAccent`, `accentText` or `accentUi` only to pin an exact value. Values that are not valid CSS colors are ignored. On a hosted player page, `?accent=16a34a&bg=052e16&fg=ecfdf5` does the same (the `#` is optional).

`background` and `text` are a pair: if you set a light `background`, set a dark `text` too, or use `theme: 'light'`.

You can also set `--pf-bg`, `--pf-fg`, `--pf-muted`, `--pf-track`, `--pf-radius`, `--pf-font` and `--pf-max-h` (the tallest a video may be, default `70vh`) on `.pf-root` from your own stylesheet. All text can be translated with the `labels` option.

**Video.** The video box follows the real picture, so a portrait clip is shown tall instead of with black bars, up to `--pf-max-h`. When the player sits in an iframe, make the iframe tall enough for a portrait video plus the controls. The controls are built to ignore global `button` and `input` styles on the page.

**Full screen.** The full-screen button uses the browser's own full screen when it has one. In in-app browsers and WebViews that have none, or when the browser refuses (for example an iframe without the `allowfullscreen` attribute), the player fills the page instead. The button or Escape exits, and page scrolling is restored. Inside an iframe, that fallback can only fill the iframe, so give the iframe enough room or add `allowfullscreen`.

**Switching tracks.** Pass `allowLoad: true` (with `allowedSrcOrigins`) to let the embedding page call `player.load()`. The returned handle also has `load(track)` for your own code. See [Playlists and queues](#playlists-and-queues).

**Security.**
- If you read `src` or `poster` from the URL, set `allowedSrcOrigins`. Otherwise anyone can use your player page to play any file.
- Only `http(s)` URLs are accepted.
- The UI injects one `<style>`. On a page with a strict Content Security Policy, pass `nonce`, or ship the exported `playerCss` as a normal stylesheet.

The host connects automatically when the page is inside an iframe. Pass `host: false` to skip it, or `host: { allowedOrigins: [...] }` to restrict which sites may control the player.

## Playlists and queues

`player.load()` switches the player page to another track without reloading the iframe. That matters on phones: the browser lets a player start by itself only after the person has tapped play inside it. A new iframe loses that permission, but the same iframe keeps it, so the next song can start on its own.

**On the player page**, opt in. With the default UI:

```ts
import { mountPlayer } from '@boy-offi9-inc/playfold/ui';

mountPlayer('#app', {
  src: 'https://media.example.com/first.mp3',
  allowLoad: true,
  allowedSrcOrigins: ['https://media.example.com'], // required with allowLoad
});
```

With your own player, pass a handler. It receives a checked track and decides which sources it accepts:

```ts
connectHost(audio, {
  load: (track) => {
    if (new URL(track.src, location.href).origin !== 'https://media.example.com') {
      throw new Error('source not allowed');
    }
    audio.src = track.src;
    if (track.autoplay) void audio.play();
  },
});
```

**On the embedding page:**

```ts
await player.load({
  src: 'https://media.example.com/second.mp3',
  title: 'Second song',
  subtitle: 'Artist',
  poster: 'https://media.example.com/second.jpg',
  autoplay: true,
});
```

`load` resolves when the new track's metadata is ready, and rejects if the player page refuses it or the file cannot be played. `eyebrow` keeps its old value unless you pass a new one. Audio stays audio and video stays video: loading the other kind is refused, so mount a new player for that. The player page fires `trackchange` when it finishes.

### Queue

```ts
import { createQueue } from '@boy-offi9-inc/playfold';

const queue = createQueue(player, tracks, { loop: false });

queue.on('change', ({ index, track }) => highlight(index));
queue.on('error', (error) => console.warn(error));

await queue.next();
await queue.previous();
await queue.jump(3);
```

| Member | Description |
| --- | --- |
| `next()` | Load the next track. Resolves `false` at the end of the list unless `loop` is on. |
| `previous()` | Restart the current track if it is more than 3 seconds in or the first one, otherwise go back one. |
| `jump(index)` | Load the track at `index`. Rejects if it is out of range. |
| `add(...tracks)` | Append tracks. |
| `items`, `index`, `current` | The list (a copy), the position, and the current track. |
| `on('change' \| 'error', fn)` | `change` fires after a track loads. `error` fires when a move nobody asked for directly fails, such as auto-advance. |
| `destroy()` | Stop listening. |

Options: `startIndex` (default `0`), `autoplay` (default `true`), `autoAdvance` (default `true`) and `loop` (default `false`). The queue assumes the player page already shows `tracks[startIndex]` and loads nothing when it is created. With `allowLoad`, the default UI also shows next and previous on the lock screen, and the queue answers them. The queue stores nothing and draws nothing: the list, shuffle and any screens are yours.

`examples/queue.html` is a complete working page with a track list, previous and next, and an event log. Host it over http and open it.

## Coordinating several players

When a page embeds more than one player, `createGroup` pauses the rest when one starts, so two embeds never talk over each other. It also knows which player is playing and can pause or set the volume of every player at once.

```ts
import { createGroup } from '@boy-offi9-inc/playfold';

const group = createGroup([playerA, playerB], { exclusive: true, volume: 0.8 });

group.on('current', (player) => highlight(player === playerA));
group.on('error', (error) => console.warn(error));

group.pauseAll();
await group.setVolume(0.5);
```

| Member | Description |
| --- | --- |
| `createGroup(players, options?)` | Options: `exclusive` (default `true` — pause the others when one plays) and `volume` (default `1`). |
| `add(player)` `remove(player)` | Change the group. A removed player stops being paused by the others. |
| `pauseAll()` | Pause every player. |
| `setVolume(volume)` | Set the volume of every player, and of players added later. Rejects outside 0..1. |
| `players`, `current` | A copy of the list, and the player that is playing (or null). |
| `on('current' \| 'error', fn)` | `current` fires when the playing player changes. `error` fires when pausing another player fails, so one broken embed cannot stop the rest. |
| `destroy()` | Stop listening. |

It works with anything that has `play`, `pause`, `setVolume` and `on`, so it can group Playfold players together with a plain `<audio>` element wrapped in the same interface. It stores nothing and draws nothing.

## Analytics hooks

`instrument` turns a player's events into a flat stream for any sink: `play`, `pause`, `ended`, `seek`, `load`, a `progress` event at 25%, 50% and 75%, and one final `listen`. It changes nothing about how the player works and returns a stop function.

```ts
import { instrument } from '@boy-offi9-inc/playfold';

const stop = instrument(player, {
  handler: (event) => plausible.track(event.name, event),
  // target: 'promo-audio',  // default: the element's data-analytics or data-playfold
  // milestones: true,       // progress at 25/50/75 and listen at 100; the default
});
```

An event looks like `{ name: 'progress', target: 'promo-audio', currentTime: 45, duration: 180, percent: 25 }` — `percent` only on `progress` and `listen`. Handler errors are logged, never raised into the player, and a `seek()` or `load()` is reported through the same stream. Milestones reset on `trackchange`, so each track gets its own set. The hook needs no network access and knows nothing about your analytics vendor.

## Entry points

| Import | Purpose |
| --- | --- |
| `@boy-offi9-inc/playfold` | Client |
| `@boy-offi9-inc/playfold/host` | Player page host |
| `@boy-offi9-inc/playfold/react` | React component |
| `@boy-offi9-inc/playfold/meta` | Server-side link-preview tags, oEmbed and request handler |
| `@boy-offi9-inc/playfold/group` | Multi-player coordination (also exported from the root) |
| `@boy-offi9-inc/playfold/analytics` | Analytics event stream (also exported from the root) |
| `@boy-offi9-inc/playfold/check` | Link-preview checker (also the `playfold-check` command) |
| `@boy-offi9-inc/playfold/ui` | Optional default player UI for the player page |
| `@boy-offi9-inc/playfold/browser` | Script-tag build |

## Scope

playfold stays small on purpose. It is not a hosting service, transcoder, CDN, analytics tool or player UI framework. The default player UI is a small optional extra, not a framework: use it, restyle it with CSS variables, or ignore it.

It was inspired by the public APIs of the Vimeo Player API, the YouTube IFrame API, the SoundCloud Widget API and the Spotify iFrame API. The implementation, protocol and naming are original.

## Development

```bash
git clone https://github.com/boy-offi9-inc/Playfold.git
cd Playfold
npm install
npm run typecheck
npm test
npx playwright install chromium   # once, for the browser test
npm run test:e2e
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to send a change.

## License

[MIT](LICENSE) © Boy Offi9 Inc.
