// What the presenter's banner says when a save didn't go through. Any slide can report a failed
// save here; the presenter page shows the message and clears it once saving works again.

import { describeSaveError } from './saveError.ts';

export const saveStatus = $state({ message: '' });

/** Reports a failed save. `what` says what wasn't saved, e.g. "Bluey's attendance". */
export const reportSaveError = (error: unknown, what?: string, retrying = false) => {
	console.error(error);
	saveStatus.message = describeSaveError(error, what, retrying);
};

/** Saving works again (or the teacher closed the message). */
export const clearSaveError = () => {
	saveStatus.message = '';
};
