import { describe, expect, it } from 'vitest';
import { isDraftCustomer, isPendingJournal, isSubmittedRequisition } from '$lib/api/dashboard';

describe('dashboard approval queue predicates', () => {
	it('matches submitted requisitions from state and status aliases', () => {
		expect(isSubmittedRequisition({ requisition_id: 'REQ-1', state: 'Submitted' })).toBe(true);
		expect(isSubmittedRequisition({ requisition_id: 'REQ-2', status: 'Pending Approval' })).toBe(true);
		expect(isSubmittedRequisition({ requisition_id: 'REQ-3', state: 'awaiting_approval' })).toBe(true);
		expect(isSubmittedRequisition({ requisition_id: 'REQ-4', state: 'Draft' })).toBe(false);
	});

	it('matches pending journals from lifecycle aliases and excludes terminal states', () => {
		expect(isPendingJournal({ journal_id: 'JRN-1', state: 'Draft' })).toBe(true);
		expect(isPendingJournal({ journal_id: 'JRN-2', status: 'Ready To Post' })).toBe(true);
		expect(isPendingJournal({ journal_id: 'JRN-3', state: 'Pending_Approval' })).toBe(true);
		expect(isPendingJournal({ journal_id: 'JRN-4', state: 'Posted' })).toBe(false);
		expect(isPendingJournal({ journal_id: 'JRN-5', state: 'Reversed' })).toBe(false);
		expect(isPendingJournal({ journal_id: 'JRN-6', state: 'Cancelled' })).toBe(false);
	});

	it('matches draft customers from status and state fields', () => {
		expect(isDraftCustomer({ customer_id: 'CUST-1', status: 'Draft' })).toBe(true);
		expect(isDraftCustomer({ customer_id: 'CUST-2', state: 'draft' })).toBe(true);
		expect(isDraftCustomer({ customer_id: 'CUST-3', status: 'Active' })).toBe(false);
	});
});
