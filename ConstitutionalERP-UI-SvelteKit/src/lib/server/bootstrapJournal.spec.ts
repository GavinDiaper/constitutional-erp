import { describe, expect, it } from 'vitest';
import {
	BootstrapValidationError,
	assertPostableBootstrapJournal,
	resolveBootstrapJournalSpec
} from '$lib/server/bootstrapJournal';

describe('resolveBootstrapJournalSpec', () => {
	it('accepts balanced two-account payload shape', () => {
		const spec = resolveBootstrapJournalSpec({
			debitAccountId: 'ACC-1000',
			creditAccountId: 'ACC-2000',
			amount: 125.5,
			memo: 'Bootstrap memo'
		});

		expect(spec).toEqual({
			debitAccountId: 'ACC-1000',
			creditAccountId: 'ACC-2000',
			amount: 125.5,
			memo: 'Bootstrap memo'
		});
	});

	it('rejects legacy single-line payload shape', () => {
		expect(() =>
			resolveBootstrapJournalSpec({
				accountId: 'ACC-1000',
				debitAmount: 100,
				creditAmount: 0
			})
		).toThrow(BootstrapValidationError);
	});

	it('rejects missing paired account IDs', () => {
		expect(() =>
			resolveBootstrapJournalSpec({
				debitAccountId: 'ACC-1000',
				amount: 50
			})
		).toThrow('debitAccountId and creditAccountId are required');
	});

	it('rejects same debit and credit accounts', () => {
		expect(() =>
			resolveBootstrapJournalSpec({
				debitAccountId: 'ACC-1000',
				creditAccountId: 'ACC-1000',
				amount: 50
			})
		).toThrow('must refer to different accounts');
	});

	it('rejects zero amount', () => {
		expect(() =>
			resolveBootstrapJournalSpec({
				debitAccountId: 'ACC-1000',
				creditAccountId: 'ACC-2000',
				amount: 0
			})
		).toThrow('amount must be greater than zero');
	});
});

describe('assertPostableBootstrapJournal', () => {
	it('passes when two lines are created from valid spec', () => {
		const spec = resolveBootstrapJournalSpec({
			debitAccountId: 'ACC-1000',
			creditAccountId: 'ACC-2000',
			amount: 10
		});

		expect(() => assertPostableBootstrapJournal(2, spec)).not.toThrow();
	});

	it('fails when fewer than two lines were created', () => {
		const spec = resolveBootstrapJournalSpec({
			debitAccountId: 'ACC-1000',
			creditAccountId: 'ACC-2000',
			amount: 10
		});

		expect(() => assertPostableBootstrapJournal(1, spec)).toThrow(
			'failed to create both debit and credit lines'
		);
	});
});
