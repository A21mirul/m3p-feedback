# M3P Feedback Booth — Bioinformatics Club, UKM FST

A kiosk web app for the "Bioinformatics Factory" booth. Visitors draw (mouse, touch or drawing pad), write feedback, tick reactions and consent, and get a branded 1080×1350 feedback card saved as PNG, ready for Instagram. Works in **Bahasa Melayu / English**, runs **offline** after the first load, and stores everything on the laptop only.

## Deploy to GitHub Pages (recommended)

1. Create a GitHub repo and push this folder to the `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` builds and publishes on every push. Your link will be `https://<username>.github.io/<repo>/`.
4. Open that link once on each booth laptop **while online**, then keep the tab open (or use the browser's "Install app"/"Add to desktop" option) so it still works if venue WiFi drops.

## Run without GitHub (backup plan)

The `dist/` folder is the finished site. On a laptop: open a terminal in `dist/` and run `python3 -m http.server 8000`, then browse to `http://localhost:8000`. (Opening `index.html` by double-click will NOT work — browsers block module scripts on `file://`.)

## Develop

```
npm install
npm run dev      # local dev server
npm run build    # output in dist/
```

## Visitor flow

Welcome (choose language) → draw + write → Preview card → Save (PNG downloads) → Thank-you → auto-reset.
After 60 s of no activity (configurable), a 10 s countdown appears, then everything resets. Work-in-progress is autosaved to the browser, so a refresh doesn't lose it.

## Keyboard shortcuts

| Key | Action |
|---|---|
| P / 7 | Pen |
| E / 0 | Eraser |
| H | Hand (pan) |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl + scroll, pinch | Zoom |
| + / − | Zoom in / out |
| Shift+1 | Fit to drawing |
| Space + drag | Pan |
| N | Next visitor |
| ? | Shortcut list |
| Ctrl+Shift+S | Staff panel |
| Esc | Close panels |

## Staff panel (Ctrl+Shift+S, no PIN)

Default language, idle timeout, Instagram handle (printed on the card footer), export format (PNG / JPG / PDF), size (IG portrait / square / story) and scale (1–3×). Lists every saved card with a thumbnail, per-card download/delete, filter "OK to post only", **ZIP of all cards** (split into `ok-to-post/` and `private/`), and a **multi-page PDF "feedback book"**.

## Important notes

- Cards live in **each laptop's browser storage**. Clearing site data or using a private window deletes them. Press **Download all (ZIP)** from the staff panel before packing up (and ideally every hour; a "Backup due" bar appears hourly).
- Each laptop has its own separate cards — use the same ZIP step on each one and merge the folders afterwards.
- Instagram posting is manual: upload the PNGs from `ok-to-post/`.
- Excalidraw's own interface is English-only (it has no Malay translation), so its toolbar is hidden and replaced with the bilingual toolbar built into this app.
- Card text uses system fonts (Trebuchet MS / Segoe UI), so the card looks the same on screen and in the PNG on each laptop.
