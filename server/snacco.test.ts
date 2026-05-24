import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserById: vi.fn(),
    getTutorialById: vi.fn(),
    isUnlocked: vi.fn(),
    adjustTokens: vi.fn(),
    unlockTutorial: vi.fn(),
    getAllUsers: vi.fn().mockResolvedValue([]),
    getTokenHistory: vi.fn().mockResolvedValue([]),
    getAllTokenTransactions: vi.fn().mockResolvedValue([]),
  };
});

import {
  getUserById,
  getTutorialById,
  isUnlocked,
  adjustTokens,
  unlockTutorial,
} from "./db";

function makeCtx(overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      isCreator: false,
      tokenBalance: 20,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeAdminCtx(): TrpcContext {
  return makeCtx({ id: 99, role: "admin", openId: "admin-user" });
}

// ─── Token balance ────────────────────────────────────────────────────
describe("tokens.getBalance", () => {
  it("returns the user token balance", async () => {
    vi.mocked(getUserById).mockResolvedValue({
      id: 1, tokenBalance: 20, openId: "test-user", name: "Test", email: null,
      loginMethod: null, role: "user", isCreator: false,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tokens.getBalance();
    expect(result.balance).toBe(20);
  });
});

// ─── Unlock tutorial ──────────────────────────────────────────────────
describe("tutorials.unlock", () => {
  beforeEach(() => {
    vi.mocked(isUnlocked).mockResolvedValue(false);
    vi.mocked(getTutorialById).mockResolvedValue({
      id: 5, title: "Test Tutorial", category: "Dance", description: null,
      tokenPrice: 1, demoVideoUrl: "/demo.mp4", tutorialVideoUrl: "/tut.mp4",
      isPublished: true, createdAt: new Date(), creatorId: 2, creatorName: "Creator",
    } as any);
    vi.mocked(getUserById).mockResolvedValue({
      id: 1, tokenBalance: 5, openId: "test-user", name: "Test", email: null,
      loginMethod: null, role: "user", isCreator: false,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    });
    vi.mocked(adjustTokens).mockResolvedValue(undefined);
    vi.mocked(unlockTutorial).mockResolvedValue(undefined);
  });

  it("deducts tokens and creates unlock record", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tutorials.unlock({ tutorialId: 5 });
    expect(result.success).toBe(true);
    expect(result.alreadyOwned).toBe(false);
    expect(adjustTokens).toHaveBeenCalledWith(1, -1, expect.stringContaining("Test Tutorial"));
    expect(unlockTutorial).toHaveBeenCalledWith(1, 5, 1);
  });

  it("returns alreadyOwned if tutorial is already unlocked", async () => {
    vi.mocked(isUnlocked).mockResolvedValue(true);
    vi.mocked(adjustTokens).mockClear();
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tutorials.unlock({ tutorialId: 5 });
    expect(result.alreadyOwned).toBe(true);
    expect(adjustTokens).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED if insufficient tokens", async () => {
    vi.mocked(getUserById).mockResolvedValue({
      id: 1, tokenBalance: 0, openId: "test-user", name: "Test", email: null,
      loginMethod: null, role: "user", isCreator: false,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.tutorials.unlock({ tutorialId: 5 })).rejects.toThrow("Insufficient tokens");
  });
});

// ─── Admin token adjustment ───────────────────────────────────────────
describe("tokens.adminAdjust", () => {
  it("allows admin to adjust tokens", async () => {
    vi.mocked(adjustTokens).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeAdminCtx());
    const result = await caller.tokens.adminAdjust({ userId: 1, amount: 10, reason: "Bonus" });
    expect(result.success).toBe(true);
    expect(adjustTokens).toHaveBeenCalledWith(1, 10, "Bonus", 99);
  });

  it("forbids non-admin from adjusting tokens", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.tokens.adminAdjust({ userId: 1, amount: 10, reason: "Bonus" })).rejects.toThrow();
  });
});

// ─── Auth logout ──────────────────────────────────────────────────────
describe("auth.logout", () => {
  it("clears session cookie", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});
