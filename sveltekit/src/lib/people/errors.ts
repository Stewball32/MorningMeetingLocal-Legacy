// Turning PocketBase SDK errors into messages a teacher can act on.
import { FORM_FIELD_OF, type FormErrors } from './form.ts';

export interface Problem {
	/** A sentence for the message box. */
	message: string;
	/** PocketBase's validation errors, keyed by form field. */
	fields: FormErrors;
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

const isPbError = (error: unknown): error is PbErrorLike =>
	typeof error === 'object' &&
	error !== null &&
	typeof (error as { status?: unknown }).status === 'number' &&
	'response' in error;

export const OFFLINE_MESSAGE =
	"Can't reach PocketBase. Check that it is running (and this computer is on the classroom network), then try again.";

export interface DescribeOptions {
	/**
	 * The request was the Add / Edit form's, which shows PocketBase's validation errors next to
	 * its fields. Anything else (a delete, a switch in the list) has no fields to highlight, so the
	 * errors are only listed in the message.
	 */
	form?: boolean;
}

/**
 * Describes a failed PocketBase request. `doing` completes "Couldn't ...", e.g. "save Bluey".
 */
export function describeError(
	error: unknown,
	doing: string,
	{ form = false }: DescribeOptions = {}
): Problem {
	const problem: Problem = { message: '', fields: {}, offline: false, notFound: false };
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
		problem.message = `Couldn't ${doing}: this person no longer exists. They may have been deleted in another window.`;
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
			const field = form ? FORM_FIELD_OF[key] : undefined;
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
