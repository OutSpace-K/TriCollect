import { decode, encode, save, valid, type Saved, type Store } from "./storage";
import { appendResult } from "./records";
export const TERMINAL_KEY = "tricollect.terminal.v1";
export function pendingTerminal(store: Store): Saved | null {
  const raw = store.get(TERMINAL_KEY);
  if (!raw) return null;
  const s = decode(raw);
  if (!s || s.phase !== "result" || !s.started || s.finishedAt === undefined)
    throw Error("Unreadable terminal journal");
  return s;
}
/** One outstanding terminal transaction. New sessions must drain it first. */
export function commitTerminal(
  store: Store,
  s: Saved,
): { durable: boolean; complete: boolean } {
  if (
    !valid(s) ||
    s.phase !== "result" ||
    !s.started ||
    s.finishedAt === undefined
  )
    return { durable: false, complete: false };
  try {
    const pending = pendingTerminal(store);
    if (pending && pending.session !== s.session)
      return { durable: false, complete: false };
  } catch {
    return { durable: false, complete: false };
  }
  // A settled game cannot undo. Avoid duplicating the complete move history in
  // the terminal journal/main/tmp and exhausting platform storage quotas.
  s = { ...s, history: [], undoAvailable: false };
  let durable = false,
    journal = false,
    main = false;
  try {
    const encoded = encode(s);
    store.set(TERMINAL_KEY, encoded);
    journal = store.get(TERMINAL_KEY) === encoded;
    durable = journal;
  } catch {
    /* A verified main save can still durably preserve the terminal. */
  }
  try {
    save(store, s);
    main = true;
    durable = true;
  } catch {
    /* Keep the journal for restart. */
  }
  // Never record a result unless its terminal state is durably recoverable.
  const recorded = durable && appendResult(store, s, true);
  let complete = main && recorded;
  if (complete) {
    try {
      store.set(TERMINAL_KEY, "");
      complete = !store.get(TERMINAL_KEY);
    } catch {
      complete = false;
    }
  }
  return { durable, complete };
}
export function drainTerminal(store: Store): boolean {
  try {
    const s = pendingTerminal(store);
    return !s || commitTerminal(store, s).complete;
  } catch {
    return false;
  }
}
