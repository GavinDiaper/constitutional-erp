import { AggregateState, LedgerEvent } from "../../contracts/canonicalTypes";

const eventTypeToState: Record<string, string> = {
  // Employee
  "H2R.EmployeeCandidateCreated": "Candidate",
  "H2R.EmployeeOnboarded": "Onboarding",
  "H2R.EmployeeActivated": "Active",
  "H2R.EmployeeWentOnLeave": "OnLeave",
  "H2R.EmployeeReturnedFromLeave": "Active",
  "H2R.EmployeeTerminated": "Terminated",
  "H2R.EmployeeRetired": "Retired",
  // Employee – Foundation ERP lowercase format
  "H2R.employee.created": "Candidate",
  "H2R.employee.activated": "Active",
  "H2R.employee.on_leave": "OnLeave",
  "H2R.employee.returned": "Active",
  "H2R.employee.terminated": "Terminated",

  // Position / Authority Rule (stateless definitions)
  "H2R.position.created": "Active",
  "H2R.authority-rule.created": "Active",

  // Assignment
  "H2R.assignment.created": "Planned",
  "H2R.assignment.activated": "Active",
  "H2R.assignment.completed": "Completed",
  "H2R.assignment.cancelled": "Cancelled",

  // Credential
  "H2R.credential.issued": "Valid",
  "H2R.credential.expired": "Expired",
  "H2R.credential.revoked": "Revoked",

  // Leave Request
  "H2R.LeaveRequestCreated": "Draft",
  "H2R.LeaveRequestSubmitted": "Submitted",
  "H2R.LeaveRequestApproved": "Approved",
  "H2R.LeaveRequestRejected": "Rejected",
  "H2R.LeaveRequestTaken": "Taken",
  "H2R.LeaveRequestCancelled": "Cancelled"
};

export function applyH2REvent(state: AggregateState | null, event: LedgerEvent): AggregateState {
  const newState = eventTypeToState[event.eventType];

  if (state === null) {
    return {
      id: event.domain.aggregateId,
      domain: "H2R",
      aggregateType: event.domain.aggregateType,
      state: newState ?? "Draft",
      attributes: { ...event.payload },
      version: 1
    };
  }

  return {
    ...state,
    state: newState ?? state.state,
    attributes: { ...state.attributes, ...event.payload },
    version: state.version + 1
  };
}
