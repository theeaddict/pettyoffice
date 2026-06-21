-- PettyOffice: forms_metadata table + seed data (v1.1)
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS forms_metadata (
  id BIGSERIAL PRIMARY KEY,
  module_type TEXT NOT NULL CHECK (module_type IN ('sue_brain', 'invoice_ex', 'breakup_habit', 'cosmic')),
  category_name TEXT NOT NULL,
  emoji_or_icon TEXT NOT NULL DEFAULT '📋',
  description_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE forms_metadata ENABLE ROW LEVEL SECURITY;

-- Public read for active rows only
CREATE POLICY IF NOT EXISTS "Public can read active forms"
  ON forms_metadata
  FOR SELECT
  USING (is_active = true);

-- Admin full access via service_role key (bypasses RLS automatically)

-- ── Module tiles (the 4 primary entry points) ──
INSERT INTO forms_metadata (module_type, category_name, emoji_or_icon, description_text, display_order) VALUES
  ('sue_brain',     'Sue Your Brain 🧠',          '⚖️', 'File a formal complaint against your own brain for emotional damages.',        0),
  ('invoice_ex',    'Invoice Your Ex 💸',            '💸', 'Issue a formal invoice for all the emotional labor, time, and energy they wasted.', 0),
  ('breakup_habit', 'Terminate a Habit 💼',       '💼', 'Issue a formal PIP and termination letter to a toxic habit.',                  0),
  ('cosmic',        'FOIA Request to the Universe', '📡', 'Demand all documents, memos, and divine correspondence related to your situation.', 0);

-- ── SUE YOUR BRAIN 🧠 options ──
INSERT INTO forms_metadata (module_type, category_name, emoji_or_icon, description_text, display_order) VALUES
  ('sue_brain', 'Overthinking',           '🌪️', 'Replaying a completely fictional crisis at 2:00 AM with a 0.02% chance of actually happening.', 1),
  ('sue_brain', 'Cringe Memories',        '😳', 'Force-loading a highly awkward handshake or greeting from 2018 precisely when trying to fall asleep.', 2),
  ('sue_brain', 'Procrastination',        '🕒', 'Staring at a blank document or task layout for 45 minutes while fully aware of the hard deadline.', 3),
  ('sue_brain', 'Shower Arguments',       '🧼', 'Simulating an intensely complex confrontational debate in the shower, winning it flawlessly, but never executing it.', 4),
  ('sue_brain', 'Choice Paralysis',       '🪫', 'Scrolling through Netflix/UberEats for an hour to find the perfect choice until you lose your appetite entirely.', 5),
  ('sue_brain', 'Imposter Syndrome',      '📉', 'Convinced that a tiny typing error in a casual email will result in immediate professional ruin.', 6);

-- ── INVOICE YOUR EX 💸 options ──
INSERT INTO forms_metadata (module_type, category_name, emoji_or_icon, description_text, display_order) VALUES
  ('invoice_ex', 'Emotional Labor',    '🧠', 'Therapy-level emotional heavy lifting disguised as a normal adult partnership.', 1),
  ('invoice_ex', 'Time Wasted',        '⏳', 'All the hours spent waiting, explaining, or re-explaining basic things.', 2),
  ('invoice_ex', 'Gaslighting',        '🕯️', 'Professional-grade confusion services that made you question your own memory.', 3),
  ('invoice_ex', 'Broken Promises',    '📜', 'A detailed ledger of verbal contracts that were breached without notice.', 4),
  ('invoice_ex', 'Ick Discovery',      '🤢', 'The moment you realized they are a completely different person than advertised.', 5),
  ('invoice_ex', 'Pet Custody',        '🐕', 'Emotional damages from the ongoing dispute over who gets the better companion.', 6);

-- ── TERMINATE A HABIT 💼 options ──
INSERT INTO forms_metadata (module_type, category_name, emoji_or_icon, description_text, display_order) VALUES
  ('breakup_habit', 'Doomscrolling',      '📱', 'Revoking the screen-time contract of an app that promised 5 minutes of rest but stole 4 hours of life.', 1),
  ('breakup_habit', 'Impulse Buying',     '🛍️', 'Terminating the internal logic system that convinces you a luxury purchase counts as self-care.', 2),
  ('breakup_habit', 'Late-Night Snacking','🍿', 'Issuing an immediate corporate ceasefire to the kitchen pantry raids executed past midnight.', 3);

-- ── FOIA REQUEST TO THE UNIVERSE 📡 options ──
INSERT INTO forms_metadata (module_type, category_name, emoji_or_icon, description_text, display_order) VALUES
  ('cosmic', 'Why I am still single',        '💔', 'Requesting all divine correspondence related to current romantic status and timing.', 1),
  ('cosmic', 'Why my crypto tanked',         '📉', 'Demanding the internal memo explaining market decisions made on your behalf.', 2),
  ('cosmic', 'What the plan is',             '🗺️', 'Seeking all strategic documents outlining the next 5-year cosmic roadmap.', 3),
  ('cosmic', 'Where my motivation went',     '🔋', 'Requesting the location and custodial records for your missing drive.', 4),
  ('cosmic', 'Why my package is late',       '📦', 'Filing a formal request for all shipping and logistics correspondence.', 5);
