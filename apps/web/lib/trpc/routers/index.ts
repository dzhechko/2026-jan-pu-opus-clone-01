import { router } from '../trpc';
import { videoRouter } from './video';
import { clipRouter } from './clip';
import { userRouter } from './user';
import { billingRouter } from './billing';

export const appRouter = router({
  video: videoRouter,
  clip: clipRouter,
  user: userRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
