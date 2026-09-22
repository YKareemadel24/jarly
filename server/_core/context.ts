import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { authenticateRequest } from "./supabase-auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateRequest(opts.req);
  } catch {
    // Authentication is optional here: `previewInvite` is public on purpose so
    // someone can see what they are being invited to before signing in.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
