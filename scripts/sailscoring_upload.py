"""Upload converted .sailscoring files to Sail Scoring and check them against
Halsail — a Python stand-in for the `sailscoring` CLI's `whoami` and
`import --replace` (same /api/v1 calls, docs/cli.md in the Sail Scoring repo),
so no Node toolchain is needed.

    SAILSCORING_TOKEN=... python scripts/sailscoring_upload.py whoami
    SAILSCORING_TOKEN=... python scripts/sailscoring_upload.py import  --season 2026
    SAILSCORING_TOKEN=... python scripts/sailscoring_upload.py compare --season 2026

  whoami   the key's workspace and role (the key owner's email is not shown)
  import   PUT /api/v1/series/<seriesId>/file for every file in
           .capture/sailscoring-<season>/ — upserts at the file's own series id,
           so re-running after a re-convert updates in place. Does NOT publish:
           an imported series is private to the workspace until published.
  --dir    folder with the files instead of .capture/sailscoring-<season>/
           (e.g. --dir . when they sit beside you)
  published  list the workspace's live publications (id, slug, series, URL)
  unpublish <publicationId>  take one publication down (its page 404s)
  publish  POST /api/v1/series/<id>/publish for every file, into one shared
           season folder (--slug, default the season) with per-fleet sub-paths
           <file-name>-irc / <file-name>-echo. Makes results PUBLIC.
  compare  GET /api/v1/series/<id>/standings for each file and compare every
           boat's rank and net points with Halsail's (expected-standings.json)

Env: SAILSCORING_TOKEN (required, never printed), SAILSCORING_WORKSPACE
(default: GBSC's u-yWB6wz0BnvuGGKok), SAILSCORING_BASE_URL (default
https://app.sailscoring.ie).
"""

import argparse
import glob
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get('SAILSCORING_BASE_URL', 'https://app.sailscoring.ie').rstrip('/')
WORKSPACE = os.environ.get('SAILSCORING_WORKSPACE', 'u-yWB6wz0BnvuGGKok')


