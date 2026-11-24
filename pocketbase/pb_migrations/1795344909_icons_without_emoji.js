/// <reference path="../pb_data/types.d.ts" />

// Icons without emoji: an icon is a name and a picture.
//
// 1. Icon names become unique on their own (not counting upper and lower case), instead of
//    together with the emoji. Icons with the same name (they used to differ by emoji) keep the
//    oldest one's name; the others get a number: "Dog", "Dog 2", "Dog 3". Each rename is printed.
// 2. icons.emoji is removed, with what was typed into it.
// 3. Icons without a picture are printed as a warning: guests who pick one show the default
//    picture until it gets one on the Icons page.
//
// Guest check-ins and calendar observances point to icons by id, so they are not changed.
//
// Rolling back: see DEPLOY.md section C2 (`pocketbase migrate down` reverts the newest migrations
// first, so this one is the 1st). It puts the emoji field back empty: the emoji themselves are
// gone, and renamed icons keep their new names. PocketBase exits with status 0 even when a
// migration fails, so check that it printed "Reverted 1795344909_icons_without_emoji.js" (or
// "Applied ..." when migrating up).

migrate(
	(app) => {
		const ICONS_ID = 'pbc_423132189';
		const OLD_INDEX = 'idx_UJLcWE3gXq'; // UNIQUE (name, emoji)
		const NEW_INDEX = 'idx_icons_name';

		const icons = app.findCollectionByNameOrId(ICONS_ID);

		// 1. Same names (ignoring case and spaces around them): the oldest keeps it.
		const rows = arrayOf(
			new DynamicModel({ id: '', name: '', emoji: '', image: '', created: '' })
		);
		const hasEmoji = !!icons.fields.getByName('emoji');
		app
			.db()
			.newQuery(
				`SELECT id, name, ${hasEmoji ? 'emoji' : "'' AS emoji"}, image, created FROM icons ORDER BY created, id`
			)
			.all(rows);
		const key = (name) => String(name).trim().toLowerCase();
		const taken = new Set(rows.map((row) => key(row.name)));
		const seen = new Set();
		for (const row of rows) {
			const name = String(row.name);
			if (!seen.has(key(name))) {
				seen.add(key(name));
				continue;
			}
			let number = 2;
			while (taken.has(key(`${name.trim()} ${number}`))) number++;
			const renamed = `${name.trim()} ${number}`;
			taken.add(key(renamed));
			seen.add(key(renamed));
			row.name = renamed;
			app
				.db()
				.newQuery('UPDATE icons SET name = {:name} WHERE id = {:id}')
				.bind({ name: renamed, id: row.id })
				.execute();
			console.log(
				`icons migration: renamed "${name}" (${row.id}${row.emoji ? `, emoji ${row.emoji}` : ''}) ` +
					`to "${renamed}": icon names are now unique without the emoji`
			);
		}
		for (const row of rows) {
			if (!row.image)
				console.log(
					`icons migration: warning: "${row.name}" (${row.id}) has no picture: guests who pick ` +
						'it show the default picture until it gets one on the Icons page'
				);
		}

		// 2. The new index replaces the old one, and the emoji field goes.
		const indexes = JSON.parse(JSON.stringify(icons.indexes)).filter(
			(sql) => !sql.includes(OLD_INDEX) && !sql.includes(NEW_INDEX)
		);
		indexes.push(`CREATE UNIQUE INDEX \`${NEW_INDEX}\` ON \`icons\` (\`name\` COLLATE NOCASE)`);
		unmarshal({ indexes }, icons);
		if (hasEmoji) icons.fields.removeByName('emoji');
		app.save(icons);
	},
	(app) => {
		const ICONS_ID = 'pbc_423132189';
		const OLD_INDEX = 'idx_UJLcWE3gXq';
		const NEW_INDEX = 'idx_icons_name';

		const icons = app.findCollectionByNameOrId(ICONS_ID);
		if (!icons.fields.getByName('emoji')) {
			// as 1758729159_updated_icons.js left it; every icon gets an empty emoji
			icons.fields.addAt(
				2,
				new Field({
					autogeneratePattern: '',
					hidden: false,
					id: 'text3058431538',
					max: 0,
					min: 0,
					name: 'emoji',
					pattern: '',
					presentable: false,
					primaryKey: false,
					required: true,
					system: false,
					type: 'text'
				})
			);
		}
		const indexes = JSON.parse(JSON.stringify(icons.indexes)).filter(
			(sql) => !sql.includes(NEW_INDEX) && !sql.includes(OLD_INDEX)
		);
		indexes.push(`CREATE UNIQUE INDEX \`${OLD_INDEX}\` ON \`icons\` (\n  \`name\`,\n  \`emoji\`\n)`);
		unmarshal({ indexes }, icons);
		app.save(icons);
		console.log(
			'icons migration: rolled back; the emoji field is back but empty, and renamed icons keep their new names'
		);
	}
);
