# Snacco — Project TODO

## Phase 1: Schema & Branding
- [x] Write database schema: users (with tokens), tutorials, chapters, unlocks, token_transactions
- [x] Apply DB migration
- [x] Set up global dark theme with neon pink/red and grey accents in index.css
- [x] Set app title to "Snacco" and update App.tsx routing structure

## Phase 2: Auth & Token System
- [x] Auto-grant 20 tokens to every new user on first sign-in (upsertUser hook)
- [x] tRPC: auth.me returns token balance
- [x] tRPC: tokens.getBalance
- [x] tRPC: tokens.adjustTokens (admin only)
- [x] tRPC: tokens.getHistory (admin)

## Phase 3: Learner Experience
- [x] Demo feed page (/) — vertical scrollable feed of demo clips with title, creator, price
- [x] Tutorial detail page (/tutorial/:id) — demo clip, title, category, creator info, token price, unlock button
- [x] Token unlock mutation — deduct 1 token, create unlock record
- [x] Practice player page (/play/:id) — video with speed controls (0.5x, 0.75x, 1x, 1.25x), 10s rewind, chapter step navigation
- [x] Library page (/library) — list of all unlocked tutorials for logged-in user

## Phase 4: Creator Mode
- [x] Creator mode toggle in user profile (/profile)
- [x] Creator upload page (/creator/upload) — demo MP4 + tutorial MP4 upload, title, category, token price
- [x] Inline chapter-marking tool — watch uploaded video, tap to capture timestamp, label step, reorder/delete steps, preview markers
- [x] Publish tutorial flow — saves tutorial + chapters to DB, appears in feed

## Phase 5: Admin Portal
- [x] Admin portal layout at /admin (desktop sidebar, role-gated)
- [x] User management page — list users, token balances, usage history, manual token adjustment
- [x] Content moderation page — list all tutorials, unpublish action
- [x] Usage dashboard — signups count, total unlocks, tokens consumed charts

## Phase 6: Tests & Polish
- [x] Vitest: token grant on new user
- [x] Vitest: unlock deducts token and creates unlock record
- [x] Vitest: admin token adjustment (forbidden for non-admin)
- [x] Mobile viewport meta and touch optimisations
- [x] Final visual QA pass
- [x] Save checkpoint
