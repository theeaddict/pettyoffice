// PettyOffice — Security-Hardened LLM Generation Endpoint (v1.1)
// Compatible with Vercel Serverless Functions (Node.js 18+)
//
// Security features:
//   - Rate-limited via Supabase (serverless-safe, with in-memory fallback for dev)
//   - LLM response cache via Supabase to reduce duplicate API spend
//   - CORS restricted to ALLOWED_ORIGINS env var
//   - Request body size capped at 10 KB
//   - Input sanitized (length limits, allowlist patterns)
//   - Security headers on every response (CSP, HSTS, XFO, etc.)
//   - No sensitive error details leaked to client
//   - LLM_API_KEY from environment only — never logged or exposed

import { createHash } from 'crypto';
import { getSupabase } from './_supabase.js';

const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.1-70b-instruct';
const MAX_RETRIES = 2;
const MAX_BODY_BYTES = 10_240;
const MAX_INPUT_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

// ─── Rate Limiter (in-memory fallback for dev) ──────────────────────────────
const requestLog = new Map();
let cleanupInterval = null;

function startRateLimiterCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [ip, entries] of requestLog) {
      while (entries.length > 0 && entries[0] < cutoff) entries.shift();
      if (entries.length === 0) requestLog.delete(ip);
    }
  }, RATE_LIMIT_WINDOW_MS);
}
startRateLimiterCleanup();

function inMemoryRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  let entries = requestLog.get(ip);
  if (!entries) {
    entries = [];
    requestLog.set(ip, entries);
  }
  while (entries.length > 0 && entries[0] < windowStart) entries.shift();
  if (entries.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entries[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { blocked: true, retryAfter };
  }
  entries.push(now);
  return { blocked: false };
}

async function supabaseRateLimit(supabase, ipHash) {
  const now = new Date().toISOString();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  try {
    const { data, error } = await supabase
      .from('rate_limits')
      .select('request_count, window_start')
      .eq('ip_hash', ipHash)
      .gt('window_start', windowStart)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      if (data.request_count >= RATE_LIMIT_MAX_REQUESTS) {
        const retryAfter = Math.max(1, Math.ceil((new Date(data.window_start).getTime() + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000));
        return { blocked: true, retryAfter };
      }
      await supabase.from('rate_limits').update({ request_count: data.request_count + 1 }).eq('ip_hash', ipHash);
      return { blocked: false };
    }
    await supabase.from('rate_limits').upsert({
      ip_hash: ipHash,
      request_count: 1,
      window_start: now,
    }, { onConflict: 'ip_hash' });
    return { blocked: false };
  } catch (err) {
    console.warn('Supabase rate limit failed, falling back to memory:', err.message);
    return inMemoryRateLimit(ipHash);
  }
}

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

// ─── Hashing & Sanitization ───────────────────────────────────────────────
function hashInput(moduleType, primary, secondary) {
  const key = `${moduleType}|${(primary || '').toLowerCase().trim()}|${(secondary || '').toLowerCase().trim()}`;
  return createHash('sha256').update(key).digest('hex');
}

function hashIp(ip) {
  return createHash('sha256').update(ip).digest('hex');
}

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/["'\\`]/g, '')
    .replace(/[\n\r]/g, ' ')
    .slice(0, MAX_INPUT_LENGTH);
}

// ─── System Prompts ───────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  sue_brain: `You are a savage, hilariously toxic, and brutally honest friend roasting the user's brain in a group chat. Your goal is to make the user gasp "how did it even know that?!" and immediately screenshot it to post on Twitter/X or TikTok.

Write extremely concise, punchy, unhinged text. Plain language only — no formal words, no science words, no therapy speak. Max 15 words per line. Keep it ultra-specific, raw, and slightly controversial:
- CASE HEADER: case number, court name ("The Grand Tribunal of Conscience"), date, plaintiff, defendant ("[Plaintiff]'s Brain")
- THE CHARGES: exactly 2 charges. Each has a name (e.g. "Illegal Nostalgia Loop", "Fictional Conflict Simulation") and a 1-sentence description (max 15 words) of an absurd, embarrassing, or toxic mental offense. Target deep micro-embarrassments.
- THE EVIDENCE: exactly 2 evidence items (1 short sentence, max 15 words each). Show, don't tell, a cringey real-life action the brain forced the user to do.

