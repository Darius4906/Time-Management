# Timewise – Task Planner

A free, no-signup task planner for **days, weeks, months and years**, with a **monthly consistency report**.
Plain HTML/CSS/JS. No build step, no server, no dependencies. It runs on GitHub Pages.

## Features

- **Four time horizons.** Plan a day, a week, a month or a year. Goals cascade: the Day view also shows this week's, month's and year's goals.
- **Major vs minor tasks.** Major tasks count 3× in the weighted score. The app warns when you plan more than 3 major tasks or a very heavy day.
- **Done / Not done with a reason.** Tick ✓ or ✗. For ✗ pick a reason (ran out of time, underestimated, emergency, low energy, motivation, distraction, blocked, no longer a priority, other) and add details.
- **Carry-over.** Missed something? Carry it to another date in one click. Carried tasks are tracked, and repeated carry-overs are flagged as chronic.
- **Repeating tasks.** Daily, weekdays, weekly or monthly. Delete one occurrence or "this and later".
- **Monthly report.** Consistency score, completion rate, weighted rate, planning consistency, follow-through, streaks, daily heatmap, weekly and weekday breakdowns, major vs minor, reasons for misses, goal achievement, comparison with last month, and plain-language insights. Export CSV or print to PDF.
- **Backup & sharing.** Export/Import JSON, so you can move between devices.
- **Dark mode, mobile-friendly, keyboard shortcut** (`N` = new task).

## Gaps in the original idea that this version fixes

| Gap | What Timewise does |
|---|---|
| "Consistency" was undefined. | Two separate measures: **planning consistency** (did you set goals each day?) and **follow-through** (did you complete them?), combined into one score (40/60). |
| Unticked tasks silently disappear from the stats, so skipping the review makes you look better. | Past tasks never marked count as **not done**, and a banner nudges you to review them. |
| A "why" field gets ignored if it is free text. | Fixed reason categories, so the report can show patterns and give a tip for your top reason. |
| All tasks are equal, so ticking 5 easy ones hides skipping the 1 that mattered. | Major/minor with a weighted score, plus a major-vs-minor comparison. |
| Over-planning is the main cause of failure. | Warnings for >3 major tasks and heavy days, and the report compares heavy vs light days. |
| Missed tasks vanish or pile up. | Carry-over with a counter and chronic-procrastination detection. |
| Back-filling ticks days later inflates stats. | Allowed, but marked **done late** and counted in the report. |
| Repetitive tasks are tedious to enter. | Repeat rules. |
| Data loss when browser storage is cleared. | JSON export/import and a footer reminder. |
| Year/month goals disconnected from daily work. | Shared Day view context, and the Year view summarizes each month's consistency. |

## Run locally

Open `index.html` in a browser. Or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Publish on GitHub Pages

1. Create a new repository on GitHub (e.g. `timewise`).
2. Upload `index.html`, `style.css`, `app.js` and `README.md` (or `git push` them).
3. In the repo go to **Settings → Pages**, set **Source: Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After about a minute your app is live at `https://<your-username>.github.io/<repo-name>/`.

Anyone who opens the link gets their **own private copy**, because data is stored in each person's browser (`localStorage`) and never sent anywhere.

## Data format

Tasks are stored as JSON under the key `timewise.v1`:

```json
{ "id": "…", "title": "Study", "scope": "day|week|month|year", "date": "2026-10-19",
  "time": "09:00", "priority": "major|minor", "status": "pending|done|missed",
  "reason": "time", "reasonNote": "…", "notes": "…", "carried": 0, "late": false, "series": "…" }
```

For week/month/year scope, `date` is the first day of that period.

## Roadmap ideas

- Optional sync (e.g. Supabase or Firebase) so one account works on all devices
- Notifications / evening review reminder
- Recurring week/month goals, tags, and time estimates
- Installable PWA with offline support

## License

Add the license of your choice (MIT is a common default).
