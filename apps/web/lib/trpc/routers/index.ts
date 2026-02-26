import { router } from '../trpc';
import { videoRouter } from './video';
import { clipRouter } from './clip';
import { userRouter } from './user';
import { billingRouter } from './billing';
import { transcriptRouter } from './transcript';
import { platformRouter } from './platform';
import { analyticsRouter } from './analytics';

export const appRouter = router({
  video: videoRouter,
  clip: clipRouter,
  user: userRouter,
  billing: billingRouter,
  transcript: transcriptRouter,
  platform: platformRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
