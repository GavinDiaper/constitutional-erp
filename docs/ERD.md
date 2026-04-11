# ConstitutionalERP System ERD (Grouped)

## 1. System and Domain Grouping (Color Key)

```mermaid
flowchart LR
    classDef foundation fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#0f172a;
    classDef authority fill:#dcfce7,stroke:#15803d,stroke-width:2px,color:#0f172a;
    classDef governance fill:#fee2e2,stroke:#b91c1c,stroke-width:2px,color:#0f172a;
    classDef eventproc fill:#fff7ed,stroke:#c2410c,stroke-width:2px,color:#0f172a;
    classDef mesh fill:#ede9fe,stroke:#5b21b6,stroke-width:2px,color:#0f172a;
    classDef navigator fill:#fef9c3,stroke:#a16207,stroke-width:2px,color:#0f172a;
    classDef pge fill:#cffafe,stroke:#0f766e,stroke-width:2px,color:#0f172a;

    subgraph FoundationERP
        F_core[Core and Eventing]
        F_o2c[O2C Domain]
        F_p2p[P2P Domain]
        F_r2r[R2R Domain]
        F_h2r[H2R Domain]
        F_nav[REPL and Navlog]
    end

    subgraph ConstitutionalLayer
        AE[Authority Engine]
        GE[Governance Engine]
        EP[Event Processor]
        MG[Mesh Gateway]
        NAI[Navigator AI]
        PGE[Process Graph Engine]
    end

    class F_core,F_o2c,F_p2p,F_r2r,F_h2r,F_nav foundation;
    class AE authority;
    class GE governance;
    class EP eventproc;
    class MG mesh;
    class NAI navigator;
    class PGE pge;

    F_core --> AE
    F_core --> GE
    F_core --> EP
    AE --> GE
    GE --> MG
    MG --> PGE
    EP --> NAI
    GE --> NAI
```

## 2. FoundationERP - Core and Eventing

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#dbeafe !important;stroke:#1d4ed8 !important;}'}}%%
erDiagram
    F_event {
        string event_id PK
        string entity_id
        string entity_type
        string event_type
        int version
    }
    F_replay_checkpoint {
        string checkpoint_name PK
        string last_event_id
    }
    F_erp_mapping {
        string mapping_id PK
        string domain
        string entity_name
    }
```

## 3. FoundationERP - O2C Domain

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#bfdbfe !important;stroke:#1e3a8a !important;}'}}%%
erDiagram
    F_o2c_customer {
        string customer_id PK
    }
    F_o2c_quote {
        string quote_id PK
        string customer_id FK
    }
    F_o2c_quote_line {
        string quote_line_id PK
        string quote_id FK
    }
    F_o2c_sales_order {
        string order_id PK
        string quote_id FK
        string customer_id FK
    }
    F_o2c_sales_order_line {
        string order_line_id PK
        string order_id FK
    }
    F_o2c_invoice {
        string invoice_id PK
        string order_id FK
    }
    F_o2c_payment {
        string payment_id PK
        string invoice_id FK
    }
    F_o2c_shipment {
        string shipment_id PK
        string order_id FK
    }

    F_o2c_customer ||--o{ F_o2c_quote : has
    F_o2c_quote ||--o{ F_o2c_quote_line : has
    F_o2c_quote ||--o{ F_o2c_sales_order : converts_to
    F_o2c_customer ||--o{ F_o2c_sales_order : places
    F_o2c_sales_order ||--o{ F_o2c_sales_order_line : has
    F_o2c_sales_order ||--o{ F_o2c_invoice : billed_by
    F_o2c_invoice ||--o{ F_o2c_payment : settles
    F_o2c_sales_order ||--o{ F_o2c_shipment : ships
```

