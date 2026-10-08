"""One-off capture of a club's Halsail season, for migrating it into Sail Scoring.

Pulls every series of the season from Halsail's JSON API and saves the raw
responses to disk, so the conversion into .sailscoring files can be iterated on
without hitting Halsail again. Read-only; nothing is written anywhere but --out.

    HALSAIL_API_KEY=... python scripts/halsail_capture.py --club 3725 --season 2026

Output (default .capture/halsail-<season>/, git-ignored — it holds people's
names exactly as Halsail publishes them, so it must never be committed):
    raw/<Endpoint>_<id>.json   every API response, cached (re-runs reuse them;
                               --refresh refetches)
    inventory.json             the season's series, races, starts and counts
    inventory.md               the same, human-readable — boat/class level
                               only, no people's names

Series discovery: GetSchedule lists only scheduled series, but a club's real
scored series can be more than that (e.g. an IRC series off the same races).
The public results page embeds the full class catalogue with each class's
series per season (see netlify/functions/halsail-class-map.js), so every
series listed there is checked too and kept when any of its races start in
--season. Halsail lists a class's series most-recent-first, so a class is
abandoned at its first series that ended before the season.

Key: header `halsailapikey` (never printed). Polite: one request at a time,
--delay seconds apart.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

BASE = os.environ.get('HALSAIL_API_BASE', 'https://halsail.com').rstrip('/')


class Halsail:
    def __init__(self, key, raw_dir, delay, refresh):
        self.key, self.raw_dir, self.delay, self.refresh = key, raw_dir, delay, refresh
        self.requests = 0

    def _get(self, url, headers):
        time.sleep(self.delay)
        self.requests += 1
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode('utf-8', 'replace')

    def api(self, endpoint, ident):
        """GET /HalApi/<endpoint>/<ident>, cached as raw/<endpoint>_<ident>.json.
        Returns parsed JSON, or None for Halsail's 404 'not found' errors."""
        path = os.path.join(self.raw_dir, f'{endpoint}_{ident}.json')
        if os.path.exists(path) and not self.refresh:
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        status, text = self._get(f'{BASE}/HalApi/{endpoint}/{ident}',
                                 {'Accept': 'application/json', 'halsailapikey': self.key})
        try:
            data = json.loads(text)
        except ValueError:
            raise RuntimeError(f'{endpoint}/{ident}: HTTP {status}, not JSON (unknown endpoint?)')
        if status == 404:
            msg = (data or {}).get('MessageLine1') or (data or {}).get('ErrorMessage') or ''
            if 'api key' in msg.lower() or 'unauthorised' in msg.lower():
                raise RuntimeError('Halsail rejected the API key')
            data = None
        elif status != 200:
            raise RuntimeError(f'{endpoint}/{ident}: HTTP {status}')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=1, ensure_ascii=False)
        return data

    def page(self, path_part, cache_name):
        path = os.path.join(self.raw_dir, cache_name)
        if os.path.exists(path) and not self.refresh:
            with open(path, encoding='utf-8') as f:
                return f.read()
        status, text = self._get(BASE + path_part, {'Accept': 'text/html'})
        if status != 200:
            raise RuntimeError(f'{path_part}: HTTP {status}')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        return text


def _last_sunday_utc1(year, month):
    import datetime as dt
    d = dt.datetime(year, month + 1, 1) - dt.timedelta(days=1) if month < 12 else dt.datetime(year, 12, 31)
    return (d - dt.timedelta(days=(d.weekday() + 1) % 7)).replace(hour=1)


def local_iso(start):
    """Halsail start -> Irish local 'YYYY-MM-DDTHH:MM:SS'. GetSchedule already
    gives local ISO; GetRace gives '/Date(<UTC ms>)/'. Irish summer time is the
    EU rule (last Sunday of March to last Sunday of October, 01:00 UTC) —
    done by hand because Windows Python often has no tz database."""
    import datetime as dt
    m = re.match(r'/Date\((-?\d+)', start or '')
    if not m:
        return start or ''
    utc = dt.datetime(1970, 1, 1) + dt.timedelta(milliseconds=int(m.group(1)))
    summer = _last_sunday_utc1(utc.year, 3) <= utc < _last_sunday_utc1(utc.year, 10)
    return (utc + dt.timedelta(hours=1 if summer else 0)).strftime('%Y-%m-%dT%H:%M:%S')


