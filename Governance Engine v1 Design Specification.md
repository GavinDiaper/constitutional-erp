# **📘 Governance Engine – v1 Design Specification**  
### *Constitutional ERP – Charter, Risk, and Cross‑Domain Governance Service*  
### *Node.js + TypeScript + Event‑Driven Architecture*

---

# **1. Purpose**

The Governance Engine is the **constitutional brain** of the enterprise.  
Its job is to answer a deeper question than the Authority Engine:

> **“Given the actor’s authority AND the enterprise’s constitutional rules, is this action allowed, forbidden, or conditionally allowed?”**

Where the Authority Engine answers *who can do what*,  
the Governance Engine answers *whether the action is permissible at all*.

It enforces:

- charter rules  
- separation of duties  
- risk thresholds  
- forbidden transitions  
- cross‑domain constraints  
- approval workflows  
- escalation logic  

It is the **final arbiter** before any action reaches the Foundation ERP.

---

# **2. Responsibilities**

### ✔ Evaluate governance rules for every proposed action  
### ✔ Combine authority decisions with constitutional constraints  
### ✔ Enforce separation of duties  
### ✔ Enforce risk thresholds and approval requirements  
### ✔ Enforce cross‑domain constraints (e.g., H2R → P2P)  
### ✔ Produce governance decisions for the Mesh  
### ✔ Emit governance events  
### ✔ Support replay and deterministic evaluation  

The Governance Engine does **not**:

- execute business transitions  
- call Foundation ERP directly  
- manage authority tiers (Authority Engine does that)  
- generate hypermedia (Mesh does that)  

It is a **pure rule evaluator**.

---

# **3. Architecture Overview**

```
Foundation ERP (events)
        │
        ▼
Shared Event Feed
        │
        ▼
Authority Engine (authority decisions)
        │
        ▼
Governance Engine (constitutional decisions)
        │
        ▼
Mesh Gateway (hypermedia filtering + execution validation)
        │
        ▼
Navigator / UI / Integration Hub
```

---

# **4. Inputs**

The Governance Engine consumes:

### **4.1 Authority Engine decisions**
- actor’s effective tier  
- credential validity  
- authority rule matches  
- authority evaluation reasons  

### **4.2 Canonical events**
- H2R events (assignments, credentials, terminations)  
- O2C/P2P/R2R events (for SoD and risk scoring)  
- Constitutional events (authority changes, governance violations)  

### **4.3 Charter rules**
A JSON/YAML configuration defining:

- forbidden transitions  
- required approvals  
- risk thresholds  
- SoD constraints  
- domain‑specific rules  
- cross‑domain rules  

### **4.4 Action metadata**
Provided by the Mesh:

- action name  
- domain  
- context (e.g., PO amount, journal type, customer risk score)  
- actor identity  

---

# **5. Governance Rule Model**

Rules are declarative and composable.

### **5.1 Rule Structure**
```ts
interface GovernanceRule {
  ruleId: string;
  description: string;
  domain: AuthorityDomain | "GLOBAL";
  condition: GovernanceCondition;
  effect: GovernanceEffect;
}
```

### **5.2 Condition**
```ts
type GovernanceCondition =
  | { type: "Always" }
  | { type: "ActionIs"; action: string }
  | { type: "AmountGreaterThan"; value: number }
  | { type: "ActorIsRequester" }
  | { type: "CredentialRequired"; credentialType: string }
  | { type: "TierLessThan"; tier: number }
  | { type: "DomainIs"; domain: AuthorityDomain }
  | { type: "And"; conditions: GovernanceCondition[] }
  | { type: "Or"; conditions: GovernanceCondition[] };
```

### **5.3 Effect**
```ts
type GovernanceEffect =
  | { type: "Allow" }
  | { type: "Deny"; reason: string }
  | { type: "RequireApproval"; approverTier: number }
  | { type: "Escalate"; toTier: number }
  | { type: "FlagRisk"; level: "Low" | "Medium" | "High" };
```

---

# **6. Governance Evaluation Pipeline**

The core function:

```ts
function evaluateGovernance(input: GovernanceCheckInput): GovernanceCheckResult
```

### **6.1 Input**
```ts
interface GovernanceCheckInput {
  actorId: string;
  action: string;
  domain: AuthorityDomain;
  context?: Record<string, any>;
  authorityDecision: AuthorityCheckResult;
}
```

### **6.2 Output**
```ts
interface GovernanceCheckResult {
  allowed: boolean;
  requiresApproval?: boolean;
  requiredApproverTier?: number;
  escalatedToTier?: number;
  riskLevel?: string;
  violations: string[];
}
```

---

# **7. Evaluation Steps**

