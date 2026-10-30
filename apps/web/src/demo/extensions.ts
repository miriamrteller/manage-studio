/**
 * Demo backend pieces for features that land after the base shoots work
 * (payment requests, gallery gating, quotes). Kept separate so each feature
 * merge only touches this file.
 */
import type { FakeHooks, FunctionHandler, RpcHandler } from './fakeSupabase';
import { canRead } from './rls';

export const extraRpcs: Record<string, RpcHandler> = {};

export const extraFunctions: Record<string, FunctionHandler> = {};

export const hooks: FakeHooks = {
  canRead,
  onUnknown: (kind, name) => {
    console.warn(`[demo] unhandled ${kind}: ${name}`);
  },
};
