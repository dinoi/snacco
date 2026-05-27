import { z } from "zod";
import fs from "fs";
import path from "path";
const COOKIE_NAME = "session_token";

import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db-postgres";
import * as storage from "./storage";
import { TRPCError } from "@trpc/server";

// ─── In-memory chunk registry ─────────────────────────────────────────────────
// Tracks which chunks have been received for each upload session.
// Key: uploadId  Value: { totalChunks, received: Set<number>, dir: string }
const chunkRegistry = new Map<string, { totalChunks: number; received: Set<number>; dir: string }>();

function getChunkDir(uploadId: string): string {
  return path.join("/tmp", `snacco_upload_${uploadId}`);
}

function chunkPath(dir: string, index: number): string {
  return path.join(dir, `chunk_${String(index).padStart(6, "0")}`);
}

// ─── Admin guard ──────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,

  // ─── Auth ───────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Tokens ─────────────────────────────────────────────────────────
  tokens: router({
    getBalance: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      return { balance: user?.tokenBalance ?? 0 };
    }),

    getHistory: protectedProcedure.query(async ({ ctx }) => {
      return db.getTokenHistory(ctx.user.id);
    }),

    // Admin: adjust tokens for any user
    adminAdjust: adminProcedure
      .input(z.object({ userId: z.number(), amount: z.number(), reason: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await db.adjustTokens(input.userId, input.amount, input.reason);
        return { success: true };
      }),

    // Admin: get all transactions
    adminGetAll: adminProcedure.query(async () => {
      return db.getAllTokenTransactions();
    }),
  }),

  // ─── Users ──────────────────────────────────────────────────────────
  users: router({
    setCreatorMode: protectedProcedure
      .input(z.object({ isCreator: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await db.setCreatorMode(ctx.user.id, input.isCreator);
        return { success: true };
      }),

    // Admin
    adminList: adminProcedure.query(async () => {
      return db.getPublishedTutorials();
    }),

    adminGetTokenHistory: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return db.getTokenHistory(input.userId);
      }),
  }),

  // ─── Tutorials ──────────────────────────────────────────────────────
  tutorials: router({
    // Public feed
    feed: publicProcedure.query(async () => {
      return db.getPublishedTutorials();
    }),

    // Single tutorial detail
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const tutorial = await db.getTutorialById(input.id);
        if (!tutorial) throw new TRPCError({ code: "NOT_FOUND" });
        return tutorial;
      }),

    // Chapters for a tutorial
    getChapters: publicProcedure
      .input(z.object({ tutorialId: z.number() }))
      .query(async ({ input }) => {
        return db.getChaptersByTutorialId(input.tutorialId);
      }),

    // Check if current user has unlocked a tutorial
    isUnlocked: protectedProcedure
      .input(z.object({ tutorialId: z.number() }))
      .query(async ({ ctx, input }) => {
        const unlocked = await db.isUserTutorialUnlocked(ctx.user.id, input.tutorialId);
        return { unlocked };
      }),

    // Unlock a tutorial (spend tokens)
    unlock: protectedProcedure
      .input(z.object({ tutorialId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const already = await db.isUserTutorialUnlocked(ctx.user.id, input.tutorialId);
        if (already) return { success: true, alreadyOwned: true };

        const tutorial = await db.getTutorialById(input.tutorialId);
        if (!tutorial || !tutorial.isPublished) throw new TRPCError({ code: "NOT_FOUND" });

        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (user.tokenBalance < tutorial.tokenPrice) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Insufficient tokens" });
        }

        await db.adjustTokens(ctx.user.id, -tutorial.tokenPrice, `Unlocked tutorial: ${tutorial.title}`);
        await db.unlockTutorial(ctx.user.id, input.tutorialId, tutorial.tokenPrice);
        return { success: true, alreadyOwned: false };
      }),

    // Library: all unlocked tutorials for current user
    library: protectedProcedure.query(async ({ ctx }) => {
      return db.getUnlockedTutorials(ctx.user.id);
    }),

    // Creator: get my tutorials
    myTutorials: protectedProcedure.query(async ({ ctx }) => {
      return db.getTutorialsByCreator(ctx.user.id);
    }),

    // ── Chunked upload: receive one chunk at a time ──────────────────
    // Client sends base64-encoded chunks sequentially. Each chunk is written
    // to /tmp. When the final chunk arrives, all chunks are reassembled and
    // uploaded to S3 via storagePut (server-side, no CORS issues).
    uploadChunk: protectedProcedure
      .input(z.object({
        uploadId: z.string().min(1),       // unique per upload session (nanoid)
        chunkIndex: z.number().int().min(0),
        totalChunks: z.number().int().min(1),
        chunkData: z.string(),             // base64-encoded chunk bytes
        fileName: z.string(),
        mimeType: z.string().default("video/mp4"),
        type: z.enum(["demo", "tutorial"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { uploadId, chunkIndex, totalChunks, chunkData } = input;
        const dir = getChunkDir(uploadId);

        // Create temp dir on first chunk
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Write chunk to disk
        const buf = Buffer.from(chunkData, "base64");
        fs.writeFileSync(chunkPath(dir, chunkIndex), buf);

        // Track received chunks
        let entry = chunkRegistry.get(uploadId);
        if (!entry) {
          entry = { totalChunks, received: new Set(), dir };
          chunkRegistry.set(uploadId, entry);
        }
        entry.received.add(chunkIndex);

        const isLast = entry.received.size === totalChunks;

        if (!isLast) {
          return { done: false, received: entry.received.size, total: totalChunks };
        }

        // All chunks received — reassemble and upload to S3
        try {
          const parts: Buffer[] = [];
          for (let i = 0; i < totalChunks; i++) {
            parts.push(fs.readFileSync(chunkPath(dir, i)));
          }
          const fullBuffer = Buffer.concat(parts);

          const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          const inputKey = `videos/${ctx.user.id}/${input.type}/${Date.now()}_${safeName}`;

          // storagePut appends its own hash suffix and returns the real { key, url }
          const { key: storedKey, url } = await storage.storagePut(inputKey, fullBuffer, input.mimeType || "video/mp4");

          // Clean up temp files
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
          chunkRegistry.delete(uploadId);

          return { done: true, url, key: storedKey };
        } catch (err: any) {
          // Clean up on error too
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
          chunkRegistry.delete(uploadId);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Upload assembly failed: ${err?.message}` });
        }
      }),

    // ── Legacy presignUpload kept for reference (not used by client) ──
    presignUpload: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        mimeType: z.string().default("video/mp4"),
        type: z.enum(["demo", "tutorial"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { ENV } = await import("./_core/env");
        const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
        const forgeKey = ENV.forgeApiKey;

        const hash = Math.random().toString(36).slice(2, 10);
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `videos/${ctx.user.id}/${input.type}/${Date.now()}_${safeName}_${hash}`;

        const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
        presignUrl.searchParams.set("path", key);
        const resp = await fetch(presignUrl.toString(), {
          headers: { Authorization: `Bearer ${forgeKey}` },
        });
        if (!resp.ok) {
          const msg = await resp.text().catch(() => resp.statusText);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Presign failed: ${msg}` });
        }
        const { url: s3Url } = (await resp.json()) as { url: string };
        if (!s3Url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Empty presign URL" });

        return { key, s3Url, storageUrl: `/manus-storage/${key}` };
      }),

    // Creator: publish a tutorial with chapters
    publish: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        category: z.string().min(1),
        description: z.string().optional(),
        tokenPrice: z.number().int().min(1).max(20),
        demoVideoUrl: z.string(),
        demoVideoKey: z.string(),
        tutorialVideoUrl: z.string(),
        tutorialVideoKey: z.string(),
        chapters: z.array(z.object({
          label: z.string().min(1),
          timestampSeconds: z.number().int().min(0),
          sortOrder: z.number().int(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user?.isCreator) throw new TRPCError({ code: "FORBIDDEN", message: "Enable creator mode first" });

        const { chapters: chapterData, ...tutorialData } = input;
        const result = await db.createTutorial({ ...tutorialData, creatorId: ctx.user.id });
        if (!result?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        if (chapterData.length > 0) {
          await db.createChapters(chapterData.map(c => ({ ...c, tutorialId: result.id })));
        }

        return { success: true, tutorialId: result.id };
      }),

    // Creator: update an existing tutorial
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1),
        category: z.string().min(1),
        description: z.string().optional(),
        tokenPrice: z.number().int().min(1).max(20),
        demoVideoUrl: z.string(),
        demoVideoKey: z.string(),
        tutorialVideoUrl: z.string(),
        tutorialVideoKey: z.string(),
        chapters: z.array(z.object({
          label: z.string().min(1),
          timestampSeconds: z.number().int().min(0),
          sortOrder: z.number().int(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user?.isCreator) throw new TRPCError({ code: "FORBIDDEN", message: "Enable creator mode first" });

        // Verify ownership
        const tutorial = await db.getTutorialById(input.id);
        if (!tutorial) throw new TRPCError({ code: "NOT_FOUND" });
        if (tutorial.creatorId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own tutorials" });

        const { chapters: chapterData, ...tutorialData } = input;
        await db.updateTutorial(input.id, tutorialData);

        // Delete old chapters and create new ones
        await db.deleteChaptersByTutorialId(input.id);
        if (chapterData.length > 0) {
          await db.createChapters(chapterData.map(c => ({ ...c, tutorialId: input.id })));
        }

        return { success: true, tutorialId: input.id };
      }),

    // Creator: delete a tutorial
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user?.isCreator) throw new TRPCError({ code: "FORBIDDEN", message: "Enable creator mode first" });

        // Verify ownership
        const tutorial = await db.getTutorialById(input.id);
        if (!tutorial) throw new TRPCError({ code: "NOT_FOUND" });
        if (tutorial.creatorId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own tutorials" });

        // Delete chapters first
        await db.deleteChaptersByTutorialId(input.id);
        
        // Delete tutorial
        await db.deleteTutorial(input.id);

        return { success: true };
      }),

    // Admin: list all tutorials
    adminList: adminProcedure.query(async () => {
      return db.getAllTutorials();
    }),

    // Admin: toggle publish status
    adminSetPublished: adminProcedure
      .input(z.object({ id: z.number(), isPublished: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setTutorialPublished(input.id, input.isPublished);
        return { success: true };
      }),
  }),

  // ─── Admin dashboard stats ───────────────────────────────────────────
  admin: router({
    stats: adminProcedure.query(async () => {
      const [totalUsers, totalUnlocks, tokensConsumed] = await Promise.all([
        db.getTotalUsers(),
        db.getTotalUnlocks(),
        db.getTotalTokensConsumed(),
      ]);
      return { totalUsers, totalUnlocks, tokensConsumed };
    }),
  }),
});

export type AppRouter = typeof appRouter;
