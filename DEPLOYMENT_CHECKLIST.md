# ⚠️ CRITICAL DEPLOYMENT CHECKLIST

**THIS MUST BE FOLLOWED BEFORE EVERY SINGLE PUSH TO GITHUB**

## Pre-Push Verification (NON-NEGOTIABLE)

1. **UPDATE VERSION NUMBER FIRST**
   - Edit `scripts/generate-build-color.mjs`
   - Increment version (e.g., v1.28 → v1.29)
   - This MUST be done BEFORE committing any code changes

2. **COMMIT BOTH TOGETHER**
   - Stage version update AND code changes
   - Commit message format: `v1.XX: [description of changes]`
   - Example: `v1.29: Fix black video thumbnails on mobile`

3. **PUSH TO GITHUB**
   - Push to `dinoi/snacco` main branch
   - Verify Railway deployment triggers automatically

## Why This Matters

- Without version numbers, we can't track what's deployed
- Black frames, thumbnails, chapter marking fixes are all tied to specific versions
- Mobile UX issues require version tracking to debug
- Every deployment MUST have a new color badge and incremented version

## If You Forget

Stop immediately. Do NOT push. Rollback and start over with the version update first.

---

**Last Updated:** May 27, 2026
**Enforced By:** Manus Agent (non-negotiable workflow)
