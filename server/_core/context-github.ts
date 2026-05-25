import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema-postgres";
import { parse as parseCookieHeader } from "cookie";
import { verifySessionToken } from "./github-oauth";
import * as db from "../db-postgres";

const COOKIE_NAME = "session_token";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Get session token from cookie
    const cookieHeader = opts.req.headers.cookie;
    if (!cookieHeader) {
      return { req: opts.req, res: opts.res, user: null };
    }

    const cookies = parseCookieHeader(cookieHeader);
    const sessionToken = cookies[COOKIE_NAME];

    if (!sessionToken) {
      return { req: opts.req, res: opts.res, user: null };
    }

    // Verify JWT token
    const payload = await verifySessionToken(sessionToken);
    if (!payload) {
      return { req: opts.req, res: opts.res, user: null };
    }

    // Load user from database
    user = await db.getUserById(payload.userId);
  } catch (error) {
    // Authentication is optional for public procedures
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
