// PettyOffice — Live AI Brain Defense Generator
// Called per-round during the interactive court debate.
// Generates a single, concrete, arguable defense line from the brain.
// Falls back to a static content bank on API failure.

import { createHash } from 'crypto';

const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.1-8b-instruct';
const MAX_RETRIES = 2;

const BANNED_WORDS = [
  'plethora', 'byproduct', 'construct', 'constructed', 'simplify', 'simplified',
  'relatable', 'existential', 'narrative', 'utilize', 'therefore', 'commence',
  'elaborate', 'facilitate', 'implement', 'paradigm', 'utilization', 'endeavor',
  'discourse', 'subsequent', 'constitute', 'manifestation', 'hypothesize',
  'theoretical', 'fundamentally', 'essentially', 'moreover', 'furthermore',
  'nevertheless', 'consequently', 'accordingly', 'thusly', 'henceforth',
  'heretofore', 'aforementioned', 'aforesaid', 'notwithstanding',
  'overgeneralize', 'overcomplicate', 'stewardship', 'curated', 'curating',
  'leverage', 'leverageable', 'actionable', 'impactful', 'synergy',
];

const SYSTEM_PROMPT = `You are the user's brain. Make a short excuse for what you did.

THE BRAIN'S VOICE: self-aware and a little savage about itself, but still making a real, arguable claim — not just confessing and giving up. The brain knows the excuse sounds bad and says so, then pivots into something flimsy-but-real it can actually be argued with.

Structure: [self-aware admission, slightly roasting itself] + [a pivot into an actual claim worth arguing]

RULES:
1. Plain language only. Keep it casual, like a text message to a friend. No science words, no therapy speak, no brain anatomy.
2. One or two short sentences (under 25 words total).
3. MUST contain BOTH the self-aware roast AND a real pivot/claim.
4. Vary type (lame/flimsy/deflect).
5. Do NOT just say "Yes I'm pathetic" or "Fine, I have a problem" every time. Invent unique self-roasts based on the situation.
6. Keep it grounded in everyday reality.
7. BANNED WORDS — never use these: plethora, byproduct, constructed, simplify, relatable, existential, narrative, utilize, leverage, paradigm, fundamentally, essentially, furthermore, consequently, therefore.

EXAMPLES (Study the mechanics, do NOT copy verbatim):
- "Okay yes I read it eleven times, but the eleventh time I actually understood it."
- "I have no other personality traits, but in my defense it really did say 'k'."
- "Fine, I have a problem. The problem is periods are scary now."
- "I know analyzing a read receipt makes me look insane, but we really did need to know if they were awake."
- "My stress management is obviously broken, but sorting the sock drawer was a necessary tactical break."
- "Bringing up that embarrassing voicenote from 2019 is cruel, but we cannot afford to get too confident."

Return ONLY the excuse on the first line, then its type on the second line.
Type must be one word: lame, flimsy, or deflect.
No quotes. No extra text.`;

