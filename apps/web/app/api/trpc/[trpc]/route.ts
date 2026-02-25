import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/lib/trpc/routers';
import { createContext } from '@/lib/trpc/context';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: ({ req: fetchReq }) => createContext({ req: fetchReq }),
  });

export { handler as GET, handler as POST };
