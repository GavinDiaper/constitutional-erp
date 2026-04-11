# **📦 How a Purchase Order Is Accounted For**

## **1. A Purchase Order Creates *No Accounting Entry***
A **purchase order** is simply a *commitment* to buy goods or services in the future.  
It is **not** a financial transaction.

### Why no entry?
- No goods received  
- No liability incurred  
- No cash spent  
- No change in assets  

**Therefore: no debit, no credit.**

However, the PO is still important operationally:
- It reserves budget  
- It authorizes procurement  
- It creates an audit trail  
- It links to receiving and invoicing

---

# **📥 2. When Goods Are Received (Goods Receipt / GRN)**

This is the **first moment** an accounting entry may occur.

### If the organization uses a *perpetual inventory system*:
```
Dr Inventory (Asset)
    Cr Goods Received Not Invoiced (GRNI) – a liability placeholder
```

### If the organization uses a *periodic inventory system*:
```
Dr Purchases (Expense)
    Cr GRNI (Liability)
```

**GRNI** is a temporary liability used when goods have arrived but the supplier invoice has not.

---

# **📑 3. When the Supplier Invoice Arrives (Invoice Matching)**

The invoice is matched to:
- The PO  
- The Goods Receipt  

Then the accounting entry is:

```
Dr GRNI (clearing the placeholder)
    Cr Accounts Payable (AP)
```

If the invoice amount differs from the PO/GRN, a **price variance** account is used:
```
Dr/Cr Purchase Price Variance (PPV)
```

---

# **💸 4. When the Supplier Is Paid**

Payment clears the liability:

```
Dr Accounts Payable
    Cr Cash / Bank
```

---

# **📘 Summary of the Accounting Flow**

| Stage | Operational Event | Accounting Entry |
|-------|-------------------|------------------|
| Purchase Order | Commitment only | **No entry** |
| Goods Received | Inventory arrives | Dr Inventory / Purchases<br>Cr GRNI |
| Invoice Received | Liability confirmed | Dr GRNI<br>Cr Accounts Payable |
| Payment | Cash outflow | Dr AP<br>Cr Cash |

---

# **📚 Standard Accounts Needed for Purchase‑to‑Pay (P2P)**

Below is a clean, minimal, professional chart of accounts for handling POs and purchases.

## **Assets**
- **Inventory**
- Prepaid Expenses (if applicable)
- Input VAT / Tax Receivable (if applicable)

## **Liabilities**
- **Accounts Payable (Trade Creditors)**
- **Goods Received Not Invoiced (GRNI)**
- Accrued Expenses
- VAT / Tax Payable

## **Expenses**
- **Purchases / Cost of Goods Sold**
- Freight / Shipping Expense
- Purchase Price Variance (PPV)
- Supplies Expense
- Repairs & Maintenance
- Utilities
- Other operating expenses

## **Equity**
- Retained Earnings
- Capital

---

# **🧠 Why GRNI Is Essential**
Without GRNI, your books would be wrong whenever:
- Goods arrive before the invoice  
- Invoices arrive late  
- Month‑end cut‑off is required  

GRNI ensures:
- Inventory is correct  
- Liabilities are correct  
- Expenses are recognized in the right period  

It’s one of the most important control accounts in procurement accounting.

