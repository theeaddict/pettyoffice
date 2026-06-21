import confetti from 'canvas-confetti';

const STORAGE_KEY = 'pettyoffice_milestones_seen';

const MILESTONES = [
  { threshold: 100, message: '100 Brains Sued. The courts are overwhelmed.', emoji: '⚖️' },
  { threshold: 500, message: '500 documents filed. Justice is being served.', emoji: '📄' },
  { threshold: 1000, message: '1,000 cases. We are now officially a movement.', emoji: '🎉' },
  { threshold: 5000, message: '5,000 petty documents. The UN has been notified.', emoji: '🌍' },
  { threshold: 10000, message: '10,000 cases. PettyOffice is now too big to fail.', emoji: '👔' },
];

function getSeen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markSeen(threshold) {
  const seen = getSeen();
  seen.add(threshold);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
}

export function checkMilestones(total) {
  const seen = getSeen();
  const eligible = MILESTONES
    .filter(m => m.threshold <= total && !seen.has(m.threshold))
    .sort((a, b) => b.threshold - a.threshold);

  if (eligible.length === 0) return;

  const ms = eligible[0];
  showCelebration(ms);
  markSeen(ms.threshold);
}

function showCelebration(ms) {
  const existing = document.getElementById('milestone-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'milestone-overlay';
  overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm';
  overlay.style.animation = 'fadeIn 0.3s ease-out';

  overlay.innerHTML = `
    <div class="relative w-full max-w-sm mx-4 bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700/50 rounded-2xl p-8 shadow-2xl text-center space-y-4" style="animation: scaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)">
      <div class="text-6xl mb-1">${ms.emoji}</div>
      <div class="text-5xl font-extrabold text-emerald-400 font-mono stat-value milestone-count">${ms.threshold.toLocaleString()}</div>
      <p class="text-sm text-slate-300 leading-relaxed max-w-xs mx-auto">${ms.emoji} ${ms.threshold.toLocaleString()} ${ms.message}</p>
      <button id="milestone-share-btn" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-xl transition shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2">
        <span>🔗</span>
        <span>Share this milestone</span>
      </button>
      <p class="text-[9px] font-mono text-slate-600">Tap anywhere or wait 5s to dismiss</p>
    </div>
  `;

  document.body.appendChild(overlay);

  confetti({
    particleCount: 200,
    spread: 140,
    origin: { y: 0.55 },
    colors: ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
  });

  setTimeout(() => {
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.4, x: 0.3 },
      colors: ['#10b981', '#6366f1', '#f59e0b'],
    });
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.4, x: 0.7 },
      colors: ['#ef4444', '#8b5cf6', '#ec4899'],
    });
  }, 300);

  overlay.querySelector('#milestone-share-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const text = `🎉 PettyOffice just hit ${ms.threshold.toLocaleString()} generations! ${ms.emoji} ${ms.threshold.toLocaleString()} ${ms.message}`;
    if (navigator.share) {
      navigator.share({ title: 'PettyOffice Milestone', text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  });

  const timer = setTimeout(() => overlay.remove(), 5000);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      clearTimeout(timer);
      overlay.remove();
    }
  });
}
