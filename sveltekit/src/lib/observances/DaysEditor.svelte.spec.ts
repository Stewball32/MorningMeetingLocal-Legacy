// The Days editor in a page (jsdom): what is waiting to be added in each kind of day, Clear, Edit
// (its start and end), the quick pick's Fill in, and fixing rules written in the dashboard.
// The keyboard on a real select (each arrow key is a `change`) is checked in the browsers.
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeAll, describe, expect, it } from 'vitest';
import DaysEditor from './DaysEditor.svelte';
import { entryFromSaved, savedDates, type DayEntry } from './dates.ts';

const TODAY = new Date(2026, 10, 22, 15, 30); // Sun Nov 22, 2026, afternoon

beforeAll(() => {
	// jsdom has no layout.
	Element.prototype.scrollIntoView = () => {};
});

function setup(saved: unknown[] = []) {
	let entries: DayEntry[] = saved.map((value) => entryFromSaved(value, TODAY));
	const names: string[] = [];
	const view = render(DaysEditor, {
		entries,
		today: TODAY,
		onChange: (next: DayEntry[]) => {
			entries = next;
			void view.rerender({ entries: next });
		},
		onPickName: (name: string) => names.push(name)
	});
	const root = view.container;
	const q = <T extends Element = HTMLElement>(selector: string) =>
		root.querySelector<T & HTMLElement>(selector);
	const qa = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
	const settle = async () => {
		await tick();
		await tick();
	};
	return {
		q,
		names,
		get entries() {
			return entries;
		},
		saved: () => savedDates(entries),
		pending: () => view.component.pendingPick(),
		message: () => q('[data-days-message]')?.textContent?.trim() ?? '',
		problem: () => q('[data-days-problem]')?.textContent?.trim() ?? '',
		rows: () => qa('li[data-day]').map((li) => li.textContent!.replace(/\s+/g, ' ').trim()),
		shownKind: () => q<HTMLInputElement>('[data-day-kinds] input:checked')?.value,
		waitingKinds: () =>
			qa('[data-day-kinds] input[data-pending]').map((input) => (input as HTMLInputElement).value),
		async kind(value: string) {
			const radio = q<HTMLInputElement>(`[data-day-kinds] input[value="${value}"]`)!;
			radio.checked = true;
			await fireEvent.change(radio);
			await settle();
		},
		/** Sets the nth select of the rule builder, as a person does. */
		async choose(index: number, value: string) {
			const select = qa('[data-rule-builder] select')[index] as HTMLSelectElement;
			select.value = value;
			await fireEvent.change(select);
			await settle();
		},
		async type(selector: string, value: string) {
			const input = q<HTMLInputElement>(selector)!;
			input.value = value;
			await fireEvent.input(input);
			await settle();
		},
		async click(selector: string, text?: string) {
			const button = qa(selector).find((b) => !text || b.textContent!.includes(text));
			if (!button) throw new Error(`no ${selector} ${text ?? ''}`);
			await fireEvent.click(button);
			await settle();
		},
		async edit(startsWith: string) {
			const li = qa('li[data-day]').find((l) => l.textContent!.trim().startsWith(startsWith));
			await fireEvent.click(li!.querySelector('[data-edit-day]')!);
			await settle();
		},
		async pick(rule: string) {
			const select = q<HTMLSelectElement>('[data-quick-pick]')!;
			select.value = rule;
			await fireEvent.change(select);
			await settle();
		}
	};
}

