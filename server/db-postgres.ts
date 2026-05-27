import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, and, lt } from "drizzle-orm";
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
} from "../drizzle/schema-postgres";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      const pool = new Pool({ connectionString: ENV.databaseUrl });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");

  if (!user.githubId) throw new Error("User githubId is required for upsert");

  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.githubId, user.githubId)).limit(1);

  if (existing.length > 0) {
    // Update existing user
    const updateData: Partial<InsertUser> = {
      name: user.name,
      email: user.email,
      lastSignedIn: user.lastSignedIn || new Date(),
    };
    await db.update(users).set(updateData).where(eq(users.githubId, user.githubId));
    return existing[0];
  } else {
    // Create new user
    const result = await db
      .insert(users)
      .values({
        githubId: user.githubId,
        name: user.name,
        email: user.email,
        loginMethod: "github",
        role: "user",
        isCreator: false,
        tokenBalance: 20,
        lastSignedIn: user.lastSignedIn || new Date(),
      })
      .returning();

    return result[0];
  }
}

export async function getUserByGithubId(githubId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

// ─── Creator Mode ─────────────────────────────────────────────────────

export async function setCreatorMode(userId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ isCreator: enabled }).where(eq(users.id, userId));
}

// ─── Tokens ───────────────────────────────────────────────────────────

export async function adjustTokens(userId: number, delta: number, reason: string) {
  const db = await getDb();
  if (!db) return;

  // Update balance
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");

  const newBalance = Math.max(0, user.tokenBalance + delta);
  await db.update(users).set({ tokenBalance: newBalance }).where(eq(users.id, userId));

  // Log transaction
  await db.insert(tokenTransactions).values({
    userId,
    amount: delta,
    reason,
  });
}

// ─── Tutorials ────────────────────────────────────────────────────────

export async function createTutorial(tutorial: InsertTutorial) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");

  const result = await db.insert(tutorials).values(tutorial).returning();
  return result[0];
}

export async function getTutorialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tutorials).where(eq(tutorials.id, id)).limit(1);
  return result[0];
}

export async function getTutorialsByCreator(creatorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tutorials)
    .where(eq(tutorials.creatorId, creatorId))
    .orderBy(desc(tutorials.createdAt));
}

export async function getPublishedTutorials() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tutorials)
    .where(eq(tutorials.isPublished, true))
    .orderBy(desc(tutorials.createdAt));
}

export async function getTutorialsByCategory(category: string) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tutorials)
    .where(eq(tutorials.category, category))
    .orderBy(desc(tutorials.createdAt));
}

export async function updateTutorial(id: number, updates: Partial<InsertTutorial>) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");

  const result = await db
    .update(tutorials)
    .set(updates)
    .where(eq(tutorials.id, id))
    .returning();
  return result[0];
}

// ─── Chapters ─────────────────────────────────────────────────────────

export async function createChapter(chapter: InsertChapter) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");

  const result = await db.insert(chapters).values(chapter).returning();
  return result[0];
}

export async function createChapters(chapterList: InsertChapter[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");
  if (chapterList.length === 0) return [];

  const result = await db.insert(chapters).values(chapterList).returning();
  return result;
}

export async function getChaptersByTutorialId(tutorialId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(chapters)
    .where(eq(chapters.tutorialId, tutorialId))
    .orderBy(chapters.sortOrder);
}

export async function deleteChapter(chapterId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(chapters).where(eq(chapters.id, chapterId));
}

export async function deleteChaptersByTutorialId(tutorialId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(chapters).where(eq(chapters.tutorialId, tutorialId));
}

export async function deleteTutorial(tutorialId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tutorials).where(eq(tutorials.id, tutorialId));
}

// ─── Unlocks ──────────────────────────────────────────────────────────

export async function unlockTutorial(userId: number, tutorialId: number, tokensPaid: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not connected");

  const result = await db
    .insert(unlocks)
    .values({
      userId,
      tutorialId,
      tokensPaid,
    })
    .returning();

  return result[0];
}

export async function getUnlockedTutorials(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const unlockedIds = await db.select({ tutorialId: unlocks.tutorialId }).from(unlocks).where(eq(unlocks.userId, userId));

  if (unlockedIds.length === 0) return [];

  const tutorialIds = unlockedIds.map((u) => u.tutorialId);
  return await db
    .select()
    .from(tutorials)
    .where(inArray(tutorials.id, tutorialIds))
    .orderBy(desc(tutorials.createdAt));
}

export async function isUserTutorialUnlocked(userId: number, tutorialId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .select()
    .from(unlocks)
    .where(and(eq(unlocks.userId, userId), eq(unlocks.tutorialId, tutorialId)))
    .limit(1);

  return result.length > 0;
}

export async function getAllTokenTransactions() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tokenTransactions).orderBy(desc(tokenTransactions.createdAt));
}

export async function getTokenHistory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tokenTransactions)
    .where(eq(tokenTransactions.userId, userId))
    .orderBy(desc(tokenTransactions.createdAt));
}

// ─── Admin Stats ──────────────────────────────────────────────────────

export async function setTutorialPublished(tutorialId: number, isPublished: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(tutorials).set({ isPublished }).where(eq(tutorials.id, tutorialId));
}

export async function getTotalUsers() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: eq(users.id, users.id) }).from(users);
  return result.length;
}

export async function getTotalUnlocks() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select().from(unlocks);
  return result.length;
}

export async function getTotalTokensConsumed() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select()
    .from(tokenTransactions)
    .where(lt(tokenTransactions.amount, 0)); // Only count debits
  return Math.abs(result.reduce((sum, t) => sum + (t.amount || 0), 0));
}

export async function getAllTutorials() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tutorials).orderBy(desc(tutorials.createdAt));
}
