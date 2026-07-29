// Shared geometry helpers for Netlify Functions that need to reason about a
// boat's track against a fixed line (finish-line crossing detection today;
// the same primitives would serve OCS detection later).

// Does the segment A→B (two consecutive GPS pings) cross the segment C→D
// (a start/finish line's two endpoints)? Returns the fraction t (0..1)
// along A→B where the crossing falls, or null if they don't cross.
//
// Pure 2D parametric segment intersection, using lat/lng directly as y/x
// with no local-metres projection — the crossing fraction t is invariant
// under the (linear, per-axis) scaling that a true equirectangular
// projection would apply, so the unscaled math gives the same t. Only t
// matters here; we never need an actual distance or bearing out of this.
function segmentCrossFraction(A, B, C, D) {
  const abx = B.lng - A.lng, aby = B.lat - A.lat;
  const cdx = D.lng - C.lng, cdy = D.lat - C.lat;
  const denom = abx * cdy - aby * cdx;
  if (Math.abs(denom) < 1e-12) return null; // parallel, or a degenerate zero-length segment
  const acx = C.lng - A.lng, acy = C.lat - A.lat;
  const t = (acx * cdy - acy * cdx) / denom;
  const u = (acx * aby - acy * abx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

// Given two consecutive pings (each {lat,lng,t} where t is ms-epoch) and a
// line's endpoints, return the interpolated crossing point + time, or null.
function findCrossing(pingA, pingB, line) {
  const C = { lat: line.lat1, lng: line.lng1 };
  const D = { lat: line.lat2, lng: line.lng2 };
  const frac = segmentCrossFraction(pingA, pingB, C, D);
  if (frac === null) return null;
  return {
    t: pingA.t + frac * (pingB.t - pingA.t),
    lat: pingA.lat + frac * (pingB.lat - pingA.lat),
    lng: pingA.lng + frac * (pingB.lng - pingA.lng),
  };
}

// Signed area (cross product) of triangle C, D, P — same raw
// lat/lng-as-x/y convention as segmentCrossFraction above. The sign tells
// you which side of the *directed* line C→D point P falls on, and (for the
// same reason segmentCrossFraction's t is) is invariant under the
// independent positive per-axis scaling a true equirectangular projection
// would apply, so which side wins comes out the same whether or not that
// projection is actually done.
function sideOfLine(P, C, D) {
  const dx = D.lng - C.lng, dy = D.lat - C.lat;
  const px = P.lng - C.lng, py = P.lat - C.lat;
  return dx * py - dy * px;
}

// Was P on the course side of the start line at the gun? "Course side" is
// not a fixed property of the line itself — it's whichever side the first
// mark of the day's course is laid on — so this needs that mark's position
// too, and compares signs against it. Line endpoint order doesn't matter:
// swapping C/D flips both signs together, so the comparison is unaffected.
// Returns null (caller should skip, not guess) if the mark is degenerate —
// essentially on the line's own extension, which can't orient anything.
function isOnCourseSide(P, line, firstMark) {
  const C = { lat: line.lat1, lng: line.lng1 };
  const D = { lat: line.lat2, lng: line.lng2 };
  const markSide = sideOfLine(firstMark, C, D);
  if (Math.abs(markSide) < 1e-12) return null;
  return Math.sign(sideOfLine(P, C, D)) === Math.sign(markSide);
}

// Linearly interpolate {lat,lng} between two consecutive pings (each
// {lat,lng,t}, t in ms-epoch) at a given target time. targetT is expected
// to fall between pingA.t and pingB.t (the caller picks the bracketing
// pair) — used to estimate where a boat actually was at an exact instant
// (the starting signal) that fell between two GPS fixes, not at either fix
// itself.
function interpolateAtTime(pingA, pingB, targetT) {
  const span = pingB.t - pingA.t;
  const frac = span === 0 ? 0 : (targetT - pingA.t) / span;
  return {
    lat: pingA.lat + frac * (pingB.lat - pingA.lat),
    lng: pingA.lng + frac * (pingB.lng - pingA.lng),
  };
}

// Estimates the bow's actual position from a GPS ping, given how far back
// from the bow the phone sits (metres) and the ping's own course-over-
// ground heading. RRS 29.1 and finish-line crossing both care about the
// hull, not wherever the crew's phone happens to be — a phone in the
// cockpit can trail the bow by several metres, enough to matter against a
// line. Falls back to the raw ping unchanged when there's nothing to
// project with: no configured offset, or no heading on this particular
// ping — course-over-ground drops out at low speed (geolocation APIs
// report null), which is exactly when a boat is luffing for position at
// the line, so guessing a direction would be worse than not adjusting.
// Flat-earth offset (111,320 m/degree latitude, longitude scaled by
// cos(lat)) — plenty accurate at boat-length distances, no need for a
// real geodesic calculation.
function offsetToBow(ping, offsetMetres) {
  if (!offsetMetres || ping.heading == null || isNaN(ping.heading)) return ping;
  const rad = ping.heading * Math.PI / 180;
  const dLat = (offsetMetres * Math.cos(rad)) / 111320;
  const dLng = (offsetMetres * Math.sin(rad)) / (111320 * Math.cos(ping.lat * Math.PI / 180));
  return { ...ping, lat: ping.lat + dLat, lng: ping.lng + dLng };
}

module.exports = { segmentCrossFraction, findCrossing, sideOfLine, isOnCourseSide, interpolateAtTime, offsetToBow };
