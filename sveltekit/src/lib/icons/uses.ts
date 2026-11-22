// Where an icon can be used. Each use is one switch on every row and in the form, one group in
// the list, and one kind of record counted before an icon is deleted. Everything on the Icons
// page is built from this table.
//
// Adding a use later (say "Feelings", if the emotions come back) is one more entry here plus one
// migration that adds its `for_*` bool to `icons` (and the relation that points at icons, e.g.
// feelings.icon), and its field in IconRecord (#lib/pb/types.ts).
import type { IconRecord } from '#lib/pb/types.ts';

/** An icon's switch field for a use. */
export type UseField = 'for_guests' | 'for_calendar';

export interface Use {
	/** Identifies the use (and its group in the list). */
	key: string;
	/** The icon's bool field: on means the icon is offered for this use. */
	field: UseField;
	/** The switch's label. */
	label: string;
	/** The list group's title. */
	group: string;
	/** The list group's description. */
	description: string;
	/** Under the switch in the form. */
	help: string;
	/** The group's Add button. */
	addLabel: string;
	/** The records that point at an icon for this use, counted before a delete. */
	usedBy: {
		collection: string;
		/** Their relation field to icons. */
		field: string;
		/** "guest check-in": the counted thing (plural with an "s"). */
		thing: string;
		/** What happens to them when the icon is deleted. */
		afterDelete: string;
	};
	/** The message after the switch was turned on in the list; `name` is the icon's. */
	turnedOn: (name: string) => string;
	/** The message after the switch was turned off in the list. */
	turnedOff: (name: string) => string;
}

export const USES = [
	{
		key: 'guests',
		field: 'for_guests',
		label: 'Guests',
		group: 'For guests',
		description:
			'Offered to one-off guests when they check in (Add Guest on the guest page). Guests need a picture.',
		help: 'Offered to guests when they check in. Needs a picture.',
		addLabel: 'Add guest icon',
		usedBy: {
			collection: 'guest_dailies',
			field: 'avatar',
			thing: 'guest check-in',
			afterDelete: 'past guest check-ins that used it show the default picture instead'
		},
		turnedOn: (name) => `${name} is now offered to guests when they check in.`,
		turnedOff: (name) => `${name} is no longer offered to guests. Past check-ins keep its picture.`
	},
	{
		key: 'calendar',
		field: 'for_calendar',
		label: 'Calendar',
		group: 'For the calendar',
		description:
			'Offered as the picture of a calendar observance (on the Calendar Observances page).',
		help: 'Offered as the picture of a calendar observance.',
		addLabel: 'Add calendar icon',
		usedBy: {
			collection: 'calendar_observances',
			field: 'icon',
			thing: 'calendar observance',
			afterDelete:
				'calendar observances that used it lose this picture (they show their own picture or the default one)'
		},
		turnedOn: (name) => `${name} can now be picked for calendar observances.`,
		turnedOff: (name) =>
			`${name} is no longer offered for calendar observances. Observances that use it keep its picture.`
	}
] as const satisfies readonly Use[];

export type UseKey = (typeof USES)[number]['key'];

/** How many records use an icon, by use (e.g. { guests: 12, calendar: 1 }). */
export type UseCounts = Record<UseKey, number>;

/** The uses an icon is switched on for, in table order. */
export function usesOf(icon: Pick<IconRecord, UseField>): Use[] {
	return USES.filter((use) => icon[use.field]);
}

/** The use with this switch field. */
export function useOf(field: UseField): Use {
	const use = USES.find((candidate) => candidate.field === field);
	if (!use) throw new Error(`Unknown icon use: ${field}`);
	return use;
}

/** Every switch off: what "Turn off instead" sends (only the ones that are on now). */
export function allOff(icon: Pick<IconRecord, UseField>): Partial<Record<UseField, false>> {
	return Object.fromEntries(usesOf(icon).map((use) => [use.field, false]));
}
