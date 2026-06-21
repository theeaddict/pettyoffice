import fs from 'fs';

const apiKey = fs.readFileSync('.env', 'utf8').match(/LLM_API_KEY=(.*)/)[1];

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

EXAMPLES (Study the mechanics, do NOT copy verbatim):
- "Okay yes I read it eleven times, but the eleventh time I actually understood it."
- "I have no other personality traits, but in my defense it really did say 'k'."
- "Fine, I have a problem. The problem is periods are scary now."
- "I know analyzing a read receipt makes me look insane, but we really did need to know if they were awake."
- "My stress management is obviously broken, but sorting the sock drawer was a necessary break."
- "Bringing up that embarrassing voicenote from 2019 is cruel, but we cannot afford to get too confident."

Return ONLY the excuse on the first line, then its type on the second line.
Type must be one word: lame, flimsy, or deflect.
No quotes. No category name. No extra text.

Correct format:
I know analyzing a read receipt makes me look insane, but we really did need to know if they were awake.
flimsy`;

const categories = [
  { cat: "sleep", charge: "Thinking about work at 3am" },
  { cat: "social", charge: "Ignored text for 4 days" },
  { cat: "procrastination", charge: "Watched rug cleaning videos instead of working" },
  { cat: "overthinking", charge: "Analyzing a period at the end of 'okay.'" },
  { cat: "cringe", charge: "Remembering waving at a stranger" },
  { cat: "default", charge: "Opening the fridge 5 times" },
  { cat: "social", charge: "Said 'you too' to the waiter" },
  { cat: "procrastination", charge: "Arranging pens by color" }
];

async function run() {
  for (let c of categories) {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Category: ${c.cat}\nCharge: ${c.charge}\nRound: 1\nRequest: ${Date.now()}\n\nOne excuse with the [self-aware admission] + [pivot into claim] structure.` }
        ],
        temperature: 0.8,
        max_tokens: 80,
      })
    });
    const data = await res.json();
    console.log(`[${c.cat} / ${c.charge}]`);
    console.log(data.choices?.[0]?.message?.content);
    console.log('---');
  }
}

run();
