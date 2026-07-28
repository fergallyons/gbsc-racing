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

module.exports = { segmentCrossFraction, findCrossing };
