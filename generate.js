/*
 * ReadComicsOnline index generator (runs on GitHub Actions every 6 hours).
 *
 *   node generate.js [site|metron]   (see "Modes" near the end)
 *
 * 1. Downloads readcomicsonline.ru's PUBLIC sitemap files (4 files, ~1 MB
 *    compressed; the same files the KETSU module reads, no Cloudflare check).
 * 2. Adds descriptions, genres, publisher, status and years from Metron for
 *    as many series as the run's Metron budget allows (needs the METRON_TOKEN
 *    secret; without it the index is built without descriptions). Results
 *    are cached in data/metron.json so each series is only looked up once.
 * 3. Writes small JSON files to ./site, which the workflow publishes with
 *    GitHub Pages:
 *      home.json                 everything the KETSU main page needs
 *      catalog.json              all series (slug, title, last update) for search
 *      series/<xx>/<slug>.json   one series: issues + Metron details
 *      status.json, index.html   what was built, and when
 *
 * Settings (environment variables):
 *   METRON_TOKEN          Metron API token (GitHub secret)
 *   METRON_MAX_REQUESTS   Metron requests per run (default 900)
 *   METRON_MAX_MINUTES    minutes of Metron work per run (default 50)
 *   REPO_URL              shown in the User-Agent so site owners can see who we are
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { MetronClient, StopMetron, matchSeries, needsCheck } = require('./metron');

const ROOT = __dirname;
const SITE = path.join(ROOT, 'site');
const DATA = path.join(ROOT, 'data');
const CACHE_FILE = path.join(DATA, 'metron.json');
const BASE = 'https://readcomicsonline.ru';
const USER_AGENT = 'ReadComicsOnline-KETSU-index/1.0 (+' + (process.env.REPO_URL || 'https://github.com') + ')';

/* the KETSU module's own shared code: URL parsing, sitemap parsing, curated lists, Trending */
const H = vm.createContext({ console });
for (const f of ['helpers.js', 'home-data.js', 'trending.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8'), H, { filename: f });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml,*/*' } });
            if (res.status === 200) { return await res.text(); }
            lastError = new Error('HTTP ' + res.status + ' for ' + url + (res.headers.get('cf-mitigated') ? ' (Cloudflare challenge)' : ''));
        } catch (e) {
            lastError = e;
        }
        await sleep(5000 * attempt);
    }
    throw lastError;
}

/* JSON that is safe inside any HTML/script wrapper KETSU may put around it */
function safeJson(value) {
    return JSON.stringify(value).replace(/[<>&\/\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function writeJson(rel, value) {
    const file = path.join(SITE, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, safeJson(value));
}

function loadCache() {
    try {
        const c = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return c && c.series ? c : { version: 1, series: {} };
    } catch (e) {
        return { version: 1, series: {} };
    }
}

function saveCache(cache) {
    const sorted = {};
    Object.keys(cache.series).sort().forEach((k) => { sorted[k] = cache.series[k]; });
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ version: 1, series: sorted }, null, 1) + '\n');
}

/* ---------- 1. the site's public sitemaps ---------- */

async function readSite() {
    const index = await getText(BASE + '/sitemap.xml');
    const maps = H.rcoParseSitemapIndex(index);
    const comicsUrl = maps.find((u) => /sitemap-comics\.xml/.test(u)) || BASE + '/sitemap-comics.xml';
    const chapterUrls = maps.filter((u) => /sitemap-chapters-\d+\.xml/.test(u))
        .sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10));
    if (!chapterUrls.length) { throw new Error('the sitemap index lists no issue sitemaps'); }

    const comics = H.rcoParseComicsSitemap(await getText(comicsUrl));
    if (comics.length < 1000) { throw new Error('only ' + comics.length + ' series in the catalogue sitemap; refusing to publish a broken index'); }

    const issuesBySlug = {};
    const chapterTexts = [];
    let issueCount = 0;
    for (const u of chapterUrls) {
        const text = await getText(u);
        chapterTexts.push(text);
        const re = /<loc>([^<]*)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const parsed = H.rcoParseComicUrl(H.rcoDecodeEntities(m[1]));
            if (!parsed || !parsed.issue) { continue; }
            (issuesBySlug[parsed.slug] = issuesBySlug[parsed.slug] || []).push([parsed.issue, m[2].slice(0, 10)]);
            issueCount++;
        }
    }
    if (issueCount < 10000) { throw new Error('only ' + issueCount + ' issues in the issue sitemaps; refusing to publish a broken index'); }
    return { comics, issuesBySlug, chapterTexts, issueCount };
}

