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

## Upload Fix (v1.1)
- [x] Switch video upload from base64-JSON to multipart FormData via XHR (fixes upload failure for large files)
- [x] Add server-side multipart upload endpoint at POST /api/upload-video using multer
- [x] Show video thumbnail preview as soon as file is selected (before upload starts)
- [x] Show clear label "Uploading Demo Clip" or "Uploading Full Tutorial" during upload
- [x] Show upload progress bar with percentage
- [x] Reorder steps: demo upload comes before tutorial upload (already the case, confirm)
- [x] Show thumbnail of already-uploaded video in subsequent steps so user always knows what they uploaded
- [x] Add clear descriptions of what a Demo Clip vs Full Tutorial is on each upload step
- [x] Enforce demo clip max duration of 30 seconds (client-side check before upload)
- [x] Enforce tutorial max duration of 5 minutes / 300 seconds (client-side check before upload)
- [x] Show duration limit clearly on each upload step UI

## Upload Fix v1.17 — Chunked Upload (bypass CORS + gateway limits)
- [x] Add uploadChunk tRPC procedure: accept base64 chunk + metadata, store chunk in /tmp keyed by uploadId
- [x] Add finalizeChunkedUpload tRPC procedure: reassemble chunks, call storagePut, clean up /tmp (integrated into uploadChunk on final chunk)
- [x] Rewrite uploadVideoDirect in CreatorUpload.tsx to use chunked upload (2MB chunks, sequential, progress tracking)
- [x] Switch tRPC client link to httpLink (non-batching) to ensure each chunk is a separate HTTP request
- [x] Bump version badge to v1.17
- [x] Save checkpoint and publish

## UX Improvements v1.19

- [x] Replace genre button grid with Select dropdown
- [x] Add video scrubbing (click/drag on progress bar to seek)
- [x] Add marker editing: rename + drag-to-reorder
- [ ] Publish and test on phone
