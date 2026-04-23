# **1. Manual resolution metadata → YES, must be explicit**

Your developers are correct:  
If a DecisionPoint can enter `failed` or `escalated`, then **manual resolution is a constitutional act** and must be logged.

### **Decision**
Add:

- `resolvedBy: string | null`  
- `resolvedAt: string | null`  

to the persisted DecisionPoint record.

### **Why this matters**
- Governance requires attribution  
- Audit requires timestamps  
- Multi‑user environments require clarity  
- Session resume requires knowing what happened  

### **Spec text to add**
```
DecisionPoint {
  ...
  resolvedBy: string | null,   // userId or system
  resolvedAt: string | null    // ISO timestamp
}
```

This closes the governance loop.

---

# **2. Multi‑tab concurrency → YES, must be versioned**

This is a real problem:

- User opens CAIPL in two tabs  
- Tab A confirms a decision  
- Tab B still shows the old state  
- Tab B submits a stale resolve  
- Backend applies an outdated action  

This is unacceptable in a constitutional system.

### **Decision**
Add **optimistic concurrency control** via:

- `sessionVersion`  
- `decisionVersion`  

### **How it works**
- Every session update increments `sessionVersion`  
- Every decision update increments `decisionVersion`  
- UI sends the version it last saw  
- Backend rejects stale submissions with a structured error  

### **Spec text to add**
```
Session {
  ...
  version: number
}

DecisionPoint {
  ...
  version: number
}
```

### **Backend behavior**
If `submittedVersion < storedVersion`:

Return:
```
409 Conflict
{
  error: "VERSION_MISMATCH",
  message: "The decision has already been updated.",
  currentVersion: <number>
}
```

This prevents race conditions and silent corruption.

---

# **3. UI‑only feature flag → acceptable for v1 (with explicit note)**

Your instinct was right earlier:  
**UI gating is the correct architectural choice.**

But the developers are also right:  
If the UI hides CAIPL but the API is still reachable, then:

- It’s not a security boundary  
- It’s not a product boundary  
- It’s a UX boundary  

This is fine **as long as it is intentional**.

### **Decision**
- Keep **UI‑only feature flag**  
- Add explicit note: “This is not a security boundary”  
- Add optional backend check for future v2  

### **Spec text to add**
```
Feature Flag Strategy:
- CAIPL is gated at the UI layer only.
- This is a UX gating mechanism, not a security boundary.
- CAIPL API endpoints remain reachable for internal/testing use.
- A backend feature flag may be added in v2 if required for tenant-level isolation.
```

This makes the tradeoff explicit and documented.

---

# **4. Updated `cailpDesign.md` Inserts (copy/paste)**

Below is the exact text you can drop into the design doc.

---

## **📌 Add to “DecisionPoint Contract” section**

### **Manual Resolution Metadata**
```
DecisionPoint {
  ...
  resolvedBy: string | null,   // userId or "system"
  resolvedAt: string | null,   // ISO timestamp
  version: number              // optimistic concurrency control
}
```

---

## **📌 Add to “Session Persistence Model” section**

### **Session Versioning**
```
Session {
  ...
  version: number   // incremented on every update
}
```

### **Concurrency Handling**
- All CAIPL write operations must include the client’s last-known `sessionVersion` or `decisionVersion`.  
- Backend must reject stale submissions with `409 VERSION_MISMATCH`.  
- UI must refresh state surfaces when mismatch occurs.

---

## **📌 Add to “Feature Flag” section**

### **Feature Flag Strategy**
- CAIPL is gated at the **UI route level** (`/ai/workspace`).  
- This is a **UX gating mechanism**, not a security boundary.  
- CAIPL API endpoints remain reachable for internal/testing use.  
- Backend feature flagging may be added in v2 for tenant-level isolation if required.

---

# **5. Final Architectural Position**

### **Manual resolution metadata**  
→ **Mandatory** for governance integrity.

### **Concurrency/versioning**  
→ **Mandatory** for correctness and constitutional safety.

### **UI-only feature flag**  
→ **Correct choice**, with explicit documentation of the tradeoff.

This keeps CAIPL clean, governed, predictable, and future‑proof.

