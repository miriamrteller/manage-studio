// Re-export from packages/edge-runtime — canonical home as of Batch 5
// This shim exists for migration safety; update callers to import directly from
// ../../packages/edge-runtime/src/cors.ts (or the re-export below disappears in Batch 6)
export * from "../../../packages/edge-runtime/src/cors.ts";