### **Step 1 — Validate authority**
If the Authority Engine says “not allowed”, governance immediately returns:

```json
{
  "allowed": false,
  "violations": ["AuthorityEngineDenied"]
}
```

### **Step 2 — Load applicable rules**
Rules matching:

- domain  
- action  
- global rules  

### **Step 3 — Evaluate conditions**
Each rule’s condition is evaluated against:

- actor  
- authorityDecision  
- context  
- event history (for SoD)  

### **Step 4 — Apply effects**
Effects may:

- deny  
- require approval  
- escalate  
- flag risk  
- allow  

### **Step 5 — Produce final decision**
Governance merges all effects into a single decision.

### **Step 6 — Emit GovernanceEvaluationPerformed event**

---

# **8. REST API Specification**

### **POST /governance/evaluate**

#### Request
```json
{
  "actorId": "EMP-123",
  "action": "approve",
  "domain": "P2P",
  "context": { "amount": 15000 },
  "authorityDecision": {
    "allowed": true,
    "effectiveTier": 2,
    "requiredTier": 2,
    "reasons": []
  }
}
```

#### Response (denied)
```json
{
  "allowed": false,
  "violations": ["TierTooLowForThreshold"]
}
```

#### Response (requires approval)
```json
{
  "allowed": false,
  "requiresApproval": true,
  "requiredApproverTier": 3,
  "violations": []
}
```

#### Response (allowed)
```json
{
  "allowed": true,
  "violations": []
}
```

---

# **9. Governance Events**

### **GovernanceConstraintApplied**
```json
{
  "event_type": "GovernanceConstraintApplied",
  "payload": {
    "actorId": "EMP-123",
    "action": "approve",
    "domain": "P2P",
    "constraint": "TierTooLowForThreshold"
  }
}
```

### **GovernanceViolationDetected**
```json
{
  "event_type": "GovernanceViolationDetected",
  "payload": {
    "actorId": "EMP-123",
    "action": "approve",
    "domain": "P2P",
    "reason": "SelfApprovalNotAllowed"
  }
}
```

### **ApprovalRequired**
```json
{
  "event_type": "ApprovalRequired",
  "payload": {
    "action": "approve",
    "domain": "P2P",
    "requiredTier": 3
  }
}
```

---

# **10. Internal Storage**

### **v1 storage**
- SQLite or Postgres  
- Tables:
  - `governance_rule`
  - `governance_projection_metadata`
  - `governance_decision_log`

### **v2**
- rule versioning  
- rule hot‑reloading  
- distributed cache  

---

# **11. Replay Strategy**

### **v1**
- Replay canonical events to rebuild SoD projections  
- Replay rule definitions  
- Replay authority events for context  

### **v2**
- Snapshot SoD projections  
- Incremental rebuilds  

---

# **12. Deployment Model**

### **Recommended services**
- `governance-engine` (Node.js)
- Runs independently of Authority Engine
- Exposes `/governance/evaluate`
- Consumes events via polling

### **Local dev**
- Foundation ERP: `localhost:3000`  
- Authority Engine: `localhost:4001`  
- Governance Engine: `localhost:4002`  

---

# **13. Integration with Mesh Gateway**

The Mesh uses the Governance Engine in two places:

### **A. Hypermedia filtering**
When Mesh receives raw hypermedia from Foundation ERP:

1. For each `_link`:
   - call Authority Engine  
   - call Governance Engine  
2. Remove forbidden transitions  
3. Annotate transitions requiring approval  

### **B. Execution validation**
Before Mesh calls Foundation ERP:

1. Validate authority  
2. Validate governance  
3. If allowed → forward  
4. If approval required → route to approval workflow  
5. If denied → return governance error  

---

# **14. Example Governance Rules**

### **Rule: No self‑approval**
```json
{
  "ruleId": "SOD-001",
  "description": "Requester cannot approve their own requisition",
  "domain": "P2P",
  "condition": { "type": "ActorIsRequester" },
  "effect": { "type": "Deny", "reason": "SelfApprovalNotAllowed" }
}
```

### **Rule: High‑value PO requires Tier 3**
```json
{
  "ruleId": "P2P-THRESHOLD-001",
  "domain": "P2P",
  "condition": {
    "type": "AmountGreaterThan",
    "value": 10000
  },
  "effect": {
    "type": "RequireApproval",
    "approverTier": 3
  }
}
```

---

# **15. Summary**

The Governance Engine:

- enforces constitutional rules  
- ensures cross‑domain safety  
- prevents unauthorized or risky actions  
- supports explainability and replay  
- integrates with Authority Engine and Mesh  
- is essential for safe AI autonomy  

This design spec provides a clear roadmap for implementation.