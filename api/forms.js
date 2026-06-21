// GET /api/forms — Public endpoint.
// Returns all active forms_metadata rows for the front-end dashboard.

import { getSupabase } from './_supabase.js';
import { applyRateLimit } from './_rate-limit.js';

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, { key: 'forms', max: 60 })) return;
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  res.setHeader('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : ''));
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'");

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('forms_metadata')
      .select('id, module_type, category_name, emoji_or_icon, description_text, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;
    return res.status(200).json({ success: true, data: data || [] });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Failed to fetch') || msg.includes('table') || msg.includes('schema cache') || msg.includes('not configured')) {
      return res.status(200).json({
        success: true,
        source: 'fallback',
        data: [
          { id: 1, module_type: 'sue_brain', category_name: 'Sue Your Brain', emoji_or_icon: '⚖️', description_text: 'File a formal complaint against your own brain for emotional damages.', display_order: 0 },
          { id: 2, module_type: 'invoice_ex', category_name: 'Invoice Your Ex', emoji_or_icon: '💸', description_text: 'Generate an itemized bill for emotional labor, time wasted, and red flags ignored.', display_order: 1 },
          { id: 3, module_type: 'breakup_habit', category_name: 'Break Up With a Bad Habit', emoji_or_icon: '💼', description_text: 'Issue a formal PIP and termination letter to a toxic habit.', display_order: 2 },
          { id: 4, module_type: 'cosmic', category_name: 'Universe Contract', emoji_or_icon: '📡', description_text: 'Demand all documents, memos, and divine correspondence related to your situation.', display_order: 3 },
          { id: 11, module_type: 'sue_brain', category_name: 'Overthinking', emoji_or_icon: '🌪️', description_text: 'Replaying a completely fictional crisis at 2:00 AM with a 0.02% chance of actually happening.', display_order: 4 },
          { id: 12, module_type: 'sue_brain', category_name: 'Cringe Memories', emoji_or_icon: '😳', description_text: 'Force-loading a highly awkward handshake or greeting from 2018 precisely when trying to fall asleep.', display_order: 5 },
          { id: 13, module_type: 'sue_brain', category_name: 'Procrastination', emoji_or_icon: '🕒', description_text: 'Staring at a blank document or task layout for 45 minutes while fully aware of the hard deadline.', display_order: 6 },
          { id: 14, module_type: 'sue_brain', category_name: 'Shower Arguments', emoji_or_icon: '🧼', description_text: 'Simulating an intensely complex confrontational debate in the shower, winning it flawlessly, but never executing it.', display_order: 7 },
          { id: 15, module_type: 'sue_brain', category_name: 'Choice Paralysis', emoji_or_icon: '🪫', description_text: 'Scrolling through Netflix/UberEats for an hour to find the perfect choice until you lose your appetite entirely.', display_order: 8 },
          { id: 16, module_type: 'sue_brain', category_name: 'Imposter Syndrome', emoji_or_icon: '📉', description_text: 'Convinced that a tiny typing error in a casual email will result in immediate professional ruin.', display_order: 9 },
          { id: 21, module_type: 'invoice_ex', category_name: 'Wasting My 20s', emoji_or_icon: '⏳', description_text: 'Billing for the prime years spent listening to awful music and worse opinions.', display_order: 10 },
          { id: 22, module_type: 'invoice_ex', category_name: 'Terrible Podcast Idea', emoji_or_icon: '🎙️', description_text: 'Itemizing the hours spent nodding while they explained their groundbreaking audio concept.', display_order: 11 },
          { id: 23, module_type: 'invoice_ex', category_name: 'Red Flags Ignored', emoji_or_icon: '🚩', description_text: 'Charging a premium for the willful blindness required to date them.', display_order: 12 },
          { id: 24, module_type: 'invoice_ex', category_name: 'Emotional Labor', emoji_or_icon: '🧠', description_text: 'Standard billing for functioning as their unpaid therapist.', display_order: 13 },
          { id: 25, module_type: 'invoice_ex', category_name: 'Pretending Mom was Nice', emoji_or_icon: '👵', description_text: 'Hazard pay for surviving holiday dinners with their family.', display_order: 14 },
          { id: 26, module_type: 'invoice_ex', category_name: 'Stolen Hoodies', emoji_or_icon: '🧥', description_text: 'Recouping the cost of the premium outerwear that was never returned.', display_order: 15 },
          { id: 31, module_type: 'breakup_habit', category_name: 'Doomscrolling', emoji_or_icon: '📱', description_text: 'Revoking the screen-time contract of an app that promised 5 minutes of rest but stole 4 hours of life.', display_order: 16 },
          { id: 32, module_type: 'breakup_habit', category_name: 'Impulse Buying', emoji_or_icon: '🛍️', description_text: 'Terminating the internal logic system that convinces you a luxury purchase counts as self-care.', display_order: 17 },
          { id: 33, module_type: 'breakup_habit', category_name: 'Late-Night Snacking', emoji_or_icon: '🍿', description_text: 'Issuing an immediate corporate ceasefire to the kitchen pantry raids executed past midnight.', display_order: 18 },
          { id: 41, module_type: 'cosmic', category_name: 'Why I am still single', emoji_or_icon: '💔', description_text: 'Requesting all divine correspondence related to current romantic status and timing.', display_order: 19 },
          { id: 42, module_type: 'cosmic', category_name: 'Why my crypto tanked', emoji_or_icon: '📉', description_text: 'Demanding the internal memo explaining market decisions made on your behalf.', display_order: 20 },
          { id: 43, module_type: 'cosmic', category_name: 'What the plan is', emoji_or_icon: '🗺️', description_text: 'Seeking all strategic documents outlining the next 5-year cosmic roadmap.', display_order: 21 },
          { id: 44, module_type: 'cosmic', category_name: 'Where my motivation went', emoji_or_icon: '🔋', description_text: 'Requesting the location and custodial records for your missing drive.', display_order: 22 },
          { id: 45, module_type: 'cosmic', category_name: 'Why my package is late', emoji_or_icon: '📦', description_text: 'Filing a formal request for all shipping and logistics correspondence.', display_order: 23 },
        ],
        warning: 'Database not configured — using local form definitions',
      });
    }
    console.error('/api/forms error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