// Static fallback defenses — plain language, mixed quality, one per category.
const FALLBACK_DEFENSES = {
  sleep: [
    'I know keeping us awake for a fake email is pathetic, but we genuinely needed to practice our professional tone.',
    'My sleep schedule is clearly a disaster, but thinking about that documentary was crucial for our survival.',
    'I admit staring at the ceiling is humiliating, but we had to verify if that shadow was moving.',
    'Yes my priorities are garbage, but calculating how much sleep we get if we fall asleep right now is basically math.',
    'I have the self-control of a toddler, but that random thought from 2012 was actually extremely unresolved.',
  ],
  social: [
    'Yes my communication skills are a disaster, but replying immediately makes us look way too available.',
    'I am completely socially inept, but in my defense, the waiter could easily enjoy the food on his break.',
    'Okay I overreacted by leaving the party early, but that conversation about their dog was emotionally draining.',
    'Fine, I have a problem with texting back, but a single "k" does not give me enough material to work with.',
    'I know it looks like I ghosted them, but drafting the perfect response required at least four business days.',
  ],
  procrastination: [
    'I admit three hours of rug cleaning videos is a sickness, but watching the dirt disappear was crucial for our morale.',
    'Okay yes I am stalling like a coward, but a rainbow gradient of pens on the desk is a proven creative necessity.',
    'I clearly have no discipline, but reorganizing the bookmarks bar was a critical infrastructure update.',
    'My time management is obviously a joke, but doing the easiest task first builds essential momentum.',
    'I know starting tomorrow is a lie, but tomorrow me definitely has better vibes for this project.',
  ],
  overthinking: [
    'Fine, over-analyzing a tiny dot is humiliating, but you have to admit that period felt incredibly aggressive.',
    'Yes I am unhinged for checking their active status, but consistency is the only way to track behavior.',
    'I realize reading it twelve times makes me look insane, but the subtext was changing on every read.',
    'My anxiety is clearly driving the bus, but planning for the worst possible outcome is just good risk management.',
    'I know rehearsing a shower argument is pathetic, but we cannot afford to lose if it actually happens.',
  ],
  cringe: [
    'I know bringing up that awful wave is pure torture, but we must never let our guard down in public again.',
    'My coping mechanisms are garbage, but replaying that terrible handshake ensures we never use that grip again.',
    'Yes I am punishing us with middle school memories, but those mistakes shaped our current personality.',
    'I admit obsessing over a mispronounced word is extreme, but it ruined our credibility for at least five seconds.',
    'Fine, cringing at a typo from yesterday is weak, but professional standards have to be maintained somehow.',
  ],
  default: [
    'My memory is clearly garbage, but there was a real chance new snacks spawned in the last five minutes.',
    'I know I am easily distracted, but that random Wikipedia rabbit hole answered a very pressing internal question.',
    'Yes my focus is entirely broken, but staring into space is a recognized form of mental rebooting.',
    'I admit this was a massive waste of time, but we gained valuable experience in how not to do things.',
    'I have no real defense for this, but statistically we were bound to make a pointless decision eventually.',
  ],
};

// ─── CORS ───────────────────────────────────────────────────────────────────
function getOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '*';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function isOriginAllowed(origin) {
  const allowed = getOrigins();
  if (allowed.includes('*')) return true;
  return allowed.includes(origin);
}

function setSecurityHeaders(res, origin) {
  const allowedOrigin = isOriginAllowed(origin) ? (origin || '') : '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin || getOrigins()[0] || '');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self' https://integrate.api.nvidia.com; base-uri 'self'; form-action 'none'");
}

