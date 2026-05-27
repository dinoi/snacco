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
    openId: varchar("open_id", { length: 64 }).notNull().unique(),
    githubId: varchar("github_id", { length: 64 }).notNull(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("login_method", { length: 64 }).notNull().default("github"),
    role: roleEnum("role").notNull().default("user"),
    isCreator: boolean("is_creator").notNull().default(false),
    tokenBalance: integer("token_balance").notNull().default(20),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    lastSignedIn: timestamp("last_signed_in").notNull().defaultNow(),
  },
  (table) => ({})
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const tutorials = pgTable("tutorials", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description"),
  tokenPrice: integer("token_price").notNull().default(1),
  demoVideoUrl: text("demo_video_url").notNull(),
  demoVideoKey: text("demo_video_key").notNull(),
  tutorialVideoUrl: text("tutorial_video_url").notNull(),
  tutorialVideoKey: text("tutorial_video_key").notNull(),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Tutorial = typeof tutorials.$inferSelect;
export type InsertTutorial = typeof tutorials.$inferInsert;

export const chapters = pgTable("chapters", {
  id: serial("id").primaryKey(),
  tutorialId: integer("tutorial_id").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  timestampSeconds: integer("timestamp_seconds").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Chapter = typeof chapters.$inferSelect;
export type InsertChapter = typeof chapters.$inferInsert;

export const unlocks = pgTable("unlocks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tutorialId: integer("tutorial_id").notNull(),
  tokensPaid: integer("tokens_paid").notNull(),
  unlockedAt: timestamp("unlocked_at").notNull().defaultNow(),
});

export type Unlock = typeof unlocks.$inferSelect;
export type InsertUnlock = typeof unlocks.$inferInsert;

export const tokenTransactions = pgTable("token_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TokenTransaction = typeof tokenTransactions.$inferSelect;
export type InsertTokenTransaction = typeof tokenTransactions.$inferInsert;
