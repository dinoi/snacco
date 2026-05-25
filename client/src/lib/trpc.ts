import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

// Vanilla client for imperative calls (polling, etc.)
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${window.location.origin}/api/trpc`,
      transformer: superjson,
    }),
  ],
});
