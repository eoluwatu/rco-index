# ReadComicsOnline index

A small, automatically updated copy of readcomicsonline.ru's **public** series and issue lists, plus series details from [Metron](https://metron.cloud). The **ReadComicsOnline** module for the KETSU app reads it, which makes the module much faster:

| Screen in KETSU | Without this index | With it |
|---|---|---|
| Home page | 3 requests, ~700 KB, scans ~7.6 MB | 1 request, ~4 KB |
| Opening a series | ~690 KB, scans ~8.6 MB | ~1 KB |
| Search | ~380 KB, scans 4.3 MB of XML | ~210 KB of ready-made data |

Series pages also get a **description, genres, publisher, status and years** once Metron has matched them.

Everything is free: GitHub Actions builds it every 6 hours and GitHub Pages hosts it. If it's ever down, the module goes back to reading the site directly, so nothing breaks.

---

## One-time setup (about 15 minutes)

### Part A: Metron token (for descriptions)

1. Create a free account at **https://metron.cloud** (Sign up, top right).
2. **Read Metron's terms of use** on their site before going on. I couldn't find a published licence for Metron's data. This index republishes descriptions in a public file, with credit and a link to Metron. If their terms don't allow that, skip Part A and Part B step 4; the index still works, just without descriptions.
3. Open your account page, find **API Tokens**, and create a token (name it e.g. `ReadComicsOnline index`). **Copy it** and keep it private. Metron's rule: never put it in a file or share it.

### Part B: GitHub repository

1. On GitHub, click **+** (top right) → **New repository**.
   * Repository name: `rco-index`
   * Visibility: **Public** (free GitHub Pages needs a public repository; your token stays secret)
   * Leave "Add a README" **unticked**, then click **Create repository**.
2. On the empty repository page, click the link **"uploading an existing file"**.
   * Unzip `ReadComicsOnline-Index.zip` on your computer.
   * Open the unzipped folder, select **everything inside it** (including the `.github` folder), and drag it onto the GitHub page.
   * Click **Commit changes**.
   * Check that the file list now shows `.github`, `data`, `lib`, `generate.js`, `metron.js` …
3. **Settings** → **Pages** (left menu) → under "Build and deployment", set **Source** to **GitHub Actions**.
4. **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   * Name: `METRON_TOKEN`
   * Secret: paste your Metron token
   * Click **Add secret**.
5. Open the **Actions** tab. If GitHub asks, click **"I understand my workflows, go ahead and enable them"**. Then:
   * Click **Build ReadComicsOnline index** → **Run workflow** → **Run workflow**.
   * After 1–2 minutes the run shows the index as published (the "deploy" step turns green). The Metron step then keeps working for up to ~50 minutes; that's normal.
6. Open **https://YOUR-GITHUB-NAME.github.io/rco-index/**. You should see a short "ReadComicsOnline index" page with the number of series.

### Part C: connect the module

Send the address from step 6 (e.g. `https://trappmanny.github.io/rco-index/`) to whoever builds your module (in this project: send it to Claude). They put it in `KETSU-Comics-SOURCE/build/config.json` and rebuild `KETSU-Comics.json`. Import the new file into KETSU.

---

## What happens automatically

* **Every 6 hours** the index is rebuilt from the site's public sitemaps and published (~1 MB downloaded from the site per run).
* Each run then asks Metron about up to ~400 more series (900 requests, 50 minutes). It does this politely: no more than 1 request every 3.1 s, following Metron's published limits of 20 per minute and 5,000 per day.
* Series are looked up in this order: All-Time Popular, Recommended, Trending, then most recently updated. All ~9,600 series take about a week. Results are saved in `data/metron.json`, so nothing is asked twice.
* Series Metron doesn't know are retried after 45 days; matched series are refreshed after 120 days.
* New descriptions appear in KETSU after the **next** run (within 6 hours).

## Checking on it

* `https://YOUR-GITHUB-NAME.github.io/rco-index/status.json` shows when it was last built, how many series have Metron details, and what the last Metron run did (e.g. `"note":"request budget for this run used up"` is normal; `"Metron refused the token"` means the secret is wrong).
* The **Actions** tab shows every run. A red ✗ on "Build the index" usually means readcomicsonline.ru was unreachable. The previous index stays online, and the next run tries again.

## Files

| File | Purpose |
|---|---|
| `generate.js` | Builds the index (`node generate.js site`) and does Metron lookups (`node generate.js metron`) |
| `metron.js` | Metron API client (rate limits, retries) and series matching |
| `test-metron.js` | Tests for `metron.js` with a simulated Metron (`node test-metron.js`) |
| `lib/` | Shared code copied from the KETSU module's source, so both use the same rules |
| `data/metron.json` | Saved Metron results |
| `.github/workflows/build-index.yml` | The 6-hourly GitHub job |

Series details come from [Metron](https://metron.cloud), the community comic book database. Series and issue lists come from readcomicsonline.ru's public sitemaps.