describe('Quick pick', () => {
	it('choosing in the list fills in nothing (a closed select changes with every arrow key)', async () => {
		const t = setup();
		await t.pick('chinese 01-0-01');
		await t.pick('chinese 08-0-15');
		expect(t.shownKind()).toBe('date');
		expect(t.names).toEqual([]);
		expect(t.message()).toBe('');
		expect(t.pending()).toBe('');
		expect(t.q<HTMLButtonElement>('[data-quick-fill]')!.disabled).toBe(false);
	});

	it('Fill in uses the one chosen, then the list starts again', async () => {
		const t = setup();
		expect(t.q<HTMLButtonElement>('[data-quick-fill]')!.disabled).toBe(true);
		await t.pick('15 Nisan');
		await t.click('[data-quick-fill]');
		expect(t.shownKind()).toBe('calendar');
		expect(t.q('[data-rule-words]')?.textContent).toBe('Every year on 15 Nisan (Hebrew calendar)');
		expect(t.names).toEqual(['Passover']);
		expect(t.message()).toMatch(/^Filled in Passover \(first day\): Every year on 15 Nisan/);
		expect(t.q<HTMLSelectElement>('[data-quick-pick]')!.value).toBe('');
		expect(t.q<HTMLButtonElement>('[data-quick-fill]')!.disabled).toBe(true);
		// Filled in and not added: waiting.
		expect(t.pending()).toMatch(/You set up “Every year on 15 Nisan \(Hebrew calendar\)”/);
	});

	it('says which day set up (and not added) it replaces', async () => {
		const t = setup();
		await t.kind('weekday');
		await t.choose(2, '10'); // the 1st Monday in October
		await t.pick('Sunday after 1st Monday in September');
		await t.click('[data-quick-fill]');
		expect(t.message()).toBe(
			"Filled in Grandparents' Day: Every year on the Sunday after the 1st Monday in September (instead of “Every year on the 1st Monday in October”, which wasn't added). Check it, then press Add day."
		);
	});
});

describe('what is waiting to be added', () => {
	it('only the kinds set up count: switching kinds alone sets nothing up', async () => {
		const t = setup(['2026-12-10']);
		await t.kind('weekday');
		await t.choose(2, '5'); // May
		expect(t.pending()).toBe(
			"You set up “Every year on the 1st Monday in May” but didn't add it: press Add day, or Clear to leave it out."
		);
		await t.kind('easter');
		// Easter Sunday wasn't touched: only the weekday one waits, and says where it is.
		expect(t.pending()).toBe(
			"You set up “Every year on the 1st Monday in May” but didn't add it: choose “A weekday of a month”, then press Add day, or Clear to leave it out."
		);
		expect(t.waitingKinds()).toEqual(['weekday']);
		expect(t.q('[data-day-kinds] [data-kind-waiting]')?.textContent?.trim()).toBe('· not added');
		await t.kind('calendar');
		await t.kind('advanced');
		await t.kind('date');
		expect(t.waitingKinds()).toEqual(['weekday']);
	});

	it('Clear leaves a day set up out (also one put back to how it started)', async () => {
		const t = setup(['2026-12-10']);
		await t.kind('calendar');
		expect(t.q('[data-clear-rule]')).toBeNull();
		await t.choose(0, 'islamic');
		await t.choose(0, 'hebrew');
		expect(t.pending()).toMatch(/You set up “Every year on 1 Tishrei \(Hebrew calendar\)”/);
		await t.click('[data-clear-rule]');
		expect(t.pending()).toBe('');
		expect(t.q('[data-clear-rule]')).toBeNull();
		expect(t.message()).toBe('Cleared Another calendar: nothing set up there.');
		expect(t.saved()).toEqual(['2026-12-10']);
	});

	it('a date picked but not added still counts once another kind is shown', async () => {
		const t = setup(['2026-12-11']);
		await t.type('[data-days] input[type="date"]', '2026-12-14');
		await t.kind('easter');
		await t.kind('advanced');
		expect(t.pending()).toBe(
			"You picked Mon, Dec 14, 2026 but didn't add it: choose “On a date”, then press Add day."
		);
		expect(t.waitingKinds()).toEqual(['date']);
		await t.kind('date');
		expect(t.pending()).toBe("You picked Mon, Dec 14, 2026 but didn't add it: press Add day.");
		expect(t.waitingKinds()).toEqual([]);
		expect(t.q('[data-add-day]')?.hasAttribute('data-pending')).toBe(true);
	});

	it('once added, a kind waits no more; its choices stay for a similar day', async () => {
		const t = setup();
		await t.kind('weekday');
		await t.choose(0, '3');
		await t.click('[data-add-rule]');
		expect(t.saved()).toEqual(['3rd Monday in January']);
		expect(t.pending()).toBe('');
		expect(t.q<HTMLSelectElement>('[data-rule-builder] select')!.value).toBe('3');
	});
});

