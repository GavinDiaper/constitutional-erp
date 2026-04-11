# **📘 Foundation ERP – Super‑H2R Domain Implementation**  
### *Canonical Hire‑to‑Retire Domain for the Constitutional ERP*  
### *Node.js + TypeScript + better‑sqlite3*

---

# **1. Purpose of Super‑H2R**

Super‑H2R provides the **canonical workforce model** required by the Constitutional ERP to:

- assign authority  
- enforce governance  
- route approvals  
- validate training and credentials  
- manage positions and roles  
- track employee lifecycle  
- support cross‑domain workflows (O2C, P2P, R2R)  

This is not a full HRIS.  
It is the **constitutional HR kernel**.

---

# **2. Domain Overview**

Super‑H2R includes six canonical aggregates:

1. **Employee** – the person  
2. **Position** – the role  
3. **Assignment** – who holds which role  
4. **Credential** – training, certification, clearance  
5. **AuthorityRule** – domain‑specific authority thresholds  
6. **AuthorityEvent** – earned authority changes  

These are the minimum required to support:

- approval routing  
- governance filtering  
- authority‑tier enforcement  
- cross‑domain constraints  
- auditability  
- replay  

---

# **3. Shared Types**

```ts
export type EmployeeStatus =
  | "Active"
  | "OnLeave"
  | "Terminated";

export type CredentialStatus =
  | "Valid"
  | "Expired"
  | "Revoked";

export type AuthorityDomain =
  | "O2C"
  | "P2P"
  | "R2R"
  | "H2R";

export type AuthorityTier = 1 | 2 | 3 | 4 | 5;

export interface BaseEntity {
  createdAt: string;
  updatedAt: string;
}
```

---

# **4. Employee Domain**

## **4.1 Model**

```ts
export interface Employee extends BaseEntity {
  employeeId: string;
  name: string;
  email: string;
  status: EmployeeStatus;
  hireDate: string;
  terminationDate?: string;
}
```

## **4.2 Repository**

```ts
export const EmployeeRepo = {
  create(e: Employee): Employee { ... },
  updateStatus(id: string, status: EmployeeStatus): void { ... },
  findById(id: string): Employee | undefined { ... }
};
```

## **4.3 Service**

```ts
export const EmployeeService = {
  hire(name: string, email: string): Employee { ... },
  placeOnLeave(id: string): Employee { ... },
  returnFromLeave(id: string): Employee { ... },
  terminate(id: string): Employee { ... },
  require(id: string): Employee { ... }
};
```

## **4.4 State Machine**

- **Active → OnLeave → Active**  
- **Active → Terminated**  
- **OnLeave → Terminated**  

---

# **5. Position Domain**

## **5.1 Model**

```ts
export interface Position extends BaseEntity {
  positionId: string;
  title: string;
  department: string;
  authorityDomain: AuthorityDomain;
  authorityTier: AuthorityTier;
}
```

## **5.2 Repository + Service**

```ts
export const PositionService = {
  create(title, department, domain, tier): Position { ... },
  require(id): Position { ... }
};
```

---

# **6. Assignment Domain**

## **6.1 Model**

```ts
export interface Assignment extends BaseEntity {
  assignmentId: string;
  employeeId: string;
  positionId: string;
  startDate: string;
  endDate?: string;
}
```

## **6.2 Repository + Service**

```ts
export const AssignmentService = {
  assign(employeeId, positionId): Assignment { ... },
  endAssignment(assignmentId): Assignment { ... },
  getActiveAssignments(employeeId): Assignment[] { ... }
};
```

---

# **7. Credential Domain**

## **7.1 Model**

```ts
export interface Credential extends BaseEntity {
  credentialId: string;
  employeeId: string;
  type: string; // e.g. "Hazmat", "FinancialApproval", "Forklift"
  status: CredentialStatus;
  issuedDate: string;
  expiryDate?: string;
}
```

## **7.2 Repository + Service**

```ts
export const CredentialService = {
  issue(employeeId, type, expiry?): Credential { ... },
  expire(id): Credential { ... },
  revoke(id): Credential { ... },
  require(id): Credential { ... }
};
```

## **7.3 State Machine**

- **Valid → Expired**  
- **Valid → Revoked**  

---

# **8. Authority Rules Domain**

## **8.1 Model**

```ts
export interface AuthorityRule extends BaseEntity {
  ruleId: string;
  domain: AuthorityDomain;
  threshold: number; // e.g. max approval amount
  requiredTier: AuthorityTier;
}
```

## **8.2 Repository + Service**

```ts
export const AuthorityRuleService = {
  create(domain, threshold, tier): AuthorityRule { ... },
  findRulesForDomain(domain): AuthorityRule[] { ... }
};
```

---

# **9. Authority Events**

These are emitted whenever:

- an employee is assigned a position  
- a credential is issued  
- a credential expires  
- a credential is revoked  
- an authority rule is created  

Example event payload:

```json
{
  "event_type": "AuthorityGranted",
  "entity_type": "Employee",
  "entity_id": "EMP123",
  "payload": {
    "positionId": "POS456",
    "authorityTier": 3,
    "authorityDomain": "P2P"
  }
}
```

