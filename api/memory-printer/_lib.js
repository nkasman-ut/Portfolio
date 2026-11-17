// Shared helpers for the /memory-printer experience.
// Files starting with "_" are not deployed as routes by Vercel.
//
// Env vars (Vercel dashboard -> Settings -> Environment Variables):
//   OPENAI_API_KEY                         required
//   UPSTASH_REDIS_REST_URL / _TOKEN        already set for /api/stamps; used for rate limits
//   MEMORY_PRINTER_DAILY_CAP               optional, total images per day across everyone (default 40)
//   MEMORY_PRINTER_IMAGE_MODEL             optional, OpenAI image model (default gpt-image-2.6-flare)

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MAX_ANSWER = 500;
const MAX_ANSWERS = 3;

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

// Fixed-window counter. Returns true when the caller is over the limit.
async function overLimit(key, limit, windowSeconds) {
  const [count] = await redis([
    ['INCR', key],
    ['EXPIRE', key, String(windowSeconds), 'NX'],
  ]);
  return count > limit;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.headers['x-real-ip'] || 'unknown';
}

const clean = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER);

function cleanAnswers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ANSWERS).map(a => ({
    question: clean(a && a.question),
    answer: clean(a && a.answer),
  }));
}

// ---- Prompt (ported from ephemera/server/memoryPrompt.js, dithered style) ----

const DITHERED = `Black and white pixel dithering, Bayer matrix ordered dither pattern, high contrast, chunky square pixels, two-tone only, no gradients — halftone achieved purely through pixel density and arrangement, retro digital aesthetic.`;

const SHARED_RULES = `No faces, no detailed figures, no text, no color. Black and white only. The image will be displayed on a 400x300 pixel e-ink screen.`;

function buildGenerationPrompt(answers) {
  const place = answers[0]?.answer || 'an unnamed place';
  const detail = answers[1]?.answer || 'one small detail';
  const surroundings = answers[2]?.answer || 'the surrounding light and objects';

  return `A wide horizontal rectangular panel divided into exactly 2 equal panels side by side. Landscape orientation.

Style: ${DITHERED}

${SHARED_RULES}

Memory content:
- Place: ${place}
- A vivid detail from the memory: ${detail}
- The surrounding environment: ${surroundings}

Panel layout:
- Panel 1 (left): the place itself — architecture, landscape, light, the room or space as it felt
- Panel 2 (right): a close detail or texture from the memory — an object, a surface, a quality of light

Both panels must be fully visible and completely contained within the frame. Each panel is 200x300 pixels. Together they fill the full 400x300 display — no white border, no margin, no overflow, nothing cropped. No text. Exactly 2 panels, both complete.`;
}

module.exports = {
  REDIS_URL, REDIS_TOKEN, OPENAI_API_KEY,
  redis, overLimit, readBody, clientIp, cleanAnswers, buildGenerationPrompt,
};
