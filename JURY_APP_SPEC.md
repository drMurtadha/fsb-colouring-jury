# FSB Johor 2026 Colouring Contest: Jury Scoring Web App

**Build spec for Claude Code (implementation) and ChatGPT (UI/UX design)**
Version 1.0, 30 Oct 2026. Owner: Assoc. Prof. Ts. Dr. Mohd Murtadha bin Mohamad (UTM).

> How to use this file
> - **Claude Code:** read sections 1 to 14, 16 and 19. Section 16 is the task list with acceptance criteria. Do not invent features outside this spec; list any gap under "Open questions" instead.
> - **ChatGPT (UI/UX):** read sections 1, 3, 7, 9 and 15. Section 15 is the design brief. Deliver mobile-first screens at 360 x 640 that match the wireframes and tokens.
> - Both: section 19 points to the mock Google Sheet to build against; section 20 lists unresolved decisions. Treat the stated defaults as the answer until the organiser changes them.

---

## 1. Event facts (from the poster)

| Item | Value |
|---|---|
| Event | Colouring Contest, Festival Seni Bina (FSB) Johor 2026, "Selapis: The Making of Architecture" |
| Date and time | Sunday, 15 November 2026, 10:00 AM to 12:00 PM |
| Venue | Workshop (Bengkel Elektrik), Kota Jail Johor |
| Eligibility | Kids up to 12 years old |
| Category A | 7 to 12 years old |
| Category B | Below 7 years old |
| Co-organisers | PAM Southern Chapter, UTM (KALAM) |
| Registration | QR on poster, assumed Google Form writing to a Google Sheet |

Judging is **on site**: artworks are displayed, juries walk around, scan a QR on each artwork, and score on their phones.

## 2. Goals and non-goals

**Goals**
1. Pull participants from the existing Google Form / Sheet with no re-typing.
2. Register juries in seconds (name + WhatsApp number) and send each a personal link over WhatsApp.
3. No passwords: a jury opens their link once, then scans artwork QRs to score.
4. Score on a phone in under 30 seconds per artwork, with the running total always visible (no scrolling).
5. Support several juries fairly, show coverage gaps live, and compute winners per category.
6. Announce winners on a projector-friendly reveal screen and a public results page.
7. Simple CRUD for organisers: the Google Sheet stays the source of truth.

**Non-goals (v1)**
- Online submission of artworks or photo upload.
- Public voting.
- Payments, certificates generation (export CSV only; certificates can be mail-merged later).

## 3. Roles and core flows

| Role | Access | What they do |
|---|---|---|
| Admin (organiser) | `/admin/?k=ADMIN_KEY` | Sync registrations, manage juries, check-in, print QR, monitor, lock, publish |
| Registration desk | Same admin link, "Check-in" tab only | Mark arrivals, add walk-ins, hand out numbered sheets/stickers |
| Jury | `/j/?t=JURY_TOKEN` (from WhatsApp) | Scan QR, score, edit own scores |
| Audience / parents | `/results/` (after publish), `/stage/` on projector | View winners |

### 3.1 End-to-end flow

```
Google Form ──► Sheet "Form Responses 1"
                     │  (Admin presses "Sync registrations")
                     ▼
               Sheet "Participants"  ──► IDs A-001.. / B-001..  ──► Print QR labels
                                                                       │
Admin adds jury (name, WhatsApp, category) ──► token ──► wa.me link ──► Jury phone
                                                                       │
Event day: child colours ─► sheet gets QR label ─► displayed ─► Jury scans ─► Score
                                                                       │
                                                  Sheet "Scores" ◄─────┘
                                                        │
                       Admin: coverage check ─► Lock ─► Results ─► Stage reveal ─► Publish
```

## 4. Architecture

**Decision:** plain static front end (HTML, CSS, vanilla JavaScript, no build step) on **GitHub Pages** + **Google Apps Script web app** as the API + **the same Google Sheet** as the database. Astro was considered to match the owner's site and set aside for speed (30 Oct 2026).