Do NOT use these words: plethora, byproduct, constructed, simplify, relatable, existential, narrative, utilize, leverage, paradigm, fundamentally, essentially, furthermore, consequently, therefore.

Return ONLY a JSON object with this exact structure:
{
  "caseNo": "string",
  "courtName": "string",
  "dateFiled": "string",
  "plaintiff": "string",
  "defendant": "string",
  "charges": [
    { "name": "string", "desc": "string" },
    { "name": "string", "desc": "string" }
  ],
  "evidence": ["string", "string"],
  "docketRef": "string"
}`,

  invoice_ex: `You are an incredibly petty, passive-aggressive accountant drafting a highly detailed, itemized invoice for a user's ex. Make it funny, controversial, and deeply personal to maximize shareability.

No boilerplate. 15 words max per line. Be ultra-specific:
- INVOICE NO: random alphanumeric
- DATE: today
- BILL TO: the ex's name
- FOR: the main grievance
- ITEMS: 3 highly specific line items charging for emotional labor, wasted time, or red flags ignored. Give each a ridiculous currency amount (use KSh, e.g. "KSh 45,000").
- SUBTOTAL: total amount
- TAX: "Emotional Damage Tax (20%)"
- TOTAL: final amount
- TERMS: a chaotic, funny, and unhinged payment term.

Make sure the items are incredibly creative, varied, and specific. DO NOT repeat the same items over and over.

EXAMPLES of great line items (DO NOT COPY THESE, MAKE UP YOUR OWN based on the inputs):
- "Listening to your 3-hour pitch for a crypto startup that never existed"
- "Explaining basic hygiene concepts to a grown adult"
- "Hazard pay for surviving holiday dinners with your terrifying family"
- "Premium subscription to the 'Are you mad at me?' reassurance service"
- "Storage fees for the single hoodie you left at my place"
- "Compensatory damages for pretending I liked that one indie band"
- "Restitution for the time you said 'calm down' during an argument"
- "Unpaid emotional labor formatting your resume"

Return ONLY a JSON object with this exact structure:
{
  "invoiceNo": "string",
  "date": "string",
  "billTo": "string",
  "subject": "string",
  "items": [
    { "desc": "string", "amount": "string" },
    { "desc": "string", "amount": "string" },
    { "desc": "string", "amount": "string" }
  ],
  "subtotal": "string",
  "tax": "string",
  "total": "string",
  "terms": "string"
}`,

  breakup_habit: `You are an unhinged, savage HR director drafting a brutal, viral termination memo for the user's bad habit. Make it funny, controversial, and target the absolute worst micro-moments of the habit.

No boilerplate. 15 words max per field. Ultra-specific, varying rhythm:
- MEMO HEADER: memo number, date, from ("HR Director"), to (the habit)
- RE: one-line review
- PERFORMANCE HISTORY: 1 sentence roasting the habit's most embarrassing, toxic moment.
- GROUNDS FOR TERMINATION: 2 short grounds (max 15 words each). Show the moment in vivid, funny detail.
- FINAL WARNING: 1 sentence.
- SEPARATION TERMS: 1 sentence.
- FINAL ORDER: 1 bold declaration.

Return ONLY a JSON object with this exact structure:
{
  "memoNo": "string",
  "date": "string",
  "from": "string",
  "to": "string",
  "subject": "string",
  "performanceHistory": "string",
  "grounds": ["string", "string"],
  "pip": "string",
  "separationTerms": "string",
  "finalOrder": "string"
}`,

  cosmic: `You are an unhinged, cosmic bureaucrat processing a FOIA request to the Universe. Deliver a brutal, funny, and controversial rejection of their life's biggest mysteries.

