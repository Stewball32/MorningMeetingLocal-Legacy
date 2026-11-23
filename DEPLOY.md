# Updating the classroom Pi to the new version

This version adds the People, Icons and Calendar Observances pages, the Home page, the zoom-proof
presenter and the presenter fixes. The calendar also shows birthdays, built-in holidays can show
under another name, and the class's own days can move (e.g. the 4th Thursday in November). It
changes the database with four migrations:
1. `1795321340_created_people.js`: students and teachers move into one `people` collection.
2. `1795344906_icons_and_observances.js`: observances can use an icon or be hidden, icon pictures
   must be images, and icons can be deleted even when guests used them.
3. `1795344907_class_dailies_unique_date.js`: one class record per day (it merges duplicates first).
4. `1795344908_birthdays_and_holiday_names.js`: people can have a birthday, and a built-in holiday a
   name on the calendar. Both are new, empty fields.

The update was rehearsed end to end on a copy of a realistic database (two school years of attendance).
Follow the steps in order. **Read the output of every PocketBase command:** PocketBase exits with
status 0 even when something fails, so only the printed text tells you whether it worked.

Use bash for the commands below (if your shell is fish, type `bash` first), and set these once
(again whenever you come back in a new terminal, e.g. for section C weeks later):

```bash
REPO=~/MorningMeetingLocal        # the Pi's checkout (the folder with pocketbase/ and sveltekit/)
PB_URL=http://meet.lan            # the PocketBase address the classroom browsers use
BRANCH=main                       # the GitHub branch with this version
BK=~/mm-backups; mkdir -p "$BK"
```

## A. A few days before (only the optional dry run stops PocketBase, for a few seconds)

1. **Node version.** `node --version` must be **22.22.2 or newer on the 22 line, or 24.15.0 or newer**.
   (`.npmrc` has `engine-strict=true`, so older versions fail `npm ci`.) Upgrade Node first if needed.
2. **How the servers run.** Find out how PocketBase and the Node server are started, so you can stop
   and start them the same way later:
   ```bash
   ps -eo pid,user,args | grep -E '[p]ocketbase|[n]ode'
   systemctl list-units --type=service --all | grep -iE 'pocket|meet|morning|node'
   pm2 ls 2>/dev/null; tmux ls 2>/dev/null; screen -ls 2>/dev/null; crontab -l 2>/dev/null
   ```
   - **PocketBase:** note the user that owns the data (`stat -c %U "$REPO/pocketbase/pb_data"`), and run every `./pocketbase` command below as that user.
     - If PocketBase is started with `--dir`, `--migrationsDir` or `--hooksDir`, add the same flags to every `./pocketbase` command below (`migrate up`, `migrate down`).
     - Use the `--dir` folder wherever this guide says `pb_data`. Without the flags, PocketBase migrates a different, empty folder and still says `Applied`.
   - **The Node server:** `ps` only shows `node build`. Its folder and settings are in `ls -l /proc/<PID>/cwd` and `tr '\0' '\n' < /proc/<PID>/environ | grep -E '^(PORT|HOST|ORIGIN)='`.
3. **Frontend address.** `cat "$REPO/sveltekit/.env"` should show `PUBLIC_POCKETBASE_URL=http://meet.lan`.
   The address is built into the frontend by `npm run build` (step B5), so it must be right before
   building.
4. **The branch is reachable:** `git -C "$REPO" fetch origin && git -C "$REPO" rev-parse --verify "origin/$BRANCH"`
   must print a commit id. If it doesn't, point the Pi at the repository and try again:
   `git -C "$REPO" remote set-url origin https://github.com/Stewball32/MorningMeetingLocal-Legacy`.
5. **Optional dry run.** This runs the migrations on a *copy*:
   ```bash
   DRY=~/mm-dryrun; mkdir -p "$DRY"; cp "$REPO/pocketbase/pocketbase" "$DRY/"
   git -C "$REPO" archive "origin/$BRANCH" pocketbase/pb_migrations pocketbase/pb_hooks | tar -x -C "$DRY" --strip-components=1
   # stop PocketBase (see B1), then:
   cp -a "$REPO/pocketbase/pb_data" "$DRY/pb_data"
   # start PocketBase again as before, then:
   cd "$DRY" && ./pocketbase migrate up
   ```
   - **Good:**
     - a line containing `people migration: N students + M teachers -> N+M people; X + Y dailies -> X+Y people_dailies`;
     - four `Applied ...` lines, one per migration file listed at the top;
     - the 🚀 / 📂 / 🛑 lines are normal.
   - **Worth noting, but they stop nothing:**
     - lines containing `people migration: warning:` (e.g. a missing picture: re-upload it later in /people);
     - lines containing `class_dailies migration:` (days that had two records, now merged).
   - `No new migrations to apply.` means the copy wasn't next to `pb_migrations`: the dry run did nothing.
   - `Error: Failed to apply migration ...`: stop here and send the message to whoever maintains the app.
   - Afterwards: `rm -rf ~/mm-dryrun`.

