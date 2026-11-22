# Morning Meeting

**Morning Meeting** is a local-network "web" app for running interactive classroom presentations, tracking attendance, and showcasing student/teacher info. Built with modern tools for easy local hosting and fast iteration.

## 🧱 Tech Stack

- **Frontend:** [SvelteKit 3](https://svelte.dev/docs/kit) (Svelte 5) + [Skeleton UI v5](https://www.skeleton.dev/) + Tailwind CSS 4
- **Backend:** [PocketBase](https://pocketbase.io/)
- **Local Dev:** Runs on Raspberry Pi or other local hardware
- **Node:** 22.22.2+ (22.x) or 24.15.0+ to install and build (`.npmrc` has engine-strict); the built app (`node build`) runs on 22.17+

## 📦 Project Structure

- `/sveltekit/`: Main SvelteKit project for the presentation frontend
- `/pocketbase/`: PocketBase backend for storing and managing student/teacher data

## 🚀 Getting Started

### 1. Clone the Repo

```bash
git clone https://github.com/Stewball32/MorningMeetingLocal.git
cd MorningMeetingLocal
```

### 2. Run Setup Script

```bash
./setup.sh
```

This script will:
- Download the correct PocketBase binary based on your OS/architecture
- Optionally restore sample data to `pb_data/`
- Create `.env` file in `sveltekit/` if it doesn't exist
- Run `npm install` in `sveltekit/`

Config options can be modified in `setup.env` before running the script.

### 3. Dev Scripts

After setup:
- Start the frontend in dev mode:
  ```bash
  cd sveltekit
  npm run dev
  ```

- Start the frontend in production preview mode:
  ```bash
  npm run build
  npm run preview
  ```
	- Test/Run on network by adding `host` at the end:
	  ```bash
	  npm run devhost
	  npm run previewhost
	  ```

- Start PocketBase manually:
  ```bash
  cd pocketbase
  ./pocketbase serve
  ```

	- Test/Run on Network by adding --http or --https (0.0.0.0 will accept all connections)
	  ```bash
	  ./pocketbase serve --http=0.0.0.0:8090
	  ```

### 4. Use the PocketBase UI

Visit: [http://127.0.0.1:8090/_/](http://127.0.0.1:8090/_/)
- Create an admin account
- Add `students` and `teachers` in their respective tables
	- setup scripts will add sample teachers and students if you said yes.

## 🧠 Future Plans

- Custom UI for managing student data
- More interactivity for slides
- Remote control / cast view mode

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

Push the Elevator!

