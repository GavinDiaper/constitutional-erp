export type DiagramItem = {
	id: string;
	title: string;
	system: 'FoundationERP' | 'ConstitutionalLayer' | 'Cross-System';
	summary: string;
	accentClass: string;
	definition: string;
};

export const diagramCatalog: DiagramItem[] = [
	{
		id: 'foundation-core-eventing',
		title: 'Foundation Core and Eventing',
		system: 'FoundationERP',
		summary: 'Canonical event stream, replay checkpoints, and ERP field mappings.',
		accentClass: 'border-blue-500/40 bg-blue-50/70',
		definition: `erDiagram
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
    }`
	},
	{
		id: 'foundation-o2c',
		title: 'Foundation O2C Domain',
		system: 'FoundationERP',
		summary: 'Quote to cash lifecycle from customer through invoice and payment.',
		accentClass: 'border-indigo-500/40 bg-indigo-50/70',
		definition: `erDiagram
    F_o2c_customer ||--o{ F_o2c_quote : has
    F_o2c_quote ||--o{ F_o2c_quote_line : has
    F_o2c_quote ||--o{ F_o2c_sales_order : converts_to
    F_o2c_customer ||--o{ F_o2c_sales_order : places
    F_o2c_sales_order ||--o{ F_o2c_sales_order_line : has
    F_o2c_sales_order ||--o{ F_o2c_invoice : billed_by
    F_o2c_invoice ||--o{ F_o2c_payment : settles
    F_o2c_sales_order ||--o{ F_o2c_shipment : ships`
	},
	{
		id: 'foundation-p2p',
		title: 'Foundation P2P Domain',
		system: 'FoundationERP',
		summary: 'Requisition to payment lifecycle for supplier-side procurement.',
		accentClass: 'border-sky-500/40 bg-sky-50/70',
		definition: `erDiagram
    F_p2p_requisition ||--o{ F_p2p_requisition_line : has
    F_p2p_supplier ||--o{ F_p2p_purchase_order : receives
    F_p2p_requisition ||--o{ F_p2p_purchase_order : converted_to
    F_p2p_purchase_order ||--o{ F_p2p_purchase_order_line : has
    F_p2p_purchase_order ||--o{ F_p2p_goods_receipt : receives
    F_p2p_purchase_order ||--o{ F_p2p_supplier_invoice : billed_by
    F_p2p_supplier_invoice ||--o{ F_p2p_ap_payment : settled_by`
	},
	{
		id: 'foundation-r2r',
		title: 'Foundation R2R Domain',
		system: 'FoundationERP',
		summary: 'Ledger, chart of accounts, periods, journals, balances, tax, and SLA.',
		accentClass: 'border-blue-700/40 bg-blue-100/70',
		definition: `erDiagram
    F_r2r_legal_entity ||--o{ F_r2r_ledger : owns
    F_r2r_ledger ||--o{ F_r2r_account : contains
    F_r2r_fiscal_year ||--o{ F_r2r_fiscal_period : contains
    F_r2r_fiscal_period ||--o{ F_r2r_journal : contains
    F_r2r_journal ||--o{ F_r2r_journal_line : has
    F_r2r_account ||--o{ F_r2r_journal_line : referenced_by
    F_r2r_account ||--o{ F_r2r_ledger_entry : referenced_by
    F_r2r_account ||--o{ F_r2r_trial_balance_row : summarized_into
    F_tax_regime ||--o{ F_tax_jurisdiction : defines
    F_tax_jurisdiction ||--o{ F_tax_code : has
    F_tax_code ||--o{ F_tax_rate : assigned
    F_tax_code ||--o{ F_tax_rule : evaluated_by
    F_tax_rule ||--o{ F_tax_account_mapping : determines
    F_tax_account_mapping ||--o{ F_r2r_account : resolves_to
    F_r2r_journal ||--o{ F_tax_transaction_line : sources`
	},
	{
		id: 'foundation-r2r-tax',
		title: 'R2R Tax Configuration and Transactions',
		system: 'FoundationERP',
		summary: 'Tax regime, jurisdiction, codes, rates, rules, mappings, and transaction tracking.',
		accentClass: 'border-amber-600/40 bg-amber-50/70',
		definition: `erDiagram
    F_tax_regime {
        string regime_id PK
        string regime_name
        int priority
        boolean is_active
    }
    F_tax_jurisdiction {
        string jurisdiction_id PK
        string regime_id FK
        string country_code
        string jurisdiction_name
    }
    F_tax_code {
        string tax_code_id PK
        string jurisdiction_id FK
        string code
        string description
        int priority
    }
    F_tax_rate {
        string tax_rate_id PK
        string tax_code_id FK
        decimal percent_value
        boolean inclusive_flag
        date effective_from
    }
    F_tax_rule {
        string tax_rule_id PK
        string jurisdiction_id FK
        string description
        string conditions_json
        int priority
    }
    F_tax_account_mapping {
        string mapping_id PK
        string tax_code_id FK
        string transaction_type
        string account_role
        string account_code
    }
    F_tax_transaction_line {
        string transaction_line_id PK
        string source_entity_id
        string source_entity_type
        string transaction_type
        string tax_code_id FK
        decimal taxable_amount
        decimal tax_amount
        string accounting_status
    }
    F_tax_regime ||--o{ F_tax_jurisdiction : "1 : many"
    F_tax_jurisdiction ||--o{ F_tax_code : "1 : many"
    F_tax_code ||--o{ F_tax_rate : "1 : many"
    F_tax_jurisdiction ||--o{ F_tax_rule : "1 : many"
    F_tax_code ||--o{ F_tax_account_mapping : "1 : many"
    F_tax_code ||--o{ F_tax_transaction_line : "1 : many"`
	},
	{
		id: 'foundation-h2r-navlog',
		title: 'Foundation H2R and REPL/Navlog',
		system: 'FoundationERP',
		summary: 'Authority and assignment entities plus session, navlog, and transcript.',
		accentClass: 'border-cyan-600/40 bg-cyan-50/70',
		definition: `erDiagram
    F_h2r_employee ||--o{ F_h2r_assignment : assigned_to
    F_h2r_position ||--o{ F_h2r_assignment : filled_by
    F_h2r_employee ||--o{ F_h2r_credential : has
    F_repl_session ||--o{ F_navlog : records
    F_repl_session ||--o{ F_transcript : records
    F_navlog ||--o{ F_governance_decision_log : links`
	},
	{
		id: 'authority-engine',
		title: 'Authority Engine',
		system: 'ConstitutionalLayer',
		summary: 'Subject, position, credential, and authority rule projections.',
		accentClass: 'border-emerald-600/40 bg-emerald-50/70',
		definition: `erDiagram
    AE_authority_subject ||--o{ AE_authority_position : assigned
    AE_position_def ||--o{ AE_authority_position : used_by
    AE_authority_subject ||--o{ AE_authority_credential : has`
	},
	{
		id: 'governance-engine',
		title: 'Governance Engine',
		system: 'ConstitutionalLayer',
		summary: 'Rules, actor credentials, action history, decisions, and events.',
		accentClass: 'border-rose-600/40 bg-rose-50/70',
		definition: `erDiagram
    GE_governance_rule {
        string rule_id PK
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
    }`
	},
	{
		id: 'event-processor',
		title: 'Event Processor',
		system: 'ConstitutionalLayer',
		summary: 'Ledger event ingestion, dead letter handling, and source cursors.',
		accentClass: 'border-orange-600/40 bg-orange-50/70',
		definition: `erDiagram
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
    }`
	},
	{
		id: 'mesh-gateway',
		title: 'Mesh Gateway',
		system: 'ConstitutionalLayer',
		summary: 'Approval tasks, approver assignments, and decision audit logging. Canonical ERP for cross-system projection and orchestration. E.g. Oracle ERP, SAP, or custom microservices.',
		accentClass: 'border-violet-600/40 bg-violet-50/70',
		definition: `erDiagram
    MG_mesh_approval_task ||--o{ MG_mesh_approval_assignment : assigned_to`
	},
	{
		id: 'navigator-ai',
		title: 'Navigator AI',
		system: 'ConstitutionalLayer',
		summary: 'Model logs, ranking, simulation, governance outcomes, and execution traces.',
		accentClass: 'border-amber-600/40 bg-amber-50/70',
		definition: `erDiagram
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
    }`
	},
	{
		id: 'process-graph-engine',
		title: 'Process Graph Engine',
		system: 'ConstitutionalLayer',
		summary: 'Approval work items and command execution log owned by PGE.',
		accentClass: 'border-teal-600/40 bg-teal-50/70',
		definition: `erDiagram
    PGE_pge_approval_task {
        string id PK
    }
    PGE_pge_command_log {
        string id PK
    }`
	},
	{
		id: 'cross-system-links',
		title: 'Cross-System Logical Links',
		system: 'Cross-System',
		summary: 'Projection and orchestration links across foundation and constitutional services.',
		accentClass: 'border-slate-600/40 bg-slate-100/70',
		definition: `flowchart LR
    F_event[F_event] -->|projected_to| AE_event[AE_authority_event]
    F_event -->|projected_to| GE_event[GE_governance_event]
    F_event -->|ingested_as| EP_events[EP_ledger_events]
    AE_cred[AE_authority_credential] -->|informs| GE_actor_cred[GE_governance_actor_credential]
    AE_rule[AE_authority_rule] -->|complements| GE_rule[GE_governance_rule]
    GE_decisions[GE_governance_decision_log] -->|materialized_as| MG_decisions[MG_mesh_decision_log]
    MG_tasks[MG_mesh_approval_task] -->|mirrored_as| PGE_tasks[PGE_pge_approval_task]
    PGE_cmd[PGE_pge_command_log] -->|emits| EP_events
    EP_events -->|consumed_by| NAI_events[NAI_navigator_event_log]
    GE_decisions -->|referenced_by| NAI_gov[NAI_navigator_governance_outcome]`
	},
	{
		id: 'foundation-projects-lifecycle',
		title: 'Foundation Projects Lifecycle',
		system: 'FoundationERP',
		summary: 'Project state machine from draft through completion with WIP breakdown, BOM assignments, and labor costing.',
		accentClass: 'border-lime-500/40 bg-lime-50/70',
		definition: `stateDiagram-v2
    [*] --> Draft
    Draft -->|Activate| Active
    Active -->|Hold| OnHold
    OnHold -->|Resume| Active
    Active -->|Complete| Completed
    OnHold -->|Cancel| Cancelled
    Active -->|Cancel| Cancelled
    Draft -->|Cancel| Cancelled
    Completed --> [*]
    Cancelled --> [*]
    
    note right of Draft
        Initial state
        No WIP posted
    end note
    
    note right of Active
        Project underway
        WIP materials/labor tracked
        BOM assignments active
    end note
    
    note right of OnHold
        Temporarily halted
        WIP accumulation paused
    end note
    
    note right of Completed
        Closed and archived
        Final WIP balance
        Ready for GL posting
    end note
    
    note right of Cancelled
        Cancelled and void
        All WIP reversed
    end note`
	},
	{
		id: 'foundation-projects-domain',
		title: 'Foundation Projects Domain',
		system: 'FoundationERP',
		summary: 'Project management with WIP breakdown, BOM assignments, labor entries, and finished item creation.',
		accentClass: 'border-lime-500/40 bg-lime-50/70',
		definition: `erDiagram
    F_proj_project {
        string project_id PK
        string name
        string description
        string status
        decimal budget_amount
        date start_date
        date end_date
        string manager_id FK
        string organization_id FK
    }
    F_proj_wip {
        string wip_id PK
        string project_id FK
        decimal material_balance
        decimal labor_balance
        decimal overhead_balance
        string status
        date closed_at
    }
    F_proj_bom_assignment {
        string assignment_id PK
        string project_id FK
        string bom_id FK
        decimal quantity_planned
        decimal quantity_completed
        string status
    }
    F_proj_labor_entry {
        string entry_id PK
        string project_id FK
        string labor_type
        decimal hours
        decimal hourly_rate
        decimal total_cost
        date posted_at
    }
    F_proj_finished_item {
        string finished_item_id PK
        string project_id FK
        string sku_id FK
        decimal quantity_produced
        decimal wip_cost_per_unit
        date created_at
    }
    F_proj_project ||--o{ F_proj_wip : has
    F_proj_project ||--o{ F_proj_bom_assignment : assigned
    F_proj_project ||--o{ F_proj_labor_entry : posts
    F_proj_project ||--o{ F_proj_finished_item : creates`
	}
];

export const diagramById: Record<string, DiagramItem> = Object.fromEntries(
	diagramCatalog.map((item) => [item.id, item])
);
