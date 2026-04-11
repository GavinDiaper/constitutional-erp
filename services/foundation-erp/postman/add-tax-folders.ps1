# add-tax-folders.ps1
# Adds 31-R2R Tax Config, 11-O2C UAE VAT, 21-P2P UAE VAT, 22-P2P UAE Reverse Charge
# folders to the FoundationERP Postman collection (and copies result to unified).

param(
  [string]$CollectionPath = "$PSScriptRoot\FoundationERP.postman_collection.json",
  [string]$UnifiedPath    = "d:\Projects\ConstitutionalERP\postman\ConstitutionalERP.unified.postman_collection.json"
)

$col = Get-Content $CollectionPath -Raw | ConvertFrom-Json

# ─── helpers ────────────────────────────────────────────────────────────────

function H { @(
  @{ key="x-api-key";    value="{{apiKey}}" }
  @{ key="x-ingress-id"; value="{{ingressId}}" }
) }

function HJ { @(
  @{ key="x-api-key";    value="{{apiKey}}" }
  @{ key="x-ingress-id"; value="{{ingressId}}" }
  @{ key="Content-Type"; value="application/json" }
) }

function Url([string]$raw, [string[]]$path) {
  @{ raw=$raw; host=@("{{baseUrl}}"); path=$path }
}

function QUrl([string]$raw, [string[]]$pt, [hashtable[]]$q) {
  @{ raw=$raw; host=@("{{baseUrl}}"); path=$pt; query=$q }
}

function TestScript([string[]]$lines) {
  @( @{ listen="test"; script=@{ type="text/javascript"; exec=$lines } } )
}

function GetReq([string]$name, [hashtable]$url, [string[]]$tests) {
  @{ name=$name; request=@{ method="GET"; header=(H); url=$url }; event=(TestScript $tests) }
}

function PostReq([string]$name, [string]$body, [hashtable]$url, [string[]]$tests) {
  @{ name=$name; request=@{ method="POST"; header=(HJ); body=@{ mode="raw"; raw=$body }; url=$url }; event=(TestScript $tests) }
}

function PostNoBody([string]$name, [hashtable]$url, [string[]]$tests) {
  @{ name=$name; request=@{ method="POST"; header=(H); url=$url }; event=(TestScript $tests) }
}

# ─── 31 - R2R Tax Config ────────────────────────────────────────────────────

