import { AsyncLocalStorage } from 'node:async_hooks';

export const AI_ANALYSIS_BUDGET_MS = 120_000;
export const AI_PERSISTENCE_GRACE_MS = 5_000;
export const AI_REQUEST_BUDGET_MS = AI_ANALYSIS_BUDGET_MS + AI_PERSISTENCE_GRACE_MS;

export function analysisTimeoutMs(config: { get<T>(key: string, fallback: T): T }): number {
  return Number(config.get('AGENT_REQUEST_TIMEOUT_MS', AI_ANALYSIS_BUDGET_MS));
}
const budgets = new AsyncLocalStorage<{ signal: AbortSignal; expiresAt: number }>();

export function requestSignal(): AbortSignal | undefined {
  return budgets.getStore()?.signal;
}

export function remainingRequestMs(): number {
  const budget = budgets.getStore();
  return budget ? Math.max(0, budget.expiresAt - Date.now()) : AI_REQUEST_BUDGET_MS;
}

export function checkRequestBudget(): void {
  requestSignal()?.throwIfAborted();
}

export async function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason ?? new Error('Analysis deadline exceeded.'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/** Nested budgets inherit the earlier deadline; they never restart its clock. */
export async function withRequestBudget<T>(work: () => Promise<T>, milliseconds = AI_REQUEST_BUDGET_MS): Promise<T> {
  const parent = budgets.getStore();
  const expiresAt = Math.min(Date.now() + milliseconds, parent?.expiresAt ?? Infinity);
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new Error('Analysis deadline exceeded.')), Math.max(0, expiresAt - Date.now()));
  try {
    return await budgets.run({ signal, expiresAt }, () => abortable(Promise.resolve().then(() => {
      signal.throwIfAborted();
      return work();
    }), signal));
  } finally {
    clearTimeout(timer);
    controller.abort(new Error('Analysis request finished.'));
  }
}
