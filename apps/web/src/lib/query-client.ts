import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ZodError } from 'zod'
import { reportError } from './monitoring'

/** Errors the user caused or can fix themselves are not worth an alert. */
export function isExpectedError(error: unknown): boolean {
  if (error instanceof ZodError) return true
  const raw = (error as { message?: unknown } | null)?.message
  const msg = (typeof raw === 'string' ? raw : String(error)).toLowerCase()
  return (
    msg.includes('failed to fetch') || // offline / flaky network
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('jwt expired') ||
    // Business-rule refusals shown to the user as a message (see BaseService).
    msg.includes('already enrolled') ||
    msg.includes('not eligible')
  )
}

/** First element of a query key, only if it is a plain static name (keys can hold ids or search text). */
function keyName(key: readonly unknown[] | undefined): string {
  const first = key?.[0]
  return typeof first === 'string' && /^[A-Za-z][\w-]{0,40}$/.test(first) ? first : 'unknown'
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (!isExpectedError(error)) reportError(error, { source: 'query', query: keyName(query.queryKey) })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (!isExpectedError(error)) {
        reportError(error, { source: 'mutation', mutation: keyName(mutation.options.mutationKey) })
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

export default queryClient
