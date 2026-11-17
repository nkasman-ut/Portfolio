// POST /api/memory-printer/next-question   body { answers, nextQuestion }
//   -> { question: string | null }
//
// Adapts the next interview question to what the visitor has shared (gpt-4o-mini).
// On any problem it falls back to the default question, so the interview never blocks.

const {
  REDIS_URL, REDIS_TOKEN, OPENAI_API_KEY,
  overLimit, readBody, clientIp, cleanAnswers,
} = require('./_lib');

const PER_IP_LIMIT = 40;       // adaptive questions per visitor...
const PER_IP_WINDOW = 60 * 60; // ...per hour

const SYSTEM = `You are guiding a quiet, intimate interview for a memory exhibition. The goal is to gather just enough to generate a vertical four-panel woodcut or linocut illustration — high contrast, not overly detailed. Each panel needs something to work with: a place, a presence, a detail, a feeling.

From the answers so far, deduce what you still need to know to make a compelling image. Only ask what is genuinely missing. If the next question is already answered, return null.

When you do ask, be brief, warm, and curious — the way a poet might ask. Reference what the person has already shared. Under 20 words.

Reply with only the adapted question text, or the word null. Nothing else.`;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = readBody(req);
  const nextQuestion = String(body.nextQuestion || '').slice(0, 300);
  const fallback = () => res.status(200).json({ question: nextQuestion });

  if (!OPENAI_API_KEY || !REDIS_URL || !REDIS_TOKEN) return fallback();

  try {
    if (await overLimit(`memprint:q:${clientIp(req)}`, PER_IP_LIMIT, PER_IP_WINDOW)) return fallback();

    const context = cleanAnswers(body.answers)
      .map((a, i) => `Q${i + 1}: ${a.question}\nA: ${a.answer}`)
      .join('\n\n');

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 80,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Answers so far:\n${context}\n\nDefault next question: "${nextQuestion}"\n\nAdapted question (or null if already answered):` },
        ],
      }),
    });
    if (!completion.ok) return fallback();

    const data = await completion.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return res.status(200).json({ question: text === 'null' ? null : (text || nextQuestion) });
  } catch (e) {
    console.error('[memory-printer]', e);
    return fallback();
  }
};
