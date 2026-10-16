/*
 * Small Metron (https://metron.cloud) API client + series matching.
 *
 * Follows Metron's published rules (api/RATELIMIT.md in the Metron repo):
 *   - token auth: "Authorization: Bearer <token>" (token from a GitHub secret,
 *     never written to any file),
 *   - limits: 20 requests/minute (burst) and 5,000/day (sustained),
 *   - read the X-RateLimit-* headers, pause when a counter reaches 0,
 *   - on HTTP 429 wait exactly Retry-After seconds.
 * On top of that this client never sends more than one request every 3.1 s.
 */
'use strict';

const API = 'https://metron.cloud/api/';
const MIN_GAP_MS = 3100;

class StopMetron extends Error { }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class MetronClient {
    constructor(token, userAgent, opts) {
        this.token = token;
        this.userAgent = userAgent;
        this.fetch = (opts && opts.fetch) || fetch;
        this.sleep = (opts && opts.sleep) || sleep;
        this.maxRequests = (opts && opts.maxRequests) || 900;
        this.deadline = (opts && opts.deadline) || Infinity;
        this.requests = 0;
        this.lastRequestAt = 0;
        this.burstRemaining = null;
        this.burstReset = 0;
        this.sustainedRemaining = null;
    }

    async get(pathAndQuery) {
        for (let attempt = 0; attempt < 4; attempt++) {
            if (this.requests >= this.maxRequests) { throw new StopMetron('request budget for this run used up'); }
            if (Date.now() > this.deadline) { throw new StopMetron('time budget for this run used up'); }
            if (this.sustainedRemaining !== null && this.sustainedRemaining <= 25) { throw new StopMetron('daily Metron limit almost reached'); }
            const now = Date.now();
            let wait = Math.max(0, this.lastRequestAt + MIN_GAP_MS - now);
            if (this.burstRemaining === 0 && this.burstReset * 1000 > now) {
                wait = Math.max(wait, this.burstReset * 1000 - now + 500);
            }
            if (wait) { await this.sleep(wait); }
            this.lastRequestAt = Date.now();
            this.requests++;
            const res = await this.fetch(API + pathAndQuery, {
                headers: { Authorization: 'Bearer ' + this.token, Accept: 'application/json', 'User-Agent': this.userAgent }
            });
            const h = (name) => res.headers.get(name);
            if (h('X-RateLimit-Burst-Remaining') !== null) { this.burstRemaining = parseInt(h('X-RateLimit-Burst-Remaining'), 10); }
            if (h('X-RateLimit-Burst-Reset') !== null) { this.burstReset = parseInt(h('X-RateLimit-Burst-Reset'), 10); }
            if (h('X-RateLimit-Sustained-Remaining') !== null) { this.sustainedRemaining = parseInt(h('X-RateLimit-Sustained-Remaining'), 10); }
            if (res.status === 429) {
                const retry = parseInt(h('Retry-After') || '60', 10);
                if (retry > 15 * 60) { throw new StopMetron('Metron asked to wait ' + retry + ' s (daily limit)'); }
                await this.sleep(retry * 1000);
                continue;
            }
            if (res.status === 401 || res.status === 403) {
                throw new StopMetron('Metron refused the token (HTTP ' + res.status + '). Check the METRON_TOKEN secret.');
            }
            if (res.status === 404) { return null; }
            if (res.status >= 500) {
                await this.sleep(5000 * (attempt + 1));
                continue;
            }
            if (!res.ok) { throw new Error('Metron HTTP ' + res.status + ' for ' + pathAndQuery); }
            return res.json();
        }
        throw new Error('Metron did not answer after retries: ' + pathAndQuery);
    }
}

/* ---------- matching a readcomicsonline series to a Metron series ---------- */

const COLLECTED = /\b(tpb|trade paperback|hardcover|omnibus|compendium|collection|deluxe|library|absolute edition|graphic novel)\b/i;

function normalize(text) {
    let s = String(text || '').toLowerCase();
    if (s.normalize) { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    s = s.replace(/&/g, ' and ').replace(/['\u2019]/g, '');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

/* "Batman (2016-)" -> { name: "Batman", year: 2016 } */
function siteNameYear(slug, title) {
    const name = String(title || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const m = String(title || '').match(/\((\d{4})/) || String(slug || '').match(/-(\d{4})(?:\d{4})?-?$/);
    return { name, year: m ? parseInt(m[1], 10) : 0 };
}

/* Metron list entry "Batman (2016)" -> "Batman" */
function metronBaseName(entry) {
    return String(entry.series || entry.name || '').replace(/\s*\(\d{4}[^)]*\)\s*$/, '').trim();
}

function pickBest(candidates, siteName, siteTitle) {
    const want = normalize(siteName);
    const siteIsCollected = COLLECTED.test(siteTitle);
    const exact = candidates.filter((c) => normalize(metronBaseName(c)) === want);
    if (!exact.length) { return null; }
    const typeName = (c) => (c.series_type && c.series_type.name) || '';
    exact.sort((a, b) => {
        const ca = COLLECTED.test(typeName(a)) === siteIsCollected ? 0 : 1;
        const cb = COLLECTED.test(typeName(b)) === siteIsCollected ? 0 : 1;
        if (ca !== cb) { return ca - cb; }
        return (b.issue_count || 0) - (a.issue_count || 0);
    });
    return exact[0];
}

function cleanDescription(desc) {
    let s = String(desc || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '');
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    s = s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (s.length > 1500) { s = s.slice(0, 1500).replace(/\s+\S*$/, '') + '\u2026'; }
    return s;
}

/* Returns a cache entry: { status: 'ok', ... } or { status: 'none' }. */
async function matchSeries(client, slug, title, today) {
    const { name, year } = siteNameYear(slug, title);
    if (!name) { return { status: 'none', checked: today }; }
    const q = encodeURIComponent(name);
    let list = await client.get('series/?name=' + q + (year ? '&year_began=' + year : ''));
    let best = pickBest((list && list.results) || [], name, title);
    if (!best && year) {
        list = await client.get('series/?name=' + q);
        const near = ((list && list.results) || []).filter((c) => c.year_began && Math.abs(c.year_began - year) <= 1);
        best = pickBest(near, name, title);
    }
    if (!best) { return { status: 'none', checked: today }; }
    const d = (await client.get('series/' + best.id + '/')) || best;
    return {
        status: 'ok',
        checked: today,
        id: best.id,
        name: d.series || d.name || best.series || '',
        desc: cleanDescription(d.desc),
        genres: (d.genres || []).map((g) => g && g.name).filter(Boolean),
        publisher: (d.publisher && d.publisher.name) || '',
        seriesStatus: d.status || '',
        yearBegan: d.year_began || null,
        yearEnd: d.year_end || null,
        url: d.resource_url || ''
    };
}

/* Should this series be (re)checked today? */
function needsCheck(entry, todayMs) {
    if (!entry) { return true; }
    const age = (todayMs - Date.parse(entry.checked || '1970-01-01')) / 86400000;
    return entry.status === 'ok' ? age > 120 : age > 45;
}

module.exports = { MetronClient, StopMetron, matchSeries, needsCheck, siteNameYear, pickBest, normalize, cleanDescription };
