import { AsyncLocalStorage } from "node:async_hooks";
import type { ErrorActor, ErrorSource } from "../src/features/portal/model/errors.ts";

export interface ErrorContext {
  actor?: ErrorActor | null; projectId?: string; projectName?: string;
  subprojectId?: string; subprojectName?: string;
  requestId?: string; method?: string; path?: string; operation?: string; source?: ErrorSource;
  requestStatus?: number;
  report?: (error: unknown, context?: ErrorContext) => string | null;
}
const storage = new AsyncLocalStorage<ErrorContext>();
export const errorContext = () => storage.getStore() ?? {};
export function withErrorContext<T>(context: ErrorContext, action: () => T): T { return storage.run({ ...errorContext(), ...context }, action); }
export function updateErrorContext(context: ErrorContext) { Object.assign(storage.getStore() ?? {}, context); }
export function reportHandledError(error: unknown, context?: ErrorContext) { return errorContext().report?.(error, context); }