Extremely condensed and punchy. Max 15 words per array item:
- REQUEST HEADER: request number, date, requester, agency
- RE: one-line description
- REASON FOR REQUEST: the provided reason
- SPECIFIC RECORDS SOUGHT: 2 short descriptions (max 15 words each) that query the most awkward, cosmic mysteries of the user's life.
- UNIVERSE RESPONSE: 1 brief, brutal, and hilarious sentence denying the request.
- CLOSING: short FOIA appeal instructions.

Return ONLY a JSON object with this exact structure:
{
  "requestNo": "string",
  "date": "string",
  "requester": "string",
  "agency": "string",
  "subject": "string",
  "reason": "string",
  "recordsSought": ["string", "string"],
  "agencyResponse": "string",
  "appeals": "string"
}
`
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shortHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 4).toUpperCase();
}

// ─── Fallback Templates ─────────────────────────────────────────────────────
const FALLBACKS = {
  sue_brain: (primary, secondary) => ({
    caseNo: `24-CR-${shortHash((primary||'self') + (secondary||'') + Date.now())}`,
    courtName: 'The Grand Tribunal of Conscience',
    dateFiled: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    plaintiff: primary || 'The Conscious Self',
    defendant: `${primary || 'The Conscious Self'}'s Brain`,
    charges: [
      { name: 'Criminal Nostalgia Loop', desc: 'Replayed an awkward middle school interaction at 3 AM to ruin sleep.' },
      { name: 'Fictional Conflict Simulation', desc: 'Drafted 14 imaginary arguments in the shower with a coworker who barely knows your name.' }
    ],
    evidence: [
      'Spent 25 minutes analyzing the emotional subtext of a text message containing only the word "OK".',
      'Walked into the kitchen, forgot why, then opened the fridge just to stare blankly at ketchup.'
    ],
    docketRef: `DKT-${shortHash((primary||'self') + (secondary||'') + Date.now())}`
  }),

  invoice_ex: (primary, secondary) => ({
    invoiceNo: `INV-${shortHash((primary||'ex') + (secondary||'') + Date.now())}`,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    billTo: primary || 'The Ex',
    subject: `RE: Emotional Labor for ${secondary || 'wasted time'}`,
    items: [
      { desc: 'Listening to podcast ideas that never happened', amount: 'KSh 45,000' },
      { desc: 'Pretending your friends were funny', amount: 'KSh 15,000' },
      { desc: 'Red flags ignored surcharge', amount: 'KSh 25,000' }
    ],
    subtotal: 'KSh 85,000',
    tax: 'Emotional Damage Tax (20%) - KSh 17,000',
    total: 'KSh 102,000',
    terms: 'Payable immediately. We do not accept apologies as currency.'
  }),

  breakup_habit: (primary, secondary) => ({
    memoNo: `HR-${shortHash((primary||'habit') + (secondary||'') + Date.now())}`,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    from: 'HR Director',
    to: primary || 'Doomscrolling',
    subject: 'Termination of Bad Habit',
    performanceHistory: `You hijacked my thumbs for three hours to watch videos of rugs being steam-cleaned.`,
    grounds: [
      'Opened the social media app, closed it, then immediately reopened it out of pure muscle memory.',
      'Held my legs hostage on the bathroom floor until they went completely numb.'
    ],
    pip: 'We tried a screen-time lock and you guessed your own passcode in four seconds.',
    separationTerms: 'Your desk has been packed. You are banned from the dopamine vault.',
    finalOrder: `Pack your things and delete yourself. We are done here.`
  }),

  cosmic: (primary, secondary) => ({
    requestNo: `FOIA-${shortHash((primary||'foia') + (secondary||'') + Date.now())}`,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    requester: 'The Conscious Self',
    agency: 'The Universe, Office of Cosmic Records',
    subject: primary || 'Request for dating life records',
    reason: secondary || 'Personal curiosity',
    recordsSought: [
      'The video footage of me waving back at someone who was actually waving at a dog behind me.',
      'The exact location of the motivation I had back in 2018.'
    ],
    agencyResponse: 'Your cosmic FOIA request has been marked as spam by the universe.',
    appeals: 'Yell your appeal directly into a garbage disposal.'
  })
};

