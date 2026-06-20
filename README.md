# IronCycle

A periodized powerlifting program generator. Built around block periodization
(Volume → Strength → Peak → Deload) and **Prilepin's chart** for set/rep
prescriptions, with **RPE-based autoregulation** and **weak-point variation**
selection for squat, bench, deadlift, and overhead press.

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

Your maxes, current week/day, RPE logs, and autoregulation adjustments are
stored in your browser's `localStorage` — nothing is sent to a server. Data
is per-browser and per-device: it won't sync across devices, and clearing
your browser's site data will reset the app.

## Tech

- React + Vite
- Tailwind CSS (via CDN, compiled in-browser — no build step needed)
- [Recharts](https://recharts.org) for the progress chart
- [lucide-react](https://lucide.dev) for icons
