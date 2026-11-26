// Real-browser test of the playlist (mountPlaylist + follow) wired to a mountPlayer card and a queue.
// Needs dist/playfold.global.js and dist/playfold-ui.global.js, plus Playwright with Chromium.
// Run: npm run build && node test/playlist.e2e.mjs      (set SHOTS=/some/dir to save screenshots)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const read = (name) => readFileSync(fileURLToPath(new URL(`../dist/${name}`, import.meta.url)));
const sdk = read('playfold.global.js');
const ui = read('playfold-ui.global.js');
const { chromium } = await import('playwright');

function wav(seconds = 6, rate = 8000) {
  const n = seconds * rate;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt32LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return b;
}
const audio = wav(4);

function ranged(req, res, body, type) {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!m) return res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': body.length }).end(body);
  const start = Number(m[1] || 0);
  const end = m[2] ? Number(m[2]) : body.length - 1;
  return res
    .writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 })
    .end(body.subarray(start, end + 1));
}

const TRACKS = [
  { src: '/a.wav', title: 'First Move', subtitle: 'Side A' },
  { src: '/b.wav', title: 'Second Wind', subtitle: 'Side B' },
  { src: '/a.wav', title: 'Third Time', subtitle: 'Side C' },
];

const PORT = 4203;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (url.pathname === '/ui.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(ui);
  if (url.pathname === '/sdk.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(sdk);
  if (url.pathname === '/a.wav') return ranged(req, res, audio, 'audio/wav');
  if (url.pathname === '/b.wav') return ranged(req, res, audio.subarray(0, Math.floor(audio.length / 2)), 'audio/wav');
  if (url.pathname === '/playlist') {
    return res.writeHead(200, { 'content-type': 'text/html' }).end(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<body style="margin:0;background:#0b1020;color:#f8fafc"><div id="p"></div><div id="list"></div><script src="/ui.js"></script><script>` +
        `const tracks = ${JSON.stringify(TRACKS)};` +
        `window.ui = PlayfoldUI.mountPlayer('#p', { src: tracks[0].src, title: tracks[0].title, subtitle: tracks[0].subtitle, preload: 'auto' });` +
        `window.list = PlayfoldUI.mountPlaylist('#list', tracks);` +
        `window.list.on('activate', (row) => window.ui.load({ ...tracks[row.index], autoplay: true }));` +
        `</script>`,
    );
  }
  res.writeHead(404).end();
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
let failed = false;
const shot = async (page, name) => {
  if (!process.env.SHOTS) return;
  const { mkdirSync } = await import('node:fs');
  mkdirSync(process.env.SHOTS, { recursive: true });
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

try {
  const page = await browser.newPage({ viewport: { width: 420, height: 620 } });
  await page.goto(`${ORIGIN}/playlist`);
  await page.locator('.pf-root').waitFor();
  await page.locator('.pf-plist').waitFor();

  // 1. renders the tracklist
  const titles = await page.locator('.pf-plist-title').allTextContents();
  assert.deepEqual(titles, ['First Move', 'Second Wind', 'Third Time']);
  assert.equal(await page.locator('.pf-plist-sub').count(), 3);
  assert.equal(await page.locator('.pf-plist button[aria-current="true"]').count(), 0, 'nothing selected before the first pick');
  console.log('ok  playlist renders all three rows with subtitles');

  // 2. clicking a row activates it and loads that track into the player
  await page.locator('.pf-plist-items button', { hasText: 'Second Wind' }).click();
  await page.locator('.pf-plist button[aria-current="true"]', { hasText: 'Second Wind' }).waitFor();
  await page.waitForFunction(() => window.ui.element.getAttribute('aria-label') === 'Second Wind');
  assert.equal(await page.locator('.pf-title').textContent(), 'Second Wind');
  console.log('ok  clicking a row highlights it and loads that track');

  // 3. keyboard navigation moves focus between rows
  await page.locator('.pf-plist-items button').first().focus();
  await page.keyboard.press('ArrowDown');
  const focused = await page.evaluate(() => document.activeElement?.textContent || '');
  assert.ok(focused.includes('Second Wind'), `focus should move to row 2: ${focused}`);
  console.log('ok  ArrowDown moves focus through the list');

  // 4. skip controls wrap around
  await page.locator('.pf-plist-skip').first().click(); // previous from index 1 -> 0
  await page.locator('.pf-plist button[aria-current="true"]', { hasText: 'First Move' }).waitFor();
  const before = await page.evaluate(() => window.list.active.index);
  await page.evaluate(() => window.list.next.click());
  await page.waitForFunction((i) => window.list.active.index === (i + 1) % 3, before);
  console.log('ok  previous and next move the selection');

  // 5. follow(): a queue drives the highlight
  await page.evaluate(() => {
    window.moves = [];
    window.stop = PlayfoldUI.follow(window.list, {
      on(_event, listener) {
        window.moves.push(listener);
        return () => {
          const i = window.moves.indexOf(listener);
          if (i >= 0) window.moves.splice(i, 1);
        };
      },
    });
  });
  await page.evaluate(() => window.moves.forEach((fn) => fn({ index: 2, track: { src: '/a.wav' } })));
  await page.locator('.pf-plist button[aria-current="true"]', { hasText: 'Third Time' }).waitFor();
  await page.evaluate(() => window.stop());
  await page.evaluate(() => window.moves.forEach((fn) => fn({ index: 0, track: { src: '/a.wav' } })));
  assert.equal(await page.locator('.pf-plist button[aria-current="true"]', { hasText: 'Third Time' }).count(), 1, 'stop() must detach');
  console.log('ok  follow() mirrors queue changes and detaches on stop()');

  // 6. destroy removes the list
  await page.evaluate(() => window.list.destroy());
  assert.equal(await page.locator('.pf-plist').count(), 0);
  console.log('ok  destroy() removes the list');

  await shot(page, 'playlist');
  console.log('PASS playlist e2e');
} catch (error) {
  failed = true;
  console.error('FAIL', error);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