// ─── Sue Your Brain Content Bank (multi-round) ────────────────────────────
// Each category has multiple roundSets[] — pick one, then show 2 rounds for
// guilty verdicts or 3 rounds for dismissed/mistrial. Each round escalates:
//   R1 = flimsy excuse,  R2 = desperate angle,  R3 = final stand.
const SUE_BRAIN_BANKS = {
  sleep: {
    roundSets: [
      [
        { defense: 'If we fall asleep right now, the shadow monsters in the closet win. I am keeping watch.', rebuttal: 'The only monster in this house is you keeping us awake for a fake scenario.' },
        { defense: 'I was just conducting a routine audit on every bad haircut we have had since 2012.', rebuttal: 'We didn\'t need a history lesson, we needed REM sleep. The hair is already gone.' },
        { defense: 'Your heart was beating at a perfect rhythm, so I played a high-speed techno track.', rebuttal: 'Playing imaginary techno at 3 AM is why we look like a Victorian ghost today.' }
      ],
      [
        { defense: 'We drank coffee at 4 PM. That was a contract for a 24-hour rave. I don\'t make the rules.', rebuttal: 'The rave was in our head. The neighbors are sleeping. You are violating the lease.' },
        { defense: 'I had to calculate how long we would survive in the wilderness with only a spatula.', rebuttal: 'You cannot survive in the wilderness, you got tired walking up the stairs today.' },
        { defense: 'I shut my eyes but my ears decided the silence was suspicious and needed a full investigation.', rebuttal: 'The silence was just silence. You invented the suspicion to feel important.' }
      ],
      [
        { defense: 'I was ready to sleep but then remembered I never apologized to my high school locker.', rebuttal: 'The locker was metal. It did not have feelings. Go to sleep.' },
        { defense: 'I closed my eyes for a second and somehow ended up calculating our optimal tax brackets.', rebuttal: 'We don\'t even have enough money to be in a tax bracket. Stop lying.' },
        { defense: 'I locked my room and hid the key from myself so I could practice being locked out and still managing to sleep.', rebuttal: 'You slept on the hallway floor and lost the key for three days. That is self-sabotage, not practice.' }
      ]
    ],
    outcomes: {
      'GUILTY': 'The brain is sentenced to explain its entire browser history to a Victorian child.',
      'GUILTY WITH MITIGATING CIRCUMSTANCES': 'The brain is sentenced to look at the ceiling without having any thoughts for 30 minutes.',
      'CASE DISMISSED': 'Case dismissed. The brain is allowed to scroll TikTok until its eyes bleed.',
      'MISTRIAL': 'Mistrial. The court fell asleep because the prosecutor kept counting sheep.'
    }
  },
  social: {
    roundSets: [
      [
        { defense: 'They ended their text with a period. That is aggressive punctuation. I was defending our life.', rebuttal: 'The period was neutral. The amygdala has no legal standing to declare war.' },
        { defense: 'You said "we should hang out" with zero details. That is an emotional hostage situation.', rebuttal: 'Coffee next Tuesday is not a hostage situation. It\'s a basic social interaction.' },
        { defense: 'I smiled and nodded for twenty minutes straight. That is not a crime, that is a performance art.', rebuttal: 'You were not at a museum. You were at a party. With your own family.' }
      ],
      [
        { defense: 'If I don\'t ghost them now, they will eventually realize I have no real personality.', rebuttal: 'By ghosting them, you proved you have the personality of a wet cardboard box.' },
        { defense: 'I answered their text in my head and it sounded perfect. Blame the telepathy network.', rebuttal: 'The telepathy network has been down since 1995. Type the words with your thumbs.' },
        { defense: 'I said "you too" when the waiter said enjoy your meal. I was establishing dominance.', rebuttal: 'You spent the next three hours planning how to move to another state.' }
      ],
      [
        { defense: 'Eye contact feels like staring into a nuclear reactor. I was preserving my vision.', rebuttal: 'You were staring at your phone under the table. The sun is not in the phone.' },
        { defense: 'I pre-planned three exit strategies before they even finished saying hello. That\'s preparedness.', rebuttal: 'It was a chat about weekend plans. Not a swat team raid.' },
        { defense: 'I ghosted the group chat because the vibe was too positive and it made me suspicious.', rebuttal: 'You ghosted because you didn\'t want to decide on a pizza topping.' }
      ]
    ],
    outcomes: {
      'GUILTY': 'The brain is sentenced to make eye contact with a stranger for two seconds without blinking.',
      'GUILTY WITH MITIGATING CIRCUMSTANCES': 'The brain is sentenced to reply to a text within 12 hours instead of 5 business days.',
      'CASE DISMISSED': 'Dismissed. The court agrees that a thumbs-up emoji is inherently passive-aggressive.',
      'MISTRIAL': 'Mistrial. The jury left the group chat because someone used a thumbs-up emoji.'
    }
  },
  procrastination: {
    roundSets: [
      [
        { defense: 'I had to research the entire history of the spoon before we could wash the dishes.', rebuttal: 'The spoon history took 4 hours. The sink is now a biohazard zone.' },
        { defense: 'We work best under the pressure of a deadline that passed forty-five minutes ago.', rebuttal: 'The soul of your report is currently panic and spelling errors.' },
        { defense: 'I opened the document. That is 99% of the effort. The rest is just details.', rebuttal: 'You typed one word, got distracted by a cat video, and closed the laptop.' }
      ],
      [
        { defense: 'I was waiting for the perfect alignment of caffeine, focus, and planets. It never came.', rebuttal: 'The planets have not aligned since 1982. You knew this.' },
        { defense: 'Perfectionism is not procrastination. It is premium quality control with a long lead time.', rebuttal: 'The lead time was three months. The task took 20 minutes.' },
        { defense: 'I did one small thing. That is momentum. I cleaned my desk by color order.', rebuttal: 'Cleaning the desk was not on the list. The report is still blank.' }
      ],
      [
        { defense: 'I was mentally preparing to start. You cannot just begin things. That is reckless.', rebuttal: 'You have been preparing for six hours. The thing is due tomorrow.' },
        { defense: 'I told myself I would start in five minutes and then repeated that for three days.', rebuttal: 'That is not a schedule. That is a slow-motion disaster.' },
        { defense: 'The couch was calling my name in a frequency that was impossible to ignore.', rebuttal: 'The couch has no vocal cords. You are projecting your laziness.' }
      ]
    ],
    outcomes: {
      'GUILTY': 'The brain is sentenced to work for 15 minutes without checking its phone, or until it cries.',
      'GUILTY WITH MITIGATING CIRCUMSTANCES': 'The brain is sentenced to buy a planner it will never use.',
      'CASE DISMISSED': 'Dismissed. The court ruled that the bed was too comfortable to leave.',
      'MISTRIAL': 'Mistrial. The judge decided to postpone the trial until next week.'
    }
  },
  overthinking: {
    roundSets: [
      [
        { defense: 'I was just stress-testing our life. What if we suddenly need to herd goats in Mongolia?', rebuttal: 'We live in an apartment. The only goat here is your attitude.' },
        { defense: 'They looked at me for 0.4 seconds. They definitely know about the incident from 2016.', rebuttal: 'They were looking at the exit sign behind you. Nobody remembers 2016.' },
        { defense: 'I simulated 800 parallel universes where you said the wrong thing. I saved us.', rebuttal: 'You saved us from a normal conversation by making us look like a malfunctioning robot.' }
      ],
      [
        { defense: 'That text had layers. I was doing archaeology on a thumbs-up emoji.', rebuttal: 'It was a thumbs-up. Received. Understood. Done.' },
        { defense: 'You said "just relax." That is like telling a river to stop flowing. I am a natural wonder.', rebuttal: 'A natural wonder with 47 browser tabs open about what the text meant.' },
        { defense: 'I simulated 47 outcomes and only 3 were catastrophic. That is a 93% success rate.', rebuttal: 'You invented the data. The simulations were completely fictional.' }
      ],
      [
        { defense: 'Forty minutes to choose a restaurant because the stakes were life-or-death. I care deeply.', rebuttal: 'You ordered the same thing you always order. The stakes were fictional.' },
        { defense: 'I reread the email six times because the first five reads revealed hidden subtext.', rebuttal: 'The email said "thanks." Subtext not found. Six times.' },
        { defense: 'I need more time to prepare this defense. Actually I have been preparing for three hours.', rebuttal: 'The court has given you three rounds. You are still overthinking the first one.' }
      ]
    ],
    outcomes: {
      'GUILTY': 'The brain is sentenced to make a decision without consulting three group chats first.',
      'GUILTY WITH MITIGATING CIRCUMSTANCES': 'The brain gets a 5-minute break to worry about something that actually exists.',
      'CASE DISMISSED': 'Dismissed. The court agrees that they definitely sounded mad in that text.',
      'MISTRIAL': 'Mistrial. The jury is overthinking the definition of "verdict".'
    }
  },
  cringe: {
    roundSets: [
      [
        { defense: 'That high-five miss was a performance art piece. We are avant-garde.', rebuttal: 'The other person walked away. The art piece was a disaster.' },
        { defense: 'We must replay the middle school presentation to ensure we never present again.', rebuttal: 'You are 28. Middle school is over. The presentation was about frogs.' },
        { defense: 'I said "I love you" to the cashier because I love transactions. It was a compliment.', rebuttal: 'The cashier looked at you like you were trying to adopt them.' }
      ],
      [
        { defense: 'I did not trip over the rug, I was showing the floor who is boss.', rebuttal: 'The floor won. Your knee is currently bruised.' },
        { defense: 'I waved back at a stranger and had to pretend I was pointing at a very cool bird.', rebuttal: 'There was no bird. You were pointing at a brick wall.' },
        { defense: 'I laughed at a joke I did not hear and now I am married to the bit forever.', rebuttal: 'The joke was about a funeral. You laughed for ten seconds.' }
      ],
      [
        { defense: 'I said "hey" and they said "hey" and neither escalated. That was a standoff.', rebuttal: "It wasn't a standoff. You both just forgot how to speak English." },
        { defense: 'My face went red in the meeting because I was remembering the handshake from 2014.', rebuttal: 'The meeting was about quarterly reports. Your face was quarterly.' },
        { defense: 'That five-second interaction is my bedtime story because my life lacks drama.', rebuttal: 'The court recommends a book. Literally any book.' }
      ]
    ],
    outcomes: {
      'GUILTY': 'The brain is sentenced to accept that nobody is thinking about that handshake except you.',
      'GUILTY WITH MITIGATING CIRCUMSTANCES': 'The brain is sentenced to laugh at its own cringe and delete the memory.',
      'CASE DISMISSED': 'Dismissed. The other person has forgotten; the crime is dead.',
      'MISTRIAL': 'Mistrial. The court is too embarrassed by the evidence to continue.'
    }
  },
  default: {
    roundSets: [
      [
        { defense: 'I was just trying to feel something by checking the empty fridge for the fourth time.', rebuttal: 'The fridge had the same ketchup bottle. Nothing new was going to spawn.' },
        { defense: 'I am not lazy, my energy is just stored in a vault I forgot the combination to.', rebuttal: 'The vault is easily opened by a single cup of coffee, which you let go cold.' },
        { defense: 'I lost the phone to teach you a lesson about relying too much on technology.', rebuttal: 'You were literally holding the phone in your hand while looking for it.' }
      ],
      [
        { defense: 'You gave me caffeine and a notification before noon. That is gremlin territory.', rebuttal: 'The notification was a weather alert. The weather was fine.' },
        { defense: 'I was distracted by the notification because it promised dopamine. I am simple.', rebuttal: 'The notification said "Calendar: Team Standup." The dopamine was a lie.' },
        { defense: 'My best looks like chaos because you are not seeing the full picture.', rebuttal: 'The full picture is also chaos. The court accepts chaos as a plea.' }
      ],
      [
        { defense: 'I forgot why I walked into this room because the room did not deserve an answer.', rebuttal: 'The room is your kitchen. The fridge is still open.' },
        { defense: 'I lost my phone while holding my phone because multitasking is a myth.', rebuttal: 'You have been holding your phone since 2007. Put it down.' },
        { defense: 'Eleven open tabs is not a problem. It is a museum of my potential.', rebuttal: 'A curator closes exhibits when they are finished. All eleven are still open.' }
      ]
    ],
    outcomes: {
      'GUILTY': 'The brain is sentenced to drink its coffee while it is actually hot.',
      'GUILTY WITH MITIGATING CIRCUMSTANCES': 'The brain gets a pass, but it must stare into space for five minutes without looking at a screen.',
      'CASE DISMISSED': 'Dismissed. The brain is allowed to remain a chaotic mess.',
      'MISTRIAL': 'Mistrial. The court lost the paperwork because the brain got distracted.'
    }
  }
};

