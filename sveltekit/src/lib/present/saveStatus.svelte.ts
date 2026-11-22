// What the presenter's banner says when a save didn't go through. Any slide can report a failed
// save here; the presenter page shows the message and clears it once that kind of save works again.

import { describeSaveError } from './saveError.ts';

/** `source` says which kind of save failed, e.g. 'class_dailies' or 'attendance:<person id>'. */
export const saveStatus = $state({ message: '', source: '' });

/** Reports a failed save. `what` says what wasn't saved, e.g. "Bluey's attendance". */
export const reportSaveError = (error: unknown, what?: string, retrying = false, source = '') => {
	console.error(error);
	saveStatus.message = describeSaveError(error, what, retrying);
	saveStatus.source = source;
};

/**
 * Clears the message: always when `source` is left out (the teacher closed it), otherwise only
 * if the message is about that kind of save (so a later class_dailies save doesn't hide that a
 * student's attendance still wasn't saved).
 */
export const clearSaveError = (source?: string) => {
	if (source !== undefined && saveStatus.source !== source) return;
	saveStatus.message = '';
	saveStatus.source = '';
};