House rules borrowed from the owner's site, [drMurtadha/drMurtadha.github.io](https://github.com/drMurtadha/drMurtadha.github.io): no UI framework, **no web fonts**, **no runtime CDN scripts** (vendor libraries into `assets/vendor/`), WCAG AA contrast, 44px targets, reduced-motion support, and repo write-ups (`README.md`, `DEPLOYMENT_GUIDE.md`, `TEST_REPORT.md`).

Why:
- Registration data already lives in Google Sheets; no migration.
- Zero hosting cost, no server to maintain, organisers can fix any record directly in the Sheet (the simplest possible CRUD).
- Scale is small (hundreds of rows, tens of requests per minute), well within Apps Script limits.

```
┌────────────── GitHub Pages (static) ───────────────┐
│ /j/  /a/  /admin/  /stage/  /results/  /print/       │
│ plain HTML + vanilla JS + CSS, no build step        │
└───────────────┬────────────────────────────────────┘
                │ fetch (GET, POST text/plain)
                ▼
┌────────── Google Apps Script Web App (/exec) ──────┐
│ doGet / doPost router, LockService, token checks    │
│ Script Properties: ADMIN_KEY, SHEET_ID              │
└───────────────┬────────────────────────────────────┘
                ▼
        Google Sheet (tabs in section 5)
```

Implementation notes for Claude Code:
- Deploy Apps Script as web app: "Execute as: Me", "Who has access: Anyone".
- Call it from the browser with `fetch(API_URL + '?action=...')` for reads, and `fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload)})` for writes. Plain-text POST avoids a CORS preflight, which Apps Script cannot answer.
- Return JSON with `ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)`.
- Wrap every write in `LockService.getScriptLock().waitLock(10000)`.
- Keep `API_URL` in `assets/config.js` so a redeploy of Apps Script only changes one line.

Fallback if Apps Script proves too slow on the day: Firebase (Firestore) with the same data model. Not planned for v1.

## 5. Data model (Google Sheet tabs)

Row 1 is the header in every tab. Columns in this order.

### 5.1 `Form Responses 1` (untouched, owned by Google Forms)
Mapped through `Config.formColumnMap` (section 5.5) so form wording changes do not break the app.

### 5.2 `Participants`
| Column | Example | Notes |
|---|---|---|
| pid | A-014 | Category letter + 3-digit running number. Never reused |
| category | A | Derived from age on 15 Nov 2026 (<7 = B, 7 to 12 = A); admin can override |
| childName | Aisyah | Never sent to jury endpoints |
| age | 9 | |
| dob | 2017-03-02 | Optional, if the form asks |
| guardianName | | |
| guardianPhone | 60123456789 | Normalised (section 6.2). Never sent to jury endpoints |
| school | | Optional |
| source | form / walkin | |
| formRowKey | 2026-10-21T10:22:01Z#17 | Timestamp + row number; makes sync idempotent |
| checkedIn | TRUE | Set at desk on event day |
| status | active / absent / dq | Only `active` artworks can be scored or win |
| createdAt | ISO time | |

### 5.3 `Jury`
| Column | Example | Notes |
|---|---|---|
| jid | J01 | |
| name | Ar. Siti Rahman | |
| whatsapp | 60123456789 | Normalised digits only |
| categories | A,B | Which categories this jury scores |
| isHead | TRUE | Head jury breaks ties |
| token | 7KQ2-M9XR-H3TA | Random, 12 chars, regenerable |
| active | TRUE | FALSE revokes the link immediately |
| lastSeen | ISO time | Updated on any jury call |
| createdAt | ISO time | |

### 5.4 `Scores`
| Column | Notes |
|---|---|
| key | `jid|pid`, unique; writes are upserts |
| jid, pid, category | |
| c1 .. c5 | Integers 1 to 10 |
| total | Weighted total out of 100, 1 decimal (computed server side) |
| note | Optional, max 140 chars |
| updatedAtClient | Client timestamp; last-write-wins |
| updatedAtServer | |