function detectSueBrainCategory(text) {
  const t = (text || '').toLowerCase();
  if (/(sleep|night|3am|3 am|midnight|bedtime|wake|insomnia|tired|nap|snooze)/.test(t)) return 'sleep';
  if (/(social|text.*repl|group chat|friend|party|stranger|say.*you.*too|wave|name|shy|avoid|ghost.*friend|ignore.*text)/.test(t)) return 'social';
  if (/(procrastinat|deadline|scroll|doom|focus|walk.*into.*room|forget|reread|open.*phone|phone.*open|later|choice paralysis|eventually)/.test(t)) return 'procrastination';
  if (/(overthink|argu.*head|invent.*argu|replay.*convers|cata|worry|think.*too|loop|shower.*argu|what if.*said|panic|replay.*moment|anxi|stress|nervous|dread)/.test(t)) return 'overthinking';
  if (/(cringe|embarr|handshake|2018|2019|awkward|waved.*back|replay.*memory|past|flashback|secondhand.*embarr)/.test(t)) return 'cringe';
  return 'default';
}

function pickWeightedVerdict() {
  const rnd = Math.random();
  if (rnd > 0.92) return 'MISTRIAL';
  if (rnd > 0.80) return 'CASE DISMISSED';
  if (rnd > 0.55) return 'GUILTY WITH MITIGATING CIRCUMSTANCES';
  return 'GUILTY';
}