## 4. FoundationERP - P2P Domain

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#93c5fd !important;stroke:#1d4ed8 !important;}'}}%%
erDiagram
    F_p2p_supplier {
        string supplier_id PK
    }
    F_p2p_requisition {
        string requisition_id PK
    }
    F_p2p_requisition_line {
        string requisition_line_id PK
        string requisition_id FK
    }
    F_p2p_purchase_order {
        string po_id PK
        string requisition_id FK
        string supplier_id FK
    }
    F_p2p_purchase_order_line {
        string po_line_id PK
        string po_id FK
    }
    F_p2p_goods_receipt {
        string receipt_id PK
        string po_id FK
    }
    F_p2p_supplier_invoice {
        string supplier_invoice_id PK
        string po_id FK
    }
    F_p2p_ap_payment {
        string ap_payment_id PK
        string supplier_invoice_id FK
    }

    F_p2p_requisition ||--o{ F_p2p_requisition_line : has
    F_p2p_supplier ||--o{ F_p2p_purchase_order : receives
    F_p2p_requisition ||--o{ F_p2p_purchase_order : converted_to
    F_p2p_purchase_order ||--o{ F_p2p_purchase_order_line : has
    F_p2p_purchase_order ||--o{ F_p2p_goods_receipt : receives
    F_p2p_purchase_order ||--o{ F_p2p_supplier_invoice : billed_by
    F_p2p_supplier_invoice ||--o{ F_p2p_ap_payment : settled_by
```

## 5. FoundationERP - R2R Domain

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#60a5fa !important;stroke:#1e40af !important;}'}}%%
erDiagram
    F_r2r_legal_entity {
        string legal_entity_id PK
        string parent_legal_entity_id FK
    }
    F_r2r_ledger {
        string ledger_id PK
        string legal_entity_id FK
    }
    F_r2r_ledger_set {
        string ledger_set_id PK
    }
    F_r2r_ledger_set_member {
        string ledger_set_id PK, FK
        string ledger_id PK, FK
    }
    F_r2r_account {
        string account_id PK
        string ledger_id FK
        string parent_account_id FK
    }
    F_r2r_fiscal_year {
        string fiscal_year_id PK
    }
    F_r2r_fiscal_period {
        string fiscal_period_id PK
        string fiscal_year_id FK
    }
    F_r2r_journal {
        string journal_id PK
        string fiscal_period_id FK
        string ledger_id FK
    }
    F_r2r_journal_line {
        string journal_line_id PK
        string journal_id FK
        string account_id FK
    }
    F_r2r_ledger_entry {
        string ledger_entry_id PK
        string journal_id FK
        string account_id FK
    }
    F_r2r_trial_balance_row {
        string trial_balance_row_id PK
        string fiscal_period_id FK
        string account_id FK
    }
    F_r2r_coa_segment_definition {
        string segment_definition_id PK
    }
    F_r2r_account_segment_value {
        string account_id PK, FK
        string segment_definition_id PK, FK
    }
    F_r2r_coa_combination_rule {
        string rule_id PK
    }
    F_r2r_coa_combination_rule_condition {
        string condition_id PK
        string rule_id FK
        string segment_definition_id FK
    }
    F_r2r_fx_rate_type {
        string rate_type_id PK
    }
    F_r2r_fx_rate {
        string rate_id PK
        string rate_type_id FK
    }
    F_r2r_sla_posting_profile {
        string posting_profile_id PK
    }
    F_r2r_sla_posting_profile_line {
        string posting_profile_line_id PK
        string posting_profile_id FK
        string account_id FK
    }

    F_r2r_legal_entity ||--o{ F_r2r_legal_entity : parent_of
    F_r2r_legal_entity ||--o{ F_r2r_ledger : owns
    F_r2r_ledger ||--o{ F_r2r_ledger_set_member : member_of
    F_r2r_ledger_set ||--o{ F_r2r_ledger_set_member : contains
    F_r2r_ledger ||--o{ F_r2r_account : contains
    F_r2r_account ||--o{ F_r2r_account : parent_of
    F_r2r_fiscal_year ||--o{ F_r2r_fiscal_period : contains
    F_r2r_fiscal_period ||--o{ F_r2r_journal : contains
    F_r2r_ledger ||--o{ F_r2r_journal : posts_to
    F_r2r_journal ||--o{ F_r2r_journal_line : has
    F_r2r_account ||--o{ F_r2r_journal_line : referenced_by
    F_r2r_journal ||--o{ F_r2r_ledger_entry : posts
    F_r2r_account ||--o{ F_r2r_ledger_entry : referenced_by
    F_r2r_fiscal_period ||--o{ F_r2r_trial_balance_row : summarized_into
    F_r2r_account ||--o{ F_r2r_trial_balance_row : summarized_into
    F_r2r_account ||--o{ F_r2r_account_segment_value : segmented_by
    F_r2r_coa_segment_definition ||--o{ F_r2r_account_segment_value : defines
    F_r2r_coa_combination_rule ||--o{ F_r2r_coa_combination_rule_condition : has
    F_r2r_coa_segment_definition ||--o{ F_r2r_coa_combination_rule_condition : constrains
    F_r2r_fx_rate_type ||--o{ F_r2r_fx_rate : rates
    F_r2r_sla_posting_profile ||--o{ F_r2r_sla_posting_profile_line : has
    F_r2r_account ||--o{ F_r2r_sla_posting_profile_line : maps_to
```

## 6. FoundationERP - H2R and REPL/Navlog

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#3b82f6 !important;stroke:#1e3a8a !important;}'}}%%
erDiagram
    F_h2r_employee {
        string employee_id PK
    }
    F_h2r_position {
        string position_id PK
    }
    F_h2r_assignment {
        string assignment_id PK
        string employee_id FK
        string position_id FK
    }
    F_h2r_credential {
        string credential_id PK
        string employee_id FK
    }
    F_h2r_authority_rule {
        string rule_id PK
    }

    F_repl_session {
        string session_id PK
    }
    F_navlog {
        string navlog_id PK
        string session_id FK
    }
    F_transcript {
        string transcript_id PK
        string session_id FK
    }
    F_governance_decision_log {
        string decision_id PK
        string navlog_id FK
    }

    F_h2r_employee ||--o{ F_h2r_assignment : assigned_to
    F_h2r_position ||--o{ F_h2r_assignment : filled_by
    F_h2r_employee ||--o{ F_h2r_credential : has
    F_repl_session ||--o{ F_navlog : records
    F_repl_session ||--o{ F_transcript : records
    F_navlog ||--o{ F_governance_decision_log : links
```

## 7. Authority Engine

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#dcfce7 !important;stroke:#166534 !important;}'}}%%
erDiagram
    AE_authority_subject {
        string employee_id PK
    }
    AE_position_def {
        string position_id PK
    }
    AE_authority_position {
        string assignment_id PK
        string employee_id FK
        string position_id FK
    }
    AE_authority_credential {
        string credential_id PK
        string employee_id FK
    }
    AE_authority_rule {
        string rule_id PK
    }
    AE_authority_metadata {
        string key PK
    }
    AE_authority_event {
        string event_id PK
    }

    AE_authority_subject ||--o{ AE_authority_position : assigned
    AE_position_def ||--o{ AE_authority_position : used_by
    AE_authority_subject ||--o{ AE_authority_credential : has
```

## 8. Governance Engine

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#fee2e2 !important;stroke:#991b1b !important;}'}}%%
erDiagram
    GE_governance_rule {
        string rule_id PK
    }
    GE_governance_projection_metadata {
        string key PK
    }
    GE_governance_actor_credential {
        string credential_id PK
    }
    GE_governance_action_history {
        int history_id PK
    }
    GE_governance_decision_log {
        string decision_id PK
    }
    GE_governance_event {
        string event_id PK
    }
```

## 9. Event Processor

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#fff7ed !important;stroke:#9a3412 !important;}'}}%%
erDiagram
    EP_ledger_events {
        string id PK
    }
    EP_ledger_dead_letter {
        int id PK
    }
    EP_cep_source_cursor {
        string source_system PK
    }
    EP_cep_runtime_metadata {
        string key PK
    }
```

## 10. Mesh Gateway

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#ede9fe !important;stroke:#5b21b6 !important;}'}}%%
erDiagram
    MG_mesh_projection_metadata {
        string key PK
    }
    MG_mesh_approval_task {
        string task_id PK
    }
    MG_mesh_approval_assignment {
        string task_id PK, FK
        string approver_id PK
    }
    MG_mesh_decision_log {
        int id PK
    }

    MG_mesh_approval_task ||--o{ MG_mesh_approval_assignment : assigned_to
```

## 11. Navigator AI

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#fef9c3 !important;stroke:#a16207 !important;}'}}%%
erDiagram
    NAI_navigator_llm_log {
        string id PK
    }
    NAI_navigator_ranking_decision {
        string id PK
    }
    NAI_navigator_simulation_run {
        string id PK
    }
    NAI_navigator_governance_outcome {
        string id PK
    }
    NAI_navigator_execution_trace {
        string id PK
    }
    NAI_navigator_repl_transcript {
        int id PK
    }
    NAI_navigator_cache {
        string cache_key PK
    }
    NAI_navigator_replay_metadata {
        string key PK
    }
    NAI_navigator_event_log {
        string id PK
    }
```

## 12. Process Graph Engine

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Segoe UI'},'themeCSS':'.er .entityLabel{font-size:44px !important;} .er .relationshipLabel{font-size:44px !important;} .er .attributeText{font-size:44px !important;} .er .entityBox{fill:#cffafe !important;stroke:#0f766e !important;}'}}%%
erDiagram
    PGE_pge_approval_task {
        string id PK
    }
    PGE_pge_command_log {
        string id PK
    }
```

## 13. Cross-System Logical Links

```mermaid
flowchart LR
    classDef foundation fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#0f172a;
    classDef authority fill:#dcfce7,stroke:#15803d,stroke-width:2px,color:#0f172a;
    classDef governance fill:#fee2e2,stroke:#b91c1c,stroke-width:2px,color:#0f172a;
    classDef eventproc fill:#fff7ed,stroke:#c2410c,stroke-width:2px,color:#0f172a;
    classDef mesh fill:#ede9fe,stroke:#5b21b6,stroke-width:2px,color:#0f172a;
    classDef navigator fill:#fef9c3,stroke:#a16207,stroke-width:2px,color:#0f172a;
    classDef pge fill:#cffafe,stroke:#0f766e,stroke-width:2px,color:#0f172a;

    F_event[F_event]
    AE_event[AE_authority_event]
    GE_event[GE_governance_event]
    EP_events[EP_ledger_events]
    GE_decisions[GE_governance_decision_log]
    MG_decisions[MG_mesh_decision_log]
    MG_tasks[MG_mesh_approval_task]
    PGE_tasks[PGE_pge_approval_task]
    PGE_cmd[PGE_pge_command_log]
    NAI_events[NAI_navigator_event_log]
    NAI_gov[NAI_navigator_governance_outcome]
    GE_actor_cred[GE_governance_actor_credential]
    AE_cred[AE_authority_credential]
    AE_rule[AE_authority_rule]
    GE_rule[GE_governance_rule]

    class F_event foundation;
    class AE_event,AE_cred,AE_rule authority;
    class GE_event,GE_decisions,GE_actor_cred,GE_rule governance;
    class EP_events eventproc;
    class MG_decisions,MG_tasks mesh;
    class NAI_events,NAI_gov navigator;
    class PGE_tasks,PGE_cmd pge;

    F_event -->|projected_to| AE_event
    F_event -->|projected_to| GE_event
    F_event -->|ingested_as| EP_events
    AE_cred -->|informs| GE_actor_cred
    AE_rule -->|complements| GE_rule
    GE_decisions -->|materialized_as| MG_decisions
    MG_tasks -->|mirrored_as| PGE_tasks
    PGE_cmd -->|emits| EP_events
    EP_events -->|consumed_by| NAI_events
    GE_decisions -->|referenced_by| NAI_gov
```

Integration Hub is intentionally stateless in this codebase (no local migration set), so it is represented by cross-system logical links rather than owned tables.
