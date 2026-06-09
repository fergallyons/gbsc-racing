// Netlify Function: /api/google-cal
// Fetches and parses the GBSC Google Calendar iCal feed.
// Runs server-side to bypass browser CORS restrictions.
// Returns events as JSON matching the hub_events shape.

const CALENDAR_ID  = 'calendargbsc@gmail.com';
const WINDOW_PAST  = 90;   // days before today to include
const WINDOW_FUTURE = 400; // days ahead to expand recurring events

export default async (req, context) => {
  const url = 'https://calendar.google.com/calendar/ical/' +
    encodeURIComponent(CALENDAR_ID) + '/public/basic.ics';

  let icsText;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'GBSC-Management/1.0' } });
    if (!r.ok) {
      return Response.json({ error: 'Google Calendar returned ' + r.status }, { status: 502 });
    }
    icsText = await r.text();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  const events = parseAndExpand(icsText);

  return new Response(JSON.stringify(events), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // fresh every hour
    },
  });
};

export const config = { path: '/api/google-cal' };

// ── iCal parser + RRULE expander ──────────────────────────────

function parseAndExpand(ics) {
  // Unfold RFC 5545 folded lines
  const text = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = text.split(/\r\n|\r|\n/);

  const rawEvents = [];
  let cur = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
    } else if (line === 'END:VEVENT') {
      if (cur && (cur.SUMMARY || cur.UID)) rawEvents.push(cur);
      cur = null;
    } else if (cur !== null) {
      const col = line.indexOf(':');
      if (col === -1) continue;
      const fullKey  = line.slice(0, col).toUpperCase();
      const rawVal   = line.slice(col + 1);
      const val      = rawVal
        .replace(/\\n/g, '\n').replace(/\\N/g, '\n')
        .replace(/\\,/g, ',').replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
      const baseKey  = fullKey.split(';')[0];
      const params   = fullKey.slice(baseKey.length);
      // EXDATE can appear multiple times — accumulate
      if (baseKey === 'EXDATE') {
        cur.EXDATE = (cur.EXDATE || '') + (cur.EXDATE ? ',' : '') + val;
      } else {
        cur[baseKey] = { val, params };
      }
    }
  }

  const now    = new Date();
  const past   = new Date(now); past.setDate(past.getDate() - WINDOW_PAST);
  const future = new Date(now); future.setDate(future.getDate() + WINDOW_FUTURE);
  const exDateSet = new Set();

  const results = [];

  for (const raw of rawEvents) {
    const title    = raw.SUMMARY?.val?.trim()     || '(no title)';
    const desc     = raw.DESCRIPTION?.val?.trim() || null;
    const location = raw.LOCATION?.val?.trim()    || null;
    const uid      = raw.UID?.val                 || Math.random().toString(36);
    const rrule    = raw.RRULE?.val               || null;
    const exdates  = parseExDates(raw.EXDATE || '');

    const startInfo = parseICSDate(raw.DTSTART);
    if (!startInfo) continue;

    // DTEND for all-day is exclusive (day after), subtract one day
    let endInfo = parseICSDate(raw.DTEND);
    if (!endInfo) endInfo = startInfo;
    if (startInfo.allDay && endInfo.date > startInfo.date) {
      endInfo = { date: new Date(endInfo.date.getTime() - 86400000), allDay: true };
    }

    const duration = endInfo.date.getTime() - startInfo.date.getTime();

    if (rrule) {
      const occurrences = expandRRule(startInfo.date, rrule, past, future);
      occurrences.forEach((occ, i) => {
        const ds = fmtDate(occ);
        if (exdates.has(ds)) return;
        const occEnd = new Date(occ.getTime() + duration);
        results.push(makeEvent(uid + '_' + i, title, desc, location, occ, occEnd, startInfo.allDay));
      });
    } else {
      if (startInfo.date <= future && endInfo.date >= past) {
        results.push(makeEvent(uid, title, desc, location, startInfo.date, endInfo.date, startInfo.allDay));
      }
    }
  }

  results.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return results;
}

function makeEvent(uid, title, desc, location, start, end, allDay) {
  const s = allDay ? fmtDate(start) : start.toISOString();
  const e = allDay ? fmtDate(end)   : end.toISOString();
  return {
    id: 'gcal_' + uid.replace(/[^a-zA-Z0-9_-]/g, '_'),
    title,
    description: desc,
    location,
    start_date: s,
    end_date:   e !== s ? e : null,
    all_day:    allDay,
    event_type: 'general',
    _source:    'google',
  };
}

function parseICSDate(field) {
  if (!field) return null;
  const val    = typeof field === 'object' ? field.val    : field;
  const params = typeof field === 'object' ? field.params : '';
  if (!val) return null;

  const allDay = val.length === 8 || params.includes('VALUE=DATE');

  let date;
  if (allDay) {
    const y = +val.slice(0,4), m = +val.slice(4,6) - 1, d = +val.slice(6,8);
    date = new Date(y, m, d, 12, 0, 0);
  } else {
    // Normalise YYYYMMDDTHHMMSS[Z] → ISO string
    const iso = val.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/,
      '$1-$2-$3T$4:$5:$6$7'
    );
    date = new Date(iso);
  }

  if (isNaN(date.getTime())) return null;
  return { date, allDay };
}

function parseExDates(str) {
  const set = new Set();
  if (!str) return set;
  str.split(',').forEach(d => {
    const parsed = parseICSDate(d.trim());
    if (parsed) set.add(fmtDate(parsed.date));
  });
  return set;
}

function expandRRule(startDate, rruleStr, windowStart, windowEnd) {
  const params = {};
  rruleStr.split(';').forEach(p => {
    const eq = p.indexOf('=');
    if (eq !== -1) params[p.slice(0, eq)] = p.slice(eq + 1);
  });

  const freq     = params.FREQ;
  const interval = params.INTERVAL ? parseInt(params.INTERVAL) : 1;
  const maxCount = params.COUNT    ? parseInt(params.COUNT)    : 600;
  const until    = params.UNTIL    ? parseICSDate(params.UNTIL)?.date : null;
  const limit    = until && until < windowEnd ? until : windowEnd;

  const results = [];
  let cur = new Date(startDate);
  let n   = 0;

  while (cur <= limit && n < maxCount) {
    if (cur >= windowStart) results.push(new Date(cur));
    if      (freq === 'DAILY')   cur.setDate(cur.getDate() + interval);
    else if (freq === 'WEEKLY')  cur.setDate(cur.getDate() + 7 * interval);
    else if (freq === 'MONTHLY') cur.setMonth(cur.getMonth() + interval);
    else if (freq === 'YEARLY')  cur.setFullYear(cur.getFullYear() + interval);
    else break;
    n++;
  }

  return results;
}

function fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
