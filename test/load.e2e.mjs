// Real-browser test of player.load(), the queue helper and lock-screen next/previous.
// A host page on one origin embeds the default player UI served from another.
// Needs dist/playfold.global.js and dist/playfold-ui.global.js, plus Playwright with Chromium.
// Run: npm run build && node test/load.e2e.mjs
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const read = (name) => readFileSync(fileURLToPath(new URL(`../dist/${name}`, import.meta.url)));
const sdk = read('playfold.global.js');
const ui = read('playfold-ui.global.js');
const portrait = readFileSync(fileURLToPath(new URL('./fixtures/portrait.webm', import.meta.url)));
const { chromium } = await import('playwright');

function wav(seconds, rate = 8000) {
  const n = seconds * rate;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return b;
}
const long = wav(6);
const short = wav(3);

// Chromium only allows seeking when the server honours Range requests.
function ranged(req, res, body, type) {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!m) return res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': body.length }).end(body);
  const start = Number(m[1] || 0);
  const end = m[2] ? Number(m[2]) : body.length - 1;
  return res
    .writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 })
    .end(body.subarray(start, end + 1));
}

const PLAYER_PORT = 4212;
const HOST_PORT = 4211;
const PLAYER_ORIGIN = `http://127.0.0.1:${PLAYER_PORT}`;
const HOST_ORIGIN = `http://127.0.0.1:${HOST_PORT}`;

const playerServer = http.createServer((req, res) => {
  const url = new URL(req.url, PLAYER_ORIGIN);
  if (url.pathname === '/ui.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(ui);
  if (url.pathname === '/long.wav') return ranged(req, res, long, 'audio/wav');
  if (url.pathname === '/short.wav') return ranged(req, res, short, 'audio/wav');
  if (url.pathname === '/slow.wav') return setTimeout(() => ranged(req, res, long, 'audio/wav'), 600);
  if (url.pathname === '/portrait.webm') return ranged(req, res, portrait, 'video/webm');
  if (url.pathname === '/player') {
    const allowLoad = url.searchParams.get('load') === '1';
    return res.writeHead(200, { 'content-type': 'text/html' }).end(
      `<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="p"></div><script src="/ui.js"></script><script>` +
        `window.ui = PlayfoldUI.mountPlayer('#p', { src: '/long.wav', title: 'First', subtitle: 'Artist', eyebrow: 'Brand', preload: 'auto'` +
        (allowLoad ? `, allowLoad: true, allowedSrcOrigins: [location.origin]` : '') +
        ` });</script>`,
    );
  }
  res.writeHead(404).end();
});

const hostServer = http.createServer((req, res) => {
  const url = new URL(req.url, HOST_ORIGIN);
  if (url.pathname === '/sdk.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(sdk);
  res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><body><div id="one"></div><script src="/sdk.js"></script>');
});

await Promise.all([playerServer, hostServer].map((s, i) => new Promise((r) => s.listen(i ? HOST_PORT : PLAYER_PORT, '127.0.0.1', r))));

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});

// Record the lock-screen handlers the player registers, so the test can press the buttons.
const recordHandlers = () => {
  window.__handlers = {};
  if (navigator.mediaSession) {
    const original = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = (action, fn) => {
      window.__handlers[action] = fn;
      try { original(action, fn); } catch { /* unsupported action */ }
    };
  }
};

async function open(withLoad) {
  const page = await browser.newPage({ viewport: { width: 390, height: 300 } });
  await page.addInitScript(recordHandlers);
  await page.goto(HOST_ORIGIN);
  await page.evaluate(
    ({ origin, withLoad }) => {
      window.pf = Playfold.createPlayer(document.getElementById('one'), {
        baseUrl: origin,
        path: '/player',
        params: withLoad ? { load: '1' } : {},
        height: 150,
      });
      window.tracks = [];
      window.pf.on('trackchange', (t) => window.tracks.push(t.title));
      return window.pf.ready;
    },
    { origin: PLAYER_ORIGIN, withLoad },
  );
  const frame = page.frameLocator('iframe.playfold-frame');
  await frame.locator('.pf-root').waitFor();
  const inner = page.frames().find((f) => f.url().startsWith(PLAYER_ORIGIN));
  return { page, frame, inner };
}