describe('Edit', () => {
	it('waits while something is set up and not added (it would be lost)', async () => {
		const t = setup(['easter -2']);
		await t.kind('weekday');
		await t.choose(2, '10');
		await t.edit('Every year 2 days before');
		expect(t.problem()).toBe(
			"You set up “Every year on the 1st Monday in October” but didn't add it: press Add day, or Clear to leave it out. Then press Edit again."
		);
		expect(t.q('li[data-editing]')).toBeNull();
		await t.click('[data-clear-rule]');
		await t.edit('Every year 2 days before');
		expect(t.q('li[data-editing]')).not.toBeNull();
		expect(t.shownKind()).toBe('easter');
	});

	it('waits while another change is not saved', async () => {
		const t = setup(['easter -2', '1 Shawwal']);
		await t.edit('Every year 2 days before');
		await t.choose(0, 'after');
		await t.edit('Every year on 1 Shawwal');
		expect(t.problem()).toMatch(
			/^You changed Every year 2 days before Easter Sunday but didn't save the change: press Save change, or Cancel\. Then press Edit again\.$/
		);
		await t.click('[data-rule-builder] button', 'Cancel');
		await t.edit('Every year on 1 Shawwal');
		expect(t.shownKind()).toBe('calendar');
	});

	it('ends with an empty builder: what it filled in other kinds is not left waiting', async () => {
		const t = setup(['07-04 if Saturday then previous Friday if Sunday then next Monday']);
		await t.edit('Every year on Jul 4');
		expect(t.q<HTMLInputElement>('[data-days] input[type="date"]')!.value).toBe('2027-07-04');
		await t.kind('weekday');
		await t.click('[data-add-rule]', 'Save change');
		expect(t.saved()).toEqual(['1st Monday in January']);
		expect(t.pending()).toBe('');
		await t.kind('date');
		expect(t.q<HTMLInputElement>('[data-days] input[type="date"]')!.value).toBe('');
		expect(t.q('[data-weekend]')).toBeNull();
		expect(t.pending()).toBe('');
	});

	it('Cancel after a quick pick leaves no Advanced text behind', async () => {
		const t = setup(['03-02 in even years']);
		await t.edit('03-02 in even years');
		await t.pick('14 AdarII');
		await t.click('[data-quick-fill]');
		expect(t.message()).toMatch(/Check it, then press Save change\.$/);
		await t.click('[data-add-rule]', 'Save change');
		expect(t.saved()).toEqual(['14 AdarII']);
		await t.kind('advanced');
		expect(t.q<HTMLInputElement>('[data-advanced]')!.value).toBe('');
		expect(t.pending()).toBe('');
	});

	it('a lowercase rule from the dashboard, opened and not changed, is no change', async () => {
		const lower = '07-04 if saturday then previous friday if sunday then next monday';
		const t = setup([lower]);
		await t.edit('Every year on Jul 4');
		expect(t.shownKind()).toBe('date');
		expect(t.pending()).toBe('');
		expect(t.q('[data-add-day]')?.hasAttribute('data-pending')).toBe(false);
		await t.click('[data-add-day]');
		expect(t.message()).toBe('No change.');
		expect(t.saved()).toEqual([lower]);
	});
});