/* ---------- 2. Metron ---------- */

async function enrich(comics, trendingPicks, cache) {
    const token = (process.env.METRON_TOKEN || '').trim();
    if (!token) {
        console.log('Metron: no METRON_TOKEN secret, skipping descriptions');
        return { checked: 0, matched: 0, note: 'no token' };
    }
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const bySlug = {};
    comics.forEach((c) => { bySlug[c.slug] = c; });

    /* most-seen series first: Popular, Recommended, Trending, then newest updates */
    const order = [];
    const seen = new Set();
    const add = (slug) => { if (bySlug[slug] && !seen.has(slug)) { seen.add(slug); order.push(slug); } };
    H.RCO_ALL_TIME_POPULAR.forEach(add);
    H.RCO_RECOMMENDED.forEach((r) => add(r[0]));
    trendingPicks.forEach((p) => add(p.slug));
    comics.slice().sort((a, b) => (a.lastmod < b.lastmod ? 1 : a.lastmod > b.lastmod ? -1 : 0)).forEach((c) => add(c.slug));
    const todo = order.filter((slug) => needsCheck(cache.series[slug], now));

    const client = new MetronClient(token, USER_AGENT, {
        maxRequests: parseInt(process.env.METRON_MAX_REQUESTS || '900', 10),
        deadline: now + parseInt(process.env.METRON_MAX_MINUTES || '50', 10) * 60000
    });
    let checked = 0;
    let matched = 0;
    let note = 'finished';
    for (const slug of todo) {
        try {
            const entry = await matchSeries(client, slug, bySlug[slug].title, today);
            cache.series[slug] = entry;
            checked++;
            if (entry.status === 'ok') { matched++; }
            if (checked % 25 === 0) {
                console.log('Metron: ' + checked + ' checked, ' + matched + ' matched, ' + client.requests + ' requests');
                saveCache(cache);
            }
        } catch (e) {
            if (e instanceof StopMetron) { note = e.message; break; }
            console.log('Metron: skipped ' + slug + ': ' + e.message);
        }
    }
    console.log('Metron: ' + checked + ' series checked this run (' + matched + ' matched), ' + client.requests + ' requests; ' + (todo.length - checked) + ' still to check; ' + note);
    return { checked, matched, remaining: todo.length - checked, note };
}

/* ---------- 3. the published files ---------- */

function publicMetron(entry) {
    if (!entry || entry.status !== 'ok') { return null; }
    return {
        desc: entry.desc || '',
        genres: entry.genres || [],
        publisher: entry.publisher || '',
        status: entry.seriesStatus || '',
        yearBegan: entry.yearBegan || null,
        yearEnd: entry.yearEnd || null,
        url: entry.url || ''
    };
}