$t31 = @(

  GetReq "List Tax Regimes" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/regimes" @("api","v1","r2r","tax","regimes")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'var uae = rows.find(function(r){ return r.tax_regime_id === "TREG-UAE-VAT"; });'
      'pm.test("UAE VAT regime seeded", function () { pm.expect(uae).to.exist; });'
      'pm.test("UAE regime is active", function () { pm.expect(uae.is_active).to.eql(1); });'
      'pm.environment.set("taxRegimeId", uae.tax_regime_id);'
    )

  GetReq "Get UAE Tax Regime" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/regimes/TREG-UAE-VAT" @("api","v1","r2r","tax","regimes","TREG-UAE-VAT")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var body = pm.response.json();'
      'pm.test("UAE regime code", function () { pm.expect(body.code).to.eql("UAE-VAT"); });'
    )

  GetReq "List Tax Jurisdictions" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/jurisdictions" @("api","v1","r2r","tax","jurisdictions")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'var uae = rows.find(function(r){ return r.tax_jurisdiction_id === "TJUR-UAE"; });'
      'pm.test("UAE jurisdiction seeded", function () { pm.expect(uae).to.exist; });'
      'pm.test("UAE jurisdiction country_code is AE", function () { pm.expect(uae.country_code).to.eql("AE"); });'
      'pm.environment.set("taxJurisdictionId", uae.tax_jurisdiction_id);'
    )

  GetReq "List Tax Codes" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/codes" @("api","v1","r2r","tax","codes")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var codes = (pm.response.json().data || []).map(function(r){ return r.tax_code_id; });'
      'var expected = ["TCOD-VAT5","TCOD-VAT0","TCOD-EXEMPT","TCOD-RC5","TCOD-WHT10"];'
      'pm.test("All UAE tax codes seeded", function () {'
      '  expected.forEach(function(id){ pm.expect(codes).to.include(id); });'
      '});'
    )

  GetReq "List Tax Rates" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/rates" @("api","v1","r2r","tax","rates")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'pm.test("At least 5 tax rates seeded", function () { pm.expect(rows.length).to.be.at.least(5); });'
      'var vat5 = rows.find(function(r){ return r.tax_rate_id === "TRAT-VAT5-AE"; });'
      'pm.test("UAE VAT5 rate is 5%", function () { pm.expect(vat5.rate_percent).to.eql(5); });'
      'var wht = rows.find(function(r){ return r.tax_rate_id === "TRAT-WHT10-AE"; });'
      'pm.test("UAE WHT10 rate is 10%", function () { pm.expect(wht.rate_percent).to.eql(10); });'
    )

  GetReq "List Tax Rules" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/rules" @("api","v1","r2r","tax","rules")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'var ids = rows.map(function(r){ return r.tax_rule_id; });'
      'pm.test("UAE AR standard rule seeded", function () { pm.expect(ids).to.include("TRUL-UAE-AR-STD"); });'
      'pm.test("UAE AP standard rule seeded", function () { pm.expect(ids).to.include("TRUL-UAE-AP-STD"); });'
      'pm.environment.set("taxRuleId", "TRUL-UAE-AR-STD");'
    )

  GetReq "List Tax Account Mappings" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/account-mappings" @("api","v1","r2r","tax","account-mappings")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'pm.test("At least 8 account mappings seeded", function () { pm.expect(rows.length).to.be.at.least(8); });'
      'var vat5AR = rows.find(function(r){ return r.tax_account_mapping_id === "TAMP-VAT5-AR-LIAB"; });'
      'pm.test("VAT5 AR liability mapping present", function () { pm.expect(vat5AR).to.exist; });'
    )

  PostReq "Create Custom Tax Regime" `
    '{"code":"TEST-REG-{{$timestamp}}","name":"Test Tax Regime {{$timestamp}}","description":"Postman test","priority":99}' `
    (Url "{{baseUrl}}/api/v1/r2r/tax/regimes" @("api","v1","r2r","tax","regimes")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("customTaxRegimeId", body.tax_regime_id);'
      'pm.test("Custom regime created", function () { pm.expect(body.tax_regime_id).to.be.a("string"); });'
    )

  PostReq "Create Custom Tax Jurisdiction" `
    '{"taxRegimeId":"{{customTaxRegimeId}}","countryCode":"AE","name":"UAE Custom Test Jurisdiction"}' `
    (Url "{{baseUrl}}/api/v1/r2r/tax/jurisdictions" @("api","v1","r2r","tax","jurisdictions")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("customTaxJurisdictionId", body.tax_jurisdiction_id);'
      'pm.test("Custom jurisdiction created", function () { pm.expect(body.country_code).to.eql("AE"); });'
    )

  PostReq "Create Custom Tax Code" `
    '{"taxJurisdictionId":"{{customTaxJurisdictionId}}","code":"CUST-VAT","description":"Custom VAT Code","taxApplicability":"taxable","priority":50}' `
    (Url "{{baseUrl}}/api/v1/r2r/tax/codes" @("api","v1","r2r","tax","codes")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("customTaxCodeId", body.tax_code_id);'
      'pm.test("Custom tax code created", function () { pm.expect(body.tax_code_id).to.be.a("string"); });'
    )

  PostReq "Create Custom Tax Rate" `
    '{"taxCodeId":"{{customTaxCodeId}}","taxJurisdictionId":"{{customTaxJurisdictionId}}","ratePercent":7,"inclusiveFlag":false,"effectiveFrom":"2026-01-01T00:00:00.000Z"}' `
    (Url "{{baseUrl}}/api/v1/r2r/tax/rates" @("api","v1","r2r","tax","rates")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("customTaxRateId", body.tax_rate_id);'
      'pm.test("Custom tax rate is 7%", function () { pm.expect(body.rate_percent).to.eql(7); });'
    )

  PostReq "Create Custom Tax Rule" `
    '{"taxJurisdictionId":"{{customTaxJurisdictionId}}","taxCodeId":"{{customTaxCodeId}}","code":"CUST-RULE","name":"Custom AE Rule","priority":50,"conditionsJson":{"conditions":[{"field":"country_code","op":"eq","value":"AE"}],"match":"all"},"effectiveFrom":"2026-01-01T00:00:00.000Z"}' `
    (Url "{{baseUrl}}/api/v1/r2r/tax/rules" @("api","v1","r2r","tax","rules")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("customTaxRuleId", body.tax_rule_id);'
      'pm.test("Custom tax rule created", function () { pm.expect(body.tax_rule_id).to.be.a("string"); });'
    )

  PostNoBody "Deactivate Custom Tax Rule" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/rules/{{customTaxRuleId}}/deactivate" @("api","v1","r2r","tax","rules","{{customTaxRuleId}}","deactivate")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Rule deactivated", function () { pm.expect(pm.response.json().is_active).to.eql(0); });'
    )

  PostReq "Create Custom Account Mapping" `
    '{"taxRegimeId":"TREG-UAE-VAT","taxCodeId":"TCOD-VAT5","transactionType":"ar-invoice","accountRole":"tax_liability","accountCode":"SYS-210-LIAB-VAT-OUT","effectiveFrom":"2026-01-01T00:00:00.000Z"}' `
    (Url "{{baseUrl}}/api/v1/r2r/tax/account-mappings" @("api","v1","r2r","tax","account-mappings")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.test("Account mapping created", function () { pm.expect(body.tax_account_mapping_id).to.be.a("string"); });'
    )

  GetReq "List UAE FX Rate (USD-AED)" `
    (QUrl "{{baseUrl}}/api/v1/r2r/fx/rates/latest?rateTypeId=FXT-SEED-SPOT&fromCurrency=USD&toCurrency=AED" `
      @("api","v1","r2r","fx","rates","latest") `
      @(@{key="rateTypeId";value="FXT-SEED-SPOT"},@{key="fromCurrency";value="USD"},@{key="toCurrency";value="AED"})) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var body = pm.response.json();'
      'pm.test("USD to AED rate is 0.25", function () { pm.expect(body.rate).to.eql(0.25); });'
      'pm.test("From currency is USD", function () { pm.expect(body.from_currency).to.eql("USD"); });'
      'pm.test("To currency is AED", function () { pm.expect(body.to_currency).to.eql("AED"); });'
    )

  GetReq "Get UAE Legal Entity" `
    (Url "{{baseUrl}}/api/v1/r2r/legal-entities/LE-SEED-AE" @("api","v1","r2r","legal-entities","LE-SEED-AE")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var body = pm.response.json();'
      'pm.test("UAE entity name", function () { pm.expect(body.name).to.eql("Constitutional Holdings UAE"); });'
      'pm.test("UAE entity currency AED", function () { pm.expect(body.currency_code).to.eql("AED"); });'
    )

  GetReq "Get UAE Ledger" `
    (Url "{{baseUrl}}/api/v1/r2r/ledgers/LGR-SEED-AE" @("api","v1","r2r","ledgers","LGR-SEED-AE")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var body = pm.response.json();'
      'pm.test("UAE ledger currency AED", function () { pm.expect(body.currency_code).to.eql("AED"); });'
      'pm.test("UAE ledger linked to AE legal entity", function () { pm.expect(body.legal_entity_id).to.eql("LE-SEED-AE"); });'
    )
)

# ─── 11 - O2C Flow UAE VAT (VAT5 exclusive) ─────────────────────────────────

$t11 = @(

  PostReq "Create UAE Customer" `
    '{"name":"UAE Test Customer","email":"uae.customer@test.ae","currencyCode":"AED"}' `
    (Url "{{baseUrl}}/api/v1/o2c/customers" @("api","v1","o2c","customers")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("uaeCustomerId", body.customer_id);'
      'pm.test("UAE customer created", function () { pm.expect(body.customer_id).to.be.a("string"); });'
    )

  PostReq "Create UAE Quote" `
    '{"customerId":"{{uaeCustomerId}}","validUntil":"2027-12-31T23:59:59.000Z","notes":"UAE VAT test quote"}' `
    (Url "{{baseUrl}}/api/v1/o2c/quotes" @("api","v1","o2c","quotes")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("uaeQuoteId", body.quote_id);'
    )

  PostReq "Add UAE Quote Line" `
    '{"productCode":"UAE-PROD-001","description":"UAE Taxable Product","quantity":10,"unitPrice":1000,"currency":"AED"}' `
    (Url "{{baseUrl}}/api/v1/o2c/quotes/{{uaeQuoteId}}/lines" @("api","v1","o2c","quotes","{{uaeQuoteId}}","lines")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
    )

  PostNoBody "Send UAE Quote" `
    (Url "{{baseUrl}}/api/v1/o2c/quotes/{{uaeQuoteId}}/send" @("api","v1","o2c","quotes","{{uaeQuoteId}}","send")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Quote sent", function () { pm.expect(pm.response.json().state).to.eql("Sent"); });'
    )

  PostNoBody "Accept UAE Quote" `
    (Url "{{baseUrl}}/api/v1/o2c/quotes/{{uaeQuoteId}}/accept" @("api","v1","o2c","quotes","{{uaeQuoteId}}","accept")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Quote accepted", function () { pm.expect(pm.response.json().state).to.eql("Accepted"); });'
    )

  PostNoBody "Convert UAE Quote To Order" `
    (Url "{{baseUrl}}/api/v1/o2c/quotes/{{uaeQuoteId}}/convert-to-order" @("api","v1","o2c","quotes","{{uaeQuoteId}}","convert-to-order")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("uaeOrderId", body.sales_order_id);'
      'pm.test("UAE order created", function () { pm.expect(body.sales_order_id).to.be.a("string"); });'
    )

  PostNoBody "Confirm UAE Order" `
    (Url "{{baseUrl}}/api/v1/o2c/orders/{{uaeOrderId}}/confirm" @("api","v1","o2c","orders","{{uaeOrderId}}","confirm")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Order confirmed", function () { pm.expect(pm.response.json().state).to.eql("Confirmed"); });'
    )

  PostNoBody "Allocate UAE Order" `
    (Url "{{baseUrl}}/api/v1/o2c/orders/{{uaeOrderId}}/allocate" @("api","v1","o2c","orders","{{uaeOrderId}}","allocate")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Order allocated", function () { pm.expect(pm.response.json().state).to.eql("Allocated"); });'
    )

  PostNoBody "Ship UAE Order" `
    (Url "{{baseUrl}}/api/v1/o2c/orders/{{uaeOrderId}}/ship" @("api","v1","o2c","orders","{{uaeOrderId}}","ship")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Order shipped", function () { pm.expect(pm.response.json().state).to.eql("Shipped"); });'
    )

  PostReq "Generate UAE Invoice With VAT5" `
    '{"taxCodeId":"TCOD-VAT5","countryCode":"AE"}' `
    (Url "{{baseUrl}}/api/v1/o2c/orders/{{uaeOrderId}}/generate-invoice" @("api","v1","o2c","orders","{{uaeOrderId}}","generate-invoice")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("uaeInvoiceId", body.invoice_id);'
      'pm.test("UAE invoice draft created", function () { pm.expect(body.state).to.eql("Draft"); });'
      'pm.test("Invoice amount_due includes VAT (10000 base * 5% = 10500)", function () {'
      '  pm.expect(parseFloat(body.amount_due)).to.be.closeTo(10500, 1);'
      '});'
    )

  GetReq "Get UAE Invoice Tax Lines (After Generate)" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/transaction-lines/{{uaeInvoiceId}}" @("api","v1","r2r","tax","transaction-lines","{{uaeInvoiceId}}")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'pm.test("Tax line created for UAE invoice", function () { pm.expect(rows.length).to.be.at.least(1); });'
      'var line = rows[0];'
      'pm.environment.set("uaeTaxLineApplicability", line.tax_applicability);'
      'pm.test("Tax applicability is taxable", function () { pm.expect(line.tax_applicability).to.eql("taxable"); });'
      'pm.test("Tax code is TCOD-VAT5", function () { pm.expect(line.tax_code_id).to.eql("TCOD-VAT5"); });'
      'pm.test("Tax amount is 500 (5% of 10000)", function () { pm.expect(parseFloat(line.tax_amount)).to.be.closeTo(500, 1); });'
      'pm.test("Tax line status is pending", function () { pm.expect(line.accounting_status).to.eql("pending"); });'
    )

  PostNoBody "Post UAE Invoice" `
    (Url "{{baseUrl}}/api/v1/o2c/invoices/{{uaeInvoiceId}}/post" @("api","v1","o2c","invoices","{{uaeInvoiceId}}","post")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Invoice posted", function () { pm.expect(pm.response.json().state).to.eql("Posted"); });'
    )

  GetReq "Verify UAE Tax Lines Posted" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/transaction-lines/{{uaeInvoiceId}}" @("api","v1","r2r","tax","transaction-lines","{{uaeInvoiceId}}")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'pm.test("Tax line exists after posting", function () { pm.expect(rows.length).to.be.at.least(1); });'
      'pm.test("Tax line status is posted", function () { pm.expect(rows[0].accounting_status).to.eql("posted"); });'
      'pm.test("Journal ID recorded on tax line", function () { pm.expect(rows[0].accounting_journal_id).to.be.a("string"); });'
      'pm.environment.set("uaeJournalId", rows[0].accounting_journal_id);'
    )

  GetReq "Verify UAE Multi-Line Journal (DR AR + CR Rev + CR VAT Out)" `
    (QUrl "{{baseUrl}}/api/v1/query/r2r_ledger_entry?limit=50&offset=0" `
      @("api","v1","query","r2r_ledger_entry") `
      @(@{key="limit";value="50"},@{key="offset";value="0"})) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = (pm.response.json().data || []).filter(function(r){ return r.journal_id === pm.environment.get("uaeJournalId"); });'
      'pm.test("UAE journal has 3 ledger entry lines (DR AR, CR Revenue, CR VAT Output)", function () {'
      '  pm.expect(rows.length).to.eql(3);'
      '});'
      'var drLines = rows.filter(function(r){ return r.entry_type === "Debit"; });'
      'var crLines = rows.filter(function(r){ return r.entry_type === "Credit"; });'
      'pm.test("1 debit line (AR)", function () { pm.expect(drLines.length).to.eql(1); });'
      'pm.test("2 credit lines (Revenue + VAT Output)", function () { pm.expect(crLines.length).to.eql(2); });'
    )

  PostReq "Register UAE Payment" `
    '{"invoiceId":"{{uaeInvoiceId}}","amount":10500,"currency":"AED","paymentDate":"2026-04-06T00:00:00.000Z","reference":"PAY-UAE-001"}' `
    (Url "{{baseUrl}}/api/v1/o2c/payments" @("api","v1","o2c","payments")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("uaePaymentId", body.payment_id);'
    )

  PostNoBody "Apply UAE Payment" `
    (Url "{{baseUrl}}/api/v1/o2c/payments/{{uaePaymentId}}/apply" @("api","v1","o2c","payments","{{uaePaymentId}}","apply")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Payment applied", function () { pm.expect(pm.response.json().state).to.eql("Applied"); });'
    )

  PostNoBody "Reconcile UAE Payment" `
    (Url "{{baseUrl}}/api/v1/o2c/payments/{{uaePaymentId}}/reconcile" @("api","v1","o2c","payments","{{uaePaymentId}}","reconcile")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Payment reconciled", function () { pm.expect(pm.response.json().state).to.eql("Reconciled"); });'
    )
)

# ─── 21 - P2P Flow UAE VAT (VAT5 AP) ─────────────────────────────────────────

$t21 = @(

  PostReq "Create UAE Supplier" `
    '{"name":"UAE VAT Test Supplier","email":"supplier.uae@test.ae","currencyCode":"AED"}' `
    (Url "{{baseUrl}}/api/v1/p2p/suppliers" @("api","v1","p2p","suppliers")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("uaeSupplierId", body.supplier_id);'
    )

  PostReq "Create UAE Requisition" `
    '{"requestedBy":"UAE Buyer","notes":"UAE VAT procurement test"}' `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions" @("api","v1","p2p","requisitions")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("uaeReqId", pm.response.json().requisition_id);'
    )

  PostReq "Add UAE Requisition Line" `
    '{"productCode":"UAE-ITEM-001","description":"UAE Taxable Goods","quantity":5,"unitPrice":2000,"currency":"AED"}' `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions/{{uaeReqId}}/lines" @("api","v1","p2p","requisitions","{{uaeReqId}}","lines")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
    )

  PostNoBody "Submit UAE Requisition" `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions/{{uaeReqId}}/submit" @("api","v1","p2p","requisitions","{{uaeReqId}}","submit")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Approve UAE Requisition" `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions/{{uaeReqId}}/approve" @("api","v1","p2p","requisitions","{{uaeReqId}}","approve")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostReq "Convert UAE Requisition To PO" `
    '{"supplierId":"{{uaeSupplierId}}"}' `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions/{{uaeReqId}}/convert-to-po" @("api","v1","p2p","requisitions","{{uaeReqId}}","convert-to-po")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("uaePoId", pm.response.json().purchase_order_id);'
    )

  PostNoBody "Approve UAE PO" `
    (Url "{{baseUrl}}/api/v1/p2p/purchase-orders/{{uaePoId}}/approve" @("api","v1","p2p","purchase-orders","{{uaePoId}}","approve")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Send UAE PO" `
    (Url "{{baseUrl}}/api/v1/p2p/purchase-orders/{{uaePoId}}/send" @("api","v1","p2p","purchase-orders","{{uaePoId}}","send")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostReq "Create UAE Goods Receipt" `
    '{"purchaseOrderId":"{{uaePoId}}","receivedBy":"UAE Receiving Team","notes":"UAE test receipt"}' `
    (Url "{{baseUrl}}/api/v1/p2p/goods-receipts" @("api","v1","p2p","goods-receipts")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("uaeReceiptId", pm.response.json().receipt_id);'
    )

  PostNoBody "Receive UAE Goods" `
    (Url "{{baseUrl}}/api/v1/p2p/goods-receipts/{{uaeReceiptId}}/receive" @("api","v1","p2p","goods-receipts","{{uaeReceiptId}}","receive")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Accept UAE Goods" `
    (Url "{{baseUrl}}/api/v1/p2p/goods-receipts/{{uaeReceiptId}}/accept" @("api","v1","p2p","goods-receipts","{{uaeReceiptId}}","accept")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostReq "Create UAE Supplier Invoice With VAT5" `
    '{"receiptId":"{{uaeReceiptId}}","taxCodeId":"TCOD-VAT5","countryCode":"AE"}' `
    (Url "{{baseUrl}}/api/v1/p2p/supplier-invoices" @("api","v1","p2p","supplier-invoices")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("uaeSupplierInvoiceId", body.supplier_invoice_id);'
      'pm.test("Supplier invoice draft", function () { pm.expect(body.state).to.eql("Draft"); });'
      'pm.test("amount_due includes 5% VAT (10000 base => 10500)", function () {'
      '  pm.expect(parseFloat(body.amount_due)).to.be.closeTo(10500, 1);'
      '});'
    )

  GetReq "Get UAE AP Tax Lines (Pending)" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/transaction-lines/{{uaeSupplierInvoiceId}}" @("api","v1","r2r","tax","transaction-lines","{{uaeSupplierInvoiceId}}")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'pm.test("Tax line created for UAE AP invoice", function () { pm.expect(rows.length).to.be.at.least(1); });'
      'pm.test("AP tax applicability is taxable", function () { pm.expect(rows[0].tax_applicability).to.eql("taxable"); });'
      'pm.test("AP tax code is TCOD-VAT5", function () { pm.expect(rows[0].tax_code_id).to.eql("TCOD-VAT5"); });'
      'pm.test("AP tax amount is 500 (5% of 10000)", function () { pm.expect(parseFloat(rows[0].tax_amount)).to.be.closeTo(500, 1); });'
      'pm.test("AP tax line is pending", function () { pm.expect(rows[0].accounting_status).to.eql("pending"); });'
    )

  PostNoBody "Validate UAE Supplier Invoice" `
    (Url "{{baseUrl}}/api/v1/p2p/supplier-invoices/{{uaeSupplierInvoiceId}}/validate" @("api","v1","p2p","supplier-invoices","{{uaeSupplierInvoiceId}}","validate")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Post UAE Supplier Invoice" `
    (Url "{{baseUrl}}/api/v1/p2p/supplier-invoices/{{uaeSupplierInvoiceId}}/post" @("api","v1","p2p","supplier-invoices","{{uaeSupplierInvoiceId}}","post")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("Supplier invoice posted", function () { pm.expect(pm.response.json().state).to.eql("Posted"); });'
    )

  GetReq "Verify UAE AP Tax Lines Posted" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/transaction-lines/{{uaeSupplierInvoiceId}}" @("api","v1","r2r","tax","transaction-lines","{{uaeSupplierInvoiceId}}")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'pm.test("AP tax line is posted", function () { pm.expect(rows[0].accounting_status).to.eql("posted"); });'
      'pm.test("AP journal ID recorded", function () { pm.expect(rows[0].accounting_journal_id).to.be.a("string"); });'
      'pm.environment.set("uaeApJournalId", rows[0].accounting_journal_id);'
    )

  GetReq "Verify UAE AP Multi-Line Journal (DR Expense + DR VAT-In + CR AP)" `
    (QUrl "{{baseUrl}}/api/v1/query/r2r_ledger_entry?limit=50&offset=0" `
      @("api","v1","query","r2r_ledger_entry") `
      @(@{key="limit";value="50"},@{key="offset";value="0"})) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = (pm.response.json().data || []).filter(function(r){ return r.journal_id === pm.environment.get("uaeApJournalId"); });'
      'pm.test("UAE AP journal has 3 lines (DR Expense, DR VAT Input, CR AP)", function () {'
      '  pm.expect(rows.length).to.eql(3);'
      '});'
      'var drLines = rows.filter(function(r){ return r.entry_type === "Debit"; });'
      'var crLines = rows.filter(function(r){ return r.entry_type === "Credit"; });'
      'pm.test("2 debit lines (Expense + VAT Input)", function () { pm.expect(drLines.length).to.eql(2); });'
      'pm.test("1 credit line (AP)", function () { pm.expect(crLines.length).to.eql(1); });'
    )

  PostReq "Create UAE AP Payment" `
    '{"supplierInvoiceId":"{{uaeSupplierInvoiceId}}","amount":10500,"currency":"AED","paymentDate":"2026-04-06T00:00:00.000Z","reference":"AP-PAY-UAE-001"}' `
    (Url "{{baseUrl}}/api/v1/p2p/ap-payments" @("api","v1","p2p","ap-payments")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("uaeApPaymentId", pm.response.json().ap_payment_id);'
    )

  PostNoBody "Receive UAE AP Payment" `
    (Url "{{baseUrl}}/api/v1/p2p/ap-payments/{{uaeApPaymentId}}/receive" @("api","v1","p2p","ap-payments","{{uaeApPaymentId}}","receive")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Apply UAE AP Payment" `
    (Url "{{baseUrl}}/api/v1/p2p/ap-payments/{{uaeApPaymentId}}/apply" @("api","v1","p2p","ap-payments","{{uaeApPaymentId}}","apply")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Reconcile UAE AP Payment" `
    (Url "{{baseUrl}}/api/v1/p2p/ap-payments/{{uaeApPaymentId}}/reconcile" @("api","v1","p2p","ap-payments","{{uaeApPaymentId}}","reconcile")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("AP payment reconciled", function () { pm.expect(pm.response.json().state).to.eql("Reconciled"); });'
    )
)

# ─── 22 - P2P Flow UAE Reverse Charge (RC5) ──────────────────────────────────

$t22 = @(

  PostReq "Create RC Supplier" `
    '{"name":"UAE Reverse Charge Supplier","email":"supplier.rc@test.ae","currencyCode":"AED"}' `
    (Url "{{baseUrl}}/api/v1/p2p/suppliers" @("api","v1","p2p","suppliers")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("rcSupplierId", pm.response.json().supplier_id);'
    )

  PostReq "Create RC Requisition" `
    '{"requestedBy":"RC Buyer","notes":"Reverse charge VAT test"}' `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions" @("api","v1","p2p","requisitions")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("rcReqId", pm.response.json().requisition_id);'
    )

  PostReq "Add RC Requisition Line" `
    '{"productCode":"RC-SERVICE-001","description":"Imported Digital Service","quantity":1,"unitPrice":8000,"currency":"AED"}' `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions/{{rcReqId}}/lines" @("api","v1","p2p","requisitions","{{rcReqId}}","lines")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
    )

  PostNoBody "Submit RC Requisition" `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions/{{rcReqId}}/submit" @("api","v1","p2p","requisitions","{{rcReqId}}","submit")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Approve RC Requisition" `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions/{{rcReqId}}/approve" @("api","v1","p2p","requisitions","{{rcReqId}}","approve")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostReq "Convert RC Requisition To PO" `
    '{"supplierId":"{{rcSupplierId}}"}' `
    (Url "{{baseUrl}}/api/v1/p2p/requisitions/{{rcReqId}}/convert-to-po" @("api","v1","p2p","requisitions","{{rcReqId}}","convert-to-po")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("rcPoId", pm.response.json().purchase_order_id);'
    )

  PostNoBody "Approve RC PO" `
    (Url "{{baseUrl}}/api/v1/p2p/purchase-orders/{{rcPoId}}/approve" @("api","v1","p2p","purchase-orders","{{rcPoId}}","approve")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Send RC PO" `
    (Url "{{baseUrl}}/api/v1/p2p/purchase-orders/{{rcPoId}}/send" @("api","v1","p2p","purchase-orders","{{rcPoId}}","send")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostReq "Create RC Goods Receipt" `
    '{"purchaseOrderId":"{{rcPoId}}","receivedBy":"RC Receiving Team","notes":"Reverse charge test receipt"}' `
    (Url "{{baseUrl}}/api/v1/p2p/goods-receipts" @("api","v1","p2p","goods-receipts")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("rcReceiptId", pm.response.json().receipt_id);'
    )

  PostNoBody "Receive RC Goods" `
    (Url "{{baseUrl}}/api/v1/p2p/goods-receipts/{{rcReceiptId}}/receive" @("api","v1","p2p","goods-receipts","{{rcReceiptId}}","receive")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Accept RC Goods" `
    (Url "{{baseUrl}}/api/v1/p2p/goods-receipts/{{rcReceiptId}}/accept" @("api","v1","p2p","goods-receipts","{{rcReceiptId}}","accept")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostReq "Create RC Supplier Invoice With RC5" `
    '{"receiptId":"{{rcReceiptId}}","taxCodeId":"TCOD-RC5","countryCode":"AE"}' `
    (Url "{{baseUrl}}/api/v1/p2p/supplier-invoices" @("api","v1","p2p","supplier-invoices")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'var body = pm.response.json();'
      'pm.environment.set("rcSupplierInvoiceId", body.supplier_invoice_id);'
      'pm.test("RC invoice draft", function () { pm.expect(body.state).to.eql("Draft"); });'
      'pm.test("amount_due equals base (RC does not gross-up AP amount)", function () {'
      '  pm.expect(parseFloat(body.amount_due)).to.be.closeTo(8000, 1);'
      '});'
    )

  GetReq "Get RC Tax Lines (Pending - Reverse Charge)" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/transaction-lines/{{rcSupplierInvoiceId}}" @("api","v1","r2r","tax","transaction-lines","{{rcSupplierInvoiceId}}")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'pm.test("RC tax line created", function () { pm.expect(rows.length).to.be.at.least(1); });'
      'pm.test("Tax applicability is reverse-charge", function () { pm.expect(rows[0].tax_applicability).to.eql("reverse-charge"); });'
      'pm.test("Tax code is TCOD-RC5", function () { pm.expect(rows[0].tax_code_id).to.eql("TCOD-RC5"); });'
      'pm.test("RC tax amount is 400 (5% of 8000)", function () { pm.expect(parseFloat(rows[0].tax_amount)).to.be.closeTo(400, 1); });'
      'pm.test("RC tax line is pending", function () { pm.expect(rows[0].accounting_status).to.eql("pending"); });'
    )

  PostNoBody "Validate RC Supplier Invoice" `
    (Url "{{baseUrl}}/api/v1/p2p/supplier-invoices/{{rcSupplierInvoiceId}}/validate" @("api","v1","p2p","supplier-invoices","{{rcSupplierInvoiceId}}","validate")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Post RC Supplier Invoice" `
    (Url "{{baseUrl}}/api/v1/p2p/supplier-invoices/{{rcSupplierInvoiceId}}/post" @("api","v1","p2p","supplier-invoices","{{rcSupplierInvoiceId}}","post")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("RC invoice posted", function () { pm.expect(pm.response.json().state).to.eql("Posted"); });'
    )

  GetReq "Verify RC Tax Lines Posted" `
    (Url "{{baseUrl}}/api/v1/r2r/tax/transaction-lines/{{rcSupplierInvoiceId}}" @("api","v1","r2r","tax","transaction-lines","{{rcSupplierInvoiceId}}")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = pm.response.json().data || [];'
      'pm.test("RC tax line is posted", function () { pm.expect(rows[0].accounting_status).to.eql("posted"); });'
      'pm.environment.set("rcJournalId", rows[0].accounting_journal_id);'
    )

  GetReq "Verify RC 4-Line Journal (DR Exp + CR AP + DR VAT-In + CR VAT-Out)" `
    (QUrl "{{baseUrl}}/api/v1/query/r2r_ledger_entry?limit=50&offset=0" `
      @("api","v1","query","r2r_ledger_entry") `
      @(@{key="limit";value="50"},@{key="offset";value="0"})) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'var rows = (pm.response.json().data || []).filter(function(r){ return r.journal_id === pm.environment.get("rcJournalId"); });'
      'pm.test("RC journal has 4 ledger entry lines (DR Expense, CR AP, DR VAT Input, CR VAT Output)", function () {'
      '  pm.expect(rows.length).to.eql(4);'
      '});'
      'var drLines = rows.filter(function(r){ return r.entry_type === "Debit"; });'
      'var crLines = rows.filter(function(r){ return r.entry_type === "Credit"; });'
      'pm.test("2 debit lines (Expense + VAT Input)", function () { pm.expect(drLines.length).to.eql(2); });'
      'pm.test("2 credit lines (AP + VAT Output)", function () { pm.expect(crLines.length).to.eql(2); });'
    )

  PostReq "Create RC AP Payment (base amount only)" `
    '{"supplierInvoiceId":"{{rcSupplierInvoiceId}}","amount":8000,"currency":"AED","paymentDate":"2026-04-06T00:00:00.000Z","reference":"AP-PAY-RC-001"}' `
    (Url "{{baseUrl}}/api/v1/p2p/ap-payments" @("api","v1","p2p","ap-payments")) @(
      'pm.test("Status is 201", function () { pm.response.to.have.status(201); });'
      'pm.environment.set("rcApPaymentId", pm.response.json().ap_payment_id);'
    )

  PostNoBody "Receive RC AP Payment" `
    (Url "{{baseUrl}}/api/v1/p2p/ap-payments/{{rcApPaymentId}}/receive" @("api","v1","p2p","ap-payments","{{rcApPaymentId}}","receive")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Apply RC AP Payment" `
    (Url "{{baseUrl}}/api/v1/p2p/ap-payments/{{rcApPaymentId}}/apply" @("api","v1","p2p","ap-payments","{{rcApPaymentId}}","apply")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
    )

  PostNoBody "Reconcile RC AP Payment" `
    (Url "{{baseUrl}}/api/v1/p2p/ap-payments/{{rcApPaymentId}}/reconcile" @("api","v1","p2p","ap-payments","{{rcApPaymentId}}","reconcile")) @(
      'pm.test("Status is 200", function () { pm.response.to.have.status(200); });'
      'pm.test("RC AP payment reconciled", function () { pm.expect(pm.response.json().state).to.eql("Reconciled"); });'
    )
)

# ─── Insert new folders ──────────────────────────────────────────────────────

$newFolders = @(
  @{ name="31 - R2R Tax Config";             item=$t31 }
  @{ name="11 - O2C Flow UAE VAT (VAT5)";    item=$t11 }
  @{ name="21 - P2P Flow UAE VAT (VAT5)";    item=$t21 }
  @{ name="22 - P2P Flow UAE Reverse Charge (RC5)"; item=$t22 }
)

# Remove any previous versions of these folders to allow re-run
$existingNames = $newFolders | ForEach-Object { $_.name }
$col.item = @($col.item | Where-Object { $existingNames -notcontains $_.name }) + $newFolders

# ─── Save FoundationERP collection ──────────────────────────────────────────

$out = $col | ConvertTo-Json -Depth 50
[System.IO.File]::WriteAllText($CollectionPath, $out)
Write-Host "Saved: $CollectionPath"

# ─── Sync to unified collection ─────────────────────────────────────────────

$uni = Get-Content $UnifiedPath -Raw | ConvertFrom-Json

# Find the FoundationERP sub-collection and update its items
$fndNode = $uni.item | Where-Object { $_.name -eq "FoundationERP API" }
if ($fndNode) {
  $existingNamesArr = $newFolders | ForEach-Object { $_.name }
  $fndNode.item = @($fndNode.item | Where-Object { $existingNamesArr -notcontains $_.name }) + $newFolders
  $uniOut = $uni | ConvertTo-Json -Depth 50
  [System.IO.File]::WriteAllText($UnifiedPath, $uniOut)
  Write-Host "Saved unified: $UnifiedPath"
} else {
  Write-Warning "Could not find 'FoundationERP API' node in unified collection - skipping unified update."
}

Write-Host "Done. Added folders:" ($newFolders | ForEach-Object { $_.name })