def class_catalogue(html):
    """[(classId, className, [seryId, ...most recent first])] from a results page."""
    m = re.search(r'<select id="ddRacingClasses"[^>]*>([\s\S]*?)</select>', html)
    if not m:
        return []
    out = []
    for cid, name in re.findall(r'<option value="(\d+)"[^>]*>\s*([^<]+?)\s*</option>', m.group(1)):
        sm = re.search(r'id=dd' + cid + r'[^>]*>([\s\S]*?)</select>', html)
        series = re.findall(r'<option value="(\d+)"', sm.group(1)) if sm else []
        out.append((int(cid), name.strip(), [int(s) for s in series]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--club', type=int, required=True, help='Halsail club id (GBSC: 3725)')
    ap.add_argument('--season', type=int, required=True)
    ap.add_argument('--out', help='output folder (default .capture/halsail-<season>)')
    ap.add_argument('--delay', type=float, default=0.4, help='seconds between requests')
    ap.add_argument('--refresh', action='store_true', help='refetch instead of reusing cached responses')
    args = ap.parse_args()

    key = os.environ.get('HALSAIL_API_KEY', '')
    if not key:
        sys.exit('Set HALSAIL_API_KEY in the environment first.')
    out = args.out or os.path.join('.capture', f'halsail-{args.season}')
    raw = os.path.join(out, 'raw')
    os.makedirs(raw, exist_ok=True)
    hs = Halsail(key, raw, args.delay, args.refresh)
    season = str(args.season)

    schedule = hs.api('GetSchedule', args.club) or []
    sched_series = {e['SeryID'] for e in schedule if e.get('SeryID')}
    print(f'GetSchedule: {len(schedule)} entries, {len(sched_series)} series')

    catalogue = []
    if sched_series:
        html = hs.page(f'/Result/Public/{min(sched_series)}', f'ResultPublic_{min(sched_series)}.html')
        catalogue = class_catalogue(html)
    print(f'Class catalogue: {len(catalogue)} classes')

    race_cache = {}

    def race(rid):
        if rid not in race_cache:
            race_cache[rid] = hs.api('GetRace', rid)
        return race_cache[rid]

    def series_season_info(sid):
        """(series json, [race ids], in_season, ended_before_season)"""
        s = hs.api('GetSeries', sid)
        if not s:
            return None, [], False, False
        rids = {r['RaceID'] for r in s.get('Results') or [] if r.get('RaceID')} \
            | {e['RaceID'] for e in schedule if e.get('SeryID') == sid and e.get('RaceID')}
        if not rids:
            # A tandem (Switches has 'Tandem') holds no results of its own — its
            # derived races only show up in the computed standings
            res = hs.api('GetSeriesResult', sid) or {}
            rids = {x['RaceID'] for b in res.get('ResultsOverall') or [] for x in b.get('Results') or [] if x.get('RaceID')}
        rids = sorted(rids)
        if not rids:
            return s, [], sid in sched_series, False
        # First and last race decide the season without fetching every race
        years = {local_iso((race(rids[0]) or {}).get('Start'))[:4], local_iso((race(rids[-1]) or {}).get('Start'))[:4]}
        in_season = season in years or sid in sched_series
        ended_before = not in_season and all(y and y < season for y in years)
        return s, rids, in_season, ended_before

    kept = {}  # seryId -> {series, raceIds, classId, catalogueName}
    for sid in sorted(sched_series):
        s, rids, _, _ = series_season_info(sid)
        if s:
            kept[sid] = {'series': s, 'raceIds': rids, 'classId': s.get('ClassID'), 'catalogueName': None}
    for cid, cname, sids in catalogue:
        for sid in sids:
            if sid in kept:
                kept[sid]['catalogueName'] = cname
                continue
            s, rids, in_season, ended_before = series_season_info(sid)
            if in_season:
                kept[sid] = {'series': s, 'raceIds': rids, 'classId': cid, 'catalogueName': cname}
            elif ended_before:
                break  # most-recent-first: the rest of this class's series are older still
    print(f'Season {season}: {len(kept)} series')

    # Everything the conversion needs, per kept series
    boats, classes = set(), set()
    for sid, k in kept.items():
        k['result'] = hs.api('GetSeriesResult', sid)
        hs.api('GetDiscards', sid)
        for rid in k['raceIds']:
            race(rid)
        for r in (k['series'].get('Results') or []) + ((k['result'] or {}).get('ResultsOverall') or []):
            if r.get('BoatID'):
                boats.add(r['BoatID'])
        if k['classId']:
            classes.add(k['classId'])
    for cid in sorted(classes):
        try:
            hs.api('GetClass', cid)
        except RuntimeError as e:
            print('  GetClass', cid, '-', e)
    for bid in sorted(boats):
        hs.api('GetBoat', bid)
    print(f'Fetched {len(boats)} boats, {len(classes)} classes ({hs.requests} requests this run)')

    # Inventory — no people's names
    inv = []
    for sid, k in sorted(kept.items(), key=lambda kv: local_iso((race_cache.get(kv[1]['raceIds'][0]) or {}).get('Start')) if kv[1]['raceIds'] else ''):
        s, res = k['series'], k['result'] or {}
        results = s.get('Results') or []
        races = []
        for rid in k['raceIds']:
            r = race_cache.get(rid) or {}
            rr = [x for x in results if x.get('RaceID') == rid]
            races.append({
                'raceId': rid, 'name': r.get('Race'), 'start': local_iso(r.get('Start')), 'status': r.get('Status'),
                'weight': r.get('Weight'), 'series': r.get('Series'), 'class': r.get('Class'),
                'results': len(rr), 'timed': sum(1 for x in rr if x.get('ElapsedSeconds')),
                'statuses': dict(Counter((x.get('Status') or '').strip() or '-' for x in rr)),
                'handicaps': sorted({x.get('Handicap') for x in rr if x.get('Handicap') is not None})[:3],
            })
        inv.append({
            'seryId': sid, 'name': s.get('Name'), 'resultName': res.get('SeriesName'),
            'className': res.get('ClassName'), 'catalogueName': k['catalogueName'], 'classId': k['classId'],
            'inSchedule': sid in sched_series, 'switches': s.get('Switches'),
            'tandem': 'Tandem' in (s.get('Switches') or ''),
            'boats': len({x.get('BoatID') for x in results} | {b.get('BoatID') for b in res.get('ResultsOverall') or []}), 'standings': len(res.get('ResultsOverall') or []),
            'races': races,
        })
    with open(os.path.join(out, 'inventory.json'), 'w', encoding='utf-8') as f:
        json.dump(inv, f, indent=1, ensure_ascii=False)

    lines = [f'# Halsail club {args.club} — season {season}', '',
             f'{len(inv)} series. Generated by scripts/halsail_capture.py.', '']
    by_class = defaultdict(list)
    for x in inv:
        by_class[x['className'] or x['catalogueName'] or '?'].append(x)
    for cname, xs in sorted(by_class.items()):
        lines.append(f'## {cname}')
        lines.append('')
        lines.append('| SeryID | Series | Sched | Boats | Races | First | Last | Switches |')
        lines.append('|---|---|---|---|---|---|---|---|')
        for x in xs:
            starts = [r['start'] for r in x['races'] if r['start']]
            lines.append(f"| {x['seryId']} | {x['resultName'] or x['name']} | {'y' if x['inSchedule'] else ''} | "
                         f"{x['boats']} | {len(x['races'])} | {min(starts)[:16] if starts else ''} | "
                         f"{max(starts)[:16] if starts else ''} | {x['switches'] or ''} |")
        lines.append('')
    # Races shared between series (a tandem/derived structure, or one start feeding several series)
    starts = defaultdict(list)
    for x in inv:
        for r in x['races']:
            if r['start']:
                starts[(r['start'], x['className'])].append(x['seryId'])
    shared = {k: v for k, v in starts.items() if len(v) > 1}
    lines.append(f'## Starts appearing in more than one series of the same class: {len(shared)}')
    lines.append('')
    for (st, cn), sids in sorted(shared.items())[:60]:
        lines.append(f'- {st} {cn}: {sids}')
    with open(os.path.join(out, 'inventory.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print('Wrote', os.path.join(out, 'inventory.md'))


if __name__ == '__main__':
    main()