## B. The update (after school; takes about as long as `npm ci` + build)

1. **Stop both servers first.** Do *not* run `git checkout` while PocketBase is running: it reloads
   itself when the files in `pb_hooks` change and would migrate the live data straight away, before
   the backup. Stop it the way it was started (`sudo systemctl stop <unit>`, `pm2 stop <name>`,
   Ctrl+C in its terminal, or `kill <PID>`), and the Node server too. Check with
   `pgrep -a pocketbase; pgrep -af node` that they are gone.
2. **Back up the database** (and the old frontend, for going back without internet):
   ```bash
   cd "$REPO/pocketbase"
   # a backup from an earlier attempt? move it away first, or cp would copy into it:
   [ -e "$BK/pb_data-before-update" ] && mv "$BK" "$BK-$(date +%F-%H%M)" && mkdir -p "$BK"
   cp -a pb_data "$BK/pb_data-before-update" && du -sh pb_data "$BK/pb_data-before-update"   # same size
   cp -a "$REPO/sveltekit/build" "$REPO/sveltekit/node_modules" "$BK/"
   git -C "$REPO" status --short > "$BK/git-status-before.txt"; cat "$BK/git-status-before.txt"
   ```
   - **Expected on the classroom Pi:**
     - ` M` for `sveltekit/src/lib/slides/attendance/GuestCheck.svelte` and for `sveltekit/src/lib/slides/calendar/DayInMonth.svelte`, `FindTheDate.svelte` and `MonthView.svelte`;
     - `??` for `pocketbase/pb_migrations/1758729111_updated_icons.js` and `1758729159_updated_icons.js`.
     - These classroom hotfixes are already in this version and in `origin/class`.
   - Ask first about any other ` M` line: the next step overwrites it.
3. **Get the new code:**
   ```bash
   cd "$REPO" && git fetch origin && git checkout -f -B "$BRANCH" "origin/$BRANCH" && git log --oneline -1
   ```
4. **Migrate by hand and read the output:**
   ```bash
   cd "$REPO/pocketbase" && ./pocketbase migrate up 2>&1 | tee "$BK/migrate-up.log"
   [ "$(grep -c 'Applied ' "$BK/migrate-up.log")" = 4 ] && [ "$(grep -cE 'Applied (1795321340_created_people|1795344906_icons_and_observances|1795344907_class_dailies_unique_date|1795344908_birthdays_and_holiday_names)\.js' "$BK/migrate-up.log")" = 4 ] && echo MIGRATED
   ```
   You should see the `people migration: ... -> ... people` line with the real numbers (not `0 students`)
   and `MIGRATED`. If you see `Error: Failed to apply migration ...` instead, nothing was changed
   (PocketBase applies all four or none, even if the `people migration:` line was printed): go to C1.
5. **Build the frontend:**
   ```bash
   cd "$REPO/sveltekit" && npm ci && npm run build
   ```
   It should end with adapter-node's `✔ done`. (A "Some chunks are larger than 500 kB" warning is fine.)
   If `npm ci` fails with `EBADENGINE`, Node is too old (A1): go to C1 rather than starting the old
   frontend against the new data.
6. **Start PocketBase and the Node server** exactly as before. PocketBase must print
   `Server started at ...` and no `Error:` line.
