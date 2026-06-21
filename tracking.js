/**
 * PettyOffice Event Tracking Module
 *
 * Silently logs visitor page views and document generations
 * to the Supabase "visitors" and "generations" tables.
 * All calls are fire-and-forget — errors are caught and logged
 * to console but never block the user experience.
 */

import { supabase } from './supabase.js';

// ---------- Country Detection ----------

let cachedCountry = 'Unknown';
let countryReady = false;

/**
 * Resolve country from browser locale (no external API calls).
 */
async function resolveCountry() {
  try {
    const locale = navigator.language || navigator.userLanguage || '';
    const parts = locale.split('-');
    if (parts.length > 1) {
      cachedCountry = parts[parts.length - 1].toUpperCase();
    }
  } catch { /* silently ignore */ }
  countryReady = true;
}

const countryPromise = resolveCountry();

// ---------- Device Detection ----------

function getDevice() {
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

// ---------- Public Tracking Functions ----------

/**
 * Track a page visit.
 * Inserts a row into the "visitors" table with page name,
 * detected country, and device type.
 *
 * @param {string} page - view identifier, e.g. "launchpad", "renderer"
 */
export async function trackVisit(page) {
  try {
    // Wait for country on first call only
    if (!countryReady) await countryPromise;

    await supabase.from('visitors').insert({
      page,
      country: cachedCountry,
      device: getDevice(),
    });
  } catch (err) {
    console.error('[PettyOffice tracking] visitor insert failed:', err);
  }
}

/**
 * Track a document generation event.
 * Inserts a row into the "generations" table with the tool name,
 * detected country, and device type.
 *
 * @param {string} toolName - tool identifier, e.g. "sue_brain", "cease_anxiety"
 */
export async function trackGeneration(toolName) {
  try {
    if (!countryReady) await countryPromise;

    await supabase.from('generations').insert({
      tool: toolName,
      country: cachedCountry,
      device: getDevice(),
    });
  } catch (err) {
    console.error('[PettyOffice tracking] generation insert failed:', err);
  }
}
