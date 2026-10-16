/*
 * KETSU Comics - "Trending" picks, shared by the module's main page and the
 * GitHub index generator.
 *
 * Trending = series with a new issue uploaded in the last 10 days (30 if
 * fewer than 8). Well-known series first (All-Time Popular, then
 * Recommended), then series with at least monthly uploads over the past year,
 * newest first. Needs home-data.js (the curated lists) and helpers.js.
 */

var RCO_TRENDING_COUNT = 30;
var RCO_TRENDING_DAYS = 10;
var RCO_TRENDING_MIN = 8;

/* issue sitemap source -> the Trending picks [{slug, issue, iso}] (no titles
 * yet: the issue sitemap has none; the catalogue step adds them). */
function rcoTrendingPicks(source, now) {
    var re = /<loc>([^<]*)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g;
    var yearCount = {};
    var latest = {};
    var m;
    while ((m = re.exec(source)) !== null) {
        var parsed = rcoParseComicUrl(rcoDecodeEntities(m[1]));
        var t = Date.parse(m[2]);
        if (!parsed || !parsed.issue || !t) {
            continue;
        }
        if (now - t <= 365 * RCO_DAY_MS) {
            yearCount[parsed.slug] = (yearCount[parsed.slug] || 0) + 1;
        }
        if (!latest[parsed.slug] || latest[parsed.slug].t < t) {
            latest[parsed.slug] = { t: t, issue: parsed.issue, iso: m[2] };
        }
    }

    function candidates(days) {
        return Object.keys(latest).filter(function (slug) { return now - latest[slug].t <= days * RCO_DAY_MS; });
    }
    var slugs = candidates(RCO_TRENDING_DAYS);
    if (slugs.length < RCO_TRENDING_MIN) {
        slugs = candidates(30);
    }

    var recommended = {};
    RCO_RECOMMENDED.forEach(function (r) { recommended[r[0]] = true; });
    function boost(slug) {
        var rank = RCO_ALL_TIME_POPULAR.indexOf(slug);
        if (rank >= 0) { return 2000 - rank; }
        return recommended[slug] ? 1000 : 0;
    }
    slugs.sort(function (a, b) {
        var d = boost(b) - boost(a);
        if (d) { return d; }
        d = Math.min(yearCount[b] || 0, 12) - Math.min(yearCount[a] || 0, 12);
        if (d) { return d; }
        return latest[b].t - latest[a].t;
    });

    return slugs.slice(0, RCO_TRENDING_COUNT).map(function (slug) {
        return { slug: slug, issue: latest[slug].issue, iso: latest[slug].iso };
    });
}
