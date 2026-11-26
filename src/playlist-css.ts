/* Tracklist styles for `mountPlaylist`. Pair with `playerCss`. */
export const playlistCss = `
.pf-plist{--pf-plist-radius:12px;box-sizing:border-box;margin-top:12px;font:15px/1.4 inherit}
.pf-plist-controls{display:flex;gap:8px;margin-bottom:8px}
.pf-plist .pf-plist-skip{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:32px;padding:0 10px;border-radius:8px;background:color-mix(in srgb,currentColor 8%,transparent);cursor:pointer;font:inherit}
.pf-plist .pf-plist-skip:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
.pf-plist .pf-plist-skip:focus-visible{outline:2px solid var(--pf-accent,#f97316);outline-offset:2px}
.pf-plist-items{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.pf-plist-items li{margin:0}
.pf-plist-items button{all:unset;box-sizing:border-box;display:block;width:100%;padding:9px 12px;border-radius:8px;background:color-mix(in srgb,currentColor 6%,transparent);cursor:pointer;font:inherit;text-align:left;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.pf-plist-items button:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
.pf-plist-items button:focus-visible{outline:2px solid var(--pf-accent,#f97316);outline-offset:2px}
.pf-plist-items button[aria-current="true"]{background:color-mix(in srgb,var(--pf-accent,#f97316) 16%,transparent);box-shadow:inset 0 0 0 1px var(--pf-accent,#f97316)}
.pf-plist-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-plist-sub{display:block;font-size:13px;color:var(--pf-muted,#94a3b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (prefers-reduced-motion:no-preference){.pf-plist button{transition:background-color .15s}}
`;