---

# **10. Hypermedia API**

## **10.1 Employees**

```
POST /api/v1/h2r/employees
GET  /api/v1/h2r/employees/:id
POST /api/v1/h2r/employees/:id/leave
POST /api/v1/h2r/employees/:id/return
POST /api/v1/h2r/employees/:id/terminate
```

### Example hypermedia:

```json
{
  "employee_id": "EMP123",
  "status": "Active",
  "_links": {
    "self": { "href": "/api/v1/h2r/employees/EMP123" },
    "place-on-leave": {
      "href": "/api/v1/h2r/employees/EMP123/leave",
      "method": "POST",
      "mcpFunction": "h2r_place_on_leave"
    }
  }
}
```

---

## **10.2 Positions**

```
POST /api/v1/h2r/positions
GET  /api/v1/h2r/positions/:id
```

---

## **10.3 Assignments**

```
POST /api/v1/h2r/assignments
POST /api/v1/h2r/assignments/:id/end
```

---

## **10.4 Credentials**

```
POST /api/v1/h2r/credentials
POST /api/v1/h2r/credentials/:id/expire
POST /api/v1/h2r/credentials/:id/revoke
```

---

## **10.5 Authority Rules**

```
POST /api/v1/h2r/authority-rules
GET  /api/v1/h2r/authority-rules?domain=P2P
```

---

# **11. MCP Function Catalog**

### **Employee Functions**
- `h2r_create_employee`
- `h2r_place_on_leave`
- `h2r_return_from_leave`
- `h2r_terminate_employee`

### **Position Functions**
- `h2r_create_position`

### **Assignment Functions**
- `h2r_assign_position`
- `h2r_end_assignment`

### **Credential Functions**
- `h2r_issue_credential`
- `h2r_expire_credential`
- `h2r_revoke_credential`

### **Authority Functions**
- `h2r_create_authority_rule`

---

# **12. Event Emission**

Every state transition emits an event:

- `EmployeeHired`
- `EmployeeOnLeave`
- `EmployeeReturned`
- `EmployeeTerminated`
- `PositionCreated`
- `AssignmentCreated`
- `AssignmentEnded`
- `CredentialIssued`
- `CredentialExpired`
- `CredentialRevoked`
- `AuthorityRuleCreated`

These flow into:

- Mesh Ledger  
- Replay engine  
- Governance engine  
- Navigator  

---

# **13. Integration Hub API Guide (H2R)**

### **Endpoints**

```
/api/v1/h2r/employees
/api/v1/h2r/positions
/api/v1/h2r/assignments
/api/v1/h2r/credentials
/api/v1/h2r/authority-rules
```

### **Security**

Same as O2C/P2P/R2R:

- `x-api-key`
- `x-ingress-id`

### **Event Feed**

H2R events appear in:

```
GET /api/v1/events
```

---

# **14. Postman Collection Structure**

```
60 - H2R Flow
  - Create Employee
  - Create Position
  - Assign Position
  - Issue Credential
  - Create Authority Rule
  - Place Employee On Leave
  - Return Employee
  - Terminate Employee
```

---

# **15. Mapping Tables (ERP‑Agnostic)**

### **Employee**

| Canonical | Oracle HCM | SAP HCM | Dynamics HR |
|----------|-------------|---------|-------------|
| employeeId | PER_ALL_PEOPLE_F.PERSON_ID | PA0001-PERNR | HcmWorker.RecId |
| name | FULL_NAME | NAME | PersonName |
| status | ASSIGNMENT_STATUS | STAT2 | EmploymentStatus |

### **Position**

| Canonical | Oracle | SAP | Dynamics |
|----------|--------|-----|----------|
| positionId | PER_POSITIONS.POSITION_ID | HRP1000-OBJID | HcmPosition.RecId |
| title | NAME | STEXT | Title |

### **Credential**

| Canonical | Oracle | SAP | Dynamics |
|----------|--------|-----|----------|
| credentialId | PER_CERTIFICATIONS.CERTIFICATION_ID | HRP1001 | HcmSkill.RecId |

---

# **16. End‑to‑End H2R Flow**

```ts
const emp = EmployeeService.hire("Alice", "alice@example.com");
const pos = PositionService.create("Finance Controller", "Finance", "R2R", 3);
const asg = AssignmentService.assign(emp.employeeId, pos.positionId);
const cred = CredentialService.issue(emp.employeeId, "FinancialApproval", "2027-12-31");
const rule = AuthorityRuleService.create("R2R", 10000, 3);
EmployeeService.placeOnLeave(emp.employeeId);
EmployeeService.returnFromLeave(emp.employeeId);
EmployeeService.terminate(emp.employeeId);
```

---

# **17. Summary**

Super‑H2R completes the constitutional foundation:

- O2C → revenue  
- P2P → spend  
- R2R → accounting  
- **H2R → authority, governance, approvals, workforce**  

It is:

- canonical  
- ERP‑agnostic  
- hypermedia‑driven  
- event‑sourced  
- governance‑aware  
- Navigator‑friendly  
- Mesh‑integrated  

Your developers can now implement H2R alongside O2C, P2P, and R2R in the Foundation ERP.

---