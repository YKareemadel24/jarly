import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { sharedJarRouter } from "./sharedJarRouter";

export const appRouter = router({
  system: systemRouter,
  sharedJar: sharedJarRouter,
  auth: router({
    /**
     * Who the caller is, or null. Read from the Supabase token already verified
     * on the request, so this costs nothing beyond the context it was built in.
     *
     * There is no matching `logout`: signing out is entirely a client concern
     * now, because the server never held a session of its own.
     */
    me: publicProcedure.query((opts) => opts.ctx.user),
  }),
});

export type AppRouter = typeof appRouter;
