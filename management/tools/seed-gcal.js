#!/usr/bin/env node
// One-off seed generator: reads GBSC Google Calendar and outputs SQL INSERTs
// for the hub_events table.
//
// Usage:
//   node seed-gcal.js              → prints SQL to stdout
//   node seed-gcal.js > seed.sql   → write to file, then paste into Supabase SQL editor

const CALENDAR_ID   = 'calendargbsc@gmail.com';
const WINDOW_PAST   = 90;   // days before today to include
const WINDOW_FUTURE = 500;  // days ahead to include

const url = 'https://calendar.google.com/calendar/ical/' +
  encodeURIComponent(CALENDAR_ID) + '/public/basic.ics';

(async () => {
  let icsText;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — is the calendar set to public?');
    icsText = await r.text();
  } catch (e) {
    console.error('Failed to fetch calendar:', e.message);
    process.exit(1);
  }

  const events = parseAndExpand(icsText);
  if (!events.length) {
    console.error('No events found in the feed.');
    process.exit(0);
  }

  console.log('-- GBSC Google Calendar seed — generated ' + new Date().toISOString());
  console.log('-- ' + events.length + ' events\n');
  console.log('INSERT INTO hub_events (title, description, location, start_date, end_date, all_day, event_type)');
  console.log('VALUES');

  const rows = events.map((ev, i) => {
    const title = sqlStr(ev.title);
    const desc  = sqlStr(ev.description);
    const loc   = sqlStr(ev.location);
    const start = sqlStr(ev.start_date);
    const end   = ev.end_date ? sqlStr(ev.end_date) : 'NULL';
    const allDay = ev.all_day ? 'true' : 'false';
    const type  = sqlStr(ev.event_type);
    const comma = i < events.length - 1 ? ',' : ';';
    return `  (${title}, ${desc}, ${loc}, ${start}, ${end}, ${allDay}, ${type})${comma}`;
  });

  console.log(rows.join('\n'));
  console.log('\n-- Done. Paste the above into Supabase SQL Editor and run.');
})();

// ── iCal parser ────────────────────────────────────────────────

function parseAndExpand(ics) {
  const text  = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = text.split(/\r\n|\r|\n/);

  const rawEvents = [];
  let cur = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
    } else if (line === 'END:VEVENT') {
      if (cur) rawEvents.push(cur);
      cur = null;
    } else if (cur !== null) {
      const col = line.indexOf(':');
      if (col === -1) continue;
      const fullKey = line.slice(0, col).toUpperCase();
      const rawVal  = line.slice(col + 1);
      const val     = rawVal
        .replace(/\\n/g, ' ').replace(/\\N/g, ' ')
        .replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
      const baseKey = fullKey.split(';')[0];
      const params  = fullKey.slice(baseKey.length);
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

    let endInfo = parseICSDate(raw.DTEND);
    if (!endInfo) endInfo = startInfo;
    if (startInfo.allDay && endInfo.date > startInfo.date) {
      endInfo = { date: new Date(endInfo.date.getTime() - 86400000), allDay: true };
    }

    const duration = endInfo.date.getTime() - startInfo.date.getTime();

    if (rrule) {
      const occurrences = expandRRule(startInfo.date, rrule, past, future);
      occurrences.forEach((occ, i) => {
        if (exdates.has(fmtDate(occ))) return;
        const occEnd = new Date(occ.getTime() + duration);
        results.push(makeEvent(title, desc, location, occ, occEnd, startInfo.allDay));
      });
    } else {
      if (startInfo.date <= future && endInfo.date >= past) {
        results.push(makeEvent(title, desc, location, startInfo.date, endInfo.date, startInfo.allDay));
      }
    }
  }

  results.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return results;
}

function makeEvent(title, desc, location, start, end, allDay) {
  const s = allDay ? fmtDate(start) : start.toISOString();
  const e = allDay ? fmtDate(end)   : end.toISOString();
  return {
    title,
    description: desc,
    location,
    start_date: s,
    end_date:   e !== s ? e : null,
    all_day:    allDay,
    event_type: guessType(title),
  };
}

function guessType(title) {
  const t = title.toLowerCase();
  if (/regatta|pursuit|league|race week|series/.test(t)) return 'regattas';
  if (/cruiser|cruise|offshore|isora|coastal/.test(t))   return 'cruisers';
  if (/dinghy|dingy|laser|optimist|mirror|wayfarer|frostbite|junior/.test(t)) return 'dinghys';
  if (/social|dinner|prize|prizegiving|party|bbq|céilí|agm|meeting|committee/.test(t)) return 'social';
  if (/external|inter-club|interprovincial|nationals|worlds/.test(t)) return 'external';
  return 'other';
}

function parseICSDate(field) {
  if (!field) return null;
  const val    = typeof field === 'object' ? field.val    : field;
  const params = typeof field === 'object' ? field.params : '';
  if (!val) return null;

  const allDay = val.length === 8 || params.includes('VALUE=DATE');
  let date;
  if (allDay) {
    const y = +val.slice(0,4), m = +val.slice(4,6)-1, d = +val.slice(6,8);
    date = new Date(y, m, d, 12, 0, 0);
  } else {
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
  str.split(',').forEach(d => {
    const p = parseICSDate(d.trim());
    if (p) set.add(fmtDate(p.date));
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

function sqlStr(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}