function writeSite(site, trendingPicks, cache, metronRun) {
    const generated = new Date().toISOString();
    fs.rmSync(SITE, { recursive: true, force: true });
    fs.mkdirSync(SITE, { recursive: true });
    const { comics, issuesBySlug } = site;

    writeJson('catalog.json', {
        rcoIndex: 1,
        generated,
        series: comics.map((c) => [c.slug, c.title, (c.lastmod || '').slice(0, 10)])
    });

    /* home.json: only the series the main page shows, with their catalogue
     * position, so the module's row logic gives the same result as with the
     * full catalogue */
    const wanted = new Set();
    H.RCO_ALL_TIME_POPULAR.forEach((s) => wanted.add(s));
    H.RCO_RECOMMENDED.forEach((r) => wanted.add(r[0]));
    trendingPicks.forEach((p) => wanted.add(p.slug));
    comics.slice().sort((a, b) => (a.lastmod === b.lastmod ? b.order - a.order : a.lastmod < b.lastmod ? 1 : -1)).slice(0, 30).forEach((c) => wanted.add(c.slug));
    comics.slice(-30).forEach((c) => wanted.add(c.slug));
    writeJson('home.json', {
        rcoIndex: 1,
        generated,
        series: comics.filter((c) => wanted.has(c.slug)).map((c) => [c.slug, c.title, c.lastmod || '', c.order]),
        trending: trendingPicks
    });

    let withMetron = 0;
    for (const c of comics) {
        const metron = publicMetron(cache.series[c.slug]);
        if (metron) { withMetron++; }
        writeJson(H.rcoIndexSeriesPath(c.slug), {
            rcoIndex: 1,
            generated,
            slug: c.slug,
            title: c.title,
            cover: c.cover,
            lastmod: c.lastmod || '',
            issues: issuesBySlug[c.slug] || [],
            metron
        });
    }

    const status = {
        rcoIndex: 1,
        generated,
        series: comics.length,
        issues: site.issueCount,
        withMetronDetails: withMetron,
        lastMetronRun: metronRun
    };
    writeJson('status.json', status);
    fs.writeFileSync(path.join(SITE, 'index.html'), [
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>ReadComicsOnline index</title><style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5}</style></head><body>',
        '<h1>ReadComicsOnline index</h1>',
        '<p>Data files for the ReadComicsOnline module for the KETSU app, rebuilt every 6 hours from the public sitemaps of readcomicsonline.ru.</p>',
        '<p>Last built: ' + generated + '<br>Series: ' + comics.length + ' &middot; issues: ' + site.issueCount + ' &middot; series with Metron details: ' + withMetron + '</p>',
        '<p>Series descriptions, genres, publishers, status and years come from <a href="https://metron.cloud">Metron</a>, the community comic book database.</p>',
        '</body></html>'
    ].join('\n'));
    fs.writeFileSync(path.join(SITE, '.nojekyll'), '');
    return status;
}

/*
 * Modes:
 *   node generate.js site     build ./site from the sitemaps + the Metron cache (fast; then publish)
 *   node generate.js metron   look up more series on Metron and save the cache (published next run)
 *   node generate.js          both (for running it on your own computer)
 */
const METRON_RUN_FILE = path.join(DATA, 'metron-last-run.json');

async function main() {
    const mode = process.argv[2] || 'all';
    if (!['site', 'metron', 'all'].includes(mode)) { throw new Error('unknown mode ' + mode + ' (use site, metron or nothing)'); }
    const t0 = Date.now();
    const site = await readSite();
    console.log('site: ' + site.comics.length + ' series, ' + site.issueCount + ' issues (' + Math.round((Date.now() - t0) / 1000) + ' s)');

    const plainPicks = JSON.parse(JSON.stringify(H.rcoTrendingPicks(site.chapterTexts.join('\n'), Date.now())));
    console.log('trending: ' + plainPicks.length + ' series');

    const cache = loadCache();
    if (mode === 'metron' || mode === 'all') {
        let metronRun;
        try {
            metronRun = await enrich(site.comics, plainPicks, cache);
        } finally {
            saveCache(cache);
        }
        fs.writeFileSync(METRON_RUN_FILE, JSON.stringify(Object.assign({ finished: new Date().toISOString() }, metronRun)) + '\n');
    }
    if (mode === 'site' || mode === 'all') {
        let lastMetronRun = null;
        try { lastMetronRun = JSON.parse(fs.readFileSync(METRON_RUN_FILE, 'utf8')); } catch (e) { }
        const status = writeSite(site, plainPicks, cache, lastMetronRun);
        fs.writeFileSync(path.join(DATA, 'last-run.json'), JSON.stringify({ date: status.generated.slice(0, 10) }) + '\n');
        console.log('site built in ' + Math.round((Date.now() - t0) / 1000) + ' s: ' + JSON.stringify(status));
    }
}

main().catch((e) => {
    console.error('FAILED: ' + (e && e.stack || e));
    process.exit(1);
});