describe('rules written in the dashboard', () => {
	for (const [saved, fixed, words] of [
		['easter  -2', 'easter -2', 'Every year 2 days before Easter Sunday'],
		['3rd Monday  in January', '3rd Monday in January', 'Every year on the 3rd Monday in January']
	])
		it(`fixes '${saved}' (a double space) with Edit, then Save change`, async () => {
			const t = setup([saved]);
			expect(t.rows()[0]).toMatch(/it has extra spaces/);
			await t.edit(saved);
			expect(t.q<HTMLInputElement>('[data-advanced]')!.value).toBe(saved);
			// Opened, nothing typed: nothing waits.
			expect(t.pending()).toBe('');
			expect(t.q('[data-rule-tidy]')?.textContent).toMatch(/single spaces/);
			await t.click('[data-add-rule]', 'Save change');
			expect(t.message()).toBe(`Changed ${saved} to ${words}.`);
			expect(t.saved()).toEqual([fixed]);
			expect(t.rows()[0]).not.toMatch(/can't read/);
		});

	it('fixes it when retyped with single spaces too', async () => {
		const t = setup(['easter  -2']);
		await t.edit('easter');
		await t.type('[data-advanced]', 'easter -2');
		expect(t.pending()).toMatch(/^You changed easter {2}-2 but didn't save the change/);
		await t.click('[data-add-rule]', 'Save change');
		expect(t.saved()).toEqual(['easter -2']);
	});

	it('keeps one that is fine, or one only its writer can fix, exactly as it was', async () => {
		const t = setup(['Friday before 01-01', 42, 'nonsense']);
		await t.edit('Friday before 01-01');
		await t.type('[data-advanced]', 'Friday  before 01-01');
		expect(t.pending()).toBe('');
		await t.click('[data-add-rule]', 'Save change');
		expect(t.message()).toBe('No change.');
		await t.edit('42');
		await t.click('[data-add-rule]', 'Save change');
		expect(t.message()).toBe('No change.');
		await t.edit('nonsense');
		await t.click('[data-add-rule]', 'Save change');
		expect(t.message()).toBe('No change.');
		expect(t.saved()).toEqual(['Friday before 01-01', 42, 'nonsense']);
	});

	it("a weekday's small first letter is the same day already in the list", async () => {
		const t = setup(['3rd Monday in January']);
		await t.kind('advanced');
		await t.type('[data-advanced]', '3rd monday in January');
		await t.click('[data-add-rule]');
		expect(t.problem()).toBe('Every year on the 3rd Monday in January is already in the list.');
		expect(t.saved()).toEqual(['3rd Monday in January']);
		// Already in the list, so not waiting either.
		expect(t.pending()).toBe('');
	});

	it('one that starts years from now shows that day', async () => {
		const t = setup(['11-20 since 2040', '11-20 prior to 2020']);
		expect(t.rows()[0]).toMatch(/^11-20 since 2040 \(next: Tue, Nov 20, 2040\)/);
		expect(t.rows()[1]).toMatch(/^11-20 prior to 2020 \(doesn't come again\)/);
	});
});

describe('Another calendar', () => {
	it('offers the days each Hebrew month has, and warns only where a 30th may not come', async () => {
		const t = setup();
		await t.kind('calendar');
		const daySelect = () =>
			t.q('[data-rule-builder]')!.querySelectorAll('select')[1] as HTMLSelectElement;
		await t.choose(2, 'Elul');
		expect(daySelect().options.length).toBe(29);
		await t.choose(2, 'Tishrei');
		expect(daySelect().options.length).toBe(30);
		await t.choose(1, '30');
		expect(t.q('[data-calendar-hint]')?.textContent).not.toMatch(/no day 30/);
		await t.choose(2, 'Cheshvan');
		expect(t.q('[data-calendar-hint]')?.textContent).toMatch(/no day 30/);
		// Moving to a shorter month keeps the day within it.
		await t.choose(2, 'Tamuz');
		expect(daySelect().value).toBe('29');
	});
});
