/*
 * KETSU Comics - shared helpers.
 *
 * This file is prepended to every section script (mainPage, search, info,
 * chapters) by build/build.js. It only contains plain functions with no
 * side effects, so it can also be loaded by the Node test-suite.
 *
 * Comments are fine here: the build step minifies the code and strips them
 * before the script is embedded into KETSU-Comics.json.
 */

var RCO_BASE = 'https://readcomicsonline.ru';
var RCO_CDN = 'https://cdn.readcomicsonline.ru';
var RCO_SITEMAP_INDEX = RCO_BASE + '/sitemap.xml';
var RCO_SITEMAP_COMICS = RCO_BASE + '/sitemap-comics.xml';
var RCO_POLL_MS = 400;
var RCO_LIVE_TIMEOUT_MS = 12000;

/* ---------- text helpers ---------- */

function rcoClean(text) {
    if (text === null || text === undefined) {
        return '';
    }
    return String(text).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function rcoDecodeEntities(text) {
    if (!text) {
        return '';
    }
    return String(text)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&#(\d+);/g, function (m, code) { return String.fromCharCode(parseInt(code, 10)); })
        .replace(/&#x([0-9a-f]+);/gi, function (m, code) { return String.fromCharCode(parseInt(code, 16)); })
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

/* Lower-case, strip accents and punctuation so "Spider-Man" ~ "spider man". */
function rcoNormalize(text) {
    var s = rcoClean(text).toLowerCase();
    if (s.normalize) {
        s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    s = s.replace(/&/g, ' and ').replace(/['\u2019]/g, '');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

function rcoCompact(text) {
    return rcoNormalize(text).replace(/ /g, '');
}

/* ---------- URL helpers ---------- */

function rcoAbsUrl(url) {
    var u = rcoClean(url);
    if (!u || /^(javascript|data|about|blob):/i.test(u) || u.charAt(0) === '#') {
        return '';
    }
    if (u.indexOf('//') === 0) {
        u = 'https:' + u;
    } else if (u.charAt(0) === '/') {
        u = RCO_BASE + u;
    } else if (!/^https?:\/\//i.test(u)) {
        u = RCO_BASE + '/' + u;
    }
    return u.replace(/^http:\/\//i, 'https://');
}

/*
 * Images: the site's own sitemap advertises cover images on
 * cdn.readcomicsonline.ru, and older pages still reference the same files on
 * the main host (which is behind the Cloudflare check, so KETSU's native image
 * loader cannot fetch them). Point /uploads/ files at the official CDN host.
 */
function rcoImageUrl(url) {
    var u = rcoAbsUrl(url);
    if (!u) {
        return '';
    }
    return u.replace(/^https:\/\/(www\.)?readcomicsonline\.ru\/uploads\//i, RCO_CDN + '/uploads/');
}

/* Small "cover_thumb" images are upgraded to the 250x350 cover. */
function rcoCoverUrl(url) {
    return rcoImageUrl(url).replace(/\/cover\/cover_thumb\.(jpe?g|png|webp)/i, '/cover/cover_250x350.$1');
}

function rcoCoverFromSlug(slug) {
    return slug ? RCO_CDN + '/uploads/manga/' + slug + '/cover/cover_250x350.jpg' : '';
}

/* https://readcomicsonline.ru/comic/<slug>[/<issue>] -> {slug, issue} */
function rcoParseComicUrl(url) {
    var u = rcoAbsUrl(url);
    var m = u.match(/^https:\/\/(?:www\.)?readcomicsonline\.ru\/comic\/([^\/?#]+)(?:\/([^\/?#]+))?/i);
    if (!m) {
        return null;
    }
    var slug = m[1];
    var issue = m[2] || '';
    try { slug = decodeURIComponent(slug); } catch (e) { }
    try { issue = decodeURIComponent(issue); } catch (e) { }
    return { slug: slug, issue: issue };
}

function rcoSeriesUrl(slug) {
    return RCO_BASE + '/comic/' + encodeURIComponent(slug);
}

/* Read a ketsu_* parameter from a URL without URLSearchParams (KETSU does not
 * always percent-encode what the user typed, so '&' may appear raw). */
function rcoGetParam(url, name, takeRest) {
    var s = String(url || '');
    var key = name + '=';
    var i = s.indexOf('?' + key);
    if (i < 0) {
        i = s.indexOf('&' + key);
    }
    if (i < 0) {
        return null;
    }
    var value = s.slice(i + key.length + 1);
    if (!takeRest) {
        var end = value.search(/[&#]/);
        if (end >= 0) {
            value = value.slice(0, end);
        }
    }
    return value;
}

function rcoDecodeQuery(raw) {
    if (raw === null || raw === undefined) {
        return '';
    }
    var s = String(raw).replace(/\+/g, ' ');
    try {
        s = decodeURIComponent(s);
    } catch (e) {
        s = s.replace(/%20/gi, ' ');
    }
    return rcoClean(s);
}

/* ---------- page state detection ---------- */

function rcoIsChallengePage(doc) {
    try {
        var title = rcoClean(doc.title).toLowerCase();
        if (title.indexOf('just a moment') >= 0 || title.indexOf('attention required') >= 0) {
            return true;
        }
        if (doc.querySelector('#challenge-error-text, #challenge-form, #cf-challenge-running, .cf-turnstile, #challenge-stage, script[src*="challenges.cloudflare.com"]')) {
            return true;
        }
        var body = doc.body ? rcoClean(doc.body.textContent).toLowerCase() : '';
        return body.indexOf('performing security verification') >= 0 || body.indexOf('verify you are human') >= 0 || body.indexOf('checking your browser') >= 0;
    } catch (e) {
        return false;
    }
}

function rcoIsNotFoundPage(doc) {
    try {
        var title = rcoClean(doc.title).toLowerCase();
        var h = doc.querySelector('h1, h2');
        var head = h ? rcoClean(h.textContent).toLowerCase() : '';
        return title.indexOf('404') >= 0 || title.indexOf('not found') >= 0 || head.indexOf('page not found') >= 0 || head === '404';
    } catch (e) {
        return false;
    }
}

/* Raw source of the loaded document, minus KETSU's own data div. Handles XML
 * that was parsed as HTML and XML that ended up entity-escaped as text. */
function rcoRawSource(doc) {
    var html = '';
    try {
        var root = doc.documentElement;
        html = root ? root.innerHTML : '';
        var saved = doc.getElementById('ketsu-final-data');
        if (saved && saved.innerHTML) {
            html = html.split(saved.innerHTML).join('');
        }
    } catch (e) { }
    if (html.indexOf('<loc') < 0 && html.indexOf('&lt;loc') >= 0) {
        html = rcoDecodeEntities(html);
    }
    return html;
}

/* ---------- sitemap parsing ---------- */

function rcoTagValue(block, tag) {
    var re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i');
    var m = block.match(re);
    return m ? rcoClean(rcoDecodeEntities(m[1])) : '';
}

/* Turns a series slug into a readable fallback title. */
function rcoTitleFromSlug(slug) {
    var words = String(slug || '').split('-');
    var year = '';
    if (words.length > 1 && /^(19|20)\d\d$/.test(words[words.length - 1])) {
        year = words.pop();
    }
    var title = words.map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join(' ');
    return year ? title + ' (' + year + ')' : title;
}

/* sitemap-comics.xml -> [{slug, url, title, cover, lastmod, order}] */
function rcoParseComicsSitemap(source) {
    var out = [];
    var seen = {};
    var blocks = String(source || '').split(/<url[\s>]/i);
    for (var i = 1; i < blocks.length; i++) {
        var block = blocks[i];
        var loc = rcoTagValue(block, 'loc');
        var parsed = rcoParseComicUrl(loc);
        if (!parsed || parsed.issue || seen[parsed.slug]) {
            continue;
        }
        seen[parsed.slug] = true;
        var title = rcoTagValue(block, 'image:caption') || rcoTitleFromSlug(parsed.slug);
        var cover = rcoCoverUrl(rcoTagValue(block, 'image:loc')) || rcoCoverFromSlug(parsed.slug);
        out.push({
            slug: parsed.slug,
            url: rcoSeriesUrl(parsed.slug),
            title: title,
            cover: cover,
            lastmod: rcoTagValue(block, 'lastmod'),
            order: out.length
        });
    }
    return out;
}

/* sitemap.xml (index) -> list of sitemap URLs */
function rcoParseSitemapIndex(source) {
    var out = [];
    var re = /<loc>([\s\S]*?)<\/loc>/gi;
    var m;
    while ((m = re.exec(String(source || ''))) !== null) {
        var u = rcoAbsUrl(rcoDecodeEntities(m[1]));
        if (u && out.indexOf(u) < 0) {
            out.push(u);
        }
    }
    return out;
}

/* sitemap-chapters-N.xml -> [{url, issue, lastmod}] for one series slug.
 * Entries are in upload order, so one series' issues are scattered through
 * the whole file (several MB): scan every occurrence of "/comic/<slug>/". */
function rcoParseChaptersSitemap(source, slug) {
    var out = [];
    var src = String(source || '');
    var needle = '/comic/' + slug + '/';
    var pos = src.indexOf(needle);
    while (pos >= 0) {
        var locStart = src.lastIndexOf('<loc>', pos);
        var locEnd = src.indexOf('</loc>', pos);
        if (locStart < 0 || locEnd < 0) {
            break;
        }
        var loc = rcoDecodeEntities(src.slice(locStart + 5, locEnd));
        var parsed = rcoParseComicUrl(loc);
        if (parsed && parsed.slug === slug && parsed.issue) {
            var after = src.slice(locEnd, locEnd + 120);
            var lm = after.match(/^<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/);
            out.push({ url: rcoAbsUrl(loc), issue: parsed.issue, lastmod: lm ? rcoClean(lm[1]) : '' });
        }
        pos = src.indexOf(needle, locEnd);
    }
    return out;
}

/* ---------- search ---------- */

/* True when the query, with spaces removed, starts at a word boundary of the
 * text with spaces removed: "spiderman" matches "amazing spider man", while
 * "man" does not match "spider woman". */
function rcoCompactWordMatch(normalizedText, qCompact) {
    var words = normalizedText.split(' ');
    for (var i = 0; i < words.length; i++) {
        if (words.slice(i).join('').indexOf(qCompact) === 0) {
            return true;
        }
    }
    return false;
}

function rcoSearchComics(comics, query, limit) {
    var q = rcoNormalize(query);
    if (!q) {
        return [];
    }
    var tokens = q.split(' ');
    var qCompact = q.replace(/ /g, '');
    var results = [];
    for (var i = 0; i < comics.length; i++) {
        var c = comics[i];
        var title = rcoNormalize(c.title);
        var titleNoYear = rcoNormalize(c.title.replace(/\([^)]*\)\s*$/, ''));
        var hay = ' ' + title + ' ' + rcoNormalize(c.slug.replace(/-/g, ' ')) + ' ';
        var all = true;
        for (var t = 0; t < tokens.length; t++) {
            if (hay.indexOf(' ' + tokens[t]) < 0) {
                all = false;
                break;
            }
        }
        if (!all && !rcoCompactWordMatch(title, qCompact) && !rcoCompactWordMatch(rcoNormalize(c.slug.replace(/-/g, ' ')), qCompact)) {
            continue;
        }
        var score = 1;
        if (titleNoYear === q || title === q) {
            score = 100;
        } else if (titleNoYear.indexOf(q) === 0) {
            score = 60;
        } else if (hay.indexOf(' ' + q + ' ') >= 0) {
            score = 40;
        } else if (hay.indexOf(' ' + q) >= 0) {
            score = 25;
        } else if (all) {
            score = 10;
        }
        results.push({ comic: c, score: score });
    }
    results.sort(function (a, b) {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        if (a.comic.lastmod !== b.comic.lastmod) {
            return a.comic.lastmod < b.comic.lastmod ? 1 : -1;
        }
        return a.comic.title.localeCompare(b.comic.title);
    });
    return results.slice(0, limit || 100).map(function (r) { return r.comic; });
}

/* ---------- issue numbering & ordering ---------- */

/*
 * Turns an issue label ("#12", "#12.1", "#Annual 3", "annual2022", "TPB-1")
 * into a sort key. Regular numbered issues come first in numeric order,
 * then specials (Annual, Special, TPB, ...) grouped by name and numbered.
 */
function rcoIssueKey(label) {
    var s = rcoClean(label);
    var hash = s.lastIndexOf('#');
    if (hash >= 0) {
        s = s.slice(hash + 1);
    }
    s = rcoClean(s.replace(/[_]+/g, ' '));
    var m = s.match(/^(-?\d+)(?:\.(\d+))?([a-z]*)$/i);
    if (m) {
        return { special: '', major: parseInt(m[1], 10), minor: m[2] ? parseInt(m[2], 10) : -1, suffix: (m[3] || '').toLowerCase(), text: s };
    }
    var word = s.replace(/[\d.\-\s]+/g, ' ').trim().toLowerCase();
    var num = s.match(/(\d+)(?:\.(\d+))?/);
    return {
        special: word || '~',
        major: num ? parseInt(num[1], 10) : -1,
        minor: num && num[2] ? parseInt(num[2], 10) : -1,
        suffix: '',
        text: s
    };
}

function rcoCompareIssues(a, b) {
    var ka = a.key;
    var kb = b.key;
    if (ka.special !== kb.special) {
        if (!ka.special) { return -1; }
        if (!kb.special) { return 1; }
        return ka.special < kb.special ? -1 : 1;
    }
    if (ka.major !== kb.major) { return ka.major - kb.major; }
    if (ka.minor !== kb.minor) { return ka.minor - kb.minor; }
    if (ka.suffix !== kb.suffix) { return ka.suffix < kb.suffix ? -1 : 1; }
    return a.index - b.index;
}

/* Readable label from an issue URL slug: "Annual-3" -> "Annual 3", "12" -> "#12" */
function rcoIssueLabelFromSlug(issueSlug) {
    var s = rcoClean(String(issueSlug || '').replace(/[-_]+/g, ' '));
    if (/^-?\d+(\.\d+)?[a-z]*$/i.test(s)) {
        return '#' + s;
    }
    s = s.replace(/([a-z])(\d)/gi, '$1 $2').replace(/(\d)([a-z])/gi, '$1 $2');
    return '#' + s.charAt(0).toUpperCase() + s.slice(1);
}

/* Remove the series title from "Batman (2016-) #162" -> "#162". */
function rcoShortIssueName(label, seriesTitle) {
    var s = rcoClean(label);
    var t = rcoClean(seriesTitle);
    if (t && s.toLowerCase().indexOf(t.toLowerCase()) === 0 && s.length > t.length) {
        s = rcoClean(s.slice(t.length));
    }
    return s || rcoClean(label);
}

/* items: [{name, url, date}] -> deduped, sorted ascending (issue 1 first). */
function rcoSortIssues(items) {
    var seen = {};
    var list = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || !it.url || seen[it.url]) {
            continue;
        }
        seen[it.url] = true;
        var parsed = rcoParseComicUrl(it.url);
        var keySource = it.name && it.name.indexOf('#') >= 0 ? it.name : (parsed ? parsed.issue : it.name);
        list.push({ name: it.name, url: it.url, date: it.date || '', key: rcoIssueKey(keySource), index: list.length });
    }
    list.sort(rcoCompareIssues);
    return list;
}

/* ---------- reader pages ---------- */

function rcoPageNumberFromUrl(url) {
    var file = String(url).split('?')[0].split('/').pop() || '';
    var m = file.match(/(\d+)(?=\.[a-z0-9]+$)/i) || file.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

/* Keep first occurrence order; if every page file is numbered, sort by it. */
function rcoOrderPages(urls) {
    var seen = {};
    var list = [];
    for (var i = 0; i < urls.length; i++) {
        var u = rcoImageUrl(urls[i]);
        if (!u || seen[u] || !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)) {
            continue;
        }
        seen[u] = true;
        list.push({ url: u, n: rcoPageNumberFromUrl(u), index: list.length });
    }
    var allNumbered = list.length > 0 && list.every(function (p) { return p.n !== null; });
    if (allNumbered) {
        list.sort(function (a, b) { return a.n !== b.n ? a.n - b.n : a.index - b.index; });
    }
    return list.map(function (p) { return p.url; });
}

/* Extracts page image URLs from a reader page (several strategies). */
function rcoExtractPageImages(doc, pageUrl) {
    var urls = [];
    var i;
    var imgs = doc.querySelectorAll('#all img, img.scan-page, #ppp img, .viewer-cnt img, .reading-content img');
    for (i = 0; i < imgs.length; i++) {
        var src = imgs[i].getAttribute('data-src') || imgs[i].getAttribute('data-lazy-src') || imgs[i].getAttribute('src') || '';
        if (src && src.indexOf('/uploads/') >= 0) {
            urls.push(src);
        }
    }
    var raw = rcoRawSource(doc);
    if (urls.length === 0) {
        var pagesMatch = raw.match(/var\s+pages\s*=\s*(\[[\s\S]*?\])\s*;/);
        var parsed = rcoParseComicUrl(pageUrl);
        if (pagesMatch && parsed && parsed.issue) {
            try {
                var pages = JSON.parse(pagesMatch[1]);
                var base = RCO_CDN + '/uploads/manga/' + parsed.slug + '/chapters/' + parsed.issue + '/';
                for (i = 0; i < pages.length; i++) {
                    var p = pages[i] || {};
                    var img = p.page_image || p.image || '';
                    if (!img) { continue; }
                    urls.push(String(p.external) === '1' || /^https?:|^\/\//.test(img) ? img : base + img);
                }
            } catch (e) { }
        }
    }
    if (urls.length === 0) {
        var re = /(?:https?:)?\/\/(?:cdn\.)?readcomicsonline\.ru\/uploads\/manga\/[^"'\s<>]+?\/chapters\/[^"'\s<>]+?\.(?:jpe?g|png|webp|gif)/gi;
        var m;
        while ((m = re.exec(raw)) !== null) {
            urls.push(m[0]);
        }
    }
    return rcoOrderPages(urls);
}

/* ---------- KETSU plumbing ---------- */

function rcoSavedData() {
    return document.getElementById('ketsu-final-data');
}

/* textContent first: it gives the JSON with HTML entities already decoded
 * (innerHTML would turn '&' inside URLs into '&amp;'). */
function rcoReadParsedJson() {
    var saved = rcoSavedData();
    var attempts = [
        function () { return saved.textContent; },
        function () { return saved.innerHTML; },
        function () { return rcoDecodeEntities(saved.innerHTML); }
    ];
    for (var i = 0; i < attempts.length; i++) {
        try {
            var parsed = JSON.parse(attempts[i]());
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (e) { }
    }
    return { request: { url: '' }, output: null, extra: null };
}

/* JSON with <, > and & written as <, >, &. JSON.parse turns them
 * back into the real characters, and the text survives being stored in (and
 * read back from) an HTML element unchanged, whichever way KETSU reads it. */
function rcoHtmlSafeJson(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, function (c) {
        return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
}

var rcoFinished = false;

function rcoPost(handler, value) {
    try {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[handler]) {
            window.webkit.messageHandlers[handler].postMessage(value === undefined ? '' : value);
        }
    } catch (e) { }
}

function rcoLog(message) {
    try { console.log('[KETSU Comics] ' + message); } catch (e) { }
    rcoPost('KETSU_LOG', '[KETSU Comics] ' + message);
}

/* Writes the result for KETSU and releases the async wait exactly once. */
function rcoFinish(resultObject) {
    if (rcoFinished) {
        return;
    }
    rcoFinished = true;
    try {
        rcoSavedData().innerHTML = rcoHtmlSafeJson(resultObject);
    } catch (e) {
        rcoLog('could not write result: ' + e.message);
    }
    rcoPost('EXECUTE_KETSU_ASYNC', '');
}

/* Polls until check() returns a truthy value, the page shows a Cloudflare
 * challenge for too long, or the timeout is reached. */
function rcoWaitFor(check, timeoutMs, done) {
    var started = Date.now();
    function tick() {
        var result = null;
        try { result = check(); } catch (e) { result = null; }
        if (result || Date.now() - started >= timeoutMs) {
            done(result || null);
            return;
        }
        setTimeout(tick, RCO_POLL_MS);
    }
    tick();
}

function rcoKV(key, value) {
    return { key: key, value: value };
}

function rcoGetExtra(parsedJson, key) {
    try {
        var list = parsedJson.extra.extraInfo || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].key === key) {
                return list[i].value;
            }
        }
    } catch (e) { }
    return '';
}

/* Link target for informational cells. A tiny public file is used so that
 * tapping a notice never triggers a heavy or challenged request; the info
 * script recognises ketsu_notice and shows an explanation page. */
function rcoNoticeUrl(code) {
    return RCO_BASE + '/sitemap-pages.xml?ketsu_notice=' + encodeURIComponent(code || 'info');
}

/*
 * Links used inside KETSU. The site's own series and issue pages are behind
 * Cloudflare's check, which KETSU cannot pass, so:
 *   - a series opens through the public sitemap index (the info script then
 *     reads the issue list from the public sitemaps),
 *   - an issue opens through the image server's small public robots.txt, so
 *     the reader script runs on the image server's own address and can check
 *     which page files exist with cheap HEAD requests.
 * The ketsu_* parameters are ignored by the servers; they only carry the
 * series/issue to the scripts.
 */
function rcoInfoUrl(slug, title) {
    return RCO_SITEMAP_INDEX + '?ketsu_slug=' + encodeURIComponent(slug) + (title ? '&ketsu_title=' + encodeURIComponent(title) : '');
}

function rcoReaderUrl(slug, issue) {
    return RCO_CDN + '/robots.txt?ketsu_slug=' + encodeURIComponent(slug) + '&ketsu_issue=' + encodeURIComponent(issue);
}

/* ---------- dates ---------- */

var RCO_DAY_MS = 86400000;

function rcoAgeText(iso, now) {
    var t = Date.parse(iso);
    if (!t) {
        return '';
    }
    var days = Math.floor((now - t) / RCO_DAY_MS);
    if (days <= 0) { return 'today'; }
    if (days === 1) { return 'yesterday'; }
    if (days < 60) { return days + ' days ago'; }
    if (days < 730) { return Math.round(days / 30.4) + ' months ago'; }
    return Math.round(days / 365.25) + ' years ago';
}

/* First year of a series, from "(2016-)" in its title or "-2016" at the end
 * of its slug; 0 when unknown. */
function rcoSeriesStartYear(slug, title) {
    var m = String(title || '').match(/\((\d{4})/) || String(slug || '').match(/-(\d{4})(?:\d{4})?-?$/);
    return m ? parseInt(m[1], 10) : 0;
}

/* "169 issues - newest: #162, 11 months ago" from [{url|issue, date}] */
function rcoIssueStatsLine(issues, now) {
    if (!issues || !issues.length) {
        return 'No issues are listed for this series yet.';
    }
    var newest = null;
    issues.forEach(function (it) {
        var t = Date.parse(it.date || '');
        if (t && (!newest || t > newest.t)) {
            newest = { t: t, it: it };
        }
    });
    var line = issues.length + (issues.length === 1 ? ' issue' : ' issues');
    if (newest) {
        var issue = newest.it.issue || ((rcoParseComicUrl(newest.it.url) || {}).issue) || '';
        line += ' \u00b7 newest: ' + (issue ? rcoIssueLabelFromSlug(issue) + ', ' : '') + rcoAgeText(newest.it.date, now);
    }
    return line;
}

/* ---------- optional GitHub index ----------
 * A small daily-built copy of the site's public index (see the
 * ReadComicsOnline-Index folder). Set at build time from
 * build/config.json; '' means the module works without it.
 */
var RCO_INDEX_URL = '';
var rcoUseIndexLinks = false;

function rcoIndexFileName(slug) {
    return encodeURIComponent(String(slug || '')).replace(/[!~*'()]/g, function (c) {
        return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    }).replace(/%/g, '_');
}

function rcoIndexSeriesPath(slug) {
    var name = rcoIndexFileName(slug);
    var shard = (name + '__').slice(0, 2).toLowerCase();
    return 'series/' + shard + '/' + name + '.json';
}

function rcoIndexSeriesUrl(slug, title) {
    return RCO_INDEX_URL + rcoIndexSeriesPath(slug) + '?ketsu_slug=' + encodeURIComponent(slug) + (title ? '&ketsu_title=' + encodeURIComponent(title) : '');
}

function rcoIsIndexUrl(url) {
    return !!RCO_INDEX_URL && String(url || '').indexOf(RCO_INDEX_URL) === 0;
}

/* Link for a series card: straight into the index when this screen was built
 * from the index; otherwise the public-sitemap route (told to skip the index
 * when the index is configured but just failed). */
function rcoCardUrl(slug, title) {
    if (RCO_INDEX_URL && rcoUseIndexLinks) {
        return rcoIndexSeriesUrl(slug, title);
    }
    return rcoInfoUrl(slug, title) + (RCO_INDEX_URL ? '&ketsu_noindex=1' : '');
}

/* index catalog.json / home.json -> the same series objects the sitemap
 * parser returns. Entries: [slug, title, lastmod, catalogue position?] */
function rcoComicsFromIndex(data) {
    if (!data || !data.series || !data.series.length) {
        return [];
    }
    return data.series.map(function (s, i) {
        return { slug: s[0], url: rcoSeriesUrl(s[0]), title: s[1] || rcoTitleFromSlug(s[0]), cover: rcoCoverFromSlug(s[0]), lastmod: s[2] || '', order: typeof s[3] === 'number' ? s[3] : i };
    });
}

/* End position of the JSON object that starts at s[start] ('{'), or -1. */
function rcoScanJsonObject(s, start) {
    var depth = 0;
    var inString = false;
    for (var i = start; i < s.length; i++) {
        var c = s.charAt(i);
        if (inString) {
            if (c === '\\') { i++; } else if (c === '"') { inString = false; }
        } else if (c === '"') {
            inString = true;
        } else if (c === '{') {
            depth++;
        } else if (c === '}') {
            depth--;
            if (depth === 0) { return i; }
        }
    }
    return -1;
}

/* Reads an index file out of the loaded page, however KETSU wrapped it
 * (as text, inside a <pre>, or inside a script comment). Returns the object,
 * or null when the page is not a valid index file. */
function rcoExtractIndexJson(doc) {
    var marker = '{"rco' + 'Index":';
    var sources = [];
    try {
        var saved = doc.getElementById('ketsu-final-data');
        var savedText = saved ? saved.textContent : '';
        if (doc.body) { sources.push(doc.body.textContent.split(savedText).join('')); }
        var scripts = doc.querySelectorAll('script');
        for (var i = 0; i < scripts.length; i++) { sources.push(scripts[i].innerHTML); }
        sources.push(rcoDecodeEntities(rcoRawSource(doc)));
    } catch (e) { }
    for (var j = 0; j < sources.length; j++) {
        var s = String(sources[j] || '');
        var at = s.indexOf(marker);
        while (at >= 0) {
            var end = rcoScanJsonObject(s, at);
            if (end > at) {
                try {
                    var obj = JSON.parse(s.slice(at, end + 1));
                    if (obj && obj.rcoIndex === 1) { return obj; }
                } catch (e2) { }
            }
            at = s.indexOf(marker, at + 1);
        }
    }
    return null;
}
