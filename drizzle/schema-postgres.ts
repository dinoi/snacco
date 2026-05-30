import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  json,
  unique,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    githubId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }).notNull().default("github"),
    role: roleEnum("role").notNull().default("user"),
    isCreator: boolean("isCreator").notNull().default(false),
    tokenBalance: integer("tokenBalance").notNull().default(20),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    lastSignedIn: timestamp("lastSignedIn").notNull().defaultNow(),
  },
  (table) => ({
    githubIdUnique: unique("users_openId_unique").on(table.githubId),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const tutorials = pgTable("tutorials", {
  id: serial("id").primaryKey(),
  creatorId: integer("creatorId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description"),
  tokenPrice: integer("tokenPrice").notNull().default(1),
  demoVideoUrl: text("demoVideoUrl").notNull(),
  demoVideoKey: text("demoVideoKey").notNull(),
  tutorialVideoUrl: text("tutorialVideoUrl").notNull(),
  tutorialVideoKey: text("tutorialVideoKey").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  thumbnailKey: text("thumbnailKey"),
  isPublished: boolean("isPublished").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type Tutorial = typeof tutorials.$inferSelect;
export type InsertTutorial = typeof tutorials.$inferInsert;

export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  tutorialId: integer("tutorialId").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  timestampSeconds: integer("timestampSeconds").notNull(),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Chapter = typeof chapters.$inferSelect;
export type InsertChapter = typeof chapters.$inferInsert;

export const unlocks = pgTable("unlocks", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  tutorialId: integer("tutorialId").notNull(),
  tokensPaid: integer("tokensSpent").notNull(),
  unlockedAt: timestamp("unlockedAt").notNull().defaultNow(),
});

export type Unlock = typeof unlocks.$inferSelect;
export type InsertUnlock = typeof unlocks.$inferInsert;

export const tokenTransactions = pgTable("token_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  amount: integer("amount").notNull(),
  reason: varchar("reason", { length: 255 }),
  adminId: integer("adminId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type TokenTransaction = typeof tokenTransactions.$inferSelect;
export type InsertTokenTransaction = typeof tokenTransactions.$inferInsert;
