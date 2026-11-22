# Updating the classroom Pi to the new version

This version adds the People, Icons and Calendar Observances pages, the Home page, the zoom-proof
presenter and the presenter fixes. It changes the database with three migrations:
1. `1795321340_created_people.js`: students and teachers move into one `people` collection.
2. `1795344906_icons_and_observances.js`: observances can use an icon or be hidden, icon pictures
   must be images, and icons can be deleted even when guests used them.
3. `1795344907_class_dailies_unique_date.js`: one class record per day (it merges duplicates first).

The update was rehearsed end to end on a copy of a realistic database (two school years of attendance).
Follow the steps in order. **Read the output of every PocketBase command:** PocketBase exits with
status 0 even when something fails, so only the printed text tells you whether it worked.

Use bash for the commands below (if your shell is fish, type `bash` first), and set these once:

```bash
REPO=~/MorningMeetingLocal        # the Pi's checkout (the folder with pocketbase/ and sveltekit/)
PB_URL=http://meet.lan            # the PocketBase address the classroom browsers use
BRANCH=main                       # the GitHub branch with this version
BK=~/mm-backups; mkdir -p "$BK"
```

## A. A few days before (nothing stops)

1. **Node version.** `node --version` must be **22.22.2 or newer on the 22 line, or 24.15.0 or newer**.
   (`.npmrc` has `engine-strict=true`, so older versions fail `npm ci`.) Upgrade Node first if needed.
2. **How the servers run.** Find out how PocketBase and the Node server are started, so you can stop
   and start them the same way later:
   ```bash
   ps -eo pid,user,args | grep -E '[p]ocketbase|[n]ode'
   systemctl list-units --type=service --all | grep -iE 'pocket|meet|morning|node'
   pm2 ls 2>/dev/null; tmux ls 2>/dev/null; screen -ls 2>/dev/null; crontab -l 2>/dev/null
   ```
   Note the user that owns the data (`stat -c %U "$REPO/pocketbase/pb_data"`) and run every
   `./pocketbase` command below as that user. If PocketBase is started with `--dir=...`, use that
   folder wherever this guide says `pb_data`.
3. **Frontend address.** `cat "$REPO/sveltekit/.env"` should show `PUBLIC_POCKETBASE_URL=http://meet.lan`.
   The address is built into the frontend by `npm run build` (step B5), so it must be right before
   building.
4. **Optional dry run.** This runs the migrations on a *copy*:
   ```bash
   DRY=~/mm-dryrun; mkdir -p "$DRY"; cp "$REPO/pocketbase/pocketbase" "$DRY/"
   git -C "$REPO" fetch origin
   git -C "$REPO" archive "origin/$BRANCH" pocketbase/pb_migrations pocketbase/pb_hooks | tar -x -C "$DRY" --strip-components=1
   # stop PocketBase (see B1), then:
   cp -a "$REPO/pocketbase/pb_data" "$DRY/pb_data"
   # start PocketBase again as before, then:
   cd "$DRY" && ./pocketbase migrate up
   ```
   - **Good:**
     - a line `people migration: N students + M teachers -> N+M people; X + Y dailies -> X+Y people_dailies`;
     - three `Applied ...` lines, one per migration file listed at the top.
   - **Worth noting, but they stop nothing:**
     - lines starting with `people migration: warning:` (e.g. a missing picture: re-upload it later in /people);
     - lines starting with `class_dailies migration:` (days that had two records, now merged).
   - `No new migrations to apply.` means the copy wasn't next to `pb_migrations`: the dry run did nothing.
   - `Error: Failed to apply migration ...`: stop here and send the message to whoever maintains the app.
   - Afterwards: `rm -rf ~/mm-dryrun`.

## B. The update (after school; takes about as long as `npm ci` + build)

1. **Stop both servers first.** Do *not* run `git checkout` while PocketBase is running: it reloads
   itself when the files in `pb_hooks` change and would migrate the live data straight away, before
   the backup. Stop it the way it was started (`sudo systemctl stop <unit>`, `pm2 stop <name>`,
   Ctrl+C in its terminal, or `kill <PID>`), and the Node server too. Check with
   `pgrep -a pocketbase; pgrep -af node` that they are gone.
