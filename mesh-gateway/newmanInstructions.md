# 🌐 **Goal: A Newman Utility Script for Full Flow via Mesh Gateway**

Phase 1: P2P domain only, end‑to‑end through the Mesh Gateway, validating.

The script will:

- Use **MeshGateway.postman_collection.json**
- Use **MeshGateway.local.postman_environment.json**
- Execute the **entire P2P lifecycle** *through the Mesh Gateway*, not Foundation ERP directly
- Capture IDs (supplierId, requisitionId, poId, etc.)
- Validate hypermedia filtering
- Validate action execution
- Validate approval workflow (if triggered)
- Fail fast on errors
- Produce a clean summary

This becomes your **canonical regression test** for the P2P domain.

Note:  As we build we need to check that the mesh gateway has the necessary endpoints and flows to support this test. If not, we will need to build those out in the mesh gateway first before this test can run successfully.  Equally the foundation ERP needs to have the necessary fixtures and endpoints to support the test as well.  So this will be a good way to validate that both the mesh gateway and foundation ERP are aligned with the expected flows and capabilities.
---

# 🧩 **P2P Flow (Mesh Gateway) — Start to Finish**

Note: this flow assumes the necessary endpoints and fixtures are in place in both the Mesh Gateway and Foundation ERP. If any steps fail, we will need to check that the corresponding Mesh Gateway endpoints and Foundation ERP fixtures are implemented and functioning correctly.
The postman collection for may need to be altered and aligned to this flow as well to ensure it is testing the correct endpoints and flows through the Mesh Gateway.

The flow we will automate:

1. **Create Supplier**  
2. **Create Requisition**  
3. **Submit Requisition**  
4. **Approve Requisition**  
5. **Convert Requisition → PO**  
6. **Issue PO**  
7. **Acknowledge PO**  
8. **Receive Goods** *(if implemented)*  
9. **Supplier Invoice** *(if implemented)*  
10. **AP Payment** *(if implemented)*  

Your Mesh Gateway collection already includes the first 6 steps.

---

# 🛠️ **Newman Utility Script (P2P Only)**

Below is a **ready‑to‑run Node.js script** that:

- loads the Mesh Gateway collection  
- loads the Mesh Gateway environment  
- runs only the P2P folder  
- prints a clean summary  
- exits with non‑zero code on failure  

Example code snippet:
```js
#!/usr/bin/env node

/**
 * P2P End‑to‑End Test Runner for Mesh Gateway
 * -------------------------------------------
 * Runs the full P2P lifecycle through the Mesh Gateway using Newman.
 */

const newman = require('newman');
const path = require('path');

const COLLECTION = path.join(__dirname, 'MeshGateway.postman_collection.json');
const ENVIRONMENT = path.join(__dirname, 'MeshGateway.local.postman_environment.json');

console.log('🚀 Starting P2P end‑to‑end flow via Mesh Gateway...\n');

newman.run(
  {
    collection: COLLECTION,
    environment: ENVIRONMENT,
    reporters: ['cli'],
    folder: [
      '00 – P2P Setup (Foundation ERP fixture)',
      '20 – Hypermedia Proxy (GET resource)',
      '30 – Action Execution (POST action)',
      '40 – Approval Workflow'
    ],
    insecure: true
  },
  function (err, summary) {
    if (err) {
      console.error('❌ Newman run failed to start:', err);
      process.exit(1);
    }

    const failures = summary.run.failures;

    if (failures.length > 0) {
      console.error('\n❌ P2P flow completed with failures:\n');
      failures.forEach(f => {
        console.error(`- ${f.source.name}: ${f.error.test || f.error.message}`);
      });
      process.exit(1);
    }

    console.log('\n✅ P2P flow completed successfully — all steps passed.\n');
    process.exit(0);
  }
);
```

---

# 📦 **Directory Structure (Recommended)**

```
/tests
  /mesh
    MeshGateway.postman_collection.json
    MeshGateway.local.postman_environment.json
    run-p2p.js   ← the script above
```

Run it with:

```
node run-p2p.js
```

---

# 🧠 **Why this works well**

- It uses your existing Postman tests (assertions already written)
- It runs the Mesh Gateway end‑to‑end
- It validates:
  - hypermedia filtering  
  - authority + governance integration  
  - action execution  
  - approval workflow  
  - adapter routing  
- It becomes your **CI pipeline test** for the P2P domain

---

# 🚀 **Next Steps**

Once P2P is validated, we can generate equivalent scripts for:

- **O2C** (quote → order → ship → invoice → payment)  
- **R2R** (journal → post → close)  
- **H2R** (hire → update → terminate)  

And then:

- a **full‑suite runner** that executes all domains  
- a **parallel runner** for CI  
- a **governance stress test runner** (thresholds, SoD, escalations)

---