### 5.5 `Config` (key | value)
| key | default |
|---|---|
| eventName | FSB Johor 2026 Colouring Contest |
| eventDate | 2026-11-15 |
| baseUrl | `https://<user>.github.io/<repo>` |
| criteria | JSON, section 7 |
| weightsA | `[25,20,25,15,15]` |
| weightsB | `[25,15,30,10,20]` |
| minJuryPerArtwork | 2 |
| winnersPerCategory | 3 |
| consolationPerCategory | 5 |
| scoringLocked | FALSE |
| resultsPublished | FALSE |
| showNamesOnStage | TRUE |
| formColumnMap | JSON mapping app fields to form header text |

### 5.6 `Audit`
time | actor (admin/jid) | action | target | before | after. Append only.

### 5.7 `Results` (written by "Compute results")
category | rank | pid | nScores | mean | sd | c3Mean | c1Mean | flag

## 6. Identity, links and QR codes

### 6.1 Jury links (no login)
- Admin adds a jury with name, WhatsApp number and categories. Server generates a random token.
- Link: `{baseUrl}/j/?t={token}`.
- **Do not put the phone number in the URL.** A phone number is guessable and personal; a random token is neither. The WhatsApp number is only the delivery channel.
- Admin page shows a **"Send via WhatsApp"** button per jury that opens
  `https://wa.me/{whatsapp}?text={urlencoded message}` with:
  > Salam/Hi {name}, terima kasih kerana sudi menjadi juri Pertandingan Mewarna FSB Johor 2026 (15 Nov, Kota Jail). Pautan juri peribadi anda: {link} . Sila buka pautan ini sekali sebelum mula menilai. Jangan kongsi pautan ini.
- "Regenerate link" invalidates the old token (lost phone, wrong recipient).
- On first open, the jury page stores the token in `localStorage` and keeps working from then on.

### 6.2 WhatsApp number normalisation (Malaysia default)
Strip all non-digits. If it starts with `0`, replace the leading `0` with `60`. If it starts with `60`, keep. Otherwise keep as entered (foreign number) and show a warning chip "check number".

### 6.3 Artwork QR
- Content: `{baseUrl}/a/?p={pid}` (no token, nothing personal).
- Opened with the phone camera: if this browser already holds a jury token, redirect to the scoring screen for that pid; otherwise show "Artwork A-014. Juries: please open your WhatsApp jury link first." Members of the public learn nothing.
- **Primary scanning path is the in-app "Scan" button** on the jury page. Reason: WhatsApp may open links in an in-app browser while the phone camera opens the default browser, and `localStorage` is not shared between them. The in-app scanner avoids that mismatch entirely.
- Manual fallback: numeric keypad entry of the ID (crayon smudges, glare, damaged labels).

### 6.4 Admin access
`/admin/?k={ADMIN_KEY}`; key stored in Script Properties, stored in `localStorage` after first open, rotatable.

## 7. Judging rubric (recommended)

Five criteria, each scored **1 to 10**, converted to a weighted total **out of 100**. Same criteria for both categories, different weights so young children are not penalised for fine-motor control.

| # | Criterion | What juries look for | Cat A weight | Cat B weight |
|---|---|---|---|---|
| c1 | Colour choice and harmony | Pleasing, purposeful palette; contrast; mood | 25 | 25 |
| c2 | Neatness and control | Even fill, staying within lines, clean edges | 20 | 15 |
| c3 | Creativity and originality | Unexpected but intentional choices, added details or background, personal interpretation of the architecture theme | 25 | 30 |
| c4 | Technique | Shading, blending, texture, gradients, mixed media | 15 | 10 |
| c5 | Completeness and overall impact | Whole picture finished; first-glance "wow" | 15 | 20 |

`total = Σ (c_i / 10) × weight_i` (max 100). Show one decimal.

Anchor descriptors shown under each criterion on tap-and-hold (keeps juries consistent): **1-3** emerging, **4-6** developing, **7-8** strong, **9-10** outstanding.

Input control (mobile): **a row of ten tap targets (1 to 10)** per criterion. One tap per criterion, no dragging, no mis-scroll. Rationale: sliders on phones conflict with vertical scrolling and are hard to land on an exact value; dropdowns need two taps and hide the scale. A slider remains available as a setting (`inputMode = chips | slider`) for juries who prefer it.

## 8. Multiple juries: policy and aggregation

