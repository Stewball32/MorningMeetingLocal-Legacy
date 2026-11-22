/// <reference path="../pb_data/types.d.ts" />

// One class_dailies record per date: a unique index on `date`.
//
// Without it, two screens opening the presenter at the same moment on a new day could each create
// a record for the day, and then overwrite each other's saved answers.
//
// Up first merges any dates that already have several records, so the index can be created:
// - the earliest created record is kept (older presenters look a day's record up by date and get
//   that one);
// - each field (slide, attendance, calendar) gets the value of the most recently updated record
//   that has one (not 0, null, "" or an empty {} / []);
// - the other records of that date are deleted;
// - every merge is printed.
//
// Down only drops the index; merged records stay merged (the pb_data backup taken before deploying
// is the way back). Run `pocketbase migrate down 1` while this file is the newest one in
// pb_migrations. PocketBase exits with status 0 even when a migration fails: check that it printed
// "Applied 1795344907_class_dailies_unique_date.js" (or "Reverted ...").

const INDEX = 'idx_class_dailies_date';

migrate(
	(app) => {
		const duplicates = arrayOf(new DynamicModel({ date: '', n: 0 }));
		app
			.db()
			.newQuery('SELECT date, COUNT(*) AS n FROM class_dailies GROUP BY date HAVING COUNT(*) > 1')
			.all(duplicates);

		const isEmpty = (field, value) => {
			if (field === 'slide') return !value;
			let parsed;
			try {
				parsed = JSON.parse(value);
			} catch (_) {
				return !value;
			}
			if (parsed === null || parsed === '') return true;
			if (Array.isArray(parsed)) return parsed.length === 0;
			if (typeof parsed === 'object') return Object.keys(parsed).length === 0;
			return false;
		};

		let removed = 0;
		for (const duplicate of duplicates) {
			const date = duplicate.date;
			const rows = arrayOf(
				new DynamicModel({
					id: '',
					slide: 0,
					attendance: '',
					calendar: '',
					created: '',
					updated: ''
				})
			);
			app
				.db()
				.newQuery(
					`SELECT id, COALESCE(slide, 0) AS slide, COALESCE(attendance, 'null') AS attendance,
						COALESCE(calendar, 'null') AS calendar, created, updated
					FROM class_dailies WHERE date = {:date} ORDER BY updated DESC, id DESC`
				)
				.bind({ date })
				.all(rows);
			if (rows.length < 2) continue;

			const byCreated = rows
				.slice()
				.sort((a, b) =>
					a.created === b.created ? (a.id < b.id ? -1 : 1) : a.created < b.created ? -1 : 1
				);
			const keep = byCreated[0];
			const merged = {};
			const sources = [];
			for (const field of ['slide', 'attendance', 'calendar']) {
				const source = rows.find((row) => !isEmpty(field, row[field])) || keep;
				merged[field] = source[field];
				sources.push(`${field} from ${source.id}`);
			}
			const others = rows.filter((row) => row.id !== keep.id).map((row) => row.id);

			app
				.db()
				.newQuery(
					`UPDATE class_dailies SET slide = {:slide}, attendance = {:attendance},
						calendar = {:calendar}, updated = {:updated} WHERE id = {:id}`
				)
				.bind(Object.assign({}, merged, { updated: rows[0].updated, id: keep.id }))
				.execute();
			app
				.db()
				.newQuery('DELETE FROM class_dailies WHERE date = {:date} AND id != {:id}')
				.bind({ date, id: keep.id })
				.execute();
			removed += others.length;
			console.log(
				`class_dailies migration: ${date} had ${rows.length} records; kept ${keep.id} ` +
					`(${sources.join(', ')}), deleted ${others.join(', ')}`
			);
		}
		if (removed > 0) console.log(`class_dailies migration: deleted ${removed} duplicate records`);

		const collection = app.findCollectionByNameOrId('class_dailies');
		const indexes = JSON.parse(JSON.stringify(collection.indexes)).filter(
			(sql) => !sql.includes(INDEX)
		);
		indexes.push(`CREATE UNIQUE INDEX \`${INDEX}\` ON \`class_dailies\` (\`date\`)`);
		unmarshal({ indexes }, collection);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('class_dailies');
		const indexes = JSON.parse(JSON.stringify(collection.indexes)).filter(
			(sql) => !sql.includes(INDEX)
		);
		unmarshal({ indexes }, collection);
		app.save(collection);
	}
);
