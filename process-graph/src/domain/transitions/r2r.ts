import { CanonicalTransition } from "../../contracts/canonicalTypes";

export const r2rTransitions: CanonicalTransition[] = [
  // ── Journal Entry ──────────────────────────────────────────────────────────
  {
    id: "R2R.JournalEntry.post",
    domain: "R2R",
    aggregateType: "journal-entry",
    fromStates: ["Draft"],
    toStates: ["Posted"],
    action: "post"
  },
  {
    id: "R2R.JournalEntry.reverse",
    domain: "R2R",
    aggregateType: "journal-entry",
    fromStates: ["Posted"],
    toStates: ["Reversed"],
    action: "reverse"
  },
  {
    id: "R2R.JournalEntry.adjust",
    domain: "R2R",
    aggregateType: "journal-entry",
    fromStates: ["Posted"],
    toStates: ["Adjusted"],
    action: "adjust"
  },
  {
    id: "R2R.JournalEntry.lock",
    domain: "R2R",
    aggregateType: "journal-entry",
    fromStates: ["Posted", "Adjusted"],
    toStates: ["Locked"],
    action: "lock"
  },

  // ── Period ─────────────────────────────────────────────────────────────────
  {
    id: "R2R.Period.beginClose",
    domain: "R2R",
    aggregateType: "period",
    fromStates: ["Open"],
    toStates: ["PendingClose"],
    action: "beginClose"
  },
  {
    id: "R2R.Period.close",
    domain: "R2R",
    aggregateType: "period",
    fromStates: ["PendingClose"],
    toStates: ["Closed"],
    action: "close"
  },
  {
    id: "R2R.Period.reopen",
    domain: "R2R",
    aggregateType: "period",
    fromStates: ["Closed"],
    toStates: ["Reopened"],
    action: "reopen"
  }
];
