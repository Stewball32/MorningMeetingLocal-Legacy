/// <reference path="../pb_data/types.d.ts" />

// Birthdays and other names for built-in holidays.
//
// 1. people.birthday: a person's birthday as 'MM-DD' (no year), or '' for none. The calendar slide
//    shows the birthdays of active people every year (Feb 29 on Feb 28 when the year has none).
// 2. calendar_observances.display_name: on a built-in holiday's settings record (a record with no
//    dates), the name the calendar shows instead of the built-in one (e.g. "Thanksgiving Break"
//    for "Thanksgiving Day"). The record's `name` still says which holiday it is for.
//
// Both fields are new and optional: nothing stored today can make it fail.
//
// Rolling back: see DEPLOY.md section C2 (`pocketbase migrate down` reverts the newest migrations
// first, so this one is the 1st). It drops both fields with what was typed into them. A birthday
// changes its person's record, so the people migration's down step then refuses (as for any other
// change to people) unless MM_PEOPLE_FORCE_DOWN=1. PocketBase exits with status 0 even when a
// migration fails, so check that it printed "Reverted 1795344908_birthdays_and_holiday_names.js"
// (or "Applied ..." when migrating up).

migrate(
	(app) => {
		const PEOPLE_ID = 'pbc_1795321340';
		const OBSERVANCES_ID = 'pbc_326962381';

		const people = app.findCollectionByNameOrId(PEOPLE_ID);
		if (!people.fields.getByName('birthday')) {
			people.fields.add(
				new Field({
					hidden: false,
					id: 'text1795344908',
					name: 'birthday',
					type: 'text',
					// 'MM-DD'; the editor only offers days that exist (Feb 29 included)
					pattern: '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$',
					autogeneratePattern: '',
					min: 0,
					max: 5,
					presentable: false,
					primaryKey: false,
					required: false,
					system: false
				})
			);
			app.save(people);
		}

		const observances = app.findCollectionByNameOrId(OBSERVANCES_ID);
		if (!observances.fields.getByName('display_name')) {
			observances.fields.add(
				new Field({
					hidden: false,
					id: 'text1795344909',
					name: 'display_name',
					type: 'text',
					pattern: '',
					autogeneratePattern: '',
					min: 0,
					max: 100,
					presentable: false,
					primaryKey: false,
					required: false,
					system: false
				})
			);
			app.save(observances);
		}
	},
	(app) => {
		const PEOPLE_ID = 'pbc_1795321340';
		const OBSERVANCES_ID = 'pbc_326962381';

		const observances = app.findCollectionByNameOrId(OBSERVANCES_ID);
		if (observances.fields.getByName('display_name')) {
			observances.fields.removeByName('display_name');
			app.save(observances);
		}

		const people = app.findCollectionByNameOrId(PEOPLE_ID);
		if (people.fields.getByName('birthday')) {
			people.fields.removeByName('birthday');
			app.save(people);
		}
	}
);
