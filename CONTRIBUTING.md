# Contributing to Playfold

Thanks for taking the time. Bug reports, small fixes, docs and well-argued features are all welcome.

Playfold stays small on purpose: no runtime dependencies, no backend, no analytics, and a player UI that is optional and not a framework (see [Scope](README.md#scope)). A change that fits that is much easier to accept, so for anything bigger than a fix, please open an issue first and we can agree on the shape before you write code.

## Set up

You need Node 18 or newer.

```bash
git clone https://github.com/boy-offi9-inc/Playfold.git
cd Playfold
npm install
npx playwright install chromium   # once, for the browser tests
```

## Check your change

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type-check the project in strict mode |
| `npm test` | Unit tests (vitest) |
| `npm run build` | Build every entry point with tsup |
| `npm run test:e2e` | Build, then run the browser tests in real Chromium |

CI runs all of these on every push and pull request, so please run them before you open one.

## What lives where

| Path | What it is |
| --- | --- |
| `src/protocol.ts` | The message format, shared by the client and the host |
| `src/client.ts`, `src/queue.ts` | What the embedding page uses: `Player` and `createQueue` |
| `src/host.ts` | What the player page uses: `connectHost` |
| `src/ui.ts` | The optional default player UI |
| `src/meta.ts`, `src/check.ts`, `src/cli.ts` | Link previews, and the `playfold-check` checker |
| `src/react.ts` | The React wrapper |
| `test/*.test.ts` | Unit tests |
| `test/*.e2e.mjs` | Browser tests: a host page on one origin embeds a player page on another |

## Tests

Add a test with every change that has behavior.

- **Logic** goes in a unit test next to the others in `test/`.
- **Anything that touches the browser, `postMessage` or the player UI** also needs a check in one of the `test/*.e2e.mjs` files, because that is the only place where real origins, iframes and media elements are involved.
- **Fix a bug by writing the failing test first** when you can. It shows that the bug is real and keeps it fixed.

## Guidelines

- **Security comes first.** Messages from another page are untrusted. Keep the origin and source checks, validate every incoming value, and never put text from another page into the DOM as HTML. New commands that let the embedding page change what the player does must be off by default.
- **The protocol only grows.** Do not rename or remove commands, events or fields in version 1. Add new ones, and make sure an older player page that does not know them answers with an error and does not break.
- **No new runtime dependencies.** A dev dependency is fine when it earns its place.
- **Keep the entry points separate.** The client must not pull in the UI, the host or the server-side helpers. `meta`, `check` and `queue` must not need a DOM.
- **Be kind to small screens.** The player UI is used on phones, so check touch, narrow widths and in-app browsers when you change it.
- **Update the README** when you add or change something people can use, and keep examples working.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), as in the history:

```
feat(ui): fall back to filling the page when browser full screen is unavailable
fix(host): reject a seek to a negative time
test(ui): add e2e checks for the full-screen fallback
docs(readme): document the colors option
chore(release): 1.3.0
```

The type is `feat`, `fix`, `docs`, `test`, `refactor`, `chore` or `ci`, and the scope names the area (`ui`, `host`, `client`, `queue`, `meta`, `check`, `readme`).

For a pull request:

1. Keep it focused on one thing.
2. Fill in the template, and link the issue it closes.
3. Do not bump the version. The maintainer does that when cutting a release.

## Reporting bugs and asking for features

Use the [issue forms](https://github.com/boy-offi9-inc/Playfold/issues/new/choose). For a bug, the most useful thing is a small page or snippet that shows it, plus the browser and device. In-app browsers and WebViews behave differently from Chrome and Safari, so say if that is where you saw it.

## Security

Please do not open a public issue for a vulnerability. Use the repository's **Security** tab and choose **Report a vulnerability**, and include the steps to reproduce it.
