"""Convert a captured Halsail season (scripts/halsail_capture.py) into
.sailscoring files — one Sail Scoring series per cruiser series, carrying an
IRC fleet and an ECHO fleet over the same starts.

    python scripts/halsail_to_sailscoring.py --season 2026

Reads  .capture/halsail-<season>/raw/   (no network)
Writes .capture/sailscoring-<season>/<slug>.sailscoring
       .capture/sailscoring-<season>/expected-standings.json
           Halsail's published standings per series/fleet (sail number, rank,
           net points) — what the re-scored series must reproduce.

How Halsail maps on (all confirmed against GBSC's 2026 data):
  * The ECHO series (class "Cru - E") holds the results; the IRC series
    (class "Cru - IRC", Switches 'Tandem') of the same name re-scores the same
    races. The only races an IRC tandem lacks are ones with no results, so
    one Sail Scoring series with both fleets on one start is exact.
  * Races without results (not sailed yet, abandoned, cancelled) are left out.
  * Handicaps actually applied per race are in GetSeriesResult (GetSeries only
    has each boat's base). ECHO progresses race to race; Sail Scoring's rating
    overrides can't pin an ECHO value, so by default (--echo tcf) the ECHO
    fleet is scored as a fixed-TCF fleet labelled "ECHO", with a per-race
    fixedTcf override wherever Halsail applied a different value — an exact
    reproduction. The competitor carries the latest applied value (what the
    published pages show beside the boat). --echo native seeds Sail Scoring's own progressive ECHO from
    Halsail's first applied value instead (shows "next ECHO", may not match).
  * IRC TCC changes part-way through a series become per-race ircTcc
    overrides, the competitor carrying the latest value.
  * Every code — DNC included — scores boats that came to the start + 1
    (GetScoreBases 'Competitors'), i.e. dnfScoring 'startingAreaInclDnc'.
    DNC rows are not written: the engine scores a non-finisher as DNC.
  * Discards come from GetDiscards (RacesSailed -> RacesToCount).

All ids are UUIDv5s derived from Halsail ids, so re-converting gives identical
ids and `sailscoring import --replace` updates the series in place.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from halsail_capture import local_iso  # noqa: E402

NS = uuid.uuid5(uuid.NAMESPACE_URL, 'https://gbsc.racing/halsail-migration')
ECHO_CLASS, IRC_CLASS = 'Cru - E', 'Cru - IRC'
VENUE = 'Galway Bay Sailing Club'
CODES = {'DNF', 'RET', 'DSQ', 'DNS', 'OCS', 'NSC', 'DNE', 'UFD', 'BFD'}


def uid(*parts):
    return str(uuid.uuid5(NS, '/'.join(str(p) for p in parts)))


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def discard_thresholds(table):
    """GetDiscards [{RacesSailed, RacesToCount}] -> [{minRaces, discardCount}]"""
    out, last = [], 0
    for row in sorted(table or [], key=lambda r: r['RacesSailed']):
        n = row['RacesSailed'] - row['RacesToCount']
        if n > last:
            out.append({'minRaces': row['RacesSailed'], 'discardCount': n})
            last = n
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--season', type=int, required=True)
    ap.add_argument('--capture', help='capture folder (default .capture/halsail-<season>)')
    ap.add_argument('--out', help='output folder (default .capture/sailscoring-<season>)')
    ap.add_argument('--echo', choices=['tcf', 'native'], default='tcf')
    args = ap.parse_args()
    cap = args.capture or os.path.join('.capture', f'halsail-{args.season}')
    out = args.out or os.path.join('.capture', f'sailscoring-{args.season}')
    os.makedirs(out, exist_ok=True)

    def raw(name):
        p = os.path.join(cap, 'raw', name)
        if not os.path.exists(p):
            return None
        with open(p, encoding='utf-8') as f:
            return json.load(f)

    inv = raw('../inventory.json')
    echo_series = [x for x in inv if x['className'] == ECHO_CLASS]
    irc_by_name = {x['name']: x for x in inv if x['className'] == IRC_CLASS}
    expected = {}

    for ex in echo_series:
        sid = ex['seryId']
        ix = irc_by_name.get(ex['name'])
        e_res = raw(f'GetSeriesResult_{sid}.json') or {}
        i_res = raw(f'GetSeriesResult_{ix["seryId"]}.json') if ix else {}
        e_rows = e_res.get('ResultsOverall') or []
        i_rows = (i_res or {}).get('ResultsOverall') or []

        # Sailed races = ECHO races that have results; IRC races matched by start time
        sailed = [r for r in ex['races'] if r['results'] > 0]
        if not sailed:
            print(f'skip {ex["name"]}: no results yet')
            continue
        irc_race_by_start = {r['start']: r['raceId'] for r in (ix['races'] if ix else [])}
        races = []
        for n, r in enumerate(sorted(sailed, key=lambda r: r['start']), 1):
            races.append({'n': n, 'echoRaceId': r['raceId'], 'ircRaceId': irc_race_by_start.get(r['start']),
                          'start': r['start'], 'name': r['name']})

        series_id = uid('series', sid)
        f_irc, f_echo = uid('fleet', sid, 'irc'), uid('fleet', sid, 'echo')
        fleets = []
        if ix:
            fleets.append({'id': f_irc, 'name': 'IRC', 'displayOrder': 0, 'scoringSystem': 'irc'})
        if args.echo == 'tcf':
            fleets.append({'id': f_echo, 'name': 'ECHO', 'displayOrder': 1, 'scoringSystem': 'tcf', 'ratingLabel': 'ECHO'})
        else:
            fleets.append({'id': f_echo, 'name': 'ECHO', 'displayOrder': 1, 'scoringSystem': 'echo', 'echoAlpha': 0.25})

        # Per boat: applied handicap per race in each fleet, and the result row
        def per_race(rows, key):
            out = {}
            for b in rows:
                d = out.setdefault(b['BoatID'], {})
                for x in b.get('Results') or []:
                    d[x['RaceID']] = x
            return out
        e_by_boat, i_by_boat = per_race(e_rows, 'echo'), per_race(i_rows, 'irc')
        boat_ids = list(dict.fromkeys([b['BoatID'] for b in e_rows] + [b['BoatID'] for b in i_rows]))

        competitors, overrides = [], {}  # overrides: race n -> [..]
        comp_id = {}
        for bid in boat_ids:
            boat = raw(f'GetBoat_{bid}.json') or {}
            cid = uid('competitor', sid, bid)
            comp_id[bid] = cid
            standing = next((b for b in e_rows + i_rows if b['BoatID'] == bid), {})
            helm = (standing.get('HelmOrGuestName') or boat.get('Helm') or boat.get('Owner') or boat.get('Name') or '').strip()
            c = {'id': cid, 'fleetIds': [], 'sailNumber': (boat.get('SailText') or str(boat.get('SailNumber') or '')).strip(),
                 'boatName': (boat.get('Name') or '').strip(), 'names': [helm] if helm else [(boat.get('Name') or '?').strip()],
                 'gender': '', 'age': None}
            if (boat.get('Club') or '').strip():
                c['clubs'] = [boat['Club'].strip()]
            if (boat.get('Type') or '').strip():
                c['boatClass'] = boat['Type'].strip()

            def applied(by_boat, race_key):
                rows = by_boat.get(bid) or {}
                return [(r['n'], rows[r[race_key]]['Handicap']) for r in races
                        if r[race_key] in rows and rows[r[race_key]].get('StatusString') != 'DNC'
                        and rows[r[race_key]].get('Handicap') is not None]

            if bid in i_by_boat:
                hc = applied(i_by_boat, 'ircRaceId')
                base = hc[-1][1] if hc else None
                if base is None:  # all DNC — fall back to the boat's rating
                    base = next((h['Handicap'] for h in reversed(boat.get('Handicaps') or []) if h.get('ClassID') == ix['classId']), None)
                if base is not None:
                    c['fleetIds'].append(f_irc)
                    c['ircTcc'] = base
                    for n, h in hc:
                        if h != base:
                            overrides.setdefault(n, []).append({'id': uid('ro', sid, bid, n, 'irc'), 'competitorId': cid, 'field': 'ircTcc', 'value': h})
            if bid in e_by_boat:
                hc = applied(e_by_boat, 'echoRaceId')
                # Latest applied value as the base, so the rating a published
                # page shows beside the boat is its current one; earlier races
                # are pinned by overrides
                base = hc[-1][1] if hc else next((h['Handicap'] for h in reversed(boat.get('Handicaps') or []) if h.get('ClassID') == ex['classId']), None)
                if base is not None:
                    c['fleetIds'].append(f_echo)
                    if args.echo == 'tcf':
                        c['fixedTcf'] = base
                        for n, h in hc:
                            if h != base:
                                overrides.setdefault(n, []).append({'id': uid('ro', sid, bid, n, 'echo'), 'competitorId': cid, 'field': 'fixedTcf', 'value': h})
                    else:
                        c['echoStartingTcf'] = base
            if c['fleetIds']:
                competitors.append(c)

        file_races = []
        for r in races:
            finishes = []
            for bid in boat_ids:
                row = (e_by_boat.get(bid) or {}).get(r['echoRaceId']) or (i_by_boat.get(bid) or {}).get(r['ircRaceId'])
                if not row or bid not in comp_id:
                    continue
                st = (row.get('StatusString') or '').strip()
                if st == 'DNC':
                    continue
                f = {'id': uid('finish', sid, bid, r['n']), 'competitorId': comp_id[bid], 'sortOrder': None,
                     'tiedWithPrevious': False, 'resultCode': None, 'startPresent': True,
                     'penaltyCode': None, 'penaltyOverride': None}
                if st == 'OK':
                    f['elapsedSecs'] = row['ElapsedSeconds']
                elif st in CODES:
                    f['resultCode'] = st
                else:
                    sys.exit(f'{ex["name"]} race {r["n"]}: unhandled Halsail status {st!r}')
                finishes.append(f)
            fr = {'id': uid('race', sid, r['n']), 'raceNumber': r['n'], 'name': None, 'date': r['start'][:10],
                  'finishRecording': 'elapsed',
                  'starts': [{'id': uid('start', sid, r['n']), 'fleetIds': [f['id'] for f in fleets], 'startTime': r['start'][11:19]}],
                  'finishes': finishes}
            if overrides.get(r['n']):
                fr['ratingOverrides'] = overrides[r['n']]
            file_races.append(fr)

        name = f'{ex["name"]} {args.season}' if str(args.season) not in ex['name'] else ex['name']
        doc = {
            'formatVersion': 67,
            'seriesId': series_id,
            'exportedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'series': {
                'id': series_id, 'name': name, 'venue': VENUE,
                'startDate': races[0]['start'][:10], 'endDate': races[-1]['start'][:10],
                'venueLogoUrl': '', 'eventLogoUrl': '',
                'discardThresholds': discard_thresholds(raw(f'GetDiscards_{sid}.json')),
                'dnfScoring': 'startingAreaInclDnc',
                'ftpHost': '', 'ftpPath': '', 'includeJsonExport': True,
                'enabledCompetitorFields': ['boatName', 'boatClass', 'club'],
                'primaryPersonLabel': 'helm',
                'scoringMode': 'handicap',
                'seriesNote': f'Migrated from Halsail (series {sid}' + (f' / {ix["seryId"]}' if ix else '') + ').',
            },
            'fleets': fleets,
            'competitors': competitors,
            'races': file_races,
        }
        fn = os.path.join(out, slugify(name) + '.sailscoring')
        with open(fn, 'w', encoding='utf-8') as f:
            json.dump(doc, f, indent=1, ensure_ascii=False)

        def exp(rows):
            return [{'sailNumber': (raw(f'GetBoat_{b["BoatID"]}.json') or {}).get('SailText', ''),
                     'rank': b.get('Rank'), 'net': b.get('NetPointsString')} for b in rows]
        expected[series_id] = {'name': name, 'halsail': {'echo': sid, 'irc': ix['seryId'] if ix else None},
                               'fleets': {'ECHO': exp(e_rows), **({'IRC': exp(i_rows)} if ix else {})}}
        n_ov = sum(len(v) for v in overrides.values())
        print(f'{os.path.basename(fn)}: {len(competitors)} boats, {len(file_races)} races, '
              f'{sum(len(r["finishes"]) for r in file_races)} finishes, {n_ov} rating overrides, '
              f'discards {doc["series"]["discardThresholds"]}')

    with open(os.path.join(out, 'expected-standings.json'), 'w', encoding='utf-8') as f:
        json.dump(expected, f, indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
