import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustSuggestionScore,
  inferOperationFromPrompt,
  missingRequiredFields,
  normalizeCreatePayload
} from "../src/services/navigatorService";
import { NextStepSuggestion } from "../src/contracts/navigatorTypes";

test("inferOperationFromPrompt detects supplier intent", () => {
  const operation = inferOperationFromPrompt("create a new supplier in UAE");
  assert.equal(operation, "create-supplier");
});

test("normalizeCreatePayload maps UAE country and uppercases fields", () => {
  const payload = normalizeCreatePayload("create-supplier", {
    supplierName: "Gulf Trading",
    country: "uae",
    currencyCode: "aed",
    paymentTerms: "net45"
  });

  assert.equal(payload.countryCode, "AE");
  assert.equal(payload.currencyCode, "AED");
  assert.equal(payload.paymentTerms, "NET45");
});

test("missingRequiredFields flags empty required values", () => {
  const missing = missingRequiredFields("create-requisition", {
    requester: "",
    department: "Operations"
  });

  assert.deepEqual(missing.sort(), ["currencyCode", "requester"].sort());
});

test("adjustSuggestionScore boosts supplier -> create-requisition when entity created recently", () => {
  const suggestion: NextStepSuggestion = {
    stepId: "create:create-requisition",
    kind: "CREATE_OPERATION",
    operation: "create-requisition",
    score: 0.74,
    rationale: "next",
    prerequisites: []
  };

  const score = adjustSuggestionScore({
    suggestion,
    aggregateType: "supplier",
    historySignals: {
      eventCount: 5,
      recentEventTypes: ["Navigator.EntityCreated"],
      hasRecentEntityCreated: true
    }
  });

  assert.equal(score, 0.88);
});
