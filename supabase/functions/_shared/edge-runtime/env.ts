/** Read env in Deno edge functions and in Node/vitest. */
export function getEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno;
  if (deno?.env?.get) {
    return deno.env.get(name);
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}
