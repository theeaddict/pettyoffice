# PettyOffice — working notes

Two HTML pages, Vite multi-page config. `index.html` is the main app — everything in one file: home screen, four tool input forms, loading terminal, document renderer, share/reaction UI, and the live stats dashboard. `admin/index.html` is password-gated with Chart.js for per-tool bar chart, 30-day line chart, mobile-vs-desktop doughnut, countries table with % bars, and recent activity feed refreshing every 30s.

## The stack

- Vite 8 (multi-page rollup config, inputs: index.html + admin/index.html)
- Tailwind via CDN (`cdn.tailwindcss.com`) — both pages use the Play CDN with inline config. No build-time CSS pipeline. The tradeoff: you can't tree-shake unused classes, but it's zero config and works for a project this size. There was a PostCSS + `src/style.css` setup from an earlier version that I ripped out.
- Google Fonts (Inter, EB Garamond, JetBrains Mono) loaded via `<link>` tags
- Supabase (`@supabase/supabase-js`) — anonymous INSERT/SELECT on `generations` and `visitors` tables
- html2canvas loaded from CDN — captures the `#print-sheet` div to PNG for native share or download
- chart.js + canvas-confetti as npm deps
- Lucide icons via CDN

## The thing about auth

Admin dashboard password is in `VITE_ADMIN_PASSWORD` env var, compared as plaintext in `src/admin.js`, stored in `sessionStorage`. This isn't security — it's a privacy screen. Anybody who looks at the network tab or the built JS sees the password. Fine for a parody app.

## The thing about the env file

`.env` has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_ADMIN_PASSWORD`. That's it. Vite only exposes `VITE_`-prefixed vars to client code via `import.meta.env`. The old file had unprefixed `SUPABASE_URL` and `SUPABASE_ANON_KEY` too — dead, nothing ever read them.

## How the tools work

Four tools, same pattern:

1. **Sue Your Brain** — name input + free text or pick from 30 categorized punchlines. Button validates both name and crime before enabling. Loading screen prints 5 terminal lines with 500ms delay, then renders the document. Document is a charges/evidence/verdict template with keyword-matched copy (sleep, social, procrastination, overthinking, cringe categories, plus a fallback).

2. **Invoice Your Ex** — radio selection from 4 grievances. Renders an invoice with line items, tax, and a HARD OVERDUE stamp. No loading screen — instant.

3. **Break Up With Bad Habits** (HR) — two radio groups: pick a habit to fire, pick a replacement. Renders a pink-slip termination notice with a DISCHARGED badge.

4. **Universe Contract** (Cosmic) — two radio groups: pick a manifestation, pick an offering. Renders a dark cosmic-themed contract with amber text and grid background.

Tools 3 and 4 were originally in `src/app.js` (an abandoned class-based version) and got ported inline. The class version had them as 2-step selections with a compiler overlay — the inline version simplified to radio groups.

All four call `trackGeneration(toolKey)` which fires a Supabase INSERT. The `generations` table drives both the public stats on the homepage and the admin dashboard.

## The copy

I went through and rewrote most of the UI text to be less polished. Button labels like "FILE LAWSUIT ⚖️" became "SUE THIS BRAIN ⚖️". "Edit Draft" became "← edit". The loading terminal went from "Initializing background check on Defendant (Brain)..." to "summoning the jury (it's just me)...". The error messages are honest ("cant reach the database. supabase creds probably fake."). The tipping modal headings went from "Reimbursement Ledger" to "court bribe".

The `generateLawsuitContent` function got the same treatment — the charge descriptions, evidence, and punishments now read more like someone texting than a copywriter's brief. Uneven sentence lengths, dropped capitalization, phrases like "classic." and "suspicious timing." that explain nothing.

## Tipping modal

Three options: M-Pesa (toggles a till number 5247476 inline), Buy Me a Coffee (opens external link), Ko-fi (opens external link). Footer: "100% goes to the developers therapy fund & coffee budget". The button on the home screen says "[ ☕ tip the dev ]".

## What doesn't exist anymore

Deleted: `src/app.js`, `src/main.js`, `src/style.css`, `tailwind.config.js`, `src/counter.js`, `src/assets/*`, `public/favicon.svg`, `public/icons.svg`. These were from the original Vite scaffold and the abandoned class-based version. `postcss.config.js` still exists but does nothing since no CSS entry point references it. Left it in case I want to reintroduce build-time Tailwind later.

## Database schema (schema.sql)

Two tables:
- `generations` (id, tool, country, created_at) — RLS allows anonymous INSERT and SELECT
- `visitors` (id, page, country, device, created_at) — RLS allows anonymous INSERT

Country detection via `ipapi.co/json/` on first load, cached for the session. Falls back to browser locale if the API fails.

## Milestones

Five thresholds (100, 500, 1k, 5k, 10k). Full-screen overlay with confetti via canvas-confetti (200 burst + 2×100 side bursts), a share button, auto-dismiss after 5s or on tap. Dedup via `localStorage` key `pettyoffice_milestones_seen`. Triggered from both the homepage metrics refresh and the admin dashboard refresh.
