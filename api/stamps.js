// Shared "Leave a stamp" guestbook store.
//
// GET  /api/stamps        -> { stamps: [ { city, country, seed, x, y, rot, ts }, ... ] }
// POST /api/stamps        -> validates + appends one stamp, returns { ok, stamp }
//
// Storage is an Upstash Redis list accessed over its REST API. Set these env vars
// (Vercel's Upstash / KV integration provides them automatically):
//   KV_REST_API_URL / KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_URL / _TOKEN)
//
// We deliberately store STRUCTURED, validated fields only (never raw SVG/markup),
// so nothing a visitor submits is ever echoed back as HTML. The client rebuilds the
// stamp artwork from these fields with its own trusted code.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'stamps';
const MAX_STAMPS = 5000; // keep the newest N

async function redis(command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  const j = await r.json();
  return j.result;
}

// --- place validation (mirror of the client, DOM-free) -----------------------
const normName = (s) => (s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[.'’-]/g, ' ').replace(/\s+/g, ' ').trim();

// Only real place-name characters are allowed — blocks markup outright.
const PLACE_RE = /^[\p{L}\p{M}.'’\- ]{1,60}$/u;

const US_ABBR = new Set(['AL','AK','AZ','AR','CA','CO','CT','FL','GA','HI','ID','IL','IA','KS','KY','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

function regionMatch(result, region) {
  const R = region.trim().toLowerCase();
  if (!R) return true;
  const cc = (result.country_code || '').toLowerCase();
  const cn = (result.country || '').toLowerCase();
  const a1 = (result.admin1 || '').toLowerCase();
  if (cn && (cn.includes(R) || R.includes(cn))) return true;
  if (a1 && (a1.includes(R) || R.includes(a1))) return true;
  if (cc === R) return true;
  if (cc === 'us') {
    if (['usa', 'united states', 'u.s', 'u.s.a', 'america'].some((w) => R.includes(w))) return true;
    if (US_ABBR.has(region.trim().toUpperCase())) return true;
  }
  if (cc === 'gb' && ['uk', 'england', 'scotland', 'wales', 'britain', 'united kingdom'].some((w) => R.includes(w))) return true;
  return false;
}

async function placeExists(city, region) {
  const q = (city || '').trim();
  if (!q) return false;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  const results = data.results || [];
  const named = results.filter((r) => normName(r.name) === normName(q));
  if (!named.length) return false;
  if (region && !named.some((r) => regionMatch(r, region))) return false;
  return true;
}

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(503).json({ error: 'store_not_configured' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const items = await redis(['LRANGE', KEY, '0', '-1']);
      const stamps = (items || [])
        .map((s) => { try { return JSON.parse(s); } catch (e) { return null; } })
        .filter(Boolean);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ stamps });
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
      const city = String(body.city || '').trim();
      const country = String(body.country || '').trim();
      const x = Number(body.x), y = Number(body.y), rot = Number(body.rot), seed = Number(body.seed);

      const numsOk = [x, y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
        && Number.isFinite(rot) && Math.abs(rot) <= 45
        && Number.isFinite(seed);
      if (!city || !PLACE_RE.test(city) || (country && !PLACE_RE.test(country)) || !numsOk) {
        res.status(400).json({ error: 'invalid' });
        return;
      }

      if (!(await placeExists(city, country))) {
        res.status(422).json({ error: 'not_found' });
        return;
      }

      const rec = {
        city, country,
        seed: Math.abs(Math.floor(seed)) % 100000,
        x: +x.toFixed(4), y: +y.toFixed(4), rot: +rot.toFixed(1),
        ts: Date.now(),
      };
      await redis(['RPUSH', KEY, JSON.stringify(rec)]);
      await redis(['LTRIM', KEY, String(-MAX_STAMPS), '-1']);
      res.status(200).json({ ok: true, stamp: rec });
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
};
