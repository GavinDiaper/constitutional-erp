# **📘 Authority Engine – v1 Design Specification**  
### *Constitutional ERP – Cross‑Domain Authority Projection Service*  
### *Node.js + TypeScript + Event‑Driven Architecture*

---

# **1. Purpose**

The Authority Engine is the **first constitutional service**.  
Its job is to answer one question with absolute clarity:

> **“Is this actor allowed to perform this action in this domain, given their position, credentials, and authority rules?”**

It consumes events from the Foundation ERP (especially H2R) and produces a **live authority projection** that the Mesh and Governance Engine rely on.

It does **not** call Foundation ERP directly.  
It does **not** enforce governance rules.  
It does **not** execute business transitions.

It is a **pure authority evaluator**.

---

# **2. Responsibilities**

### ✔ Build a cross‑domain authority model  
From H2R events:

- employees  
- positions  
- assignments  
- credentials  
- authority rules  

### ✔ Maintain a projection of:  
- employee → positions  
- employee → authority tiers per domain  
- employee → credentials (valid/expired/revoked)  
- domain → authority thresholds  

### ✔ Provide a single API:  
```
POST /authority/check
```

### ✔ Emit authority events  
- AuthorityGranted  
- AuthorityRevoked  
- CredentialExpired  
- CredentialRevoked  
- AuthorityEvaluationPerformed  

### ✔ Support replay  
Rebuild authority state from the shared event feed.

---

# **3. Architecture Overview**

```
Foundation ERP (H2R events)
        │
        ▼
Shared Event Feed (polling in v1)
        │
        ▼
Authority Engine (Node.js)
   - Event consumer
   - Authority projection
   - Credential projection
   - Authority rule projection
   - /authority/check API
        │
        ▼
Governance Engine
        │
        ▼
Mesh Gateway (hypermedia filtering + execution validation)
```

---

# **4. Event Inputs**

The Authority Engine consumes events from:

### **H2R domain**
- EmployeeHired  
- EmployeeTerminated  
- PositionCreated  
- AssignmentCreated  
- AssignmentEnded  
- CredentialIssued  
- CredentialExpired  
- CredentialRevoked  
- AuthorityRuleCreated  

### **Other domains (optional for v1)**
- O2C/P2P/R2R events (for context or future earned‑authority scoring)

### **Event feed endpoint**
```
GET /api/v1/events?after=<timestamp>&limit=100
```

---

# **5. Data Model (Internal Projection)**

### **5.1 AuthoritySubject**
```ts
interface AuthoritySubject {
  employeeId: string;
  positions: PositionGrant[];
  credentials: CredentialGrant[];
  authorityTiers: Record<AuthorityDomain, AuthorityTier>;
}
```

### **5.2 PositionGrant**
```ts
interface PositionGrant {
  positionId: string;
  domain: AuthorityDomain;
  tier: AuthorityTier;
  active: boolean;
}
```

### **5.3 CredentialGrant**
```ts
interface CredentialGrant {
  credentialId: string;
  type: string;
  status: "Valid" | "Expired" | "Revoked";
  expiryDate?: string;
}
```

### **5.4 AuthorityRuleView**
```ts
interface AuthorityRuleView {
  ruleId: string;
  domain: AuthorityDomain;
  threshold: number;
  requiredTier: AuthorityTier;
}
```

---

# **6. Authority Evaluation Logic**

The core function:

```ts
function evaluateAuthority(input: AuthorityCheckInput): AuthorityCheckResult
```

### **6.1 Input**
```ts
interface AuthorityCheckInput {
  actorId: string;
  action: string;
  domain: AuthorityDomain;
  context?: Record<string, any>; // e.g. PO amount
}
```

### **6.2 Output**
```ts
interface AuthorityCheckResult {
  allowed: boolean;
  effectiveTier?: number;
  requiredTier?: number;
  reasons: string[];
}
```

### **6.3 Evaluation Steps**

1. **Load subject projection**
   - positions  
   - authority tiers  
   - credentials  

2. **Check domain authority tier**
   - Does subject have a tier for this domain?

3. **Check credential requirements**
   - If action requires a credential (e.g. “FinancialApproval”), verify it’s valid.

4. **Check authority rules**
   - Example: PO amount > 10,000 requires Tier ≥ 3.

5. **Return decision**
   - allowed / not allowed  
   - reasons  
   - required tier  

6. **Emit AuthorityEvaluationPerformed event**

---

# **7. REST API Specification**

### **POST /authority/check**

#### Request
```json
{
  "actorId": "EMP-123",
  "action": "approve",
  "domain": "P2P",
  "context": {
    "amount": 15000
  }
}
```

#### Response (allowed)
```json
{
  "allowed": true,
  "effectiveTier": 3,
  "requiredTier": 3,
  "reasons": ["Tier 3 meets threshold for P2P approvals"]
}
```

#### Response (denied)
```json
{
  "allowed": false,
  "requiredTier": 3,
  "reasons": ["Actor has Tier 2 but Tier 3 is required for this amount"]
}
```

---

# **8. Event Emission**

### **AuthorityGranted**
```json
{
  "event_type": "AuthorityGranted",
  "entity_id": "EMP-123",
  "payload": {
    "domain": "P2P",
    "tier": 3
  }
}
```

### **AuthorityRevoked**
```json
{
  "event_type": "AuthorityRevoked",
  "entity_id": "EMP-123",
  "payload": {
    "domain": "P2P"
  }
}
```

### **AuthorityEvaluationPerformed**
```json
{
  "event_type": "AuthorityEvaluationPerformed",
  "payload": {
    "actorId": "EMP-123",
    "action": "approve",
    "domain": "P2P",
    "allowed": false
  }
}
```

---

# **9. Internal Storage**

### **v1 storage strategy**
- SQLite or Postgres  
- Tables:
  - `authority_subject`
  - `authority_position`
  - `authority_credential`
  - `authority_rule`
  - `authority_projection_metadata` (cursor, last event timestamp)

### **v2+**
- Redis cache  
- Materialized snapshots  
- Kafka/NATS streaming  

---

# **10. Replay Strategy**

### **v1**
- Store last processed event timestamp
- On startup:
  - replay from last checkpoint
  - rebuild projections

### **v2**
- Add snapshotting  
- Add incremental rebuilds  

---

# **11. Deployment Model**

### **Recommended services**
- `authority-engine` (Node.js)
- Runs independently of Foundation ERP
- Consumes events via polling
- Exposes `/authority/check` to:
  - Governance Engine
  - Mesh Gateway

### **Local dev**
- Foundation ERP: `localhost:3000`
- Authority Engine: `localhost:4001`

---

