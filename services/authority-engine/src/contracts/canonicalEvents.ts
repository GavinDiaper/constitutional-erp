export type AuthorityDomain = "O2C" | "P2P" | "R2R" | "H2R";

export interface CanonicalEventBase<TType extends string, TPayload> {
  type: TType;
  entityId: string;
  version: number;
  occurredAt: string;
  sourceEventId: string;
  payload: TPayload;
}

export type EmployeeHiredEvent = CanonicalEventBase<
  "EmployeeHired",
  { employeeId: string; name: string; email?: string }
>;
export type EmployeeTerminatedEvent = CanonicalEventBase<
  "EmployeeTerminated",
  { employeeId: string; fromStatus?: string; toStatus?: string }
>;
export type EmployeeOnLeaveEvent = CanonicalEventBase<
  "EmployeeOnLeave",
  { employeeId: string; fromStatus?: string; toStatus?: string }
>;
export type EmployeeReturnedEvent = CanonicalEventBase<
  "EmployeeReturned",
  { employeeId: string; fromStatus?: string; toStatus?: string }
>;
export type PositionCreatedEvent = CanonicalEventBase<
  "PositionCreated",
  {
    positionId: string;
    title: string;
    department: string;
    authorityDomain: AuthorityDomain;
    authorityTier: number;
  }
>;
export type AssignmentCreatedEvent = CanonicalEventBase<
  "AssignmentCreated",
  { assignmentId: string; employeeId: string; positionId: string }
>;
export type AssignmentEndedEvent = CanonicalEventBase<
  "AssignmentEnded",
  { assignmentId: string; fromState?: string; toState?: string }
>;
export type CredentialIssuedEvent = CanonicalEventBase<
  "CredentialIssued",
  { credentialId: string; employeeId: string; credentialType: string; expiryDate?: string }
>;
export type CredentialExpiredEvent = CanonicalEventBase<
  "CredentialExpired",
  { credentialId: string; fromStatus?: string; toStatus?: string }
>;
export type CredentialRevokedEvent = CanonicalEventBase<
  "CredentialRevoked",
  { credentialId: string; fromStatus?: string; toStatus?: string }
>;
export type AuthorityRuleCreatedEvent = CanonicalEventBase<
  "AuthorityRuleCreated",
  { ruleId: string; domain: AuthorityDomain; threshold: number; requiredTier: number }
>;

export type CanonicalEvent =
  | EmployeeHiredEvent
  | EmployeeTerminatedEvent
  | EmployeeOnLeaveEvent
  | EmployeeReturnedEvent
  | PositionCreatedEvent
  | AssignmentCreatedEvent
  | AssignmentEndedEvent
  | CredentialIssuedEvent
  | CredentialExpiredEvent
  | CredentialRevokedEvent
  | AuthorityRuleCreatedEvent;
