/**
 * The only file that imports the Sentry SDK at runtime. It is loaded with a dynamic
 * import (see ./index.ts), so builds without a DSN never download it. Named imports
 * keep the chunk small: no replay, tracing or feedback-widget code is bundled.
 */
export {
  breadcrumbsIntegration,
  captureException,
  captureFeedback,
  init,
  lastEventId,
  setTag,
  setUser,
  withScope,
} from '@sentry/react';
