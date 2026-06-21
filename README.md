# IronCycle

A four-day, twelve-week powerlifting block, woven together from three of
[Greg Nuckols' programs](https://www.strengtheory.com) (Squat 3×/week,
Bench 3×/week, Deadlift 2×/week), structured as four 3-week periodized
phases — **Accumulation → Intensification → Peak → Realization**. Sets and
reps stay identical across a phase's 3 weeks; only the weight changes, week
to week, driven by how the same workout actually went the time before.

Every working weight is **autoregulated by RPE**, shown as a ±2% range so
there's room to round to whatever's on the bar. Rate each set 6–10 and the
*next* set's weight recalculates immediately — heavier if it felt easy,
lighter if it felt hard. You can also record what you **actually** lifted
(weight and reps, if they differed from the suggestion) — that real
performance, not just the assumed target, is what drives the next set and
the next week's same workout. Each movement (competition lift, every
variation, every loaded accessory) tracks its own estimated 1RM
independently, seeded from the three 1RMs you enter once at setup.

You can also edit how many sets an exercise gets, and swap in a different
movement for any variation or accessory, right from the workout screen.

## Run it locally

Requires [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Build for production

```bash
npm run build
```

Output goes to `dist/`. You can preview the production build with `npm run preview`.

## Project structure

All source files sit flat in the project root (`index.html`, `main.jsx`,
`App.jsx`, `index.css`, `package.json`, `vite.config.js`) — no `src/`
subfolder, so you can drag-and-drop or use "Add file → Upload files" on
GitHub.com without needing to create folders yourself.

The one exception is `.github/workflows/deploy.yml`, which **must** live at
that exact nested path — GitHub only looks for workflow files there, so this
can't be flattened. If your upload method doesn't support folders, the
easiest way to create it is on GitHub.com itself:

1. In your repo, click **Add file → Create new file**.
2. In the filename box, type the whole path: `.github/workflows/deploy.yml`
   (GitHub creates both folders automatically as you type the slashes).
3. Paste in the contents of `deploy.yml` from this project and commit.

If you'd rather skip GitHub Actions entirely, you can deploy manually instead
— see the section below.

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that builds and publishes the app automatically — no manual steps after setup.

1. Push this project to a new GitHub repository.
2. In the repo, go to **Settings → Pages**. Under **Build and deployment →
   Source**, choose **GitHub Actions**.
3. Push to the `main` branch (or merge a PR into it). The workflow will build
   the app and deploy it.
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`
   (check the **Actions** tab for the deployment URL once it finishes).

The Vite config uses relative asset paths, so it works at the domain root or
at any GitHub Pages subpath without extra configuration.

### Manual alternative (no Actions)

```bash
npm run build
```

Then upload the contents of `dist/` to any static host (GitHub Pages via the
`gh-pages` branch, Netlify, Vercel, S3, etc.).

## Data & privacy

Your maxes, estimated 1RMs, current week/day, and session logs are stored in
your browser's `localStorage` — nothing is sent to a server. Data is
per-browser and per-device: it won't sync across devices, and clearing your
browser's site data will reset the app.

## Credit

The twelve-week, four-phase structure and exercise selection are adapted from Greg
Nuckols' "Squat 3x IntAdv," "Bench 3x Adv," and "DL 2x Adv" programs
(strengtheory.com), combined into one schedule and converted to live
RPE-based autoregulation instead of fixed-percentage weeks.

## Tech

- React + Vite
- Tailwind CSS (via CDN, compiled in-browser — no build step needed)
- [Recharts](https://recharts.org) for the progress chart
- [lucide-react](https://lucide.dev) for icons
