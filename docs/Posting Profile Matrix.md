****# 🧱 1. Posting Profile Matrix — Overview

A posting profile defines:

- **Transaction Type** (AR Invoice, AP Invoice, Payment, Credit Memo, GRN)
- **Tax Applicability** (Taxable, Exempt, Zero‑Rated, Reverse Charge, Withholding)
- **Tax Code** (VAT5, VAT0, EXEMPT, RC5, WHT10)
- **Tax Rate** (5%, 0%, etc.)
- **GL Account Type** (Tax Liability, Tax Recoverable, WHT Payable)
- **GL Account Combination** (full COA segment combination)

This matrix is what the SLA engine uses to generate accounting entries.

---

# 📘 2. AR Tax Posting Profile Matrix (Output Tax)

### **Scenario: AR Invoice (Customer Billing)**  
Customer is charged VAT → company owes VAT to tax authority.

| Transaction Type | Tax Applicability | Tax Code | Debit Account | Credit Account | Notes |
|------------------|------------------|----------|---------------|----------------|-------|
| AR Invoice | Taxable | VAT5 | Accounts Receivable | VAT Output (Tax Liability) | Standard VAT on sales |
| AR Invoice | Zero‑Rated | VAT0 | Accounts Receivable | Revenue | No VAT liability |
| AR Invoice | Exempt | EXEMPT | Accounts Receivable | Revenue | No VAT liability |
| AR Invoice | Reverse Charge | RC5 | Accounts Receivable | Revenue | No VAT; customer self‑accounts |
| AR Credit Memo | Taxable | VAT5 | VAT Output (Tax Liability) | Accounts Receivable | Reverses VAT on credit |

### **GL Account Examples**
- **VAT Output (Tax Liability)** → 210100  
- **Revenue** → 400000  
- **Accounts Receivable** → 120000  

---

# 📘 3. AP Tax Posting Profile Matrix (Input Tax)

### **Scenario: AP Invoice (Supplier Billing)**  
Supplier charges VAT → company can recover VAT.

| Transaction Type | Tax Applicability | Tax Code | Debit Account | Credit Account | Notes |
|------------------|------------------|----------|---------------|----------------|-------|
| AP Invoice | Taxable | VAT5 | Expense/Asset | Accounts Payable | Base amount |
| AP Invoice | Taxable | VAT5 | VAT Input (Tax Recoverable) | Accounts Payable | VAT recoverable |
| AP Invoice | Zero‑Rated | VAT0 | Expense/Asset | Accounts Payable | No VAT |
| AP Invoice | Exempt | EXEMPT | Expense/Asset | Accounts Payable | No VAT |
| AP Invoice | Reverse Charge | RC5 | Expense/Asset | Accounts Payable | Base amount only |
| AP Invoice | Reverse Charge | RC5 | VAT Input (Recoverable) | VAT Output (Liability) | Self‑assessed VAT |
| AP Credit Memo | Taxable | VAT5 | Accounts Payable | VAT Input (Recoverable) | Reverses VAT |

### **GL Account Examples**
- **VAT Input (Recoverable)** → 130500  
- **VAT Output (Reverse Charge)** → 210100  
- **Accounts Payable** → 220000  
- **Expense/Asset** → depends on item category  

---

# 📘 4. Withholding Tax Posting Profile Matrix (AP Only)

### **Scenario: Supplier subject to withholding tax**

| Transaction Type | Tax Applicability | Tax Code | Debit Account | Credit Account | Notes |
|------------------|------------------|----------|---------------|----------------|-------|
| AP Invoice | Withholding | WHT10 | Expense/Asset | Accounts Payable | Base amount |
| AP Invoice | Withholding | WHT10 | Accounts Payable | WHT Payable | Withheld amount |
| AP Payment | Withholding | WHT10 | WHT Payable | Cash/Bank | Settlement to authority |

### **GL Account Examples**
- **WHT Payable** → 210300  
- **Cash/Bank** → 110000  

---

# 📘 5. Reverse Charge Posting Profile Matrix (AP)

Reverse charge is common in UAE VAT, EU VAT, India GST.

### **Scenario: Import of services — supplier not VAT registered**

| Transaction Type | Tax Code | Debit | Credit | Notes |
|------------------|----------|--------|---------|-------|
| AP Invoice | RC5 | Expense/Asset | Accounts Payable | Base amount |
| AP Invoice | RC5 | VAT Input (Recoverable) | VAT Output (Liability) | Self‑assessed VAT |

This ensures:
- VAT is recognized as both recoverable and payable  
- Net effect = zero (if fully recoverable)  

---

# 📘 6. AR/AP Tax Posting Profile Matrix — Consolidated View

Here is the **full matrix** in one place:

| Subledger | Txn Type | Tax Code | Applicability | DR Account | CR Account |
|-----------|----------|----------|---------------|------------|------------|
| AR | Invoice | VAT5 | Taxable | AR | VAT Output |
| AR | Invoice | VAT0 | Zero | AR | Revenue |
| AR | Invoice | EXEMPT | Exempt | AR | Revenue |
| AR | Invoice | RC5 | Reverse Charge | AR | Revenue |
| AR | Credit Memo | VAT5 | Taxable | VAT Output | AR |
| AP | Invoice | VAT5 | Taxable | Expense/Asset | AP |
| AP | Invoice | VAT5 | Taxable | VAT Input | AP |
| AP | Invoice | VAT0 | Zero | Expense/Asset | AP |
| AP | Invoice | EXEMPT | Exempt | Expense/Asset | AP |
| AP | Invoice | RC5 | Reverse Charge | Expense/Asset | AP |
| AP | Invoice | RC5 | Reverse Charge | VAT Input | VAT Output |
| AP | Invoice | WHT10 | Withholding | Expense/Asset | AP |
| AP | Invoice | WHT10 | Withholding | AP | WHT Payable |
| AP | Payment | WHT10 | Withholding | WHT Payable | Cash |

This is the exact structure your SLA engine will use to generate accounting entries.

---

# 🧭 7. How This Integrates With FoundationERP

Your system already has:

- **Event‑sourced subledgers**  
- **Journal posting rules**  
- **GL account combinations**  
- **Governance metadata**  

What’s missing is the **mapping layer** between:

**Tax Engine → SLA Engine → GL**

This posting profile matrix *is* that mapping layer.

