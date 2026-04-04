export type BootstrapPayload = Record<string, unknown>;

export type BootstrapJournalSpec = {
	debitAccountId: string;
	creditAccountId: string;
	amount: number;
	memo?: string;
};

export class BootstrapValidationError extends Error {
	readonly status = 400;

	constructor(message: string) {
		super(message);
		this.name = 'BootstrapValidationError';
	}
}

export function asOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

export function asNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

export function asNonNegativeNumber(value: unknown): number | null {
	const numeric = asNumber(value);
	if (numeric === null || numeric < 0) {
		return null;
	}

	return numeric;
}

export function resolveBootstrapJournalSpec(payload: BootstrapPayload): BootstrapJournalSpec {
	const usesLegacyShape =
		asOptionalString(payload.accountId) !== undefined ||
		asNonNegativeNumber(payload.debitAmount) !== null ||
		asNonNegativeNumber(payload.creditAmount) !== null;

	if (usesLegacyShape) {
		throw new BootstrapValidationError(
			'create-journal requires debitAccountId, creditAccountId, and amount. Legacy accountId/debitAmount/creditAmount payload is not supported.'
		);
	}

	const debitAccountId = asOptionalString(payload.debitAccountId);
	const creditAccountId = asOptionalString(payload.creditAccountId);
	const amount = asNonNegativeNumber(payload.amount);
	const memo = asOptionalString(payload.memo);

	if (!debitAccountId || !creditAccountId) {
		throw new BootstrapValidationError('debitAccountId and creditAccountId are required to create a postable journal.');
	}

	if (debitAccountId === creditAccountId) {
		throw new BootstrapValidationError('debitAccountId and creditAccountId must refer to different accounts.');
	}

	if (amount === null || amount <= 0) {
		throw new BootstrapValidationError('amount must be greater than zero to create a postable journal.');
	}

	return { debitAccountId, creditAccountId, amount, memo };
}

export function assertPostableBootstrapJournal(linesCreated: number, spec: BootstrapJournalSpec): void {
	if (linesCreated < 2) {
		throw new BootstrapValidationError('Bootstrap journal creation failed to create both debit and credit lines.');
	}

	if (spec.debitAccountId === spec.creditAccountId) {
		throw new BootstrapValidationError('Bootstrap journal must affect at least two accounts.');
	}

	if (spec.amount <= 0) {
		throw new BootstrapValidationError('Bootstrap journal amount must be greater than zero.');
	}
}
