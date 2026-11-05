/**
 * Just enough of Deno's globals for tsconfig.test.json: tests import edge-function
 * modules, and Vitest gives them a fake Deno (or process.env through getEnv).
 * The edge functions themselves are type-checked by Deno in CI.
 */
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
