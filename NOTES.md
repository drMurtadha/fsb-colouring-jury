# Build notes

## Status
- M1 backend: written and checked offline (`node tools/test-m1.js`, 80 checks). Not yet deployed to Google; see README.
- `syncRegistrations` (M2 scope) was implemented in M1 because the M1 criterion says every section 10 action must work.
- M2: verified offline with `node tools/test-m2.js` against a copy of the mock sheet's 26 form rows (`tools/fixtures/mock-form.json`). It reproduces the mock Participants tab exactly (A-001..A-015, B-001..B-010, same formRowKey values), skips the duplicate, and a re-run adds 0. Live check on Google still pending (README).

- M3: jury app built (`j/`, `a/`, `assets/`). Checked in the Browser pane at 360 x 640 against `tools/dev-server.js` (real `.gs` code in the emulator): total visible with no scroll, 72.0 for the sample, offline save queued then synced, prefilled edit, not-found and locked states, slider mode, light and dark. **Camera scanning could not be tested** (blocked in the pane); test on a real phone. Not tested on iOS Safari or Chrome Android (M7).

- M4: admin console built (`admin/`). Checked in the browser against the dev server: coverage matrix equals the Scores rows, a new jury's WhatsApp URL carries the exact BM message and link, lock blocks jury saves, tie override reorders results, desk mode. Not yet run against the deployed Google backend.

- M5: print page built (`print/`). Checked in the browser: 24 labels per A4 page, label 63.5 x 33.9 mm, QR 26 mm, sheet 210 x 297 mm, grid pitch matches the settings, selected IDs / 2 per participant / checked-in modes, no child name on any label, and all 25 QR codes decode (with html5-qrcode) to `{baseUrl}/a/?p={pid}`. **Not done: a physical print and phone scan at 40 cm** (needs your printer and label stock).

- M6: results, stage and public pages built (`stage/`, `results/`). `node tools/test-m6.js` (22 checks) compares `computeResults` with an independent calculation on 120 seeded artworks: full order, means, tie-breaks (c3, then c1, then override), artworks under the minimum left unranked, publish toggle, public view limited to ID and first name. Stage and public pages checked in the browser against `--demo` data. **The 'hand-calculated spreadsheet' in the acceptance criterion is replaced by that independent script**; if you want a literal spreadsheet comparison, give me the scores export or fill the mock sheet's `Leaderboard`.

- M7: hardening done in code, **device testing not done**. `node tools/test-m7.js` (18 checks): 3 juries x 120 artworks with shuffled order, repeated sends and edits gave exactly 360 rows, each holding the latest scores and the server-computed total, no errors; lock rejects writes; hostile names/notes are stored as text. In the browser, 25 saves + 3 edits through a network that dropped 35% of requests and lost 25% of replies all arrived exactly once. **Not tested:** iOS Safari, Chrome Android, real simultaneity on Google's LockService, real Apps Script latency, a physical print (see the README checklist).

## Fixed during M7
- **Runaway refresh loop (M3 bug):** the jury home page re-rendered itself after every background refresh, which started another refresh, forever (about 70,000 requests in a minute against the local server). On Apps Script that would have exhausted quota. Now one refresh per visit to the home screen (3 requests).
- **Formula injection:** a child name or school beginning with `=`, `+`, `-` or `@` from the public form (or a jury note) would have been evaluated as a formula in the Sheet. All text columns are now written as plain text; the admin CSV export also prefixes such cells with `'`.
- **Clock skew:** if two devices of the same jury have different clocks, an edit could have been silently ignored. The app now stamps an edit at least 1 ms after the stored score of that artwork.
- **Fewer sheet calls:** a score save went from about 20 to about 12 spreadsheet-service calls (one read per tab, header row cached per request).
- Added `100vh` fallbacks beside `100dvh` for older iOS; the scanner no longer throws if you leave the scan screen before the camera started.

## Visual reference (poster.jpg, for M3 onwards)
Heavy rounded sans lettering with a pale light-blue outline on the title; Category A tile magenta/maroon, Category B tile blue; yellow highlight panels; radiating translucent colour beams and thin curved lines on white. Tokens in spec 15.2 match; sample exact hex values from the image when writing `ui.css`.

