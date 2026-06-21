// GET /api/stats — Safe aggregated metrics for admin/public dashboards.
// Exposes counts, trends, and device breakdown only. No raw rows.

import { getSupabase } from './_supabase.js';
import { applyRateLimit } from './_rate-limit.js';

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, { key: 'stats', max: 60 })) return;
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

    const { data: allGenerations, error: genError } = await supabase
      .from('generations')
      .select('tool, country, device, created_at');
    if (genError) throw genError;

    const { data: allVisitors, error: visError } = await supabase
      .from('visitors')
      .select('device, page, created_at');
    if (visError) throw visError;

    const generations = allGenerations || [];
    const visitors = allVisitors || [];

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));

    let total = 0;
    let today = 0;
    let week = 0;
    const toolCounts = {};
    const countryCounts = {};
    const devices = { mobile: 0, desktop: 0 };
    const dailyBuckets = {};

    for (let i = 29; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setUTCDate(d.getUTCDate() - i);
      dailyBuckets[d.toISOString().split('T')[0]] = 0;
    }

    for (const g of generations) {
      total++;
      const created = new Date(g.created_at);
      if (created >= todayStart) today++;
      if (created >= weekStart) week++;
      const dateKey = created.toISOString().split('T')[0];
      if (dateKey in dailyBuckets) dailyBuckets[dateKey]++;
      toolCounts[g.tool] = (toolCounts[g.tool] || 0) + 1;
      if (g.country) countryCounts[g.country] = (countryCounts[g.country] || 0) + 1;
    }

    for (const v of visitors) {
      if (v.device === 'mobile') devices.mobile++;
      else devices.desktop++;
    }

    const topCountries = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([country, count]) => ({ country, count }));

    const dailyTrend = Object.entries(dailyBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return res.status(200).json({
      success: true,
      total,
      today,
      week,
      toolCounts,
      countryCount: topCountries.length,
      topCountries,
      devices,
      visitors: visitors.length,
      dailyTrend,
    });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('must be set') || msg.includes('not configured') || msg.includes('table') || msg.includes('schema cache') || msg.includes('Failed to fetch') || msg.includes('fetch')) {
      console.error('/api/stats FALLBACK TRIGGERED. Error:', err.message);
      return res.status(200).json({
        success: true,
        source: 'fallback',
        total: 0,
        today: 0,
        week: 0,
        toolCounts: {},
        countryCount: 0,
        topCountries: [],
        devices: { mobile: 0, desktop: 0 },
        visitors: 0,
        dailyTrend: [],
      });
    }
    console.error('/api/stats error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
