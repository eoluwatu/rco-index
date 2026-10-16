/*
 * Tests for metron.js against a simulated Metron API.   node test-metron.js
 * Response shapes follow Metron's own API documentation (api/README.md).
 * The real API is only used on GitHub, with your METRON_TOKEN secret.
 */
'use strict';

const assert = require('assert');
const { MetronClient, StopMetron, matchSeries, needsCheck, siteNameYear, cleanDescription } = require('./metron');

let passed = 0;
let failed = 0;
async function test(name, fn) {
    try { await fn(); passed++; console.log('  PASS  ' + name); } catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}

/* fake Metron: routes = { 'series/?name=Batman&year_began=2016': body | fn } */
function fakeMetron(routes, opts) {
    opts = opts || {};
    const calls = [];
    const sleeps = [];
    const fetch = async (url, init) => {
        const key = url.replace('https://metron.cloud/api/', '');
        calls.push({ key, auth: init.headers.Authorization });
        let route = routes[key];
        if (typeof route === 'function') { route = route(calls.length); }
        const status = route && typeof route.status === 'number' ? route.status : (route ? 200 : 404);
        const headers = Object.assign({
            'X-RateLimit-Burst-Remaining': '19', 'X-RateLimit-Burst-Reset': '0',
            'X-RateLimit-Sustained-Remaining': '4900'
        }, (route && route.headers) || {});
        return {
            status,
            ok: status >= 200 && status < 300,
            headers: { get: (n) => (n in headers ? headers[n] : null) },
            json: async () => (route && route.body !== undefined ? route.body : route)
        };
    };
    const client = new MetronClient('TEST-TOKEN', 'test-agent', { fetch, sleep: async (ms) => { sleeps.push(ms); }, maxRequests: opts.maxRequests || 100 });
    return { client, calls, sleeps };
}

const batmanList = {
    count: 3,
    results: [
        { id: 11, series: 'Batman (2016)', year_began: 2016, issue_count: 150, series_type: { id: 1, name: 'Ongoing Series' } },
        { id: 12, series: 'Batman (2016)', year_began: 2016, issue_count: 12, series_type: { id: 5, name: 'Trade Paperback' } },
        { id: 13, series: 'Batman Beyond (2016)', year_began: 2016, issue_count: 50, series_type: { id: 1, name: 'Ongoing Series' } }
    ]
};
const batmanDetail = {
    id: 11, series: 'Batman (2016)', year_began: 2016, year_end: 2024, status: 'completed',
    desc: '<p>The Dark Knight&#039;s &amp; Gotham&#39;s story.</p><p>Second paragraph.</p>',
    genres: [{ id: 1, name: 'Super-Hero' }],
    publisher: { id: 2, name: 'DC Comics' },
    resource_url: 'https://metron.cloud/series/batman-2016/'
};

