# FSB Johor 2026 Colouring Contest: Jury Scoring App

Spec: [JURY_APP_SPEC.md](JURY_APP_SPEC.md). Build progress: M1 (backend) done; see [NOTES.md](NOTES.md).

## Backend setup (Google Apps Script)

1. Open the mock sheet (spec section 19, ID `1pukkbz6BnqbAMfLYWYtJLYuTH6KvhtWI2dcjEXKmYeg`) > Extensions > Apps Script.
2. Create three script files and paste in: `apps-script/Code.gs`, `apps-script/Sheets.gs`, and (optional, test data only) `tools/seed.gs`. In Project Settings, tick "Show appsscript.json" and paste `apps-script/appsscript.json`.
3. Run `setup()` once (authorise when asked). It binds `SHEET_ID`, adds any missing tabs and Config keys, and creates `ADMIN_KEY` in Project Settings > Script Properties.
4. Deploy > New deployment > Web app: Execute as **Me**, access **Anyone**. Copy the `/exec` URL (this becomes `API_URL` in `assets/config.js` from M3).
5. After every code change: Deploy > Manage deployments > edit > New version (the URL stays the same).

## Frontend (GitHub Pages)

Static files, no build step. Put the repo root on GitHub Pages (Settings > Pages > main / root). Paste the Apps Script `/exec` URL into `assets/config.js` (`API_URL`). Set `Config.baseUrl` in the sheet to `https://<user>.github.io/<repo>` so jury links point at the site.

## Test M6 (results, stage, public page)

Ranking check against an independent calculation (120 seeded artworks, engineered ties, override, unranked, publish):

```bash
node tools/test-m6.js
```

To see the pages with data, start the dev server with demo scores:

```bash
node tools/dev-server.js --demo
```

1. Open `/admin/?k=<key>` (stores the key). Results tab: Compute, resolve any tie with the override box, Lock scoring.
2. `/results/` shows "Keputusan akan diumumkan" until you press Publish; it then lists winners and consolation by ID and first name (it re-checks every 30 s).
3. `/stage/` on the projector: Space, Enter, click or the right arrow advances (consolation, then 3rd, 2nd, 1st, per category); left arrow goes back; F is fullscreen. Names appear only while "Show names on stage" is ticked.

## Test M5 (QR labels)

Open `/admin/` once (stores the key), then `/print/` (or the Print tab; the per-row "Cetak QR" buttons open it with `?ids=`). Pick who to print, optionally "2 per participant", and check the count shown.

1. Print one page on **plain A4 first**: tick "print outline guides", set the browser print dialog to **Scale 100% / Actual size**, margins None, headers and footers off. Measure a label with a ruler: 63.5 x 33.9 mm, QR 26 mm.
2. Hold the page against your label stock to confirm the grid (defaults 3 x 8, left 7.2, top 13.1, gap 2.5 mm, J8159-style); change the numbers if your stock differs.
3. Scan every label from about 40 cm with a phone camera and with the jury app's Scan button: each must open or select the same ID. In the app, `/a/?p=A-014` goes straight to scoring for a jury who has opened their link on that browser.
4. Then print on the label stock.

## Test M4 (admin console)

```bash
node tools/dev-server.js
```

Open `http://localhost:8080/admin/?k=<Admin key printed>` (desk: add `&mode=desk`). The key is then kept in the browser and removed from the address bar. On Google, the key is `ADMIN_KEY` in Script Properties.

1. **Juries**: add a jury (name, `011-2233 4455`, category). The row's green button opens `wa.me/601122334455` with the BM message and personal link; open the link in another window to confirm it works. Regenerate makes the old link stop working; a jury must be deactivated before it can be deleted.
2. **Overview**: have two juries save scores (use the jury links), wait up to 15 s; the coloured cells per jury match the `Scores` tab, with below-minimum artworks and disagreement flags listed.
3. **Results**: Compute, then Lock scoring; a jury trying to save now gets the closed message. Publish makes the public results endpoint answer. Tied artworks show an override box; fill it and Apply.
4. **Scores**: filter, delete (confirm), and key in a paper score with a jury's link (rejected while locked).
5. **Desk mode**: only check-in, search and walk-in, with large buttons.

## Test M3 (jury app)

Local run with the real backend code and seeded mock data (nothing persists, no Google needed):

```bash
node tools/dev-server.js
```

It prints two jury links (`http://localhost:8080/j/?t=...`). Open one on your phone-sized browser window (or on a real phone via your computer's LAN address; the camera needs HTTPS or localhost).

1. First open shows the welcome screen, then home with progress per category.
2. **Masukkan ID**: pick A, type `1`, Go. Tap one number per criterion; the total updates and Save enables only when all five are set. 72.0 for 7, 6, 8, 10, 5 in Category A.
3. Save: the toast appears, the scanner view opens. On a real phone the camera scans QR codes of the form `.../a/?p=A-014`.
4. Offline: open `http://localhost:8080/__offline?on=1` in another tab, save a score (badge shows `1 menunggu`), then `.../__offline?on=0`; within 10 s (or on reconnect) the badge returns to `✓ Disegerak`.
5. Lock: `.../__lock?on=1` and reopen a score: read-only with the closed message.
6. Press and hold a criterion name for the guidance sheet. Settings on the home page: theme and buttons/slider.

## Test M2 (registration sync)

```bash
node tools/test-m2.js
```

Live: in the Apps Script editor temporarily clear `Participants` rows 2 onward, then run:

```bash
curl -sSL -X POST "EXEC" -H 'Content-Type: text/plain;charset=utf-8' -d '{"action":"syncRegistrations","k":"ADMIN_KEY"}'
```

Expect `added: 25, skipped: 1` and a warning that row 27 duplicates A-002. Run it again: `added: 0, skipped: 26`. The new Participants rows should equal the old ones (same IDs and `formRowKey`).

## Test M1

Offline logic check (no Google account needed):

```bash
node tools/test-m1.js
```

Live smoke test against the deployed web app (replace `EXEC` and the key/token):

```bash
curl -sSL "EXEC?action=adminOverview&k=ADMIN_KEY" | head -c 600
curl -sSL "EXEC?action=juryMe&t=39VB-K3A5-6JSW"
curl -sSL -X POST "EXEC" -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"saveScore","t":"39VB-K3A5-6JSW","pid":"A-006","c":[7,6,8,10,5],"updatedAtClient":"2026-11-15T12:20:00Z"}'
```

Then check the `Scores` tab (new row, `total` written as a value) and the `Audit` tab (new row).
