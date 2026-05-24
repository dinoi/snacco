import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isCreator: boolean("isCreator").default(false).notNull(),
  tokenBalance: int("tokenBalance").default(20).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const tutorials = mysqlTable("tutorials", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: int("creatorId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description"),
  tokenPrice: int("tokenPrice").default(1).notNull(),
  demoVideoUrl: text("demoVideoUrl").notNull(),
  demoVideoKey: text("demoVideoKey").notNull(),
  tutorialVideoUrl: text("tutorialVideoUrl").notNull(),
  tutorialVideoKey: text("tutorialVideoKey").notNull(),
  isPublished: boolean("isPublished").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Tutorial = typeof tutorials.$inferSelect;
export type InsertTutorial = typeof tutorials.$inferInsert;

export const chapters = mysqlTable("chapters", {
  id: int("id").autoincrement().primaryKey(),
  tutorialId: int("tutorialId").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  timestampSeconds: int("timestampSeconds").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Chapter = typeof chapters.$inferSelect;
export type InsertChapter = typeof chapters.$inferInsert;

export const unlocks = mysqlTable("unlocks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tutorialId: int("tutorialId").notNull(),
  tokensSpent: int("tokensSpent").default(1).notNull(),
  unlockedAt: timestamp("unlockedAt").defaultNow().notNull(),
});

export type Unlock = typeof unlocks.$inferSelect;
export type InsertUnlock = typeof unlocks.$inferInsert;

export const tokenTransactions = mysqlTable("token_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  amount: int("amount").notNull(), // positive = credit, negative = debit
  reason: varchar("reason", { length: 255 }).notNull(),
  adminId: int("adminId"), // set if adjusted by admin
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TokenTransaction = typeof tokenTransactions.$inferSelect;
export type InsertTokenTransaction = typeof tokenTransactions.$inferInsert;
