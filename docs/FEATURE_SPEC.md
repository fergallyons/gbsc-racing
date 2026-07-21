# RaceOps Crest — Feature Specification

*Prepared for clubs evaluating the platform (e.g. Mayo Sailing Club) ahead of a full requirements analysis.*

## 1. What it is

**RaceOps Crest** is a web-based race-day and club-management platform for sailing clubs, covering the full cycle of a race night: course setup, start sequence, registration, crew and fee management, finishing, results and protests. It runs in any phone or desktop browser (installable to the home screen — no app-store download required) and works with a poor or absent signal at the committee boat.

It is a **single shared platform serving multiple clubs**, not a bespoke build per club — each club gets its own branding, its own database, and its own feature configuration, but all run on the same codebase and receive the same ongoing improvements.

**Currently live:** Galway Bay Sailing Club (GBSC), Royal Cork Yacht Club (RCYC), Howth Yacht Club (HYC) — each under its own club branding; RaceOps Crest is the platform behind all three.

## 2. The three roles

The app has no user accounts or logins in the traditional sense — access is PIN-based, scoped to one of three roles:

| Role | Access | Typical user |
|---|---|---|
| **Race Officer (RO)** | Club-wide 4-digit PIN | Officer of the day / club administrator |
| **Skipper** | Per-boat 4-digit PIN | Boat owner/skipper, manages their own boat |
| **Crew / Public** | No PIN — open to anyone with the app link | Crew, members, prospective sailors |

## 3. Race Officer features

**Race day**
- **Course Builder** — three ways to set today's course, selectable per club:
  - *Mark-builder* — tap real marks in sequence; the app computes leg bearings and distances from wind direction automatically.
  - *Laid course* — no fixed marks; pick a shape (windward-leeward, triangle, olympic) and lap count, and the app renders a schematic diagram.
  - *Course card* — pick from a pre-loaded, numbered course library grouped by wind direction (RCYC style).
  - Publishing pushes a "course published" notification to skippers and crew.
- **View Course** — read-only diagram of the currently published course.
- **Registrations** — live list and count of boats registered for the next race.
- **Start Sequence** — arm a start (flag system: Postponement/AP, I-flag, Z-flag, or Black flag, each with its own rule text), pick class flag and start time. Once armed, a synchronised countdown broadcasts to every device with horn signals timed to the exact second, and a screen wake-lock keeps the phone awake through the sequence. Includes postpone/resume/cancel.
- **Finish Recording** — offline-first finish capture (sail no., time, status: OCS/RET/DNF/DSQ/DNS) that survives a dropped connection or reload, then exports a CSV in HalSail's own import format for upload once back in signal.
- **Halsail** — one-tap link into halsail.com for handicap/results processing.
- **Handicaps** — ECHO/IRC lookup (see §6).

**Payments**
- **Payment Report** — printable/PDF report for a race.
- **Outstanding** — "who owes money" report (per-race billing only — automatically hidden under per-series billing, see §4).
- **Fee Statements** — per-boat payment history.

**Club admin**
- **Boat Management** — add/edit/delete boats; assign/reset boat PINs; set sail number, boat icon, and photo.
- **Marks Manager** — toggle marks on/off, add/edit/delete marks and start/finish lines.
- **Protests** — inbox of all filed protests, redress requests and scoring enquiries across all races.
- **Publish Results** — embargo toggle; results stay hidden from crew/public until the RO explicitly publishes.
- **Race Schedule** — add/edit races, group into series, cancel/restore a race without deleting it.
- **News Feed** — short news items with optional links, surfaced as a ticker banner across every dashboard.

**Advanced**
- **Club Settings** — single admin screen for: Stripe payment links per membership tier, Revolut usernames, race fee amounts per tier, visitor-outing cap, "years aboard before becoming a full member" threshold, HalSail club ID, start/wind/tide coordinates, tide station and datum offset, WorldTides API key, noticeboard and results links, eStela race-tracker link, pre-race registration window, and the club's push-notification key.
- **Usage Stats** — logins by role, unique boats, sessions per month, session duration.
- **Start Timer** — deep-links to a third-party voice-announced starting-sequence app (Android/iOS/web).
- **Features** — the live, in-app toggle screen for every configurable feature (see §4).

## 4. Skipper features

- **Boat Profile** — boat name, type, photo, sail number, current and next-race handicap ratings (IRC TCC / ECHO) at a glance.
- **Register / Withdraw** for the selected race, with a "looking for crew" toggle once registered.
- **Course, Start Sequence, Results, Handicaps** — same live views as the RO, read-only.
- **File Protest** — protest (RRS 61.2), redress request (RRS 62), or scoring enquiry, each with its own guided form.
- **Race Fees / Fee History** — collect and submit crew fees for the current race (or series, depending on billing model — see §4a), and view the boat's own payment record.
- **Crew Roster** — add/edit crew with a membership type (Full / Crew / Student / Visitor / Junior); tracks visitor-outing counts against the club's cap and crew years-aboard against the "new member" threshold; fees recalculate live from the club's fee schedule.
- **Crew Wanted / Available Crew** — see boats looking for crew, and sailors available to crew, with one-tap contact.
- **Settings** — Revolut username, boat photo, sail number, PIN change.
- **Declaration Gate** *(optional, per club)* — forces a season safety declaration before the dashboard is usable, with club-supplied links to Sailing Instructions/RRS/safety documents.
- **Push notifications** — opt in on this device to be notified when a course is published.

