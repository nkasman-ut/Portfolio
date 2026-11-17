// POST /api/memory-printer/memories   body { answers: [{ question, answer }, ...] }
//   -> { imageUrl: "data:image/webp;base64,..." }
//
// Generates the two-panel dithered memory image with gpt-image-1.
// Rate limited per IP and with a global daily cap, because every call costs money.
// Fails closed: no Redis means no generation.

const {
  REDIS_URL, REDIS_TOKEN, OPENAI_API_KEY,
  overLimit, readBody, clientIp, cleanAnswers, buildGenerationPrompt,
} = require('./_lib');

const PER_IP_LIMIT = 3;              // images per visitor...
const PER_IP_WINDOW = 60 * 60 * 24;  // ...per 24 hours
const DAILY_CAP = Number(process.env.MEMORY_PRINTER_DAILY_CAP) || 40;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!OPENAI_API_KEY || !REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: 'The memory printer is resting right now. Please come back later.' });
  }

  const answers = cleanAnswers(readBody(req).answers);
  if (!answers.some(a => a.answer)) {
    return res.status(400).json({ error: 'Share a little of your memory first.' });
  }

  try {
    const day = new Date().toISOString().slice(0, 10);
    if (await overLimit(`memprint:ip:${clientIp(req)}`, PER_IP_LIMIT, PER_IP_WINDOW)) {
      return res.status(429).json({ error: `You've made ${PER_IP_LIMIT} memories today. Come back tomorrow to make another.` });
    }
    if (await overLimit(`memprint:day:${day}`, DAILY_CAP, 60 * 60 * 26)) {
      return res.status(429).json({ error: 'The printer has made all its memories for today. Please come back tomorrow.' });
    }

    const oai = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: buildGenerationPrompt(answers),
        n: 1,
        size: '1536x1024',
        // WebP keeps the base64 response well under Vercel's 4.5 MB body limit.
        output_format: 'webp',
        output_compression: 85,
      }),
    });

    if (!oai.ok) {
      console.error('[memory-printer] OpenAI error', oai.status, await oai.text());
      return res.status(502).json({ error: "We couldn't make your memory this time. Please try again." });
    }

    const data = await oai.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(502).json({ error: "We couldn't make your memory this time. Please try again." });
    }

    return res.status(200).json({ imageUrl: `data:image/webp;base64,${b64}` });
  } catch (e) {
    console.error('[memory-printer]', e);
    return res.status(500).json({ error: 'Something went wrong while making the memory.' });
  }
};