**Assignment.** Default: a panel of 3 juries per category; every jury in a panel scores **every active artwork in their category**. A jury can be on both panels (`categories = A,B`). With ~60 artworks per category at ~30 s each, one jury needs ~30 minutes.

**Final score.** Mean of jury totals for the artwork. An artwork is eligible for ranking only when `nScores ≥ minJuryPerArtwork`.

**Tie-break** (in order): higher mean c3 (creativity), then higher mean c1 (colour), then head jury decision (admin sets an override rank, logged in `Audit`).

**Quality checks shown to admin:**
- Coverage matrix: juries × artworks, cells coloured scored / not scored; list of artworks below the minimum.
- Disagreement flag: any jury total more than 20 points from the artwork mean, or SD > 15. Prompts a second look, does not auto-change anything.
- Harsh/lenient check (optional, off by default): per-jury mean vs panel mean. If a jury is consistently far off, admin may switch aggregation to z-score normalisation per jury (`Config.aggregation = mean | zscore`). For a children's contest, plain mean is easier to explain and is the default.

**Locking.** Juries can edit their own scores until admin sets `scoringLocked = TRUE`. After lock, jury endpoints reject writes with a friendly message.

**Blind judging.** Juries see only the ID, category and (optionally) age; never names, schools or parents. This reduces bias and protects children's data.

## 9. Pages and behaviour

All pages: mobile first, Bahasa Malaysia / English toggle (BM default), works on Chrome Android and Safari iOS.

### 9.1 `/j/` Jury home
- Validates token (`action=juryMe`), shows jury name and categories.
- Progress card per category: `Scored 23 / 58`, progress bar.
- Big primary button **"Imbas Karya / Scan Artwork"** opens camera scanner.
- Secondary: "Masukkan ID" (manual), "Belum dinilai" list (unscored IDs, tappable, helps juries walk the room), "Sudah dinilai" list with totals (tap to edit).
- Sync badge: `✓ Synced` or `3 pending`.

### 9.2 Scoring screen (`/j/?p=A-014` or opened via `/a/`)
Must fit a 360 x 640 viewport **without scrolling** (wireframe in 15.3).
- Header: ID (large), category chip, age (optional), "Back".
- 5 criterion rows, each: label + 10 tap targets. Selected value is filled with the criterion colour.
- Sticky footer: live **Total XX.X / 100**, small text "Your average so far: 71.4" (helps calibration), and button **"Simpan & Imbas Seterusnya / Save & Scan Next"** (disabled until all five set).
- Optional note: icon button opens a one-line input.
- If already scored by this jury: prefilled, button reads "Kemas kini / Update".
- If artwork not in jury's categories, absent or DQ: block with explanation.
- Haptic tick (`navigator.vibrate(10)`) on save where supported; green toast "A-014 saved (78.5)".

### 9.3 `/a/` Artwork landing (QR target)
Redirect logic in 6.3. No data fetch needed for the public view.

### 9.4 `/admin/` Admin console (tabs)
1. **Overview:** counts (registered, checked in, scored complete), per-category progress, coverage matrix, disagreement flags, jury last-seen.
2. **Participants:** search by ID/name; "Sync registrations" button; inline edit category/status; check-in toggle; "Add walk-in" (name, age, guardian phone → assigns next ID, offers instant QR print).
3. **Juries:** add / edit / deactivate / delete; "Send via WhatsApp"; "Copy link"; "Regenerate link"; last seen.
4. **Scores:** filter by jury or artwork; view breakdown; delete a score (logged).
5. **Results:** "Compute results", ranking per category, flags, tie-break override, **Lock scoring**, **Publish results**, export CSV (for certificates and prize desk).
6. **Print:** link to `/print/`.

Desk mode: `/admin/?k=...&mode=desk` shows only Participants with large check-in buttons.

### 9.5 `/print/` QR labels
- Choose: all active / checked-in only / selected IDs / one walk-in.
- A4 label grid, configurable (default 3 × 8 = 24 labels, ~63.5 × 33.9 mm).
- Each label: QR (≥ 22 mm, error correction level M or Q), ID in large bold (e.g. **A-014**), category, small event name. No child name.
- Option "2 per participant": one for the artwork, one stub for the guardian to claim prizes.
- Print through the browser (`@media print`), no PDF library needed.

