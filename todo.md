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
- [x] Add draggable circle handle on timeline for current time scrubbing
- [x] Fix published upload failure: replaced chunked base64 tRPC with direct multipart FormData POST to /api/upload-video


## Bug Fixes v1.26

- [x] Fix video storage - switch to Manus persistent storage (v1.26)
- [x] Fix demo thumbnail black after upload - extract first frame
- [x] Fix chapter marking playback black frame - show first frame
- [x] Improve chapter marking UX - better scrubbing/dragging
- [x] Add delete video option in edit page
- [x] Fix videos not showing on discovery feed (black)

## Critical Bugs v1.29 (URGENT)

- [x] **Web upload thumbnail missing** - Added 2-second fallback timeout in generateThumbnail() to capture frame if seeked event doesn't fire on mobile
- [x] **Chapter marker video black & won't play** - Use localUrl instead of remote URL, added poster attribute, changed preload to auto
- [x] **Back button loses all data** - Back button now navigates to previous step, only goes to Profile if on first step
- [x] **Thumbnail extraction** - First frame captured immediately via canvas, displayed as poster while video loads

## Post-v1.29 Issues (Fixed in v1.30)

- [x] **Desktop upload 502 error** - Fixed by switching upload route to use Forge API instead of Railway storage
- [x] **Mobile demo thumbnail still missing** - Improved thumbnail generation with play event listener and try-catch for seeking
- [x] **Video scrubbing too difficult** - Increased scrubber handle size from 5x5 to 7x7 for easier mobile dragging
- [x] **Feed video playback black** - Added autoPlay and changed preload to auto in Feed.tsx video elements

## Video Playback Fixes v1.31

- [x] Changed all video preload from "metadata" to "auto" across all pages (TutorialDetail, Player, Library, Feed)
- [x] Added error logging to video elements for debugging playback issues
- [x] Added crossOrigin="anonymous" to all video elements
- [x] Improved thumbnail generation with multiple fallback event listeners (seeked, play, loadeddata, canplay, timeout)


## Playback Controls Enhancement v1.40

- [x] Add visual indicator line on scrubber showing current playback position
- [x] Add rewind button (10s back) to player controls
- [x] Add slow-motion toggle (0.5x, 0.75x, 1x, 1.25x, 1.5x speeds)
- [x] Add chapter navigation buttons (prev/next chapter)
- [x] Improve mobile touch targets for all controls
- [x] Test playback controls on both desktop and mobile

## Bug Fixes v1.42

- [x] Feed shows black screen instead of video playback (removed crossOrigin="anonymous" from all video elements - CORS blocking Railway S3)
- [x] No thumbnail generated on mobile for demo video upload (improved capture: seek to 0.5s, black-frame detection, 3s timeout, webkit-playsinline)
- [x] Long video upload (2 min) fails on mobile (added 10-min request timeout for upload route)

## Bug Fixes v1.43

- [x] Fix mobile demo thumbnail display in Step 3 — replaced `<video>` element (shows black on mobile Safari when paused) with `<img>` using thumbnail data URL
- [x] Add separate `demoThumbnailUrl` state so demo thumbnail persists when tutorial upload starts (previously `setThumbnailDataUrl(null)` at start of tutorial upload would clear the demo thumbnail)

## Bug Fixes v1.44

- [x] Fix feed/library/detail showing black videos — Railway S3 buckets are private, stored public URLs don't resolve
- [x] Add video proxy endpoint `/api/video/:key(*)` that streams video from Railway S3 to client
- [x] Modify backend procedures (feed, get, library, myTutorials, adminList) to rewrite video URLs to proxy URLs
- [x] Ensure CreatorEdit doesn't save proxy URLs back to DB (use separate resolved fields or keep keys intact)

## v1.45

