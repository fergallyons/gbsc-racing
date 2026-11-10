---
name: "renville-pier-tide-window"
description: "Use when asked when Out of the Blue (draft 2.2 m) can float at, enter, or dry out against Renville pier / the harbour wall in Galway, on a given day."
---

# Renville pier tide window (Out of the Blue)

Work out, for a given date, when the boat is afloat at, grounded against, or fully dried out at Renville pier (the harbour wall used for hull-cleaning dry-outs).

## Owner's local knowledge (logged in the Out of the Blue knowledge base, section 2.3)
- Tide height **1.7 m** = water at the bottom of the pier wall. Above 1.7 m there is water at the pier; at or below 1.7 m the pier area is dried out.
- The boat draws **2.20 m**, so she needs a tide height of about **3.9 m** to float at the pier (1.7 + 2.2). This is the bare minimum with zero under-keel clearance: add a margin if she has to leave under power or on a falling tide.
- Between 1.7 m and 3.9 m she is aground against the wall with water still around the lower hull. Keel/hull clear of the water is roughly **3.9 m minus tide height** (e.g. 2.8 m tide = about 1.1 m clear; 1.7 m or below = whole 2.2 m clear).
- If high water only reaches about 3.9 m or less, she will not float at the pier at all that day. Check the high-water height, not just the times.

## Procedure
1. **Get the tide table for Galway for the requested date** (and the day either side if the window runs past midnight). WebFetch works well on `https://www.seatemperatu.re/europe/ireland/galway/tides/month/all/?m=YYYY-M` (month format like 2026-10). Ask the fetch to return the high/low times and heights for the specific dates. The page may report heights in feet: convert (1 ft = 0.3048 m) and round to 2 dp. If WebFetch is refused or blocked, do not work around it with curl or scripts: tell the user and ask them to supply the times or use another source.
2. **Interpolate the crossing times** between each consecutive low and high water using a half-cosine curve: h(t) = mean +/- A cos(pi t / T), where mean = (HW + LW)/2, A = (HW - LW)/2, T = minutes between the two extremes, and the sign is minus on a rising tide, plus on a falling tide. Solve for the times where h crosses 3.9 m (afloat/aground) and 1.7 m (dried out/water at the pier). For a quick check use the rule of twelfths. You can use a short Python snippet to do the arithmetic.
3. **Report** a small table of the table's own low/high times and heights, then the derived windows: dried out (below 1.7 m), afloat (above 3.9 m), and aground-but-wet (between). For arriving alongside, suggest a margin after the 3.9 m crossing (about 30 minutes). Say clearly which times come from the table and which are interpolated, and that interpolated times are about +/- 15 minutes.
4. **Check daylight** for anything that falls around dusk, and mention it.
5. **Cite the source** with a Sources: link.

## Caveats to always state
- The tide-table page did not state its datum or time zone. Advise confirming against a second source (Marine Institute / Admiralty tables) before relying on the times.
- The 3.9 m figure assumes the seabed under the keel is level with the foot of the wall: unverified.
- Renville pier is assumed to be the same place as "the harbour wall" used for earlier dry-outs: unverified.
- Predictions ignore weather effects (surge, pressure, wind), which can shift heights.

## Calibration
If the owner reports when she actually touched or floated, compare it with the predicted time. A big mismatch means the 3.9 m / 1.7 m figures, the datum, or the seabed level assumption needs correcting. Update section 2.3 of the knowledge base project doc (`OutOfTheBlue_KnowledgeBase_2026.md`) with the result (read it first, change it, and write the full document back).

## Worked example (Galway, Fri 9 Oct 2026)
Table: HW 04:47 5.06 m; LW 10:48 1.01 m; HW 17:04 5.18 m; LW 23:10 0.70 m. Derived: dried out about 09:10 to 12:30; afloat about 14:45 to 19:15; fully dried out again about 21:15 to 01:10. Earliest comfortable arrival about 15:15 to 15:30.