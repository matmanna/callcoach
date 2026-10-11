import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { Db, MongoClient } from "mongodb";

export interface AuthEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  APP_ORIGIN?: string;
}

export function createAuth(db: Db, client: MongoClient, env: AuthEnv) {
  if (!env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is not set (see .env.example)");
  return betterAuth({
    database: mongodbAdapter(db, { client, usePlural: true }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? "http://localhost:5173",
    basePath: "/api/auth",
    trustedOrigins: env.APP_ORIGIN ? [env.APP_ORIGIN] : [],
    emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
    user: {
      additionalFields: {
        user_type: { type: "string", required: true, input: true },
        display_name: { type: "string", required: false, input: true },
        timezone: { type: "string", required: false, input: true },
      },
    },
    advanced: { defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        // Public HTTP sign-up is coordinators only. Volunteers are created server-side by the
        // invite-accept route, which calls auth.api without an incoming request.
        if (ctx.path === "/sign-up/email" && ctx.request && body.user_type !== "coordinator") {
          throw new APIError("FORBIDDEN", { message: "Volunteers join through an invite link." });
        }
        if (ctx.path === "/sign-up/email" && body.user_type !== "coordinator" && body.user_type !== "volunteer") {
          throw new APIError("BAD_REQUEST", { message: "user_type must be coordinator or volunteer" });
        }
        // user_type is fixed at sign-up.
        if (ctx.path === "/update-user" && "user_type" in body) {
          throw new APIError("FORBIDDEN", { message: "user_type cannot be changed" });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