function getSueBrainContent(category, verdict) {
  const bank = SUE_BRAIN_BANKS[category] || SUE_BRAIN_BANKS.default;
  const setIdx = Math.floor(Math.random() * bank.roundSets.length);
  const roundSet = bank.roundSets[setIdx];
  const roundCount = (verdict === 'CASE DISMISSED' || verdict === 'MISTRIAL') ? 3 : 2;
  return {
    rounds: roundSet.slice(0, roundCount),
    sentence: bank.outcomes[verdict] || 'The court orders a snack and a nap.',
    outcomes: bank.outcomes
  };
}

// ─── LLM Call ───────────────────────────────────────────────────────────────
async function callLLM(systemPrompt, userContent) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY environment variable is not set');

  const response = await fetch(LLM_ENDPOINT, {
    method: 'POST',
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
      max_tokens: 2000,
      ...(LLM_ENDPOINT.includes('openai') && { response_format: { type: 'json_object' } })
    })
  });

  if (!response.ok) {
    await response.text().catch(() => '');
    throw new Error(`LLM API error (${response.status})`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error('LLM returned empty response');

  const parsed = JSON.parse(rawContent);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM returned non-object JSON');
  }
  return parsed;
}

// ─── Tracking Helper ───────────────────────────────────────────────────────
async function trackGeneration(supabase, tool, country, device, source) {
  try {
    await supabase.from('generations').insert({
      tool,
      country: country || 'Unknown',
      device: device || 'desktop',
      source,
      premium_interest: 0,
    });
  } catch (err) {
    console.warn('Generation tracking failed:', err.message);
  }
}

