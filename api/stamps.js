// Shared guestbook for the footer stamp pad.
//
//   GET    /api/stamps           -> { stamps: [{ id, city, country, x, y, rot, t }, ...] } (oldest first)
//   POST   /api/stamps           body { city, country, x, y, rot } -> { stamp }
//   DELETE /api/stamps?id=<id>   header "Authorization: Bearer <STAMPS_ADMIN_TOKEN>"
//
// Storage is Upstash Redis (added via Vercel dashboard -> Storage -> Upstash for Redis),
// talked to over its REST API so there are no npm dependencies. Only plain data is
// stored; each browser rebuilds the stamp SVG itself, so nobody can inject markup.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const ADMIN_TOKEN = process.env.STAMPS_ADMIN_TOKEN;

const LIST_KEY = 'stamps:v1';
const MAX_STAMPS = 5000;        // hard ceiling on the record
const RATE_LIMIT = 5;           // stamps per IP...
const RATE_WINDOW = 60;         // ...per this many seconds
const MAX_TEXT = 60;

async function redis(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const out = await res.json();
  const err = out.find(r => r.error);
  if (err) throw new Error(err.error);
  return out.map(r => r.result);
}

// Letters (any script), marks, digits, spaces and a little punctuation. No < > & " etc.
const cleanText = s => (typeof s === 'string' ? s : '')
  .normalize('NFC')
  .replace(/[^\p{L}\p{M}\p{N} .,'’()-]/gu, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_TEXT);

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.headers['x-real-ip'] || 'unknown';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: 'Stamp storage is not configured.' });
  }

  try {
    if (req.method === 'GET') {
      const [raw] = await redis([['LRANGE', LIST_KEY, '0', '-1']]);
      const stamps = (raw || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      return res.status(200).json({ stamps });
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const city = cleanText(body.city);
      const country = cleanText(body.country);
      const x = Number(body.x), y = Number(body.y), rot = Number(body.rot);
      if (!city || ![x, y, rot].every(Number.isFinite)) {
        return res.status(400).json({ error: 'Invalid stamp.' });
      }

      const rlKey = `stamps:rl:${clientIp(req)}`;
      const [count, , len] = await redis([
        ['INCR', rlKey],
        ['EXPIRE', rlKey, String(RATE_WINDOW), 'NX'],
        ['LLEN', LIST_KEY],
      ]);
      if (count > RATE_LIMIT) {
        return res.status(429).json({ error: 'Too many stamps. Try again in a minute.' });
      }
      if (len >= MAX_STAMPS) {
        return res.status(507).json({ error: 'The guestbook is full.' });
      }

      const stamp = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        city,
        country,
        x: clamp(x, 0, 1),
        y: clamp(y, 0, 1),
        rot: Math.round(clamp(rot, -15, 15) * 10) / 10,
        t: Date.now(),
      };
      await redis([['RPUSH', LIST_KEY, JSON.stringify(stamp)]]);
      return res.status(201).json({ stamp });
    }

    if (req.method === 'DELETE') {
      const auth = req.headers.authorization || '';
      if (!ADMIN_TOKEN || auth !== `Bearer ${ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
      const id = String(req.query.id || '');
      const [raw] = await redis([['LRANGE', LIST_KEY, '0', '-1']]);
      const match = (raw || []).find(s => { try { return JSON.parse(s).id === id; } catch { return false; } });
      if (!match) return res.status(404).json({ error: 'No stamp with that id.' });
      await redis([['LREM', LIST_KEY, '1', match]]);
      return res.status(200).json({ deleted: id });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
};
