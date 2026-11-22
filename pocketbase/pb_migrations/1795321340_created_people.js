/// <reference path="../pb_data/types.d.ts" />

// Students and teachers become one `people` collection (with a role), and their per-day
// attendance becomes one `people_dailies` collection. Guest check-ins can point at a person.
//
// Nothing is thrown away: record IDs (which class_dailies.attendance.currentPerson refers to),
// created/updated times and pictures are carried over, and the old collections are kept as
// legacy_* collections that only superusers can read. The down migration puts them back.
//
// Each migrate() handler runs on its own, so every constant lives inside the handler.

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
				'CREATE UNIQUE INDEX `idx_people_dailies_date_person` ON `people_dailies` (`date`, `person`)'
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
					pattern: '',
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

		// A guest check-in may belong to a person marked is_guest. Deleting that person only clears
		// the link: the check-in keeps its own name and pronoun.
		const guestDailies = app.findCollectionByNameOrId(GUEST_DAILIES_ID);
		guestDailies.fields.add(
			new Field({
				cascadeDelete: false,
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

		// 2. Copy the records (raw SQL so IDs and created/updated times survive) ---------------

		const clash = one(
			'SELECT count(*) AS n FROM students s JOIN teachers t ON s.id = t.id'
		);
		if (clash > 0) throw new Error(`people migration: ${clash} student/teacher IDs clash`);

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

		// 3. Copy the pictures (storage key: <collectionId>/<recordId>/<filename>) -------------

		const fsys = app.newFilesystem();
		try {
			for (const [table, collectionId] of [
				['students', STUDENTS_ID],
				['teachers', TEACHERS_ID]
			]) {
				const rows = arrayOf(new DynamicModel({ id: '', avatar: '' }));
				app.db().newQuery(`SELECT id, avatar FROM ${table} WHERE avatar != ''`).all(rows);
				for (const row of rows) {
					const src = `${collectionId}/${row.id}/${row.avatar}`;
					const dst = `${PEOPLE_ID}/${row.id}/${row.avatar}`;
					if (!fsys.exists(src)) {
						console.log(`people migration: missing picture ${src}, leaving it out`);
						run(`UPDATE people SET avatar = '' WHERE id = '${row.id}'`);
						continue;
					}
					if (!fsys.exists(dst)) fsys.copy(src, dst);
				}
			}
		} finally {
			fsys.close();
		}

		// 4. Keep the old collections, renamed and locked to superusers ------------------------

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

		// Put the old collections back with their old names and rules. Their records were never
		// touched, so this is exactly the state before the migration; anything changed in
		// `people` since then is not copied back.
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

		const guestDailies = app.findCollectionByNameOrId(GUEST_DAILIES_ID);
		guestDailies.fields.removeById('relation1795321342');
		app.save(guestDailies);

		app.delete(app.findCollectionByNameOrId(PEOPLE_DAILIES_ID));
		app.delete(app.findCollectionByNameOrId(PEOPLE_ID));
	}
);