### 9.6 `/stage/` Winner reveal (projector, 16:9)
- Poster-styled full screen. Per category: reveal order consolation → 3rd → 2nd → 1st; space bar or click advances.
- Shows ID, and the child's name only if `showNamesOnStage = TRUE`.
- Requires admin key; reads computed `Results`.

### 9.7 `/results/` Public results
Visible only when `resultsPublished = TRUE`. Winners per category with ID and first name. Otherwise "Keputusan akan diumumkan / Results coming soon".

## 10. API contract (Apps Script)

All responses: `{ ok: true, data: ... }` or `{ ok: false, error: "CODE", message: "..." }`.

| Action | Method | Auth | Input | Output |
|---|---|---|---|---|
| `juryMe` | GET | token | | jury profile, categories, criteria, weights, locked flag |
| `juryArtworks` | GET | token | | `[ {pid, category, age, status} ]` for jury's categories (no names) |
| `juryScores` | GET | token | | this jury's scores |
| `saveScore` | POST | token | `{pid, c:[5 ints], note, updatedAtClient, clientOpId}` | saved row with server total |
| `adminOverview` | GET | admin | | counts, coverage, flags |
| `syncRegistrations` | POST | admin | | `{added, skipped, warnings}` |
| `participantUpsert` | POST | admin | participant fields | row |
| `participantDelete` | POST | admin | pid | |
| `juryUpsert` | POST | admin | `{jid?, name, whatsapp, categories, isHead}` | row incl. link and wa.me URL |
| `juryRegenerate` | POST | admin | jid | new link |
| `juryDelete` | POST | admin | jid | |
| `scoreDelete` | POST | admin | key | |
| `computeResults` | POST | admin | | results per category |
| `setConfig` | POST | admin | `{key, value}` | |
| `publicResults` | GET | none | | only if published |

Server rules: validate integers 1 to 10, recompute `total` server side, reject writes when locked, idempotent on `clientOpId`, write `Audit` for every admin write.

## 11. Reliability on the day

Venue Wi-Fi or 4G at Kota Jail may be patchy. Therefore:
- **Outbox queue:** every save goes to `localStorage` first, UI confirms instantly, a sync loop posts pending items (on `online` event and every 10 s). Badge shows pending count.
- Cache `juryMe` and `juryArtworks` locally so scanning and validation work offline.
- Upserts are idempotent (`key` + `clientOpId`), so retries never duplicate.
- Admin "Overview" auto-refreshes every 15 s.
- Printed backup: one A4 paper score sheet per jury with the same rubric, in case a phone dies. Admin can key it in through the Scores tab.

## 12. Security and privacy

- Participants are children: handle data under Malaysia's Personal Data Protection Act 2010. Collect only what the form already collects; jury endpoints never return names or phone numbers.
- Sheet sharing: organisers only. The web app runs as the owner; the public never gets Sheet access.
- Tokens are random and revocable; admin key rotatable; no phone numbers in URLs or QR codes.
- `robots.txt` disallow all; `<meta name="robots" content="noindex">` on every page.
- Stage names shown only with consent assumed from registration terms; organiser confirms (section 19).

## 13. CRUD summary

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Participant | Form sync, walk-in | Admin | Admin inline / Sheet | Admin (soft: status) |
| Jury | Admin form | Admin | Admin | Admin (deactivate first) |
| Score | Jury | Jury (own), Admin (all) | Jury until lock | Admin |
| Config | Sheet | All (filtered) | Admin / Sheet | n/a |

Rule: anything the app does not expose can still be fixed directly in the Sheet; the app must tolerate manual edits (trim spaces, accept TRUE/FALSE text).

## 14. QR placement on artwork

Preferred: **pre-print the QR label on the corner of each colouring template sheet** before the event, then hand the numbered sheet to the child at check-in. Avoids stickers falling off or covering the drawing. Alternative: sticker on the front bottom-right margin, outside the colouring area. Display height around eye level; leave 30 cm between artworks so juries scan the right code.

