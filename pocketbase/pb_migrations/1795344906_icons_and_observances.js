/// <reference path="../pb_data/types.d.ts" />

// Icons and calendar observances, for the Icons and Calendar Observances editor pages.
//
// 1. calendar_observances.icon: an observance can show a picture from the Icons page. Its own
//    uploaded picture, if it has one, still comes first. Deleting an icon only clears this field.
// 2. calendar_observances.hidden: on a built-in holiday's settings record (a record with no
//    dates), hides that holiday from the calendar (e.g. Tax Day). Off for every existing record.
// 3. icons.image takes the same picture types as people.avatar (files already stored are not
//    checked again) and is no longer "protected" (the view rule is public, so its files never
//    needed a token anyway).
// 4. guest_dailies: the unique index for one-off guests (date, name, icon, person) only covers
//    check-ins that have an icon. Deleting an icon clears it from the check-ins that used it; two
//    same-named one-off guests on one day then both had no icon, which the old index refused, so
//    the icon could not be deleted. Regular guests stay once a day through
//    idx_guest_dailies_date_person.
//
// Everything is added or relaxed: nothing stored today can make it fail.
//
// Rolling back: see DEPLOY.md section C2 for the order (`pocketbase migrate down` reverts the
// newest migrations first, so the ones after this one go before it). It refuses (and changes
// nothing) once icon deletes have left same-day, same-name one-off guests without an icon, which
// the old index doesn't allow; restore the pb_data copy taken before the update instead.
// PocketBase exits with status 0 even when a migration fails, so check that it printed
// "Reverted 1795344906_icons_and_observances.js" (or "Applied ..." when migrating up).

migrate(
	(app) => {
		const ICONS_ID = 'pbc_423132189';
		const OBSERVANCES_ID = 'pbc_326962381';
		const GUEST_DAILIES_ID = 'pbc_4221468678';
		const GUEST_UNIQUE = '`idx_SKPwrroDQD`';
		// Appended to the index as it is, so the down step can take it off again character for
		// character (the people migration's own down step edits this index text too).
		const ICON_ONLY = " WHERE `avatar` != ''";

		const observances = app.findCollectionByNameOrId(OBSERVANCES_ID);
		if (!observances.fields.getByName('icon')) {
			observances.fields.add(
				new Field({
					hidden: false,
					id: 'relation1704208859', // the id gen 3 gave its calendar.icon field
					name: 'icon',
					type: 'relation',
					collectionId: ICONS_ID,
					cascadeDelete: false, // deleting an icon only clears it here
					maxSelect: 1,
					minSelect: 0,
					presentable: false,
					required: false,
					system: false
				})
			);
		}
		if (!observances.fields.getByName('hidden')) {
			observances.fields.add(
				new Field({
					hidden: false,
					id: 'bool1795344906',
					name: 'hidden',
					type: 'bool',
					presentable: false,
					required: false,
					system: false
				})
			);
		}
		app.save(observances);

		const icons = app.findCollectionByNameOrId(ICONS_ID);
		const image = icons.fields.getByName('image');
		if (!image) throw new Error('icons_and_observances migration: icons.image not found');
		image.mimeTypes = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'];
		image.protected = false;
		app.save(icons);

		const guestDailies = app.findCollectionByNameOrId(GUEST_DAILIES_ID);
		const indexes = JSON.parse(JSON.stringify(guestDailies.indexes));
		const at = indexes.findIndex((sql) => sql.includes(GUEST_UNIQUE));
		if (at === -1)
			throw new Error('icons_and_observances migration: guest_dailies unique index not found');
		if (!indexes[at].endsWith(ICON_ONLY)) {
			if (/\bwhere\b/i.test(indexes[at]))
				throw new Error(
					`icons_and_observances migration: unexpected guest_dailies index: ${indexes[at]}`
				);
			indexes[at] += ICON_ONLY;
			unmarshal({ indexes }, guestDailies);
			app.save(guestDailies);
		}
	},
	(app) => {
		const ICONS_ID = 'pbc_423132189';
		const OBSERVANCES_ID = 'pbc_326962381';
		const GUEST_DAILIES_ID = 'pbc_4221468678';
		const GUEST_UNIQUE = '`idx_SKPwrroDQD`';
		const ICON_ONLY = " WHERE `avatar` != ''";

		// The old index covers check-ins without an icon too. Find the ones it would refuse before
		// changing anything, and say so instead of failing halfway.
		const clashes = arrayOf(new DynamicModel({ date: '', name: '', n: 0 }));
		app
			.db()
			.newQuery(
				`SELECT date, name, count(*) AS n FROM guest_dailies WHERE avatar = ''
				 GROUP BY date, name, person HAVING count(*) > 1 ORDER BY date, name`
			)
			.all(clashes);
		if (clashes.length > 0) {
			const examples = clashes
				.slice(0, 3)
				.map((row) => `${row.n} x "${row.name}" on ${row.date}`)
				.join(', ');
			throw new Error(
				`icons_and_observances migration: not rolling back. On ${clashes.length} day(s) one-off ` +
					`guests with the same name were checked in without an icon (${examples}${clashes.length > 3 ? ', ...' : ''}), ` +
					'because an icon they used was deleted; the old guest_dailies index does not allow that. ' +
					'Nothing was changed. Restore the pb_data copy taken before the update instead.'
			);
		}

		const guestDailies = app.findCollectionByNameOrId(GUEST_DAILIES_ID);
		const indexes = JSON.parse(JSON.stringify(guestDailies.indexes));
		const at = indexes.findIndex((sql) => sql.includes(GUEST_UNIQUE));
		if (at !== -1 && indexes[at].endsWith(ICON_ONLY)) {
			indexes[at] = indexes[at].slice(0, -ICON_ONLY.length);
			unmarshal({ indexes }, guestDailies);
			app.save(guestDailies);
		}

		const icons = app.findCollectionByNameOrId(ICONS_ID);
		const image = icons.fields.getByName('image');
		if (image) {
			image.mimeTypes = [];
			image.protected = true;
			app.save(icons);
		}

		const observances = app.findCollectionByNameOrId(OBSERVANCES_ID);
		observances.fields.removeByName('icon');
		observances.fields.removeByName('hidden');
		app.save(observances);
	}
);