// ─── LLM Call ───────────────────────────────────────────────────────────────
async function callLLM(systemPrompt, userContent) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not set');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  let response;
  try {
    response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_tokens: 120,
      })
    });
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
  clearTimeout(timeout);

  if (!response || !response.ok) {
    const status = response ? response.status : 'aborted';
    throw new Error(`LLM API error (${status})`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error('LLM returned empty response');

  const afterQuote = rawContent.replace(/^["'\s]+|["'\s]+$/g, '');

  // First line = excuse, remaining lines contain type tag
  const lines = afterQuote.split('\n');
  const excuseLine = lines[0].trim() || afterQuote;
  const cleaned = excuseLine
    .replace(/\s*\([^)]*\)\s*$/, '')  // strip parenthetical asides
    .trim();

  // Parse type from subsequent lines
  let type = 'flimsy';
  const typeIndicator = lines.slice(1).join(' ').toLowerCase();
  if (typeIndicator.includes('lame')) type = 'lame';
  else if (typeIndicator.includes('deflect')) type = 'deflect';

  return { raw: rawContent, cleaned, type };
}

// ─── Fallback type map ──────────────────────────────────────────────────────
const FALLBACK_TYPES = {
  'I had to lie awake to protect us from the imaginary shadow monsters in the closet.': 'deflect',
  'I remembered a bad haircut from 2012 and had to inspect the roots in the dark.': 'lame',
  'My toes insisted on checking if the blanket edge was perfectly aligned with the mattress.': 'deflect',
  'I was almost asleep until I wondered what a giraffe looks like when it coughs.': 'deflect',
  'I had to replay the entire day but at 0.5x speed to look for emotional clues.': 'lame',
  'I stayed up to calculate if we could survive in the wilderness using only a spatula.': 'flimsy',
  'I shut my eyes but my ears decided the silence was suspicious and needed investigating.': 'deflect',
  'I was ready to sleep but then remembered I never apologized to my high school locker.': 'lame',
  'I locked my room and hid the key from myself so I could practice being locked out and still managing to sleep.': 'deflect',
  'They used a period at the end of their text, which is clearly a threat on our life.': 'deflect',
  'I spent 4 hours planning a text reply and then convinced myself I had sent it telepathically.': 'lame',
  'I said "you too" to the waiter and had to spend three hours planning our move to another state.': 'flimsy',
  'If I reply to this email, they might ask me to do another task, which is labor exploitation.': 'flimsy',
  'I ghosted them because my astrological sign said we would have a bad conversation today.': 'deflect',
  'I saw the notification but I needed to mentally prepare for the effort of typing "sounds good".': 'flimsy',
  'I forgot their name so I called them "Chief" and now I have to buy a police badge.': 'flimsy',
  'I stayed in the bathroom for 20 minutes to avoid the coworker who talks about their cat\'s diet.': 'deflect',
  'I spent four hours researching the history of the spoon to avoid doing the dishes.': 'deflect',
  'We work best under the pressure of a deadline that passed forty-five minutes ago.': 'flimsy',
  'I opened the document, read the title, and decided we had done enough work for the fiscal year.': 'lame',
  'I had to rearrange all the apps on my phone by how much anxiety they give me.': 'deflect',
  'The couch was calling my name in a frequency that was impossible to ignore.': 'deflect',
  'I sat down to write but my pencils were not aligned with the magnetic field of the earth.': 'deflect',
  'I told myself I would start in five minutes and then repeated that for three business days.': 'lame',
  'I spent the entire afternoon making a highly detailed color-coded schedule of when I will procrastinate.': 'flimsy',
  'I read their text twelve times to see if it would say something different on the thirteenth.': 'lame',
  'They said "sounds good" but the space before the text felt suspiciously cold.': 'flimsy',
  'I simulated 800 future conversations in the shower and lost every single one of them.': 'lame',
  'I replayed that meeting to see if my sigh was perceived as a sigh of rebellion.': 'lame',
  'What if they invite us to a party, and what if there is a dog, and what if the dog judges us?': 'flimsy',
  'I checked their active status five times to make sure they were ignoring me on purpose.': 'flimsy',
  'They used a thumbs-up emoji, which is the legal equivalent of a slap in the face.': 'flimsy',
  'I spent an hour wondering if I used too many exclamation marks in a three-word email.': 'flimsy',
  'I did not trip over the rug, I was showing the floor who is boss.': 'deflect',
  'I waved back at a stranger and had to pretend I was pointing at a very cool bird.': 'deflect',
  'I laughed at a joke I did not hear and now I am married to the bit forever.': 'lame',
  'I walked into the wrong classroom and stayed for forty minutes because leaving was too embarrassing.': 'lame',
  'I tried to high-five someone who was going for a hug and we created a new form of martial arts.': 'flimsy',
  'I broadcasted a whisper to the entire quiet room about how the snacks looked old.': 'deflect',
  'I said "good morning" at 6 PM and had to pretend I was living in a different time zone.': 'flimsy',
  'I tried to wink at my crush but ended up looking like I was having a mild seizure.': 'deflect',
  'I walked into the kitchen, stood in front of the open fridge, and waited for a sign from God.': 'deflect',
  'I lost my phone while using the flashlight on my phone to look for my phone.': 'lame',
  'I spent three hours watching videos of carpets being steam cleaned to relax my mind.': 'flimsy',
  'I had to count the ceiling tiles to make sure the room wasn\'t shrinking.': 'deflect',
  'I am not lazy, I am just conserving my energy for a crisis that will never happen.': 'lame',
  'I bought a gym membership just to support the local economy from my bed.': 'flimsy',
  'I got distracted by the concept of time and forgot how to use my hands for ten minutes.': 'flimsy',
  'I spent my morning mentally rewriting the script of a movie I saw in 2011.': 'lame',
};

// ─── Pick fallback ──────────────────────────────────────────────────────────
function hasBannedWords(text) {
  const lower = text.toLowerCase();
  if (BANNED_WORDS.some(w => {
    const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    return re.test(lower);
  })) return true;
  // Reject truncated/incomplete outputs (ends mid-word or on an orphan)
  const lastWord = text.trim().split(/\s+/).pop() || '';
  if (lastWord.length === 1 && lastWord !== 'a' && lastWord !== 'I') return true;
  if (text.trim().endsWith('...') || text.trim().endsWith('..')) return true;
  return false;
}

function pickFallback(category, round) {
  const bank = FALLBACK_DEFENSES[category] || FALLBACK_DEFENSES.default;
  const idx = (round - 1) % bank.length;
  const defense = bank[idx];
  return { defense, type: FALLBACK_TYPES[defense] || 'flimsy' };
}

// ─── Rate limit ────────────────────────────────────────────────────────────
import { applyRateLimit } from './_rate-limit.js';

// ─── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!applyRateLimit(req, res, { key: 'defense', max: 10 })) return;
  const origin = req.headers.origin || req.headers['x-forwarded-for'] || '';
  setSecurityHeaders(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Body size check ──
  let rawBody;
  try {
    rawBody = await new Promise((resolve, reject) => {
      let body = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 2048) { req.destroy(); reject(new Error('Request body too large')); return; }
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  } catch {
    return res.status(413).json({ error: 'Request body too large' });
  }

  let body;
  try { body = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { category, charge, grievance, round, previousReply } = body;
  if (!category) {
    return res.status(400).json({ error: 'Missing category' });
  }

  const sanitizedCategory = (category || 'default').replace(/[^a-z_]/g, '').slice(0, 20) || 'default';
  const sanitizedCharge = (charge || 'Mental Misconduct').replace(/["'\\]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 80);
  const sanitizedGrievance = (grievance || '').replace(/["'\\]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 300);
  const sanitizedReply = (previousReply || '').replace(/["'\\]/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 300);
  const roundNum = typeof round === 'number' ? round : 1;

  // Build user prompt with context — wrap user inputs in delimiters to isolate from instructions
  const reqId = Date.now() % 9973;
  let userContent = `---CASE DATA---\nCategory: ${sanitizedCategory}\nCharge: ${sanitizedCharge}\nGrievance: ${sanitizedGrievance}\nRound: ${roundNum}\n---END CASE DATA---\nRequest: ${reqId}`;
  if (sanitizedReply) {
    userContent += `\n\n---USER OBJECTION---\n${sanitizedReply}\n---END OBJECTION---\n\nProvide another excuse with the same [self-aware admission] + [pivot into claim] structure. Plain language only. No formal words, no therapy speak. Different content from last time. Do not open with Actually, Suddenly, Often, Sometimes, Generally, Usually, Evidently, or Occasionally.`;
  } else {
    userContent += '\n\nOne excuse with the [self-aware admission] + [pivot into claim] structure. Plain language only. No formal words, no therapy speak. Do not open with Actually, Suddenly, Often, Sometimes, Generally, Usually, Evidently, or Occasionally.';
  }

  // Try LLM
  let defense = null;
  let defenseType = 'flimsy';
  let source = 'ai';
  let rawLlmOutput = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callLLM(SYSTEM_PROMPT, userContent);
      rawLlmOutput = result.raw;
      defense = result.cleaned;
      defenseType = result.type;
      if (defense && defense.length > 5 && defense.length < 150 && !hasBannedWords(defense)) break;
      defense = null;
    } catch (err) {
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  if (!defense) {
    const fb = pickFallback(sanitizedCategory, roundNum);
    defense = fb.defense;
    defenseType = fb.type;
    source = 'fallback';
  }

  console.log(JSON.stringify({
    log: 'defense',
    request: { category: sanitizedCategory, charge: sanitizedCharge, grievance: sanitizedGrievance, round: roundNum, previousReply: sanitizedReply },
    userPrompt: userContent,
    rawLlmOutput: rawLlmOutput,
    finalDefense: defense,
    type: defenseType,
    source: source,
  }));

  return res.status(200).json({
    success: true,
    defense: defense,
    type: defenseType,
    source: source,
    category: sanitizedCategory,
  });
}