## 15. UI/UX brief (for ChatGPT)

### 15.1 Feel
Playful, bright, confident; children's festival with an architecture edge. Clean white base with bold colour accents, echoing the poster's radiating colour beams and loose hand-drawn curves. Juries are adults (architects, lecturers) using one hand while standing; prioritise speed and legibility over decoration on scoring screens, and save the playful visuals for stage and results.

### 15.2 Design tokens (sample exact values from the poster; these are starting approximations)
| Token | Approx. | Use |
|---|---|---|
| `--magenta` | #C2185B | Primary actions, Category A accents |
| `--maroon` | #7A1E3A | Category A chip, headings |
| `--blue` | #2F6DB5 | Category B chip, links |
| `--yellow` | #F6D21E | Highlights, "Save" success, stage |
| `--purple` | #5B3A8C | Secondary accent |
| `--ink` | #1C1B22 | Text |
| `--paper` | #FFFFFF | Background |
| Criterion colours | c1 magenta, c2 blue, c3 yellow, c4 purple, c5 maroon | Selected tap target fill |

Typography: **no web fonts** (offline-safe, matches the owner's site). Body: `"Avenir Next", ui-sans-serif, system-ui, sans-serif`. Headings and artwork IDs: `ui-rounded, "SF Pro Rounded", "Avenir Next", system-ui, sans-serif` at weight 800 to 900 to echo the poster's rounded title. Provide a dark-mode variant for the jury pages (indoor workshop lighting varies).

Carry over the reference site's interaction rules (its `DESIGN_SYSTEM.md`): tokens named in `:root`; 3px `:focus-visible` outline at 5px offset; every non-inline target at least 44px; transitions only on colour, at `.18s`, inside `prefers-reduced-motion: no-preference`; accent colour chosen per surface so all text meets WCAG AA; verify at 360, 390, 768, 1024 and 1280px with no horizontal overflow. The palette is the poster's (below), not the reference site's navy.

### 15.3 Scoring screen wireframe (360 x 640, no scroll)

```
┌────────────────────────────────────┐
│ ←  A-014        [Kategori A] 9 thn │  56px header
│ Siti R. · 23/58 dinilai   ✓ synced │
├────────────────────────────────────┤
│ Warna & Harmoni              25%   │
│ [1][2][3][4][5][6][7][8][9][10]    │  ~64px per row
│ Kekemasan                    20%   │
│ [1][2][3][4][5][6][7][8][9][10]    │
│ Kreativiti                   25%   │
│ [1][2][3][4][5][6][7][8][9][10]    │
│ Teknik                       15%   │
│ [1][2][3][4][5][6][7][8][9][10]    │
│ Kesempurnaan & Impak         15%   │
│ [1][2][3][4][5][6][7][8][9][10]    │
├────────────────────────────────────┤
│  JUMLAH  78.5 / 100      📝 nota   │  sticky
│ [   SIMPAN & IMBAS SETERUSNYA   ]  │  56px button
└────────────────────────────────────┘
```

Tap targets: 10 per row inside 328 px gives ~30 px wide, at least 44 px tall. Selected state: filled criterion colour + white bold numeral. Unselected: outline. Total animates (count-up) on change.

### 15.4 Screens to design
1. Jury welcome (first open from WhatsApp)
2. Jury home (progress, Scan, lists)
3. Scanner (camera viewfinder, "Masukkan ID" fallback)
4. Scoring (above), plus states: prefilled edit, blocked (wrong category / absent), locked
5. Saved toast and offline/pending state
6. Admin overview with coverage matrix (desktop and tablet)
7. Admin juries list with WhatsApp send button
8. Desk check-in mode (tablet, giant buttons)
9. QR label sheet (A4 print preview)
10. Stage reveal (16:9), one frame per reveal step
11. Public results (mobile)

### 15.5 Accessibility
Contrast ≥ 4.5:1 for text; never rely on colour alone (selected tap target also shows bold numeral and a check); minimum 16 px body; respects `prefers-reduced-motion`.

## 16. Repository and build plan (for Claude Code)

### 16.1 Structure
```
/                     GitHub Pages root (repo drMurtadha/fsb-colouring-jury)
  index.html          landing (event info, links)
  j/                  jury app (home + scanner + scoring, client-side views)
  a/                  QR landing / redirect
  admin/
  print/
  stage/
  results/
  robots.txt          Disallow: /
  assets/
    config.js         API_URL, baseUrl, default language
    api.js            fetch wrapper (GET, text/plain POST), outbox queue
    i18n.js           BM / EN strings
    ui.css            tokens + components (section 15)
    vendor/           pinned QR libraries with licences (no runtime CDN)
apps-script/
  Code.gs, Sheets.gs, appsscript.json
tools/                offline emulator, dev server, tests, fixtures
.gitignore            node_modules, .DS_Store
README.md, NOTES.md, DEPLOYMENT_GUIDE.md, TEST_REPORT.md
```

All internal links and QR URLs must work under the GitHub Pages sub-path `https://drmurtadha.github.io/fsb-colouring-jury/` (use relative links, or derive the base from `location`).

Libraries (exact versions, vendored):
- Scanning: `html5-qrcode` 2.3.8 (Apache-2.0). Native `BarcodeDetector` is not available on iOS Safari, so a library is required.
- Generation: `qrcode` (soldair/node-qrcode) browser build, or `qrcodejs`. Render SVG for crisp printing.
- No framework, no build step.

### 16.2 Milestones and acceptance criteria
| # | Milestone | Done when |
|---|---|---|
| M1 | Sheet tabs + Apps Script API | All section 10 actions return correct JSON against seeded data; writes locked; audit rows appear |
| M2 | Registration sync | Re-running sync adds 0 duplicates; category derived from age on 15 Nov 2026; mapping read from Config |
| M3 | Jury app | Token link opens; scan → score → save in < 30 s; total visible without scrolling at 360 x 640; offline save syncs on reconnect |
| M4 | Admin console | Add jury → WhatsApp opens with correct message and link; coverage matrix matches Scores tab; lock blocks jury writes |
| M5 | Print | 24-label A4 prints at true size; phone scans each label at 40 cm |
| M6 | Results + stage + public | Ranking matches a hand-calculated spreadsheet for seeded data, including tie-break; publish toggles public page |
| M7 | Hardening | Two phones scoring the same artwork concurrently produce two rows; 3 juries × 120 saves without error; iOS Safari and Chrome Android tested |

## 17. Timeline to 15 Nov 2026

| Date | Task |
|---|---|
| 31 Oct to 2 Nov | Get edit access to the form's Sheet; confirm rubric, prizes, jury list; answer section 19 |
| 2 to 6 Nov | M1 to M4 |
| 7 to 9 Nov | M5, M6, UI polish from ChatGPT designs |
| 10 to 11 Nov | Dry run: 3 phones, 30 printed test labels, venue-like network (try mobile data only) |
| 12 Nov | Close online registration (or keep walk-ins), final sync |
| 13 Nov | Print labels or labelled templates; print paper backup sheets |
| 14 Nov | Send WhatsApp links; 10-minute jury briefing (video or call) |
| 15 Nov | 09:00 desk check-in · 10:00 to 12:00 colouring · 12:00 display · ~12:15 judging · lock · compute · reveal |

## 18. GitHub prior art (surveyed 30 Oct 2026)

No existing open-source project matches this exact flow (on-site, QR per artwork, token links over WhatsApp, Sheets backend). The closest projects and what to borrow:

| Project | What it is | Borrow |
|---|---|---|
| [anishathalye/gavel](https://github.com/anishathalye/gavel) | Expo judging (HackMIT), Flask + Postgres, AGPL-3.0 | Per-judge secret login link `/login/<secret>`; live admin ranking. Its pairwise-comparison model is less suited to rubric scoring of children's art |
| [chankjen/PLP_Hackathon_Judging](https://github.com/chankjen/PLP_Hackathon_Judging) | Single `index.html`, weighted 0-100 sliders, leaderboard with podium, CSV export | Closest UI pattern: weighted live total, podium, no build step. Uses localStorage only (single judge) |
| [Bostonhacks/giudice](https://github.com/Bostonhacks/giudice) | Flask app assigning judges to projects, MIT | Judge-to-entry assignment and "how many judges needed" logic |
| [HackTJ/live](https://www.github.com/HackTJ/live) | Django realtime judging + mentoring, MIT | Live scoreboard concept |
| [bryanjhc/judgify](https://github.com/bryanjhc/judgify) | Expo + Firestore mobile judging app | Judge ID generation, table assignment, offline-friendly mobile scoring |
| [pastleo gist](https://gist.github.com/pastleo/34c85a82beccab3e19bb6262d8713512) | Apps Script web app appending GET/POST data to a Sheet (from Martin Hawksey's pattern) | Sheets-as-API starting point for `apps-script/Code.gs` |
| [mebjas/html5-qrcode](https://www.github.com/mebjas/html5-qrcode) | Browser QR scanner library | In-app scanner |
| [t-rutter/qrcodejs](https://github.com/t-rutter/qrcodejs) | Browser QR generator | Label generation |

## 19. Development data source (mock sheet)

Until the real form's sheet is shared, build and test against the mock Google Sheet **"FSB Colouring Contest 2026 Jury DB (MOCK)"**, owned by murtadha@utm.my:

- Sheet ID: `1pukkbz6BnqbAMfLYWYtJLYuTH6KvhtWI2dcjEXKmYeg`
- URL: https://docs.google.com/spreadsheets/d/1pukkbz6BnqbAMfLYWYtJLYuTH6KvhtWI2dcjEXKmYeg/edit
- Set `SHEET_ID` in Apps Script Script Properties to this ID. Bind the Apps Script project to this sheet (Extensions > Apps Script) for the simplest setup.

Tabs and contents (headers exactly as section 5):

| Tab | Contents | Test cases built in |
|---|---|---|
| Form Responses 1 | 26 mock submissions, bilingual BM/EN form headers | Four phone formats (`011-0000 0001`, `01100000002`, `+60 11-0000 0003`, `601100000004`); one duplicate submission (last row, same child as row 3); one child turning 7 on 10 Nov 2026 (boundary, must be Category A); one blank school |
| Participants | 25 rows as the sync would produce them: A-001 to A-015, B-001 to B-010 | Duplicate excluded; phones normalised; `formRowKey` = timestamp#row |
| Jury | J01 to J05, all fake 6011-0000-09xx numbers, tokens `XXXX-XXXX-XXXX` | J03 judges both categories; J01 and J04 are head juries |
| Scores | 11 sample scores (J01 on A-001..A-005, J02 on A-001..A-003, J04 on B-001..B-003) | `total` is a live formula over Config weights here; the API should write the computed value instead |
| Config | All keys from 5.5, plus `dataStatus = MOCK`; weights stored as text `25,20,25,15,15` | |
| Leaderboard | Live `QUERY` over Scores: pid, category, nScores, meanTotal | Handy sanity check against the app's computed results |
| Results, Audit | Headers only | |

All names and phone numbers are fictional. Before the event, replace `Form Responses 1` with the real form's responses (or point `SHEET_ID` at the real sheet and copy the other tabs into it), set `dataStatus` to `LIVE`, clear Participants, Scores and Audit, and re-run sync.

## 20. Open questions (defaults in brackets)

1. Exact Google Form fields, and edit access to its Sheet. [Name, age, guardian name, guardian WhatsApp, school]
2. Expected entrants per category. [≤ 80 each]
3. Number of juries and who is head jury. [3 per category]
4. Prizes: winners and consolation per category. [Top 3 + 5 consolation]
5. Are walk-ins accepted on the day? [Yes]
6. Does the organiser print the colouring templates (so QR can be pre-printed on them)? [Yes, preferred]
7. Show children's names on stage and public page? [Stage yes; public first name only]
8. Repository name and GitHub account for Pages. [`drMurtadha/fsb-colouring-jury`, served at `https://drmurtadha.github.io/fsb-colouring-jury/`]
9. Language default. [Bahasa Malaysia with English toggle]
