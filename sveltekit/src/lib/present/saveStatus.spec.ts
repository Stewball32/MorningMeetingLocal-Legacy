import { describe, expect, it, vi } from 'vitest';
import { clearSaveError, reportSaveError, saveStatus } from './saveStatus.svelte.ts';

describe('save banner', () => {
	it('is cleared only by a save of the same kind, or by closing it', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		reportSaveError(new Error('offline'), "Dora's attendance", false, 'attendance:dora');
		expect(saveStatus.message).not.toBe('');
		clearSaveError('class_dailies');
		expect(saveStatus.message).not.toBe('');
		clearSaveError('attendance:dora');
		expect(saveStatus.message).toBe('');

		reportSaveError(new Error('offline'), undefined, true, 'class_dailies');
		clearSaveError();
		expect(saveStatus).toEqual({ message: '', source: '' });
	});
});
