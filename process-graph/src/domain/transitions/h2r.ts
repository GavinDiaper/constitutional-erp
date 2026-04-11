import { CanonicalTransition } from "../../contracts/canonicalTypes";

export const h2rTransitions: CanonicalTransition[] = [
  // ── Employee ───────────────────────────────────────────────────────────────
  {
    id: "H2R.Employee.onboard",
    domain: "H2R",
    aggregateType: "employee",
    fromStates: ["Candidate"],
    toStates: ["Onboarding"],
    action: "onboard"
  },
  {
    id: "H2R.Employee.activate",
    domain: "H2R",
    aggregateType: "employee",
    fromStates: ["Onboarding"],
    toStates: ["Active"],
    action: "activate"
  },
  {
    id: "H2R.Employee.goOnLeave",
    domain: "H2R",
    aggregateType: "employee",
    fromStates: ["Active"],
    toStates: ["OnLeave"],
    action: "goOnLeave"
  },
  {
    id: "H2R.Employee.returnFromLeave",
    domain: "H2R",
    aggregateType: "employee",
    fromStates: ["OnLeave"],
    toStates: ["Active"],
    action: "returnFromLeave"
  },
  {
    id: "H2R.Employee.terminate",
    domain: "H2R",
    aggregateType: "employee",
    fromStates: ["Active", "OnLeave"],
    toStates: ["Terminated"],
    action: "terminate"
  },
  {
    id: "H2R.Employee.retire",
    domain: "H2R",
    aggregateType: "employee",
    fromStates: ["Active"],
    toStates: ["Retired"],
    action: "retire"
  },

  // ── Leave Request ──────────────────────────────────────────────────────────
  {
    id: "H2R.LeaveRequest.submit",
    domain: "H2R",
    aggregateType: "leave-request",
    fromStates: ["Draft"],
    toStates: ["Submitted"],
    action: "submit"
  },
  {
    id: "H2R.LeaveRequest.approve",
    domain: "H2R",
    aggregateType: "leave-request",
    fromStates: ["Submitted"],
    toStates: ["Approved"],
    action: "approve"
  },
  {
    id: "H2R.LeaveRequest.reject",
    domain: "H2R",
    aggregateType: "leave-request",
    fromStates: ["Submitted"],
    toStates: ["Rejected"],
    action: "reject"
  },
  {
    id: "H2R.LeaveRequest.take",
    domain: "H2R",
    aggregateType: "leave-request",
    fromStates: ["Approved"],
    toStates: ["Taken"],
    action: "take"
  },
  {
    id: "H2R.LeaveRequest.cancel",
    domain: "H2R",
    aggregateType: "leave-request",
    fromStates: ["Draft", "Submitted", "Approved"],
    toStates: ["Cancelled"],
    action: "cancel"
  }
];