### 4a. Fee billing model — per club, configurable

Every club chooses one of two billing models, and the interface adapts automatically:

- **Per-race** (GBSC default) — fees are collected race by race; skipper dashboard shows a live "aboard / total / owed" strip.
- **Per-series** (RCYC) — fees are billed once per series; the per-race strip, the crew-panel fee totals, and the RO's "Outstanding" report are all automatically hidden, since they don't apply.

Empty sections (e.g. a Payments section with every tile switched off) collapse automatically rather than showing an empty header — this applies across all three dashboards (RO, Skipper, Crew).

## 5. Crew & public features

No PIN required — open to anyone with the club's app link.

- **Course, Start Sequence, Results, Handicaps** — same live views as skippers.
- **Race Weather** — wind, tide and forecast for the next race.
- **Pay Race Fees** — crew can pay their own fee directly (Stripe or Revolut) instead of routing through the skipper.
- **Calendar** — race schedule.
- **Documents** — sailing instructions and club documents.
- **Notifications** — opt in to "course published" alerts.
- **Crew Wanted / Available to Crew** — browse boats looking for crew, or self-register as available to crew (name, phone, experience level, notes).
- **New sailor onboarding** — a dedicated panel explaining the path from a first outing to full membership.

## 6. Live data integrations

- **HalSail** — pulls race schedule/start times where no local calendar exists, and scrapes both *current* and *next-race* ECHO ratings from HalSail's public race-analysis pages.
- **Irish Sailing national ratings register** — IRC TCC lookup, cross-referenced against HalSail's ECHO data into one combined handicaps table; also auto-populates a boat's sail number in Boat Management on a name match.
- **Tide** — Irish Marine Institute (ERDDAP), with a WorldTides fallback if a club supplies an API key; each club sets its own tide station and datum offset.
- **Weather** — Open-Meteo hourly forecast (wind, gusts, direction, cloud, pressure) sized to the next race window.
- **eStela** — optional link to a club's eStela.co live race-tracking page.

All of the above are per-club configuration — a new club supplies its own HalSail club ID, tide station, coordinates, and optional API keys; nothing is hardcoded to GBSC.

## 7. Payments

- **Stripe** — a Payment Link per membership tier (Full/Crew, Student, Visitor), opened directly or shown as a QR code; plus a bulk-checkout flow so one card transaction can mark several crew as paid at once, with a clean line-itemised receipt.
- **Revolut** — manual, username-based deep link (`revolut.me/<club-or-boat-username>`); payment is confirmed by hand afterward.
- **Cash** — recorded manually by the skipper or RO.

Payment configuration (Stripe links, Revolut usernames, fee amounts per tier) is entirely per-club — no amounts are hardcoded in the app itself.

## 8. Push notifications

- Race Officers are notified when a boat registers for a race.
- Crew and skippers are notified when the RO publishes a course.
- Delivery uses the standard Web Push protocol; each club generates its own notification key pair as part of setup (a five-minute one-off task).

## 9. Mobile & offline support

- Installable to the home screen on iOS and Android as a standalone app — no app-store listing needed.
- App shell and race data are cached so the app still opens and shows the last-known state with no signal.
- Finish Recording is built specifically to work with zero signal at the committee boat, syncing/exporting once reconnected.
- Live data (results, registrations, weather) always tries the network first and only falls back to cache when offline.

## 10. Access & data model

- No traditional user accounts or passwords. Access is by PIN: a club-wide RO PIN, and a per-boat PIN that skippers can change from the default.
- Race and club information (courses, results, schedules, handicaps) is intentionally open to anyone with the app link — this mirrors how race information is traditionally posted on a public noticeboard. PINs are a light deterrent against casual tampering, not a security boundary in the traditional sense.
- Each club's data lives in its own, fully separate database — there is no shared or commingled data between clubs.
- Notification subscriber details are the one exception: kept private, readable only by the server, never by the browser.

## 11. What's involved in onboarding a new club

Everything below is configuration, not new code:

- A club record with branding (name, logo, accent colour).
- A dedicated database for the club's boats, crew, races and results.
- Club-specific settings: fee schedule and billing model (per-race or per-series), visitor/membership rules, HalSail club ID (if used), start-line/tide/wind coordinates, and payment links.
- Choice of which features are switched on (course card vs. laid course vs. mark-builder, declaration gate, self-pay, etc. — see the Features screen in §3).
- A one-off push-notification key pair, if the club wants registration/course alerts.

This is the same process already completed for RCYC and HYC, each with a different fee model, branding, and feature set from GBSC.
