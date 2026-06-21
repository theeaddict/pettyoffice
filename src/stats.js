export const METRICS_CONFIG = [
  { key: 'sue_brain', icon: '⚖️', label: 'Brains successfully sued' },
  { key: 'invoice_ex', icon: '💸', label: 'Invoices generated for exes' },
  { key: 'breakup_habit', icon: '💼', label: 'Bad habits terminated' },
  { key: 'cosmic', icon: '📡', label: 'Universe Contracts signed' },
];

export async function fetchStats() {
  const res = await fetch('/api/stats');
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error('API not available (dev mode)');
  }
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch stats');
  return {
    toolCounts: json.toolCounts || {},
    countryCount: json.countryCount || 0,
    todayCount: json.today || 0,
  };
}

export function animateValue(el, start, end, duration) {
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (end - start) * eased);
    el.textContent = current.toLocaleString();
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}
