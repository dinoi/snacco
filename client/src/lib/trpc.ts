import { createTRPCReact, createTRPCProxyClient, httpLink } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

// Vanilla client for imperative calls (e.g. polling inside async functions)
export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});
