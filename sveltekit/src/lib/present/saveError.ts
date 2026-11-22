/** True for errors that mean PocketBase couldn't be reached (down, restarting, no network). */
export const isUnreachable = (error: unknown) => {
	const e = (error as { status?: number; cause?: { status?: number } } | null) ?? {};
	const status = e.status ?? e.cause?.status;
	return status === 0 || (error instanceof TypeError && /fetch/i.test(error.message));
};

/**
 * The plain-words message for a save that didn't go through.
 * @param what - what wasn't saved, e.g. "Bluey's attendance"; defaults to "That change".
 * @param retrying - the change is kept and sent again once PocketBase is back.
 */
export const describeSaveError = (error: unknown, what = 'That change', retrying = false) => {
	const after = retrying
		? 'It will be saved as soon as PocketBase is back.'
		: 'Please try again in a moment.';
	if (isUnreachable(error)) return `${what} wasn't saved: can't reach PocketBase. ${after}`;
	const status = (error as { status?: number } | null)?.status;
	const code = status ? ` (error ${status})` : '';
	return `${what} wasn't saved: PocketBase refused it${code}. ${after}`;
};