## Open questions
1. **No admin read actions.** Section 10 has no action for listing participants, juries, scores, config or results, yet sections 9.4 and 9.6 need them. I extended the `adminOverview` output with `participants`, `juries` (with link and wa.me URL), `scores`, `results` and `config` instead of adding actions. Confirm, or approve separate read actions.
2. **Stage page auth.** 9.6 says `/stage/` reads computed `Results` with the admin key; with no matching action it will use `adminOverview.results` (plus participants for names).
3. **Tie-break override storage.** Spec says the admin sets an override rank but gives no field. Stored as `Config.rankOverrides` JSON, e.g. `{"A-004":1,"A-002":2}` (lower first), set via `setConfig` and audited. Applied only after mean, c3 mean and c1 mean are all equal.
4. **`participantDelete`** is soft (status `absent`), per section 13. Use `dq` through `participantUpsert` for disqualification.
5. **Walk-ins** are created with `checkedIn = TRUE` (they are physically present).
6. **Category change after scoring** is refused (`HAS_SCORES`) so `Scores.category` cannot go stale; delete the scores first.
7. **Deleting a jury** keeps their scores in the sheet and they still count in results. Say if they should be excluded.
8. **`clientOpId`** has no column in `Scores`. Idempotency relies on the `key` upsert plus `updatedAtClient` (equal or older timestamp = no-op, response has `stale: true`). `clientOpId` is recorded in the Audit row.
9. **Jury saves are audited** (actor = jid), since the Audit schema has a jid actor. About one extra row per save; say if too noisy.
10. **SD** is the sample standard deviation (n-1). The disagreement flag fires when any jury total is more than 20 from the mean, or SD is over 15.
11. **`aggregation = zscore`** is not implemented (spec: optional, off by default); `computeResults` warns and uses the mean.
12. **Mock sheet data:** `Config.baseUrl` still holds `<github-user>`; set it before generating real links. Mock `Scores.total` is a formula; the API overwrites it with a value on save.
13. **Duplicate rule:** the same child name and guardian phone (case and spacing ignored) counts as a duplicate submission. Siblings with different names are kept.
14. The test harness emulates Sheets in memory. Google-specific behaviour (number formats keeping phones as text, lock timing, web app deployment) still needs the live smoke test in the README.
15. **Page cannot reload offline.** Scores and lists are cached in `localStorage` and saves queue offline, but opening or reloading the page with no signal needs a service worker, which the spec does not list. Say if you want one (small).
16. **Selected chip colours:** the yellow criterion (c3) uses dark text on yellow instead of white, because white on `#F9E40D` fails contrast (spec 15.5). Palette is sampled from poster.jpg: yellow `#F9E40D`, magenta `#BF1F65`, A tile maroon `#7A1E3A`, B blue `#2F6DB5`, purple lightened toward the poster's `#49257F`.
17. **Fonts** (Baloo 2, Poppins) load from Google Fonts with a system fallback; they are not vendored, so offline reloads use the fallback.
18. **`html5-qrcode` 2.3.8** is the latest release but dates from April 2023 (Apache-2.0). Vendored in `assets/vendor/`.
19. **Jury token is removed from the address bar** after first open (kept in `localStorage`), so screenshots do not leak it. Opening the WhatsApp link again still works.
20. **Public landing page** links to `/results/`, which does not exist until M6.
21. **Desk mode is a view, not a permission.** `&mode=desk` hides the other tabs, but it uses the same admin key; anyone with that key can call every admin action. A separate desk key would need a backend change, not in the spec.
22. **Admin key is passed in the URL query for GET calls** (`adminOverview`), as the spec's table implies. It can appear in Apps Script logs and browser history; rotate it in Script Properties after the event.
23. **Paper-sheet entry** (spec 11) goes through `saveScore` with the chosen jury's token, so it respects the lock and appears in the Audit tab as that jury.
24. **Print and Stage/Results links** in the admin console point at pages built in M5 and M6.
25. **Admin screens are desktop/tablet first** and only lightly checked at phone width.
26. **QR library:** the spec names `qrcode` or `qrcodejs`. The `qrcode` npm package ships no browser build and `qrcodejs` draws canvas/table rather than SVG, so I vendored `qrcode-generator` 2.0.4 (MIT, SVG output, error correction Q). Say if you want a different one.
27. **Label grid defaults** (3 x 8, 63.5 x 33.9 mm, left 7.2, top 13.1, gap 2.5) are my assumption of common 24-up stock; confirm against the stock you buy. The page does not support skipping already-used labels on a part-used sheet (not in the spec).
28. **Stub label** wording ("Keep to claim your prize") and the "one walk-in" choice (a list of walk-ins, newest preselected) are my reading of spec 9.5.
29. **QR content depends on `Config.baseUrl`.** Labels printed with the `<github-user>` placeholder are useless; the print page warns while it is unset. Reprint if the site address changes.
30. **Stage order** is Category A then B, each as: category card, consolation (all at once, in rank order), then the winners from the lowest winning place up to 1st. Say if B should go first or consolation should reveal one by one.
31. **Stage warns** (top-left of the first slide, admin eyes only) if a prize place is still `TIE-UNRESOLVED`; resolve it in the admin Results tab and reload the stage.
32. **Stage reads `adminOverview`** with the admin key from this browser (spec 9.6 requires the key); it shows the child's full name when `showNamesOnStage` is TRUE. Check the PDPA consent wording before you project names (spec 12).
33. **Public results** show ranks, ID and first name, no scores. The page polls every 30 s while unpublished.
34. **Stage is projector-oriented (16:9)** and letterboxes on other shapes; checked only in a roughly square browser pane, not on a real projector.
35. **Browser support** assumed: iOS Safari 14.5+ (CSS `gap` in flex, `inset`) and a current Chrome on Android. Older iPhones may mis-lay-out the pages.
36. **Concurrency** relies on `LockService.getScriptLock()` (10 s wait). If three juries save at the same instant, later requests wait; one that waits longer than 10 s returns `BUSY` and the phone retries by itself. Real Apps Script latency (often 1 to 3 s a call) was not measured; a dry run on the real sheet (spec 17, 10 to 11 Nov) is the proper test.
37. **A save that arrives with an older client time is ignored** (`stale: true`), by design (last write wins). The phone shows the stored score the next time it refreshes.
39. **Client time is not trusted blindly.** A missing, unreadable or more-than-5-minutes-ahead `updatedAtClient` is replaced by server time before comparing and storing; it is always stored and returned as ISO UTC. Sheet cells in the older `yyyy-mm-dd hh:mm:ss` form are read as script-time-zone local time. A retry of a clamped save gets a later server time and rewrites the same values (harmless, one extra Audit row). A phone clock up to 5 minutes fast can still win over a correct clock inside that window.
38. **Apps Script quotas**: consumer accounts allow about 20,000 web-app calls a day; 3 juries plus the 15-second admin refresh stay far below that, but leave the admin Overview open on one device only.
