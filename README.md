# FRU Field Visit Tracker

A small internal web app for your office group:

- Each employee logs in with their **Employee Code**. The first time a code is used, whatever
  password is entered becomes that employee's password (no separate admin sign-up step needed).
- Each month, an employee can upload their **Monthly Travel Plan** (.xlsx, same layout you've been
  using) and paste their **Trip Report** notes for that month.
- Anytime, they can download a consolidated **Field Visit report** (Last 1 month / 3 months /
  6 months / 1 year) in the same Excel format you've been using, with an option to highlight one
  specific month's notes in the report (or no highlight, like your latest file).
- Each employee only ever sees their own data — there is no shared/admin view built in.

## How it works technically

- **Frontend**: plain HTML/CSS/JS in `public/` — no build step required.
- **Backend**: Netlify Functions in `netlify/functions/` (Node.js).
- **Storage**: [Netlify Blobs](https://docs.netlify.com/blobs/overview/) — built into Netlify,
  no external database or account needed. Passwords are hashed with bcrypt; sessions use JWT.
- **Report generation**: `netlify/functions/utils/parseTravelPlan.js` reads the uploaded travel
  plan, groups consecutive travel days into "trips" (a gap of more than ~3 days starts a new trip,
  which allows for a normal weekend inside a trip), and pulls out district names and
  FRU/CHC/DWH/BHU-style facility mentions from the Remarks column. `aggregate.js` rolls this up
  by district across the requested months and matches your pasted Trip Report text to the
  relevant district by keyword. `buildReportExcel.js` writes the final `.xlsx` in the same layout
  as your existing reports.

### Important honest limitation

This automated matching is **best-effort**, the same way any first pass would be. It can occasionally:
- List two spellings of the same district separately (a small alias list in `aggregate.js`
  already fixes known cases like "Raibareilly" / "Raebarely" → "Raebareli" — add more there as
  you spot them).
- Miss a nuance that only a human would catch (e.g. knowing FRU Lalganj is actually in Raebareli,
  not Mirzapur, the way we corrected manually earlier).

Treat the downloaded file as a strong first draft — review the District/Facility columns before
circulating, same as we did by hand.

## Deploying this app (one-time setup)

You'll need a free [Netlify](https://www.netlify.com) account and a [GitHub](https://github.com)
account (recommended — makes future updates a simple `git push`).

### 1. Push this folder to a new GitHub repository
```bash
cd fru-app
git init
git add .
git commit -m "Initial commit"
gh repo create fru-field-visit-tracker --private --source=. --push
# (or create the repo on github.com and follow its "push an existing repository" instructions)
```

### 2. Connect the repo to Netlify
1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
2. Pick your GitHub repo.
3. Build settings are already set via `netlify.toml` — leave the defaults (Netlify will detect
   `public` as the publish directory and `netlify/functions` as the functions directory).
4. Click **Deploy**.

### 3. Enable Netlify Blobs
Netlify Blobs is available automatically on all sites (no extra toggle needed on modern Netlify
accounts). If your dashboard shows a "Blobs" section under **Storage**, no action needed.

### 4. Set your JWT secret
In Netlify: **Site settings → Environment variables → Add a variable**:
- Key: `JWT_SECRET`
- Value: any long random string (e.g. generate one at
  [randomkeygen.com](https://randomkeygen.com))

Redeploy the site after adding this (Deploys → Trigger deploy) so the function picks it up.

### 5. Share the link
Netlify gives you a URL like `https://your-site-name.netlify.app`. Share that link with your
office group — that's the whole app. You can rename the site (Site settings → Site details →
Change site name) to something friendlier first.

## Local testing (optional)

```bash
npm install
npm install -g netlify-cli   # one-time
netlify dev
```
This runs the site + functions locally (with a local Blobs emulation) at `http://localhost:8888`.

## Updating later

Any time you want to tweak the report format, wording, or add a new district-name alias, edit the
relevant file and either:
- push to GitHub (Netlify redeploys automatically), or
- run `netlify deploy --prod` from this folder if you're not using GitHub.

## File map

```
fru-app/
├── netlify.toml                     # Netlify build/redirect config
├── package.json                     # Node dependencies
├── public/                          # Static frontend
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── netlify/functions/               # Serverless backend
    ├── auth.js                      # login / first-time account creation
    ├── save-month.js                # save travel plan + trip report for a month
    ├── get-month.js                 # fetch what's already saved for a month
    ├── generate-report.js           # build & return the downloadable .xlsx
    └── utils/
        ├── store.js                 # Netlify Blobs helpers
        ├── auth-helper.js           # JWT verification
        ├── parseTravelPlan.js       # reads the uploaded travel plan, groups trips
        ├── aggregate.js             # rolls trips + trip-report text up by district
        └── buildReportExcel.js      # writes the final Excel file
```