- [x] Fix video proxy playback (videos show still but don't play — likely Range/streaming issue)
- [x] Feed: Move UI overlay above the fold so it's visible without scrolling while video loops
- [x] TutorialDetail: Overlay title/creator/desc/purchase button on video; chapters below on black background

## v1.46

- [x] Fix video proxy - switch to presigned URL redirect (streaming approach not working for video playback)
- [x] Raise CTA buttons higher on Feed and TutorialDetail so they're above the fold
- [x] Add IntersectionObserver to auto-play/pause videos as they scroll into view

## v1.47 - Video Performance

- [x] Return presigned S3 URLs directly from tRPC procedures (eliminate redirect hop)
- [x] Smart preloading: preload=metadata for off-screen videos, preload=auto for visible
- [x] Add poster/thumbnail frame support (uses preload=metadata first frame; DB thumbnail column deferred)

## v1.48 - Video Playback Speed

- [x] Cache presigned URLs server-side (avoid regenerating on every request)
- [x] Add #t=0.001 to video src URLs to force immediate first-frame load on mobile
- [x] Move moov atom to front of MP4 on upload (fast-start) for instant playback

## v1.49 - Video Compression + Stall Recovery

- [x] Client-side video compression before upload (target ~4Mbps bitrate, reduce 19MB to ~2-3MB)
- [x] Integrate compression into CreatorUpload with progress indicator
- [x] Add stall recovery to Feed player (retry .play() on stalled event)

## v1.51 - Streaming Proxy + Compression Fix

- [x] Fix compression half-speed playback (frame timing mismatch in MediaRecorder)
- [x] Replace presigned URL redirect with proper streaming proxy (pipe S3 stream with Range support, 24h cache headers)
- [x] Use stable /api/video/{key} URLs so browser can cache across pages (removed presigned URL cache)
- [x] Fix demo thumbnail being overwritten by tutorial video thumbnail (fixed in v1.52)

## v1.52 - Next Deploy Bundle (pending)

- [x] Lighter version badge colors (coral, gold, mint, sky instead of dark red/yellow/green/blue)
- [x] Fix demo thumbnail being overwritten by tutorial video thumbnail in CreatorUpload Step 3
- [x] Fix video compression to preserve audio track (rewrote to real-time playback with Web Audio API routing)
- [x] Fix compression stuck at 0% (moved audio setup after playback starts, skip on iOS, added playback verification)
- [x] Add mute/unmute toggle button to Feed video cards
- [x] Add mute/unmute toggle button to TutorialDetail video player

## v1.53 - Feed UX Improvements

- [x] Fix slow video playback start in Feed (metadata cache eliminates HeadObject round trip, skip HeadObject for non-Range)
- [x] Add TikTok-style vertical swipe navigation with 50% threshold snap, rubber-band edges, slide indicators

## v1.54 - Feed Polish

- [x] Add swipe velocity detection — snap based on flick speed (>0.4px/ms) OR 50% distance threshold
- [x] Add video loading skeleton — blurred thumbnail + spinner while video buffers (Feed + TutorialDetail)
- [x] Keep Feed mounted when navigating to tutorial detail — videos stay buffered, instant back navigation

## v1.55 - Video Loading & Thumbnails

- [x] Fix demo video reloading on tutorial detail page (keep-alive Feed + cache headers + loading skeleton)
- [x] Fix tutorial video (Player page) black screen — added autoPlay + buffering spinner overlay
- [x] Add demo thumbnails to Library page (img with video fallback)
- [x] Add demo thumbnails to Creator dashboard (img with video fallback)
- [x] Upload and store thumbnail during publish flow (uploadThumbnail mutation + DB columns)

## v1.56 - Fix Publish SQL Error

- [x] Add startup migration to auto-create thumbnail_url and thumbnail_key columns if missing in Railway PostgreSQL
- [x] Migration added to both db.ts and db-postgres.ts (db-postgres is what routers.ts uses)
- [x] No OAuth code touched

## v1.59 - Mobile Video Fix

- [x] Feed videos show on desktop but not on mobile

## v1.60 - Video Playback Fixes

- [x] Feed videos stuck on first frame (not playing) - simplified play logic
- [x] Full tutorial video is black and does not play in Player - removed autoPlay, user taps play
- [ ] Chapter marker first frame shows demo video frame instead of tutorial first frame (deferred)

## v1.63 - Claude Review Fixes

- [x] Fix wheel handler re-registration loop (goToSlideRef + empty deps)
- [x] Fix video stuck on frame 1 (readyState >= 2 check before play, canplay fallback)
- [x] Replace TutorialDetail video with static thumbnail (simplified to muted autoplay video, no loading skeleton)

## v1.64 - Fix Video Proxy Hang (CRITICAL)

- [x] Root cause: S3 client missing `forcePathStyle: true` — virtual-hosted DNS resolution hangs on Railway
- [x] Fix: Add `forcePathStyle: true` to getS3Client() in railway-storage.ts
- [x] Replace streaming proxy with presigned URL redirect (302) — eliminates bandwidth bottleneck entirely
- [x] Cache presigned URLs in-memory (~58 min TTL, URLs expire at 1 hour)
- [x] Vitest validates presigned URL generation works with Railway S3
- [x] Version bumped to v1.64 in all 3 files

## v1.65 - Fix Video Playback (Desktop Buffering + Mobile Black Screen)

- [x] Desktop: video plays in short bursts then stalls with spinner (constant buffering through presigned URL redirect)
- [x] Mobile: black screen with infinite spinner (presigned URL 302 redirect not working on mobile Safari)
- [x] Root cause: presigned URL redirect (302) breaks browser video Range request handling — reverted to streaming proxy with all optimisations

- [x] Implement S3 file deletion when tutorials are deleted

## v1.67 - Direct Presigned URL Video Delivery (CDN bypass)

- [x] Switch from streaming proxy to presigned URLs returned directly in tRPC JSON responses
- [x] resolveVideoUrl is now async, generates 24h presigned URLs for video keys
- [x] All call sites updated to use Promise.all(tutorials.map(resolveVideoUrl))
- [x] Verified: path-style presigned URLs work on Tigris (GET returns 200/206)
- [x] Verified: Tigris returns Access-Control-Allow-Origin: * (CORS works for browser)
- [x] Verified: Range requests work (206 Partial Content with Content-Range)
- [x] Removed debug/diagnostic endpoints (/api/debug/s3, /api/debug/stream, /api/debug/pipe)
- [x] Cleaned up test scripts (test-s3.mjs, test-presigned-vhost.mjs, etc.)
- [ ] Video proxy route (/api/video/:key) kept as fallback for edge cases
- [ ] Push to Railway and verify video playback on desktop and mobile