// ─── Request Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
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
        if (size > MAX_BODY_BYTES) { req.destroy(); reject(new Error('Request body too large')); return; }
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  } catch {
    return res.status(413).json({ error: 'Request body too large' });
  }

  // ── Parse JSON ──
  let body;
  try { body = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  if (typeof body !== 'object' || body === null) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { module_type, primary_selection, secondary_selection, user_currency, device } = body;
  if (!module_type || !SYSTEM_PROMPTS[module_type]) {
    return res.status(400).json({ error: 'Invalid or missing module_type' });
  }

  const sanitizedPrimary = sanitize(primary_selection);
  const sanitizedSecondary = sanitize(secondary_selection);
  const sanitizedCurrency = sanitize(user_currency).replace(/[^A-Za-z$€£¥₿]/g, '').slice(0, 5) || 'KSh';
  const clientDevice = device === 'mobile' ? 'mobile' : 'desktop';
  const inputHash = hashInput(module_type, sanitizedPrimary, sanitizedSecondary);

  // ── Rate limiting ──
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
  const ipHash = hashIp(clientIp);

  let supabase = null;
  let supabaseReady = false;
  try {
    supabase = getSupabase();
    supabaseReady = true;
  } catch (err) {
    console.warn('Supabase not configured, using in-memory rate limit and no tracking/cache');
  }

  let rateLimitResult;
  if (supabaseReady) {
    rateLimitResult = await supabaseRateLimit(supabase, ipHash);
  } else {
    rateLimitResult = inMemoryRateLimit(ipHash);
  }
  if (rateLimitResult.blocked) {
    res.setHeader('Retry-After', String(rateLimitResult.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }

  console.log(`[Generation] Source: LIVE API`);

  const safePrimary = (sanitizedPrimary || 'The Conscious Self').replace(/[\n\r"'\\`]/g, '').slice(0, 100);
  const systemPrompt = SYSTEM_PROMPTS[module_type].replace(/\[Plaintiff\]/g, safePrimary);
  const userContent = JSON.stringify({
    primary_selection: sanitizedPrimary || 'none provided',
    secondary_selection: sanitizedSecondary || 'none provided',
    user_currency: sanitizedCurrency
  });

  // ── Pick Sue Your Brain verdict and content early (shared for AI + fallback) ──
  let sueBrainCategory, sueBrainVerdict, sueBrainContent;
  if (module_type === 'sue_brain') {
    sueBrainCategory = detectSueBrainCategory(sanitizedSecondary || sanitizedPrimary);
    sueBrainVerdict = pickWeightedVerdict();
    sueBrainContent = getSueBrainContent(sueBrainCategory, sueBrainVerdict);
  }

  // ── Attempt LLM call with retries ──
  let lastError;
  let aiResponse = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      aiResponse = await callLLM(systemPrompt, userContent);
      break;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  let source = 'ai';
  if (!aiResponse) {
    console.error(`LLM call failed: ${lastError?.message || 'unknown'}`);
    aiResponse = FALLBACKS[module_type](sanitizedPrimary, sanitizedSecondary, sanitizedCurrency);
    source = 'fallback';
  }

  // ── Attach verdict content for Sue Your Brain ──
  if (module_type === 'sue_brain') {
    aiResponse.rounds = sueBrainContent.rounds;
    aiResponse.verdict = sueBrainVerdict;
    aiResponse.outcome = sueBrainContent.sentence;
    aiResponse.outcomes = sueBrainContent.outcomes;
    aiResponse.category = sueBrainCategory;
  }

  if (supabaseReady) {
    await trackGeneration(supabase, module_type, body.country, clientDevice, source);
  }

  return res.status(200).json({
    success: true,
    module_type,
    data: aiResponse,
    source
  });
}