2. **Back up the database:**
   ```bash
   cd "$REPO/pocketbase"
   cp -a pb_data "$BK/pb_data-before-update" && du -sh pb_data "$BK/pb_data-before-update"   # same size
   git -C "$REPO" status --short > "$BK/git-status-before.txt"; cat "$BK/git-status-before.txt"
   ```
   Lines starting with ` M` are files changed on the Pi that the next step would overwrite: ask first.
3. **Get the new code:**
   ```bash
   cd "$REPO" && git fetch origin && git checkout -f -B "$BRANCH" "origin/$BRANCH" && git log --oneline -1
   ```
4. **Migrate by hand and read the output:**
   ```bash
   cd "$REPO/pocketbase" && ./pocketbase migrate up 2>&1 | tee "$BK/migrate-up.log"
   [ "$(grep -cE 'Applied (1795321340_created_people|1795344906_icons_and_observances|1795344907_class_dailies_unique_date)\.js' "$BK/migrate-up.log")" = 3 ] && echo MIGRATED
   ```
   You should see the `people migration: ... -> ... people` line and `MIGRATED`. If you see
   `Error: Failed to apply migration ...` instead, that migration changed nothing: go to C1.
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
   ```
   - Reload every open Morning Meeting tab (Ctrl+Shift+R).
   - The Home page shows a Presenter button and tiles for People, Icons and Calendar Observances, each with a short summary.
   - The attendance pages list everyone, and /people shows Teachers and Students with the right counts.
   - Mark one student here and reload: it stays.
   - /icons lists the guest icons. /calendar lists the coming days and the built-in holidays.
   - Keep `$BK` for a few weeks.

## C. Going back

1. **Restore the backup** (always works; loses whatever was done since the update):
   1. Stop both servers (B1).
   2. Move new migration files aside:
      - Run `cd "$REPO/pocketbase" && git status --short pb_migrations`.
      - Any `??` migration file that is *not* listed in `$BK/git-status-before.txt` goes into `$BK`.
      - PocketBase writes these files when a collection's fields are changed in the admin dashboard, and the old version can't apply them.
   3. `mv pb_data "$BK/pb_data-update-failed" && cp -a "$BK/pb_data-before-update" pb_data`
   4. `cd "$REPO" && git checkout -f -B class origin/class`, then `cd sveltekit && npm ci && npm run build`.
   5. Start both servers; reload the browser tabs.
2. **`migrate down`** only undoes an update nobody has used yet, and only works **while the new
   code is still checked out** (do it before C1 step 4):
   ```bash
   cd "$REPO/pocketbase" && ./pocketbase migrate down 3      # answer y
   ```
   - **Good:** three `Reverted ...` lines, for `1795344907_class_dailies_unique_date.js`, `1795344906_icons_and_observances.js` and `1795321340_created_people.js`. Then continue with C1 step 4 (skip the restore).
   - **`not rolling back, ...`:** something was changed since the update (people, attendance, guest check-ins, or icons deleted). The files before it in the output are already reverted, and that is fine. Use C1.
     - `MM_PEOPLE_FORCE_DOWN=1` forces the people step and throws those changes away. Only use it when you are sure.
   - **If it names any other file,** it ran with the old code: don't run it again (each run undoes an older migration). Use C1.

## Afterwards

- **The admin dashboard:** don't change the fields of `people`, `people_dailies`, `icons`, `calendar_observances` or `class_dailies` there. Add and edit things at `/people`, `/icons` and `/calendar` instead.
- **The old collections** stay in the database as `legacy_students`, `legacy_teachers`, `legacy_student_dailies` and `legacy_teacher_dailies` (only visible to the admin). They can be deleted later, once the new version has been in use for a while.
- **The presenter now always fills its window.** Ctrl+plus/minus no longer changes the slide size, only the corner buttons. Fullscreen (F11 or the button) gives the biggest slide.
