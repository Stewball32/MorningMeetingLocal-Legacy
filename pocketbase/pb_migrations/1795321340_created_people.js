/// <reference path="../pb_data/types.d.ts" />

// Students and teachers become one `people` collection (with a role), and their per-day
// attendance becomes one `people_dailies` collection. Guest check-ins can point at a person.
//
// Nothing is thrown away: record IDs (which class_dailies.attendance.currentPerson refers to),
// created/updated times and pictures are carried over, and the old collections are kept as
// legacy_* collections that only superusers can read.
//
// Rolling back: the real way back is the pb_data copy taken before deploying. The down migration
// only undoes a migration nobody has used yet; it refuses to run once people, attendance or guest
// links have changed (set MM_PEOPLE_FORCE_DOWN=1 to throw those changes away and run it anyway).
// Run `pocketbase migrate down 1` while this file is still in pb_migrations (with the people code
// still checked out): without it PocketBase reverts whichever migration comes before it instead.
// PocketBase exits with status 0 even when a migration fails, so check that it printed
// "Reverted 1795321340_created_people.js" (or "Applied ..." when migrating up).

migrate(
	(app) => {
		const PEOPLE_ID = 'pbc_1795321340';
		const PEOPLE_DAILIES_ID = 'pbc_1795321341';
		const STUDENTS_ID = 'pbc_856668217';
		const TEACHERS_ID = 'pbc_2907260911';
		const STUDENT_DAILIES_ID = 'pbc_2553608578';
		const TEACHER_DAILIES_ID = 'pbc_2259412331';
		const GUEST_DAILIES_ID = 'pbc_4221468678';
		const FEELINGS_ID = 'pbc_155896558';

		const idField = {
			autogeneratePattern: '[a-z0-9]{15}',
			hidden: false,
			id: 'text3208210256',
			max: 15,
			min: 15,
			name: 'id',
			pattern: '^[a-z0-9]+$',
			presentable: false,
			primaryKey: true,
			required: true,
			system: true,
			type: 'text'
		};
		const autodateFields = [
			{
				hidden: false,
				id: 'autodate2990389176',
				name: 'created',
				onCreate: true,
				onUpdate: false,
				presentable: false,
				system: false,
				type: 'autodate'
			},
			{
				hidden: false,
				id: 'autodate3332085495',
				name: 'updated',
				onCreate: true,
				onUpdate: true,
				presentable: false,
				system: false,
				type: 'autodate'
			}
		];

		const one = (sql) => {
			const row = new DynamicModel({ n: 0 });
			app.db().newQuery(sql).one(row);
			return row.n;
		};
		const run = (sql) => app.db().newQuery(sql).execute();

		// 1. New collections -------------------------------------------------------------------

		const people = new Collection({
			id: PEOPLE_ID,
			name: 'people',
			type: 'base',
			system: false,
			listRule: '',
			viewRule: '',
			createRule: '',
			updateRule: '',
			deleteRule: '',
			indexes: [],
			fields: [
				idField,
				{
					autogeneratePattern: '',
					hidden: false,
					id: 'text1579384326',
					max: 0,
					min: 0,
					name: 'name',
					pattern: '',
					presentable: true,
					primaryKey: false,
					required: true,
					system: false,
					type: 'text'
				},
				{
					hidden: false,
					id: 'select1466534506',
					maxSelect: 1,
					name: 'role',
					presentable: false,
					required: true,
					system: false,
					type: 'select',
					values: ['student', 'teacher']
				},
				{
					autogeneratePattern: '',
					hidden: false,
					id: 'text724990059',
					max: 0,
					min: 0,
					name: 'title',
					pattern: '',
					presentable: false,
					primaryKey: false,
					required: false,
					system: false,
					type: 'text'
				},
				{
					hidden: false,
					id: 'select1287425730',
					maxSelect: 1,
					name: 'pronoun',
					presentable: false,
					required: false,
					system: false,
					type: 'select',
					values: ['he', 'she']
				},
				{
					hidden: false,
					id: 'file376926767',
					maxSelect: 1,
					maxSize: 0,
					mimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'],
					name: 'avatar',
					presentable: false,
					protected: false,
					required: false,
					system: false,
					thumbs: [],
					type: 'file'
				},
				{
					autogeneratePattern: '',
					hidden: false,
					id: 'text700514382',
					max: 0,
					min: 0,
					name: 'video_id',
					pattern: '',
					presentable: false,
					primaryKey: false,
					required: false,
					system: false,
					type: 'text'
				},
				{
					hidden: false,
					id: 'number270228525',
					max: null,
					min: 0,
					name: 'video_start',
					onlyInt: true,
					presentable: false,
					required: false,
					system: false,
					type: 'number'
				},
				{
					hidden: false,
					id: 'number4200986293',
					max: null,
					min: 0,
					name: 'video_end',
					onlyInt: true,
					presentable: false,
					required: false,
					system: false,
					type: 'number'
				},
				{
					hidden: false,
					id: 'bool1795321343',
					name: 'is_guest',
					presentable: false,
					required: false,
					system: false,
					type: 'bool'
				},
				{
					hidden: false,
					id: 'bool1795321344',
					name: 'active',
					presentable: false,
					required: false,
					system: false,
					type: 'bool'
				},
				...autodateFields
			]
		});
		app.save(people);

		const peopleDailies = new Collection({
			id: PEOPLE_DAILIES_ID,
			name: 'people_dailies',
			type: 'base',
			system: false,
			listRule: '',
			viewRule: '',
			createRule: '',
			updateRule: '',
			deleteRule: '',
			indexes: [
				'CREATE UNIQUE INDEX `idx_people_dailies_date_person` ON `people_dailies` (`date`, `person`)',
				'CREATE INDEX `idx_people_dailies_person` ON `people_dailies` (`person`)'
			],
			fields: [
				idField,
				{
					autogeneratePattern: '',
					hidden: false,
					id: 'text2862495610',
					max: 0,
					min: 0,
					name: 'date',
					pattern: '^\\d{4}-\\d{2}-\\d{2}$',
					presentable: false,
					primaryKey: false,
					required: true,
					system: false,
					type: 'text'
				},
				{
					// Deleting a person deletes their attendance history with them.
					cascadeDelete: true,
					collectionId: PEOPLE_ID,
					hidden: false,
					id: 'relation1795321345',
					maxSelect: 1,
					minSelect: 0,
					name: 'person',
					presentable: false,
					required: true,
					system: false,
					type: 'relation'
				},
				{
					hidden: false,
					id: 'select1795321346',
					maxSelect: 1,
					name: 'here',
					presentable: false,
					required: false,
					system: false,
					type: 'select',
					values: ['present', 'absent']
				},
				{
					hidden: false,
					id: 'json1795321347',
					maxSize: 0,
					name: 'attendance',
					presentable: false,
					required: false,
					system: false,
					type: 'json'
				},
				{
					cascadeDelete: false,
					collectionId: FEELINGS_ID,
					hidden: false,
					id: 'relation1225036535',
					maxSelect: 999,
					minSelect: 0,
					name: 'feelings',
					presentable: false,
					required: false,
					system: false,
					type: 'relation'
				},
				...autodateFields
			]
		});
		app.save(peopleDailies);

		// A guest check-in may belong to a person marked is_guest. Like their attendance, deleting
		// the person deletes their guest check-ins with them.
		const guestDailies = app.findCollectionByNameOrId(GUEST_DAILIES_ID);
		guestDailies.fields.add(
			new Field({
				cascadeDelete: true,
				collectionId: PEOPLE_ID,
				hidden: false,
				id: 'relation1795321342',
				maxSelect: 1,
				minSelect: 0,
				name: 'person',
				presentable: false,
				required: false,
				system: false,
				type: 'relation'
			})
		);
		app.save(guestDailies);

		// One-off guests stay unique per date, name and icon. Two different regular guests may share
		// a name and icon (or both use their own picture), so `person` joins that index; on top of
		// it, a regular guest can check in only once a day (one-off guests have person = '').
		const guestIndexes = JSON.parse(JSON.stringify(guestDailies.indexes));
		const guestUnique = guestIndexes.findIndex((sql) => sql.includes('`idx_SKPwrroDQD`'));
		if (guestUnique === -1) throw new Error('people migration: guest_dailies unique index not found');
		guestIndexes[guestUnique] = guestIndexes[guestUnique].replace(/\)\s*$/, ', `person`)');
		guestIndexes.push(
			"CREATE UNIQUE INDEX `idx_guest_dailies_date_person` ON `guest_dailies` (`date`, `person`) WHERE `person` != ''"
		);
		unmarshal({ indexes: guestIndexes }, guestDailies);
		app.save(guestDailies);

		// 2. Copy the records (raw SQL so IDs and created/updated times survive) ---------------

		const clash = one(
			'SELECT count(*) AS n FROM students s JOIN teachers t ON s.id = t.id'
		);
		if (clash > 0) throw new Error(`people migration: ${clash} student/teacher IDs clash`);

		// Rows PocketBase itself should never have written; they are copied as they are, but say so.
		const warnings = {
			'dailies pointing at a missing student/teacher':
				one('SELECT count(*) AS n FROM student_dailies WHERE student NOT IN (SELECT id FROM students)') +
				one('SELECT count(*) AS n FROM teacher_dailies WHERE teacher NOT IN (SELECT id FROM teachers)'),
			'dailies whose date is not YYYY-MM-DD':
				one(`SELECT count(*) AS n FROM student_dailies WHERE date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`) +
				one(`SELECT count(*) AS n FROM teacher_dailies WHERE date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
			'people with an unknown pronoun':
				one(`SELECT count(*) AS n FROM students WHERE pronoun NOT IN ('he', 'she', '')`) +
				one(`SELECT count(*) AS n FROM teachers WHERE pronoun NOT IN ('he', 'she', '')`)
		};
		for (const [what, n] of Object.entries(warnings))
			if (n > 0) console.log(`people migration: warning: ${n} ${what} (copied unchanged)`);

		run(`INSERT INTO people
			(id, name, role, title, pronoun, avatar, video_id, video_start, video_end, is_guest, active, created, updated)
			SELECT id, name, 'student', '', pronoun, avatar, video_id, video_start, video_end, FALSE, TRUE, created, updated
			FROM students`);
		run(`INSERT INTO people
			(id, name, role, title, pronoun, avatar, video_id, video_start, video_end, is_guest, active, created, updated)
			SELECT id, name, 'teacher', title, pronoun, avatar, video_id, video_start, video_end, FALSE, TRUE, created, updated
			FROM teachers`);

		run(`INSERT INTO people_dailies (id, date, person, here, attendance, feelings, created, updated)
			SELECT id, date, student, here, attendance, '[]', created, updated FROM student_dailies`);
		// Daily IDs are only unique within their own collection; give any teacher daily whose ID a
		// student daily already uses a fresh one (nothing else refers to daily IDs).
		run(`INSERT INTO people_dailies (id, date, person, here, attendance, feelings, created, updated)
			SELECT
				CASE WHEN id IN (SELECT id FROM people_dailies) THEN substr(lower(hex(randomblob(8))), 1, 15) ELSE id END,
				date, teacher, here, NULL, feelings, created, updated
			FROM teacher_dailies`);

		const counts = {
			students: one('SELECT count(*) AS n FROM students'),
			teachers: one('SELECT count(*) AS n FROM teachers'),
			studentDailies: one('SELECT count(*) AS n FROM student_dailies'),
			teacherDailies: one('SELECT count(*) AS n FROM teacher_dailies'),
			people: one('SELECT count(*) AS n FROM people'),
			peopleDailies: one('SELECT count(*) AS n FROM people_dailies')
		};
		if (counts.people !== counts.students + counts.teachers)
			throw new Error(`people migration: copied ${counts.people} people, expected ${counts.students + counts.teachers}`);
		if (counts.peopleDailies !== counts.studentDailies + counts.teacherDailies)
			throw new Error(`people migration: copied ${counts.peopleDailies} dailies, expected ${counts.studentDailies + counts.teacherDailies}`);

		// 3. Keep the old collections, renamed and locked to superusers ------------------------

		for (const [id, name] of [
			[STUDENT_DAILIES_ID, 'legacy_student_dailies'],
			[TEACHER_DAILIES_ID, 'legacy_teacher_dailies'],
			[STUDENTS_ID, 'legacy_students'],
			[TEACHERS_ID, 'legacy_teachers']
		]) {
			const collection = app.findCollectionByNameOrId(id);
			const oldName = collection.name;
			const indexes = JSON.parse(JSON.stringify(collection.indexes)).map((sql) =>
				sql.replace(`ON \`${oldName}\``, `ON \`${name}\``)
			);
			unmarshal(
				{
					name,
					indexes,
					listRule: null,
					viewRule: null,
					createRule: null,
					updateRule: null,
					deleteRule: null
				},
				collection
			);
			app.save(collection);
		}

		// 4. Copy the pictures (storage key: <collectionId>/<recordId>/<filename>) -------------
		// Last, because files are not part of the database transaction: if anything above fails,
		// no copies are left behind. A failed run that did copy files can simply be re-run.

		const fsys = app.newFilesystem();
		try {
			const rows = arrayOf(new DynamicModel({ id: '', avatar: '', role: '' }));
			app.db().newQuery("SELECT id, avatar, role FROM people WHERE avatar != ''").all(rows);
			for (const row of rows) {
				const from = row.role === 'teacher' ? TEACHERS_ID : STUDENTS_ID;
				const src = `${from}/${row.id}/${row.avatar}`;
				const dst = `${PEOPLE_ID}/${row.id}/${row.avatar}`;
				if (!fsys.exists(src)) {
					console.log(`people migration: warning: missing picture ${src}, leaving it out`);
					app.db().newQuery("UPDATE people SET avatar = '' WHERE id = {:id}").bind({ id: row.id }).execute();
					continue;
				}
				if (!fsys.exists(dst)) fsys.copy(src, dst);
			}
		} finally {
			fsys.close();
		}

		console.log(
			`people migration: ${counts.students} students + ${counts.teachers} teachers -> ${counts.people} people; ` +
				`${counts.studentDailies} + ${counts.teacherDailies} dailies -> ${counts.peopleDailies} people_dailies`
		);
	},
	(app) => {
		const PEOPLE_ID = 'pbc_1795321340';
		const PEOPLE_DAILIES_ID = 'pbc_1795321341';
		const STUDENTS_ID = 'pbc_856668217';
		const TEACHERS_ID = 'pbc_2907260911';
		const STUDENT_DAILIES_ID = 'pbc_2553608578';
		const TEACHER_DAILIES_ID = 'pbc_2259412331';
		const GUEST_DAILIES_ID = 'pbc_4221468678';

		const one = (sql) => {
			const row = new DynamicModel({ n: 0 });
			app.db().newQuery(sql).one(row);
			return row.n;
		};

		// The legacy_* records were never touched, so putting them back restores exactly the state
		// before the migration -- and silently drops everything done in the app since. Refuse if
		// anything changed, unless forced.
		const changed = {
			'people added or edited': one(`SELECT count(*) AS n FROM people p
				WHERE NOT EXISTS (SELECT 1 FROM legacy_students s WHERE s.id = p.id AND s.updated = p.updated)
				AND NOT EXISTS (SELECT 1 FROM legacy_teachers t WHERE t.id = p.id AND t.updated = p.updated)`),
			'people deleted':
				one('SELECT count(*) AS n FROM legacy_students WHERE id NOT IN (SELECT id FROM people)') +
				one('SELECT count(*) AS n FROM legacy_teachers WHERE id NOT IN (SELECT id FROM people)'),
			'attendance records added or edited': one(`SELECT count(*) AS n FROM people_dailies d
				WHERE NOT EXISTS (SELECT 1 FROM legacy_student_dailies s
					WHERE s.date = d.date AND s.student = d.person AND s.updated = d.updated)
				AND NOT EXISTS (SELECT 1 FROM legacy_teacher_dailies t
					WHERE t.date = d.date AND t.teacher = d.person AND t.updated = d.updated)`),
			'attendance records deleted':
				one(`SELECT count(*) AS n FROM legacy_student_dailies s WHERE NOT EXISTS
					(SELECT 1 FROM people_dailies d WHERE d.date = s.date AND d.person = s.student)`) +
				one(`SELECT count(*) AS n FROM legacy_teacher_dailies t WHERE NOT EXISTS
					(SELECT 1 FROM people_dailies d WHERE d.date = t.date AND d.person = t.teacher)`),
			'guest check-ins linked to a person': one("SELECT count(*) AS n FROM guest_dailies WHERE person != ''")
		};
		const lost = Object.entries(changed).filter(([, n]) => n > 0);
		if (lost.length > 0) {
			const summary = lost.map(([what, n]) => `${n} ${what}`).join(', ');
			if ($os.getenv('MM_PEOPLE_FORCE_DOWN') !== '1')
				throw new Error(
					`people migration: not rolling back, it would lose ${summary}. ` +
						'Restore the pb_data copy taken before the update instead, or set MM_PEOPLE_FORCE_DOWN=1 to roll back anyway.'
				);
			console.log(`people migration: MM_PEOPLE_FORCE_DOWN=1, throwing away ${summary}`);
		}

		// Put the old collections back with their old names and rules.
		for (const [id, name, deleteRule] of [
			[STUDENTS_ID, 'students', null],
			[TEACHERS_ID, 'teachers', null],
			[STUDENT_DAILIES_ID, 'student_dailies', ''],
			[TEACHER_DAILIES_ID, 'teacher_dailies', '']
		]) {
			const collection = app.findCollectionByNameOrId(id);
			const oldName = collection.name;
			const indexes = JSON.parse(JSON.stringify(collection.indexes)).map((sql) =>
				sql.replace(`ON \`${oldName}\``, `ON \`${name}\``)
			);
			unmarshal(
				{ name, indexes, listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule },
				collection
			);
			app.save(collection);
		}

		// The old unique index has no `person`, so same-name check-ins of different regular guests on
		// one day can't all stay: keep a one-off guest's row, otherwise the earliest linked one.
		const duplicateGuests = `FROM guest_dailies WHERE person != '' AND EXISTS (
			SELECT 1 FROM guest_dailies g WHERE g.date = guest_dailies.date AND g.name = guest_dailies.name
				AND g.avatar = guest_dailies.avatar AND g.rowid != guest_dailies.rowid
				AND (g.person = '' OR g.rowid < guest_dailies.rowid))`;
		const duplicates = one(`SELECT count(*) AS n ${duplicateGuests}`);
		if (duplicates > 0) {
			app.db().newQuery(`DELETE ${duplicateGuests}`).execute();
			console.log(`people migration: removed ${duplicates} same-name guest check-ins`);
		}

		// Drop the once-a-day index and take `person` back out of the other one before the field goes.
		const guestDailies = app.findCollectionByNameOrId(GUEST_DAILIES_ID);
		const guestIndexes = JSON.parse(JSON.stringify(guestDailies.indexes))
			.filter((sql) => !sql.includes('`idx_guest_dailies_date_person`'))
			.map((sql) => (sql.includes('`idx_SKPwrroDQD`') ? sql.replace(', `person`)', ')') : sql));
		unmarshal({ indexes: guestIndexes }, guestDailies);
		app.save(guestDailies);
		guestDailies.fields.removeById('relation1795321342');
		app.save(guestDailies);

		app.delete(app.findCollectionByNameOrId(PEOPLE_DAILIES_ID));
		app.delete(app.findCollectionByNameOrId(PEOPLE_ID));
	}
);