const rejection = (page, code) =>
  page.evaluate(async (src) => {
    try {
      await new Function('pf', `return ${src}`)(window.pf);
      return 'resolved';
    } catch (error) {
      return error.message;
    }
  }, code);

let failed = false;
try {
  // --- a player page that did not opt in ---------------------------------------------------------
  const off = await open(false);
  const refused = await rejection(off.page, `pf.load({ src: '${PLAYER_ORIGIN}/short.wav', title: 'Nope' })`);
  assert.match(refused, /not enabled/);
  assert.equal(await off.frame.locator('.pf-title').textContent(), 'First');
  assert.equal(await off.inner.evaluate(() => window.__handlers.nexttrack), undefined, 'no next button unless load is enabled');
  console.log('ok  load is refused unless the player page opts in, and no lock-screen next button appears');

  // --- a player page that did -------------------------------------------------------------------
  const { page, frame, inner } = await open(true);
  assert.equal(await inner.evaluate(() => typeof window.__handlers.nexttrack), 'function');

  // 1. load switches the track, the heading and the duration, and says so
  await page.evaluate((o) => window.pf.load({ src: `${o}/short.wav`, title: 'Second', subtitle: 'Artist 2' }), PLAYER_ORIGIN);
  assert.equal(await frame.locator('.pf-title').textContent(), 'Second');
  assert.equal(await frame.locator('.pf-sub').textContent(), 'Artist 2');
  assert.equal(await frame.locator('.pf-eyebrow').textContent(), 'Brand', 'the eyebrow keeps its value');
  await frame.locator('.pf-time[data-end]').filter({ hasText: '0:03' }).waitFor();
  const state = await page.evaluate(() => window.pf.getState());
  assert.ok(Math.abs(state.duration - 3) < 0.2, `duration ${state.duration}`);
  assert.deepEqual(await page.evaluate(() => window.tracks), ['Second']);
  assert.equal(await frame.locator('.pf-root').getAttribute('aria-label'), 'Second');
  console.log('ok  load() switches the track, heading and duration, and fires trackchange');

  // 2. a title is text, never markup
  await page.evaluate((o) => window.pf.load({ src: `${o}/short.wav`, title: '<img src=x onerror=window.__pwned=1>' }), PLAYER_ORIGIN);
  assert.equal(await frame.locator('.pf-title img').count(), 0);
  assert.equal(await inner.evaluate(() => window.__pwned === undefined), true);
  console.log('ok  a loaded title is shown as text');

  // 3. sources outside the allowed origins, bad payloads and a wrong media type are refused
  assert.match(await rejection(page, `pf.load({ src: 'https://evil.test/x.mp3', title: 'Evil' })`), /not allowed/);
  assert.match(await rejection(page, `pf.load({ src: 'javascript:alert(1)' })`), /not allowed|http or https/);
  assert.match(await rejection(page, `pf.load({})`), /src is required/);
  assert.match(await rejection(page, `pf.load({ src: '${PLAYER_ORIGIN}/short.wav', title: 5 })`), /title must be a string/);
  assert.match(await rejection(page, `pf.load({ src: '${PLAYER_ORIGIN}/portrait.webm', type: 'video' })`), /cannot load video/);
  assert.notEqual(await frame.locator('.pf-title').textContent(), 'Evil');
  console.log('ok  foreign sources, bad payloads and an audio-to-video switch are refused');

  // 4. a file that does not exist rejects
  assert.notEqual(await rejection(page, `pf.load({ src: '${PLAYER_ORIGIN}/missing.mp3', title: 'Gone' })`), 'resolved');
  console.log('ok  a missing file rejects instead of hanging');

  // 5. autoplay starts playback
  await page.evaluate((o) => window.pf.load({ src: `${o}/long.wav`, title: 'Auto', autoplay: true }), PLAYER_ORIGIN);
  await frame.locator('.pf-play[aria-label="Pause"]').waitFor();
  assert.equal((await page.evaluate(() => window.pf.getState())).paused, false);
  await page.evaluate(() => window.pf.pause());
  console.log('ok  autoplay starts the new track');

  // 6. a newer load replaces one that is still waiting
  const settled = await page.evaluate(async (o) => {
    const first = window.pf.load({ src: `${o}/slow.wav`, title: 'Slow' });
    const second = window.pf.load({ src: `${o}/short.wav`, title: 'Fast' });
    const [a, b] = await Promise.allSettled([first, second]);
    return [a.status, a.reason && a.reason.message, b.status];
  }, PLAYER_ORIGIN);
  assert.equal(settled[0], 'rejected');
  assert.match(settled[1], /replaced by a newer load/);
  assert.equal(settled[2], 'fulfilled');
  assert.equal(await frame.locator('.pf-title').textContent(), 'Fast');
  console.log('ok  a newer load replaces one that is still waiting');

  // 7. the queue: next, previous, auto-advance, lock-screen buttons and errors
  await page.evaluate((o) => {
    window.changes = [];
    window.errors = [];
    window.q = Playfold.createQueue(window.pf, [
      { src: `${o}/long.wav`, title: 'First' },
      { src: `${o}/short.wav`, title: 'Second' },
      { src: `${o}/short.wav?x=3`, title: 'Third' },
    ]);
    window.q.on('change', (c) => window.changes.push(c.index));
    window.q.on('error', (e) => window.errors.push(e.message));
    return window.pf.load({ src: `${o}/long.wav`, title: 'First' });
  }, PLAYER_ORIGIN);

  assert.equal(await page.evaluate(() => window.q.next()), true);
  assert.equal(await frame.locator('.pf-title').textContent(), 'Second');
  assert.equal((await page.evaluate(() => window.pf.getState())).paused, false, 'queue autoplays');

  assert.equal(await page.evaluate(() => window.q.previous()), true);
  assert.equal(await frame.locator('.pf-title').textContent(), 'First');
  assert.equal(await page.evaluate(() => window.q.index), 0);
  assert.equal(await page.evaluate(() => window.q.previous()), true, 'previous on the first track restarts it');
  assert.equal(await page.evaluate(() => window.q.index), 0);
  console.log('ok  queue next() and previous() load the right tracks');

  await inner.evaluate(() => window.__handlers.nexttrack());
  await page.waitForFunction(() => window.q.index === 1);
  assert.equal(await frame.locator('.pf-title').textContent(), 'Second');
  await inner.evaluate(() => window.__handlers.previoustrack());
  await page.waitForFunction(() => window.q.index === 0);
  console.log('ok  lock-screen next and previous move the queue');

  await page.evaluate(() => window.q.jump(1));
  await page.evaluate(() => window.pf.seek(2.6));
  await page.waitForFunction(() => window.q.index === 2, null, { timeout: 8000 });
  assert.equal(await frame.locator('.pf-title').textContent(), 'Third');
  await page.evaluate(() => window.pf.pause());
  console.log('ok  the queue moves on by itself when a track ends');

  assert.equal(await page.evaluate(() => window.q.next()), false, 'no loop: next at the end resolves false');
  assert.equal(await page.evaluate(() => window.q.index), 2);

  await page.evaluate(() => window.q.add({ src: 'https://evil.test/x.mp3', title: 'Bad' }));
  const bad = await page.evaluate(async () => {
    try { await window.q.jump(3); return 'resolved'; } catch (error) { return error.message; }
  });
  assert.match(bad, /not allowed/);
  assert.equal(await page.evaluate(() => window.q.index), 2, 'a failed load keeps the old index');
  await inner.evaluate(() => window.__handlers.nexttrack());
  await page.waitForFunction(() => window.errors.length === 1);
  assert.match(await page.evaluate(() => window.errors[0]), /not allowed/);
  console.log('ok  a failed load keeps the index, and background failures arrive as an error event');

  assert.deepEqual(await page.evaluate(() => window.changes), [1, 0, 1, 0, 1, 2]);
  console.log('ok  the change event fired once per successful move');

  // 8. destroy() clears the lock-screen buttons
  await inner.evaluate(() => window.ui.destroy());
  assert.equal(await inner.evaluate(() => window.__handlers.nexttrack), null);
} catch (error) {
  failed = true;
  console.error('FAIL', error);
} finally {
  await browser.close();
  playerServer.close();
  hostServer.close();
}
process.exit(failed ? 1 : 0);
