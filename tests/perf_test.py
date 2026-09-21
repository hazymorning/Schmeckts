#!/usr/bin/env python3
"""Performance after a rating (saving, then the evaluation and the redraw of the home page) and when opening the
evaluation page, with made-up data spanning 2 and 5 years (2 pets, 2 meals a day, 150 varieties), the CPU throttled
4x. Usage: python3 tests/perf_test.py"""
import datetime, json, random, statistics
from common import check, phone, run_tests, started

LIMIT_MS = 40
REPORT_MS = 150   # the evaluation is only computed and drawn when it opens
TUESDAY = datetime.datetime(2026, 6, 9, 10)  # on a Tuesday „Letzte Woche“ is on the home page as well
BRANDS = ['Sheba', 'Felix', 'Animonda', 'Miamor', 'Gourmet', 'Whiskas', 'Catz', 'MjAMjAM', 'Bozita', 'Almo']
FLAVORS = ['Lachs', 'Huhn', 'Rind', 'Pute', 'Ente', 'Thunfisch', 'Lamm', 'Kaninchen', 'Wild', 'Forelle', 'Käse', 'Leber', 'Herz', 'Garnele', 'Kalb']
TEXTURES = ['in Soße', 'in Gelee', 'Pastete', 'Mousse', 'Filets']


def household(years):
    rnd, day, now = random.Random(7), 864e5, TUESDAY.timestamp() * 1000
    pets = [{'id': 'petminka001', 'name': 'Minka', 'species': 'Katze', 'photo': None, 'createdAt': 1},
            {'id': 'pettiger001', 'name': 'Tiger', 'species': 'Katze', 'photo': None, 'createdAt': 2}]
    products = [{'id': f'sorte{i:05d}', 'brand': BRANDS[i % 10], 'variety': f'{FLAVORS[i % 15]} {TEXTURES[i % 5]}', 'type': 'Nassfutter', 'animal': 'Katze',
                 'thumb': None, 'lastPets': [], 'createdAt': i, 'codes': {}} for i in range(150)]
    liking = {(p['id'], x['id']): rnd.random() for p in pets for x in products}
    servings = []
    for n in range(int(years * 365) * 2):
        at, sort = int(now - 3 * 3600e3 - n * day / 2), products[rnd.randrange(150)]['id']
        rated = {p['id']: {'r': rnd.choices(['top', 'gut', 'mittel', 'sosse', 'schlecht'], [liking[p['id'], sort] * 4, 2, 1, 1, (1 - liking[p['id'], sort]) * 4])[0],
                           'at': at + 3600e3, 'by': 'Anna'} for p in pets}
        servings.append({'id': f'mahl{n:06d}', 'productId': sort, 'servedAt': at, 'note': '', 'by': ('Anna', 'Jonas')[n % 2], 'pets': rated})
    return {'version': 3, 'pets': pets, 'products': products, 'servings': servings}


MEASURE = """async () => { const s = await import('./js/store.js'), h = await import('./js/views/home.js');
  const meal = s.db.servings[0], out = [];
  for (const r of ['top', 'schlecht', 'gut', 'mittel', 'sosse', 'top', 'schlecht', 'gut', 'mittel', 'sosse', 'top']) {
    meal.pets.petminka001 = {r, at: Date.now()};
    const t0 = performance.now(); s.save(); const t1 = performance.now(); h.renderHome(); const t2 = performance.now();
    out.push([t1 - t0, t2 - t1, !!document.querySelector('[data-sec=week]')]); await new Promise(done => setTimeout(done, 50)); }
  return out; }"""

# The evaluation is only computed when it opens: save beforehand so that nothing comes from the cache
OPEN = """async () => { const s = await import('./js/store.js'), sheet = await import('./js/ui/sheet.js'), views = await import('./js/views/sheets.js');
  const out = [];
  for (let i = 0; i < 5; i++) {
    await sheet.closeSheet(); s.save();
    await new Promise(done => setTimeout(done, 50));
    const t0 = performance.now(); sheet.openSheet(views.reportState(null)); const t1 = performance.now();
    out.push([t1 - t0, document.querySelectorAll('#sheetBody .tl-day').length]); }
  await sheet.closeSheet();
  return out; }"""


async def test_rating(browser, url):
    print(f'After a rating, CPU throttled 4x (limit for the evaluation and the redraw: {LIMIT_MS} ms)')
    for years in (2, 5):
        ctx = await phone(browser)
        await ctx.clock.install(time=TUESDAY)
        seed = await ctx.new_page()
        await seed.goto(url)
        await seed.evaluate("([db, prefs]) => { localStorage.setItem('schmeckts-v3', db); localStorage.setItem('schmeckts-prefs', prefs); }",
                            [json.dumps(household(years)), json.dumps({'mode': 'lokal'})])
        await seed.close()
        pg = await ctx.new_page()
        await pg.goto(url); await started(pg)
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        runs = (await pg.evaluate(MEASURE))[2:]
        save, draw = (statistics.median(x[i] for x in runs) for i in (0, 1))
        check(draw < LIMIT_MS and all(x[2] for x in runs), f'{years} years ({years * 730} meals): evaluation and redraw {draw:.0f} ms, saving {save:.0f} ms')
        opens = (await pg.evaluate(OPEN))[1:]
        shown = statistics.median(x[0] for x in opens)
        check(shown < REPORT_MS and all(x[1] == 20 for x in opens),
              f'{years} years: the evaluation opens in {shown:.0f} ms (limit {REPORT_MS} ms), {opens[0][1]} days to begin with')
        await ctx.close()


run_tests({'rating': test_rating})