(async () => {
    console.log('metron.js');

    await test('site title -> name + start year', () => {
        assert.deepStrictEqual(siteNameYear('batman-2016', 'Batman (2016-)'), { name: 'Batman', year: 2016 });
        assert.deepStrictEqual(siteNameYear('invincible-compendium-20112018', 'Invincible Compendium (2011-2018)'), { name: 'Invincible Compendium', year: 2011 });
        assert.deepStrictEqual(siteNameYear('batman-the-killing-joke', 'Batman: The Killing Joke'), { name: 'Batman: The Killing Joke', year: 0 });
    });
    await test('exact name + year: picks the ongoing series, not the trade paperback or a different title', async () => {
        const { client, calls } = fakeMetron({ 'series/?name=Batman&year_began=2016': batmanList, 'series/11/': batmanDetail });
        const e = await matchSeries(client, 'batman-2016', 'Batman (2016-)', '2026-10-16');
        assert.strictEqual(e.status, 'ok');
        assert.strictEqual(e.id, 11);
        assert.strictEqual(e.publisher, 'DC Comics');
        assert.deepStrictEqual(e.genres, ['Super-Hero']);
        assert.strictEqual(e.seriesStatus, 'completed');
        assert.strictEqual(e.yearBegan, 2016);
        assert.strictEqual(e.yearEnd, 2024);
        assert.strictEqual(e.desc, 'The Dark Knight\'s & Gotham\'s story.\n\nSecond paragraph.');
        assert.deepStrictEqual(calls.map((c) => c.key), ['series/?name=Batman&year_began=2016', 'series/11/', 'issue/?series_id=11&number=1'], 'short blurb -> looks for issue #1');
        assert.ok(calls.every((c) => c.auth === 'Bearer TEST-TOKEN'), 'token sent as Bearer');
    });
    await test('a collected edition on the site prefers Metron\'s collected-edition series', async () => {
        const list = { results: [
            { id: 21, series: 'Invincible Compendium (2011)', year_began: 2011, issue_count: 3, series_type: { name: 'Trade Paperback' } },
            { id: 22, series: 'Invincible Compendium (2011)', year_began: 2011, issue_count: 9, series_type: { name: 'Ongoing Series' } }
        ] };
        const { client } = fakeMetron({ 'series/?name=Invincible%20Compendium&year_began=2011': list, 'series/21/': { id: 21, desc: 'x' } });
        const e = await matchSeries(client, 'invincible-compendium-20112018', 'Invincible Compendium (2011-2018)', '2026-10-16');
        assert.strictEqual(e.id, 21);
    });
    await test('year off by one is accepted; up to 3 only when it is the only exact-name series', async () => {
        const near = { results: [{ id: 31, series: 'Saga (2012)', year_began: 2012, issue_count: 66 }] };
        let f = fakeMetron({ 'series/?name=Saga&year_began=2013': { results: [] }, 'series/?name=Saga': near, 'series/31/': { id: 31, desc: 'Space opera.' } });
        let e = await matchSeries(f.client, 'saga-2013', 'Saga (2013-)', '2026-10-16');
        assert.strictEqual(e.status, 'ok');
        f = fakeMetron({ 'series/?name=Saga&year_began=2014': { results: [] }, 'series/?name=Saga': near, 'series/31/': { id: 31, desc: 'Space opera.' } });
        e = await matchSeries(f.client, 'saga-2014', 'Saga (2014-)', '2026-10-16');
        assert.strictEqual(e.status, 'ok', 'only exact-name series within 3 years -> accepted');
        f = fakeMetron({ 'series/?name=Saga&year_began=2016': { results: [] }, 'series/?name=Saga': near });
        e = await matchSeries(f.client, 'saga-2016', 'Saga (2016-)', '2026-10-16');
        assert.strictEqual(e.status, 'none', '4 years apart -> not accepted');
        const two = { results: [{ id: 41, series: 'Hawkeye (2012)', year_began: 2012 }, { id: 42, series: 'Hawkeye (2016)', year_began: 2016 }] };
        f = fakeMetron({ 'series/?name=Hawkeye&year_began=2014': { results: [] }, 'series/?name=Hawkeye': two });
        e = await matchSeries(f.client, 'hawkeye-2014', 'Hawkeye (2014-)', '2026-10-16');
        assert.strictEqual(e.status, 'none', 'two possible series -> no guessing');
    });
    await test('no match -> "none", so it is not asked again for 45 days', async () => {
        const { client } = fakeMetron({ 'series/?name=Nonexistent&year_began=2020': { results: [] }, 'series/?name=Nonexistent': { results: [] } });
        const e = await matchSeries(client, 'nonexistent-2020', 'Nonexistent (2020-)', '2026-10-16');
        assert.deepStrictEqual(e, { status: 'none', checked: '2026-10-16', mv: 2 });
        const today = Date.parse('2026-10-16');
        assert.strictEqual(needsCheck(e, today + 10 * 86400000), false);
        assert.strictEqual(needsCheck(e, today + 46 * 86400000), true);
        assert.strictEqual(needsCheck({ status: 'ok', checked: '2026-10-16', mv: 2 }, today + 100 * 86400000), false);
        assert.strictEqual(needsCheck({ status: 'ok', checked: '2026-10-16', mv: 2 }, today + 121 * 86400000), true);
        assert.strictEqual(needsCheck(undefined, today), true);
    });
    await test('"Amazing Spider-Man" on the site matches Metron\'s "The Amazing Spider-Man"', async () => {
        const list = { results: [{ id: 51, series: 'The Amazing Spider-Man (2018)', year_began: 2018, issue_count: 93, series_type: { name: 'Ongoing Series' } }] };
        const { client } = fakeMetron({ 'series/?name=Amazing%20Spider-Man&year_began=2018': list, 'series/51/': { id: 51, desc: 'x'.repeat(200) } });
        const e = await matchSeries(client, 'amazing-spiderman-2018', 'Amazing Spider-Man (2018-)', '2026-10-16');
        assert.strictEqual(e.status, 'ok');
        assert.strictEqual(e.id, 51);
        assert.strictEqual(e.descSource, 'series', 'long series description kept, no issue lookups');
    });
    await test('short series blurb -> issue #1 description is used instead', async () => {
        const { client } = fakeMetron({
            'series/?name=Batman&year_began=2016': batmanList,
            'series/11/': Object.assign({}, batmanDetail, { desc: 'The DC Rebirth relaunch of Batman.' }),
            'issue/?series_id=11&number=1': { results: [{ id: 901, number: '1' }] },
            'issue/901/': { id: 901, desc: '"I AM GOTHAM" part one! No one has ever stopped the Caped Crusader. Not The Joker. Not Two-Face. But how does Batman confront a new hero who wants to save the city?', desc_is_solicitation: true }
        });
        const e = await matchSeries(client, 'batman-2016', 'Batman (2016-)', '2026-10-16');
        assert.ok(e.desc.startsWith('"I AM GOTHAM" part one!'), e.desc);
        assert.strictEqual(e.descSource, 'issue1');
        assert.strictEqual(e.mv, 2);
    });
    await test('series checked under the old rules are checked again (no match, or short description)', () => {
        const today = Date.parse('2026-10-17');
        assert.strictEqual(needsCheck({ status: 'none', checked: '2026-10-16' }, today), true);
        assert.strictEqual(needsCheck({ status: 'ok', checked: '2026-10-16', desc: 'Short.' }, today), true);
        assert.strictEqual(needsCheck({ status: 'ok', checked: '2026-10-16', desc: 'x'.repeat(300) }, today), false);
        assert.strictEqual(needsCheck({ status: 'none', checked: '2026-10-16', mv: 2 }, today), false);
        assert.strictEqual(needsCheck({ status: 'ok', checked: '2026-10-16', desc: 'Short.', mv: 2 }, today), false);
    });
    await test('never more than one request every 3.1 seconds', async () => {
        const { client, sleeps } = fakeMetron({ 'series/?name=Batman&year_began=2016': batmanList, 'series/11/': batmanDetail });
        await matchSeries(client, 'batman-2016', 'Batman (2016-)', '2026-10-16');
        assert.ok(sleeps.length >= 1 && sleeps.every((ms) => ms >= 3000 && ms <= 3100), JSON.stringify(sleeps));
    });
    await test('HTTP 429: waits exactly Retry-After, then retries', async () => {
        const { client, sleeps } = fakeMetron({
            'series/11/': (n) => (n === 1 ? { status: 429, headers: { 'Retry-After': '42' } } : batmanDetail)
        });
        const d = await client.get('series/11/');
        assert.strictEqual(d.id, 11);
        assert.ok(sleeps.includes(42000), JSON.stringify(sleeps));
    });
    await test('burst counter at 0: pauses until the reset time', async () => {
        const reset = Math.floor(Date.now() / 1000) + 30;
        const { client, sleeps } = fakeMetron({ 'series/11/': { body: batmanDetail, headers: { 'X-RateLimit-Burst-Remaining': '0', 'X-RateLimit-Burst-Reset': String(reset) } } });
        await client.get('series/11/');
        await client.get('series/11/');
        assert.ok(sleeps.some((ms) => ms > 25000), JSON.stringify(sleeps));
    });
    await test('daily limit nearly used, bad token, or run budget used -> stops cleanly', async () => {
        let f = fakeMetron({ 'series/11/': { body: batmanDetail, headers: { 'X-RateLimit-Sustained-Remaining': '10' } } });
        await f.client.get('series/11/');
        await assert.rejects(f.client.get('series/11/'), StopMetron);
        f = fakeMetron({ 'series/11/': { status: 401 } });
        await assert.rejects(f.client.get('series/11/'), (e) => e instanceof StopMetron && /METRON_TOKEN/.test(e.message));
        f = fakeMetron({ 'series/11/': batmanDetail }, { maxRequests: 2 });
        await f.client.get('series/11/');
        await f.client.get('series/11/');
        await assert.rejects(f.client.get('series/11/'), StopMetron);
    });
    await test('descriptions: HTML removed, entities decoded, very long text shortened', () => {
        assert.strictEqual(cleanDescription('<b>Bold</b> &amp; <i>more</i><br>next'), 'Bold & more\nnext');
        const long = cleanDescription('word '.repeat(1000));
        assert.ok(long.length <= 1501 && long.endsWith('\u2026'));
    });

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
})();