7. **Check:**
   ```bash
   curl -s "$PB_URL/api/collections/people/records?perPage=1&fields=id" | grep -o '"totalItems":[0-9]*'   # students + teachers
   curl -s -o /dev/null -w '%{http_code}\n' "$PB_URL/api/collections/students/records?perPage=1"         # 404
   curl -s -o /dev/null -w '%{http_code}\n' -G "$PB_URL/api/collections/people/records" --data-urlencode "filter=birthday != ''"   # 200 (400: no birthday field, migration 4 is missing)
   ```
   - Reload every open Morning Meeting tab (Ctrl+Shift+R).
   - The Home page shows a Presenter button and tiles for People, Icons and Calendar Observances, each with a short summary.
   - The attendance pages list everyone, and /people shows Teachers and Students with the right counts.
   - /icons lists the guest icons. /calendar lists the coming days and the built-in holidays.
   - /calendar has a Birthdays section that says "No birthdays yet" ("Can't load the birthdays" means migration 4 is missing: go to C1).
     Birthdays are set on /people. One set there shows in that section and on the calendar slide, and like the mark below, it counts as using the new version.
   - Mark one student here and reload: it stays. That counts as using the new version: from then on, going back means C1 (or C2 with `MM_PEOPLE_FORCE_DOWN=1`, which throws that mark away).
   - Keep `$BK` for a few weeks.

## C. Going back

1. **Restore the backup** (always works; loses whatever was done since the update):
   1. Stop both servers (B1).
   2. Move new migration files aside:
      - Run `git -C "$REPO" status --short pocketbase/pb_migrations | grep -vxFf "$BK/git-status-before.txt"`.
      - Move every file it prints into `$BK`.
      - PocketBase writes these files when a collection's fields are changed in the admin dashboard, and the old version can't apply them.
   3. `cd "$REPO/pocketbase" && mv pb_data "$BK/pb_data-update-failed" && cp -a "$BK/pb_data-before-update" pb_data`
   4. Put the old code back and rebuild:
      - `cd "$REPO" && git checkout -f -B class origin/class`, then `cd sveltekit && npm ci && npm run build`.
      - Without internet, `npm ci` can't run: put the old `build` and `node_modules` folders from `$BK` back into `sveltekit/` instead.
   5. Start both servers; reload the browser tabs.
2. **`migrate down`** only undoes an update nobody has used yet, and only works **while the new
   code is still checked out**.
   - Stop both servers first (B1).
   - Then run:
     ```bash
     cd "$REPO/pocketbase" && ./pocketbase migrate down 4
     ```
   - It first lists the migrations it will undo and asks `(y/N)`. Answer `y` only if the list is exactly `1795344908_birthdays_and_holiday_names.js`, `1795344907_class_dailies_unique_date.js`, `1795344906_icons_and_observances.js` and `1795321340_created_people.js`.
     - If it lists any other file, answer `n` and use C1. (Either the old code is checked out, or the dashboard wrote a migration.)
   - **Good:** four `Reverted ...` lines. Then continue with C1 step 4 (steps 1-3 are not needed).
   - **A line containing `not rolling back`:** people (a birthday too), attendance, or check-ins of regular guests were changed since the update. Nothing was reverted: PocketBase undoes the whole command when one step refuses, so there are no `Reverted` lines and the database is exactly as it was. Use C1.
     - `MM_PEOPLE_FORCE_DOWN=1 ./pocketbase migrate down 4` throws those people and attendance changes away, birthdays included. As another user, use `sudo -u <user> env MM_PEOPLE_FORCE_DOWN=1 ./pocketbase migrate down 4`. Only use it when you are sure.
   - **`migrate down` does not notice what was done on /icons or /calendar.** A deleted icon stays deleted, and past guests who used it show no picture. Hidden holidays, the names given to built-in holidays ("Name on the calendar"), and icons chosen for observances, are dropped. If anyone used /icons or /calendar, use C1 instead.
   - **Birthdays are dropped by `migrate down` too.** Setting one changes its person, so without `MM_PEOPLE_FORCE_DOWN=1` it stops at `not rolling back` (above).

## Afterwards

- **The admin dashboard:** don't change the fields of `people`, `people_dailies`, `icons`, `calendar_observances` or `class_dailies` there. Add and edit things at `/people`, `/icons` and `/calendar` instead.
- **The old collections** stay in the database as `legacy_students`, `legacy_teachers`, `legacy_student_dailies` and `legacy_teacher_dailies` (only visible to the admin). They can be deleted later, once the new version has been in use for a while.
- **The presenter now always fills its window.** Ctrl+plus/minus no longer changes the slide size, only the corner buttons. Fullscreen (F11 or the button) gives the biggest slide.
- **Keep at most about 5 Morning Meeting tabs open in one browser.** Each tab keeps a live connection to PocketBase, and browsers allow about 6 per address. With more, the newest tab can't connect and its changes don't save.
