PettyOffice — Full System Report
1. Project Overview
PettyOffice is a single-page parody "productivity suite" that lets users generate satirical legal documents. It runs entirely in the browser with a Supabase backend for anonymous metrics. The vibe is dark corporate parody — slate backgrounds, monospace fonts, emerald accent numbers, Terminal-loading screens, and a tipping modal that frames donations as "Expense Reimbursement."
Two tools are currently wired: Sue Your Brain (generates a charges/evidence/verdict document about your own overthinking) and Invoice Your Ex (generates an invoice document with a HARD OVERDUE stamp). Two more modules — Break Up With Bad Habits and Universe Contract — exist in src/app.js but are not hooked into the UI.
2. Architecture — Two-Page SPA
The app is two HTML pages built by a single Vite multi-page config:
Page	Route	Purpose
index.html	/	Main app — home screen, input forms, loading terminal, document renderer, share/reaction UI, live metrics dashboard
admin/index.html	/admin/	Admin dashboard — password-gated, Chart.js visualizations, countries table, activity feed
Both pages are standalone HTML files with <script type="module"> blocks. index.html is an inline module (~600 lines of JS) that imports from tracking.js, src/stats.js, and src/milestones.js. admin/index.html delegates to src/admin.js.
There is a separate class-based architecture (src/app.js → PettyOfficeApp class, bootstrapped by src/main.js) that supports all 4 tools with a 2-step selection flow. This class is not used — index.html never imports it. It exists as dead/reference code.
3. Stack & Dependencies
Production dependencies (package.json dependencies)
Package	Version	Used By	Purpose
@supabase/supabase-js	^2.108.2	supabase.js	Anonymous INSERT/SELECT on generations and visitors tables
canvas-confetti	^1.9.4	src/milestones.js	Confetti bursts on milestone celebrations
chart.js	^4.5.1	src/admin.js	Bar, line, doughnut charts on admin dashboard
html2canvas	^1.4.1	index.html (CDN)	Captures document div to PNG for share/download
Note: html2canvas is loaded via CDN script tag in index.html, not through npm. The npm dependency is unused in the inline version.
Dev dependencies
Package	Version	Purpose
vite	^8.0.12	Build tool and dev server
tailwindcss	^4.3.1	Utility CSS framework
@tailwindcss/postcss	^4.3.1	Tailwind v4 PostCSS plugin
postcss	^8.5.15	CSS post-processor
autoprefixer	^10.5.0	Vendor prefix auto-adding
CDN dependencies (not in npm)
- Tailwind CSS CDN (cdn.tailwindcss.com) — dynamically generates Tailwind classes at runtime via the Play CDN. Used in both index.html and admin/index.html.
- Lucide Icons (unpkg.com/lucide@latest) — SVG icon library. Used for arrow-left, scale, receipt, share-2, check, x icons.
- html2canvas (cdnjs.cloudflare.com/.../html2canvas.min.js) — document screenshot capture.
- Google Fonts — Inter, EB Garamond, JetBrains Mono.
4. File-by-File Breakdown
index.html (1189 lines) — Main App
Contains everything: HTML structure, inline CSS, and a monolithic <script type="module"> block (~620 lines of JS).
Views (controlled by switchView()):
- view-home — Launchpad with two tiles (Legal_Notice.docx, Billing_Invoice.xlsx), telemetry card, live metrics dashboard
- view-input-lawsuit — Name input + crime text input + 30 categorized punchline options (5 categories × 6 options each)
- view-input-invoice — Radio button selection of 4 relationship grievances
- view-renderer — Document preview (#print-sheet with #sheet-content), reaction buttons (💀/😭/🤣), share button, copy link, "sue again" button
- view-loading — Terminal-style log printing with green-on-black aesthetic
Key JS functions:
- updateLawsuitBtn() — Enables/disables the File Lawsuit button based on name + crime validation
- switchView(viewName) — Hides/shows views, calls trackVisit()
- generateLawsuitContent(grievance, name) — Keyword-matching engine that returns 3 charges, 2 evidence items, wants, punishment based on grievance text category (sleep, social, procrastination, overthinking, cringe, or default fallback)
- renderLawsuitSheet(grievance, plaintiff) — Renders the new template (CASE #, charges, evidence, verdict, sentence, "drink water and log off" footer)
- renderInvoiceSheet(grievance) — Renders invoice template with HARD OVERDUE stamp, line items, tax calculation
- Reaction button handlers, share/capture with html2canvas, sue-again reset, copy link, tipping modal
- renderMetrics() — Fetches Supabase stats via fetchStats(), renders per-tool counts and summary with animated count-up
Styling approach: Tailwind CDN with inline config in <script> tag extending the Inter/EB Garamond/JetBrains Mono fonts. Custom CSS for .stamp-overdue (red double-border stamp), .gold-seal (radial gradient circle), metric animations, scrollbar tweaks.
Loading screen: 5 sequential log messages printing every 500ms, then a 300ms pause before showing the renderer. Messages are about "background check on Defendant (Brain)", "3AM cringe archive", etc.
admin/index.html (206 lines) — Admin Dashboard
Password-gated dashboard with:
- Password modal (#password-modal) — compares input against VITE_ADMIN_PASSWORD env var, stores in sessionStorage
- 4 stat cards: Total Documents, Generated Today, This Week, Page Visits
- 3 Chart.js canvases: bar (per-tool), line (30-day daily buckets), doughnut (mobile vs desktop)
- Top Countries table with % bars
- Recent Activity feed (last 20 generations, refreshes every 30s)
- Imports initAdmin from src/admin.js
src/admin.js (~380 lines) — Admin Logic
- initAdmin() — Entry point, checks sessionStorage auth, shows password modal or boots dashboard
- bootDashboard() — Shows dashboard, calls refreshDashboard(), sets up 30s interval
- Data fetching: fetchAllGenerations(), fetchVisitors(), fetchRecentActivity() — all fire-and-forget Supabase queries
- 3 Chart.js instances (bar/line/doughnut) with CHART_COLORS palette (['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'])
- renderCountriesTable() — Aggregates by country, sorts desc, renders with inline % bar using div width percentage
- renderActivityFeed() — Shows last 20 generations with tool icon, country flag (emoji), and timeAgo() relative timestamp
- checkMilestones() is called during dashboard refresh to trigger celebrations
src/stats.js (48 lines) — Public Metrics
- Exports METRICS_CONFIG — array of 4 tool definitions with key, icon, label
- fetchStats() — Queries Supabase generations table, returns { toolCounts, countryCount, todayCount }
- animateValue(el, start, end, duration) — Cubic ease-out animation for number count-up using requestAnimationFrame
src/milestones.js (104 lines) — Milestone Celebrations
- 5 thresholds: 100, 500, 1k, 5k, 10k
- checkMilestones(total) — Checks if any unseen milestone is crossed (picks the highest)
- showCelebration(ms) — Creates full-screen overlay with emoji, threshold number, message, share button; fires canvas-confetti twice (200 burst then 2×100 side bursts); auto-dismisses after 5s or on tap
- localStorage key pettyoffice_milestones_seen for dedup
tracking.js (93 lines) — Analytics
- Fire-and-forget Supabase inserts
- trackVisit(page) — Inserts to visitors table with page name, country (from ipapi.co GeoIP), device type (mobile/desktop based on window.innerWidth)
- trackGeneration(toolName) — Inserts to generations table with tool name and country
- Country is resolved once on module load via ipapi.co/json/ with a locale-based fallback
supabase.js (6 lines) — Supabase Client
Creates and exports a Supabase client using VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from import.meta.env.
schema.sql — Database Schema
Two tables with RLS allowing anonymous INSERT and SELECT (on generations only):
- generations: id, tool, country, created_at
- visitors: id, page, country, device, created_at
src/app.js (~410 lines) — Unused Application Class
The PettyOfficeApp class defines a full 4-tool workspace with:
- APP_DATA constant — data for all 4 tools (legal, billing, hr, cosmic), each with step1Options and step2Options
- State management, view switching, option selection, compiler overlay, document rendering for all 4 tools
- Each tool has its own document template with distinct styling (legal = serif/amber, billing = mono/white, hr = sans/rose, cosmic = dark/gold)
- Includes the same tipping modal and share/download logic as the inline version
This class is bootstrapped by src/main.js but never imported by index.html.
src/style.css (100 lines) — Tailwind v4 Entry
Uses @import "tailwindcss" with @theme defining custom corporate-* and obsidian-* color palettes. Custom utility classes for .stamp-overdue, .gold-seal, .cosmic-grid, .metallic-gold-border.
Build Config Files
File	Purpose
vite.config.js	Multi-page build with rollup inputs for index.html and admin/index.html
postcss.config.js	PostCSS with @tailwindcss/postcss and autoprefixer
tailwind.config.js	Tailwind v3/v4 config with corporate/obsidian color tokens and font families (unused by the Tailwind v4 CSS approach in src/style.css — it's a leftover)
.env	Placeholder Supabase credentials + VITE_ADMIN_PASSWORD=pettyadmin
.gitignore	Standard Vite ignores (node_modules, dist, .env)
5. Data Flow
User interacts with form
       │
       ▼
validateLawsuiteBtn() → enables/disables button
       │
       ▼
Generate button click
       │
       ├─ trackGeneration('sue_brain') → Supabase INSERT
       │
       ▼
switchView('loading')
       │
       ▼
Terminal logs print (5 lines, 500ms each)
       │
       ▼
renderLawsuitSheet(grievance, name)
       │
       ├─ generateLawsuitContent(grievance, name) → { charges, evidence, wants, punishment }
       │
       ▼
switchView('renderer')
       │
       ▼
User reacts (💀/😭/🤣) → highlights button, shows reaction message
User shares → html2canvas captures #print-sheet → navigator.share or download
User "Sue again" → resets all fields → switchView('inputLawsuit')
Concurrently, on page load:
trackVisit('launchpad') → Supabase INSERT
renderMetrics() → fetchStats() → Supabase SELECT → animate count-up → setInterval(60s)
checkMilestones(total) → localStorage check → confetti overlay
Admin dashboard:
Password check → sessionStorage
bootDashboard() → refreshDashboard() → 3 Supabase queries → render cards/charts/table/feed → setInterval(30s)
6. Build & Deployment
npm run dev    → Vite dev server on localhost:5173
npm run build  → Outputs to dist/
Build output:
dist/
├── index.html                    (~42 KB)
├── admin/index.html              (~10 KB)
├── assets/main-*.js              (~16-23 KB)
├── assets/admin-*.js             (~209 KB — includes Chart.js)
└── assets/milestones-*.js        (~217 KB — includes canvas-confetti)
The milestone module is shared by both the main and admin bundles (Vite's code splitting). The admin bundle is large because it bundles Chart.js. The main bundle is smaller because html2canvas is loaded from CDN.
7. Key Design Decisions
Why inline module instead of src/app.js:
The class-based PettyOfficeApp was built first, then the decision was made to rewrite everything inline in index.html for faster iteration and simpler deployment. The class version remains in source as reference but is unused.
Why Tailwind CDN instead of build-time:
Both pages use the Tailwind Play CDN (cdn.tailwindcss.com) which generates classes at runtime. This avoids needing a build step for CSS but means all classes must be present in the initial HTML (no dynamic class generation). The build-time src/style.css with @import "tailwindcss" exists but is only processed by the Vite build for the unused src/main.js entry point.
Why no framework (React/Vue/Svelte):
Pure vanilla JS keeps the bundle small and avoids framework overhead for what is essentially a form → preview → share flow. The entire app logic fits in ~600 lines.
Client-side "auth":
Admin password is checked in plaintext against VITE_ADMIN_PASSWORD env var exposed to the client bundle. This is not real security — it matches the parody/appliance nature. The password is stored in sessionStorage and cleared when the tab closes.
Env vars prefix:
All Supabase env vars use the VITE_ prefix required by Vite for client-side exposure. The .env file also includes non-prefixed versions (SUPABASE_URL, SUPABASE_ANON_KEY) which are ignored by Vite's client-side exposure.
8. What's Not Used / Dead Code
File / Code	Status
src/app.js (PettyOfficeApp class)	Fully built but unused — class defines all 4 tools with 2-step selection, compiler overlay, 4 distinct document templates, its own tipping/share logic. Never imported by any entry point.
src/main.js	Bootstraps PettyOfficeApp but only index.html would load it — it doesn't.
src/style.css	Tailwind v4 entry point — processed by Vite for src/main.js imports but that module is never loaded.
tailwind.config.js	Traditional Tailwind config — unused because both HTML pages use Tailwind CDN with inline config. The CSS file uses @theme instead.
npm html2canvas	The npm package is listed in dependencies but the code uses a CDN script tag instead.
src/counter.js, src/assets/*	Default Vite scaffold files — unused.
public/favicon.svg, public/icons.svg	Unused — no <link> tags reference them.
HR module ("Break Up With Bad Habits") and Cosmic module ("Universe Contract")	Only exist in APP_DATA in src/app.js. Not wired in index.html.