def call(method, path, body=None, idem=None):
    token = os.environ.get('SAILSCORING_TOKEN', '')
    if not token:
        sys.exit('Set SAILSCORING_TOKEN in the environment first.')
    headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'x-sailscoring-workspace': WORKSPACE}
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    if idem:
        headers['Idempotency-Key'] = idem
    for attempt in range(4):
        req = urllib.request.Request(BASE + '/api/v1' + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                text = r.read().decode('utf-8')
                return r.status, (json.loads(text) if text else None)
        except urllib.error.HTTPError as e:
            text = e.read().decode('utf-8', 'replace')
            if e.code == 429 and attempt < 3:
                wait = int(e.headers.get('Retry-After') or 10 * (attempt + 1))
                print(f'  rate-limited, waiting {wait}s')
                time.sleep(wait)
                continue
            try:
                return e.code, json.loads(text)
            except ValueError:
                return e.code, {'error': text[:300]}


def files(a):
    out = a.dir or os.path.join('.capture', f'sailscoring-{a.season}')
    fs = sorted(glob.glob(os.path.join(out, '*.sailscoring')))
    if not fs:
        sys.exit(f'No .sailscoring files in {out} — run halsail_to_sailscoring.py first.')
    return out, fs


def cmd_whoami(_):
    st, b = call('GET', '/workspace')
    if st != 200:
        sys.exit(f'HTTP {st}: {b}')
    print(f"workspace={b.get('workspaceSlug')} role={b.get('role')} features={b.get('features')}")


def cmd_import(a):
    _, fs = files(a)
    for fn in fs:
        with open(fn, encoding='utf-8') as f:
            content = f.read()
        sid = json.loads(content)['seriesId']
        idem = hashlib.sha256(content.encode('utf-8')).hexdigest()
        st, b = call('PUT', f'/series/{sid}/file', {'content': content}, idem)
        state = ('created' if b.get('created') else 'updated') if st in (200, 201) and isinstance(b, dict) else f'FAILED HTTP {st}: {b}'
        print(f'{os.path.basename(fn)}: {state}')
        time.sleep(0.5)


def cmd_compare(a):
    out, fs = files(a)
    with open(os.path.join(out, 'expected-standings.json'), encoding='utf-8') as f:
        expected = json.load(f)
    tot = ok = 0
    for fn in fs:
        with open(fn, encoding='utf-8') as f:
            sid = json.load(f)['seriesId']
        e = expected[sid]
        st, b = call('GET', f'/series/{sid}/standings')
        if st != 200:
            print(f"{e['name']}: HTTP {st} {b}")
            continue
        got = {}
        for s in b.get('standings') or []:
            got[s.get('fleetName')] = {str(r.get('sailNumber')).strip(): r for r in s.get('rows') or []}
        bad = 0
        for fleet, rows in e['fleets'].items():
            g = got.get(fleet, {})
            for r in rows:
                tot += 1
                m = g.get(str(r['sailNumber']).strip())
                if m and abs(float(m.get('netPoints')) - float(r['net'])) < 0.01 and m.get('rank') == r['rank']:
                    ok += 1
                else:
                    bad += 1
                    print(f"  {e['name']} {fleet} sail {r['sailNumber']}: Halsail rank {r['rank']} net {r['net']} | "
                          f"Sail Scoring {('rank %s net %s' % (m.get('rank'), m.get('netPoints'))) if m else 'missing'}")
        print(f"{e['name']}: {'OK' if not bad else str(bad) + ' differences'}")
        time.sleep(0.5)
    print(f'{ok}/{tot} boats match Halsail (rank and net points)')


def cmd_published(_):
    st, b = call('GET', '/published')
    if st != 200:
        sys.exit(f'HTTP {st}: {b}')
    for p in sorted(b or [], key=lambda p: -(p.get('publishedAt') or 0)):
        when = time.strftime('%Y-%m-%d %H:%M', time.localtime((p.get('publishedAt') or 0) / 1000))
        print(f"{p.get('id')}  {when}  {p.get('title')!r}  slug={p.get('slug')}  series={p.get('seriesId')}"
              f"{'  ORPHAN' if p.get('orphaned') else ''}  {p.get('url')}")


def cmd_unpublish(a):
    st, b = call('DELETE', f'/published/{a.publication_id}')
    print('unpublished' if st in (200, 204) else f'FAILED HTTP {st}: {b}')


def cmd_publish(a):
    # All series share one season folder (slug); each fleet page gets its own
    # sub-path so the series' identically-named IRC/ECHO fleets don't collide.
    _, fs = files(a)
    for fn in fs:
        with open(fn, encoding='utf-8') as f:
            doc = json.load(f)
        base = os.path.basename(fn)[:-len('.sailscoring')]
        body = {'slug': a.slug, 'season': str(a.season),
                'subPaths': {fl['name']: f"{base}-{fl['name'].lower()}" for fl in doc['fleets']}}
        st, b = call('POST', f"/series/{doc['seriesId']}/publish", body, hashlib.sha256(json.dumps(body).encode() + doc['seriesId'].encode()).hexdigest())
        if st in (200, 201) and isinstance(b, dict):
            print(f"{doc['series']['name']}: published — " + ', '.join(pg.get('url', '') for pg in b.get('pages') or []))
        else:
            print(f"{doc['series']['name']}: FAILED HTTP {st}: {b}")
        time.sleep(0.5)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('whoami')
    sub.add_parser('published')
    up = sub.add_parser('unpublish')
    up.add_argument('publication_id', help='id from the `published` listing')
    for c in ('import', 'compare', 'publish'):
        p = sub.add_parser(c)
        p.add_argument('--season', type=int, required=True)
        if c == 'publish':
            p.add_argument('--slug', default=None, help='shared folder to publish into (default: the season, e.g. 2026)')
        p.add_argument('--dir', help='folder holding the .sailscoring files and expected-standings.json '
                                     '(default .capture/sailscoring-<season>)')
    a = ap.parse_args()
    if getattr(a, 'slug', 'x') is None:
        a.slug = str(a.season)
    {'whoami': cmd_whoami, 'import': cmd_import, 'compare': cmd_compare, 'published': cmd_published,
     'unpublish': cmd_unpublish, 'publish': cmd_publish}[a.cmd](a)


if __name__ == '__main__':
    main()
