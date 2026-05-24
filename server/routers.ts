import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  adjustTokens,
  getAllTutorials,
  getAllUsers,
  getChaptersByTutorial,
  getPublishedTutorials,
  getTotalTokensConsumed,
  getTotalUnlocks,
  getTotalUsers,
  getTokenHistory,
  getTutorialById,
  getTutorialsByCreator,
  getUnlockedTutorials,
  getUserById,
  isUnlocked,
  setCreatorMode,
  setTutorialPublished,
  unlockTutorial,
  createTutorial,
  createChapters,
  deleteChaptersByTutorial,
} from "./db";
import { storagePut } from "./storage";

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
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Tokens ─────────────────────────────────────────────────────────
  tokens: router({
    getBalance: protectedProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      return { balance: user?.tokenBalance ?? 0 };
    }),

    getHistory: protectedProcedure.query(async ({ ctx }) => {
      return getTokenHistory(ctx.user.id);
    }),

    // Admin: adjust tokens for any user
    adminAdjust: adminProcedure
      .input(z.object({ userId: z.number(), amount: z.number(), reason: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await adjustTokens(input.userId, input.amount, input.reason, ctx.user.id);
        return { success: true };
      }),

    // Admin: get all transactions
    adminGetAll: adminProcedure.query(async () => {
      const db = await import("./db");
      return db.getAllTokenTransactions();
    }),
  }),

  // ─── Users ──────────────────────────────────────────────────────────
  users: router({
    setCreatorMode: protectedProcedure
      .input(z.object({ isCreator: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await setCreatorMode(ctx.user.id, input.isCreator);
        return { success: true };
      }),

    // Admin
    adminList: adminProcedure.query(async () => {
      return getAllUsers();
    }),

    adminGetTokenHistory: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return getTokenHistory(input.userId);
      }),
  }),

  // ─── Tutorials ──────────────────────────────────────────────────────
  tutorials: router({
    // Public feed
    feed: publicProcedure.query(async () => {
      return getPublishedTutorials();
    }),

    // Single tutorial detail
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const tutorial = await getTutorialById(input.id);
        if (!tutorial) throw new TRPCError({ code: "NOT_FOUND" });
        return tutorial;
      }),

    // Chapters for a tutorial
    getChapters: publicProcedure
      .input(z.object({ tutorialId: z.number() }))
      .query(async ({ input }) => {
        return getChaptersByTutorial(input.tutorialId);
      }),

    // Check if current user has unlocked a tutorial
    isUnlocked: protectedProcedure
      .input(z.object({ tutorialId: z.number() }))
      .query(async ({ ctx, input }) => {
        const unlocked = await isUnlocked(ctx.user.id, input.tutorialId);
        return { unlocked };
      }),

    // Unlock a tutorial (spend tokens)
    unlock: protectedProcedure
      .input(z.object({ tutorialId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const already = await isUnlocked(ctx.user.id, input.tutorialId);
        if (already) return { success: true, alreadyOwned: true };

        const tutorial = await getTutorialById(input.tutorialId);
        if (!tutorial || !tutorial.isPublished) throw new TRPCError({ code: "NOT_FOUND" });

        const user = await getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (user.tokenBalance < tutorial.tokenPrice) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Insufficient tokens" });
        }

        await adjustTokens(ctx.user.id, -tutorial.tokenPrice, `Unlocked tutorial: ${tutorial.title}`);
        await unlockTutorial(ctx.user.id, input.tutorialId, tutorial.tokenPrice);
        return { success: true, alreadyOwned: false };
      }),

    // Library: all unlocked tutorials for current user
    library: protectedProcedure.query(async ({ ctx }) => {
      return getUnlockedTutorials(ctx.user.id);
    }),

    // Creator: get my tutorials
    myTutorials: protectedProcedure.query(async ({ ctx }) => {
      return getTutorialsByCreator(ctx.user.id);
    }),

    // Creator: get a presigned S3 PUT URL so the browser can upload directly
    // (avoids routing the large video body through the app gateway)
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
        const user = await getUserById(ctx.user.id);
        if (!user?.isCreator) throw new TRPCError({ code: "FORBIDDEN", message: "Enable creator mode first" });

        const { chapters: chapterData, ...tutorialData } = input;
        const result = await createTutorial({ ...tutorialData, creatorId: ctx.user.id });
        if (!result?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        if (chapterData.length > 0) {
          await createChapters(chapterData.map(c => ({ ...c, tutorialId: result.id })));
        }

        return { success: true, tutorialId: result.id };
      }),

    // Admin: list all tutorials
    adminList: adminProcedure.query(async () => {
      return getAllTutorials();
    }),

    // Admin: toggle publish status
    adminSetPublished: adminProcedure
      .input(z.object({ id: z.number(), isPublished: z.boolean() }))
      .mutation(async ({ input }) => {
        await setTutorialPublished(input.id, input.isPublished);
        return { success: true };
      }),
  }),

  // ─── Admin dashboard stats ───────────────────────────────────────────
  admin: router({
    stats: adminProcedure.query(async () => {
      const [totalUsers, totalUnlocks, tokensConsumed] = await Promise.all([
        getTotalUsers(),
        getTotalUnlocks(),
        getTotalTokensConsumed(),
      ]);
      return { totalUsers, totalUnlocks, tokensConsumed };
    }),
  }),
});

export type AppRouter = typeof appRouter;
