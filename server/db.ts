import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  chapters,
  InsertChapter,
  InsertTokenTransaction,
  InsertTutorial,
  InsertUser,
  tokenTransactions,
  tutorials,
  unlocks,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  // New users get 20 tokens by default (schema default handles it)
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function setCreatorMode(userId: number, isCreator: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ isCreator }).where(eq(users.id, userId));
}

// ─── Tokens ───────────────────────────────────────────────────────────

export async function adjustTokens(
  userId: number,
  amount: number,
  reason: string,
  adminId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.update(users).set({ tokenBalance: sql`tokenBalance + ${amount}` }).where(eq(users.id, userId));
  const tx: InsertTokenTransaction = { userId, amount, reason, adminId };
  await db.insert(tokenTransactions).values(tx);
}

export async function getTokenHistory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tokenTransactions)
    .where(eq(tokenTransactions.userId, userId))
    .orderBy(desc(tokenTransactions.createdAt))
    .limit(50);
}

export async function getAllTokenTransactions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tokenTransactions).orderBy(desc(tokenTransactions.createdAt)).limit(200);
}

// ─── Tutorials ────────────────────────────────────────────────────────

export async function createTutorial(data: InsertTutorial) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(tutorials).values(data).$returningId();
  return result;
}

export async function getPublishedTutorials() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: tutorials.id,
      title: tutorials.title,
      category: tutorials.category,
      description: tutorials.description,
      tokenPrice: tutorials.tokenPrice,
      demoVideoUrl: tutorials.demoVideoUrl,
      tutorialVideoUrl: tutorials.tutorialVideoUrl,
      isPublished: tutorials.isPublished,
      createdAt: tutorials.createdAt,
      creatorId: tutorials.creatorId,
      creatorName: users.name,
    })
    .from(tutorials)
    .leftJoin(users, eq(tutorials.creatorId, users.id))
    .where(eq(tutorials.isPublished, true))
    .orderBy(desc(tutorials.createdAt));
}

export async function getAllTutorials() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: tutorials.id,
      title: tutorials.title,
      category: tutorials.category,
      tokenPrice: tutorials.tokenPrice,
      demoVideoUrl: tutorials.demoVideoUrl,
      tutorialVideoUrl: tutorials.tutorialVideoUrl,
      isPublished: tutorials.isPublished,
      createdAt: tutorials.createdAt,
      creatorId: tutorials.creatorId,
      creatorName: users.name,
    })
    .from(tutorials)
    .leftJoin(users, eq(tutorials.creatorId, users.id))
    .orderBy(desc(tutorials.createdAt));
}

export async function getTutorialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: tutorials.id,
      title: tutorials.title,
      category: tutorials.category,
      description: tutorials.description,
      tokenPrice: tutorials.tokenPrice,
      demoVideoUrl: tutorials.demoVideoUrl,
      tutorialVideoUrl: tutorials.tutorialVideoUrl,
      isPublished: tutorials.isPublished,
      createdAt: tutorials.createdAt,
      creatorId: tutorials.creatorId,
      creatorName: users.name,
    })
    .from(tutorials)
    .leftJoin(users, eq(tutorials.creatorId, users.id))
    .where(eq(tutorials.id, id))
    .limit(1);
  return result[0];
}

export async function setTutorialPublished(id: number, isPublished: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(tutorials).set({ isPublished }).where(eq(tutorials.id, id));
}

export async function getTutorialsByCreator(creatorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tutorials).where(eq(tutorials.creatorId, creatorId)).orderBy(desc(tutorials.createdAt));
}

// ─── Chapters ─────────────────────────────────────────────────────────

export async function createChapters(data: InsertChapter[]) {
  const db = await getDb();
  if (!db) return;
  if (data.length === 0) return;
  await db.insert(chapters).values(data);
}

export async function getChaptersByTutorial(tutorialId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(chapters)
    .where(eq(chapters.tutorialId, tutorialId))
    .orderBy(chapters.sortOrder);
}

export async function deleteChaptersByTutorial(tutorialId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(chapters).where(eq(chapters.tutorialId, tutorialId));
}

// ─── Unlocks ──────────────────────────────────────────────────────────

export async function unlockTutorial(userId: number, tutorialId: number, tokensSpent: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(unlocks).values({ userId, tutorialId, tokensSpent });
}

export async function isUnlocked(userId: number, tutorialId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: unlocks.id })
    .from(unlocks)
    .where(and(eq(unlocks.userId, userId), eq(unlocks.tutorialId, tutorialId)))
    .limit(1);
  return result.length > 0;
}

export async function getUnlockedTutorials(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: tutorials.id,
      title: tutorials.title,
      category: tutorials.category,
      tokenPrice: tutorials.tokenPrice,
      demoVideoUrl: tutorials.demoVideoUrl,
      tutorialVideoUrl: tutorials.tutorialVideoUrl,
      creatorId: tutorials.creatorId,
      creatorName: users.name,
      unlockedAt: unlocks.unlockedAt,
    })
    .from(unlocks)
    .innerJoin(tutorials, eq(unlocks.tutorialId, tutorials.id))
    .leftJoin(users, eq(tutorials.creatorId, users.id))
    .where(eq(unlocks.userId, userId))
    .orderBy(desc(unlocks.unlockedAt));
}

export async function getTotalUnlocks(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(unlocks);
  return Number(result[0]?.count ?? 0);
}

export async function getTotalUsers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(result[0]?.count ?? 0);
}

export async function getTotalTokensConsumed(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(ABS(amount)), 0)` })
    .from(tokenTransactions)
    .where(sql`amount < 0`);
  return Number(result[0]?.total ?? 0);
}
