import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "session_token";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function encodeState(returnPath: string): string {
  return Buffer.from(JSON.stringify({ returnPath })).toString("base64");
}

function decodeState(state: string): { returnPath: string } {
  try {
    return JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
  } catch {
    return { returnPath: "/" };
  }
}

export function getLoginUrl(returnPath: string = "/"): string {
  const state = encodeState(returnPath);
  const params = new URLSearchParams({
    client_id: ENV.githubClientId,
    redirect_uri: `${ENV.appUrl}/api/oauth/callback`,
    scope: "user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function registerGitHubOAuthRoutes(app: Express) {
  // OAuth callback endpoint
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: ENV.githubClientId,
          client_secret: ENV.githubClientSecret,
          code,
          redirect_uri: `${ENV.appUrl}/api/oauth/callback`,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`GitHub token exchange failed: ${tokenResponse.statusText}`);
      }

      const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };
      if (!tokenData.access_token) {
        throw new Error(`GitHub token exchange failed: ${tokenData.error}`);
      }

      // Get user info from GitHub
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!userResponse.ok) {
        throw new Error(`GitHub user fetch failed: ${userResponse.statusText}`);
      }

      const userInfo = (await userResponse.json()) as {
        id: number;
        login: string;
        name?: string;
        email?: string;
      };

      // Get email if not in user info
      let email = userInfo.email;
      if (!email) {
        const emailResponse = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (emailResponse.ok) {
          const emails = (await emailResponse.json()) as Array<{ email: string; primary: boolean }>;
          const primaryEmail = emails.find((e) => e.primary);
          email = primaryEmail?.email || emails[0]?.email || null;
        }
      }

      // Upsert user in database
      const githubId = `github_${userInfo.id}`;
      const user = await db.upsertUser({
        githubId,
        name: userInfo.name || userInfo.login,
        email: email || null,
        loginMethod: "github",
        lastSignedIn: new Date(),
      });

      // Create session token (JWT)
      const sessionToken = await createSessionToken(user.id, {
        githubId,
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect to original return path
      const { returnPath } = decodeState(state);
      res.redirect(302, returnPath || "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
    res.json({ success: true });
  });
}

export async function createSessionToken(
  userId: number,
  payload: { githubId: string; name: string; expiresInMs: number }
): Promise<string> {
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  const token = await new SignJWT({
    userId,
    githubId: payload.githubId,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + payload.expiresInMs / 1000)
    .sign(secret);

  return token;
}

export async function verifySessionToken(token: string): Promise<{ userId: number; githubId: string; name: string } | null> {
  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const verified = await jwtVerify(token, secret);
    return verified.payload as any;
  } catch {
    return null;
  }
}
