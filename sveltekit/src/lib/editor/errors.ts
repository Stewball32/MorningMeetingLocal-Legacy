// Turning PocketBase SDK errors into messages a teacher can act on.

/** A failed request, described for the page. */
export interface Problem<Field extends string = string> {
	/** A sentence for the message box. */
	message: string;
	/** PocketBase's validation errors, keyed by form field (only with DescribeOptions.fieldOf). */
	fields: Partial<Record<Field, string>>;
	/** PocketBase could not be reached at all. */
	offline: boolean;
	/** The record is gone (deleted somewhere else). */
	notFound: boolean;
}

interface PbErrorLike {
	status: number;
	isAbort?: boolean;
	response?: { message?: unknown; data?: unknown };
}

/** Whether `error` came from the PocketBase SDK (a ClientResponseError or something like it). */
export const isPbError = (error: unknown): error is PbErrorLike =>
	typeof error === 'object' &&
	error !== null &&
	typeof (error as { status?: unknown }).status === 'number' &&
	'response' in error;

export const OFFLINE_MESSAGE =
	"Can't reach PocketBase. Check that it is running (and this computer is on the classroom network), then try again.";

export interface DescribeOptions<Field extends string = string> {
	/**
	 * PocketBase field name -> form field, for an Add / Edit form's own request: validation errors
	 * for these fields go to `fields` (to show next to the inputs) and the message asks to fix the
	 * highlighted fields. Leave it out for anything else (a delete, a switch in the list): the
	 * errors are then only listed in the message.
	 */
	fieldOf?: Record<string, Field>;
	/** What the record is, for a 404: "this {noun} no longer exists". Default "record". */
	noun?: string;
	/** Starts the 404's second sentence: "{pronoun} may have been deleted ...". Default "It". */
	pronoun?: string;
}

/**
 * The `code` of each of PocketBase's validation errors, by PocketBase field name (e.g.
 * `{ name: 'validation_not_unique', emoji: 'validation_not_unique' }`), so a page can give its
 * own message for a case it knows (check this before describeError). Empty for other errors.
 */
export function validationCodes(error: unknown): Record<string, string> {
	const data = isPbError(error) ? error.response?.data : undefined;
	const codes: Record<string, string> = {};
	if (!data || typeof data !== 'object') return codes;
	for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
		if (value && typeof value === 'object' && 'code' in value)
			codes[key] = String((value as { code: unknown }).code);
	}
	return codes;
}

/**
 * Describes a failed PocketBase request. `doing` completes "Couldn't ...", e.g. "save Bluey".
 * People: `describeError(error, 'save Bluey', { noun: 'person', pronoun: 'They', fieldOf })`.
 */
export function describeError<Field extends string = string>(
	error: unknown,
	doing: string,
	{ fieldOf, noun = 'record', pronoun = 'It' }: DescribeOptions<Field> = {}
): Problem<Field> {
	const problem: Problem<Field> = { message: '', fields: {}, offline: false, notFound: false };
	if (!isPbError(error)) {
		const text = error instanceof Error ? error.message : String(error);
		problem.message = `Couldn't ${doing}: ${text}`;
		return problem;
	}

	if (error.status === 0 && !error.isAbort) {
		problem.offline = true;
		problem.message = `Couldn't ${doing}. ${OFFLINE_MESSAGE}`;
		return problem;
	}
	if (error.status === 404) {
		problem.notFound = true;
		problem.message = `Couldn't ${doing}: this ${noun} no longer exists. ${pronoun} may have been deleted in another window.`;
		return problem;
	}

	const data = error.response?.data;
	const unplaced: string[] = [];
	if (data && typeof data === 'object') {
		for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
			const text =
				value && typeof value === 'object' && 'message' in value
					? String((value as { message: unknown }).message)
					: String(value);
			const field = fieldOf?.[key];
			if (field) problem.fields[field] = text;
			else unplaced.push(`${key}: ${text}`);
		}
	}

	const pbMessage =
		typeof error.response?.message === 'string' && error.response.message
			? error.response.message
			: 'Something went wrong.';
	if (Object.keys(problem.fields).length > 0) {
		problem.message = `Couldn't ${doing}. Please fix the highlighted fields.`;
	} else {
		problem.message = `Couldn't ${doing}: ${pbMessage}`;
	}
	if (unplaced.length > 0) problem.message += ` (${unplaced.join('; ')})`;
	return problem;
}
