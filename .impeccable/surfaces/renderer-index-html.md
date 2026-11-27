---
version: 1
slug: "renderer-index-html"
primary_target: "renderer/index.html"
related_targets: ["renderer/styles.css"]
---

# App shell and lecture screen

Scope: the ListeNote window (sidebar, notes list, note with study panel, record bar), every view. Mode: Operate.
Task: in a lecture, record and type at the same time while the live transcript runs; between classes, find a course's notes and study tools fast.
Constraints: three resizable, hideable panes stay; light/dark follows the system; system fonts only, no remote assets; WCAG AA; Mac and Windows equal.
Problems to fix: cramped spacing, hard navigation, busy during class, generic look (accepted: the user chose the category standard).

## Direction contract

THESIS: The familiar notes app done right: neutral, quiet, content-first, at Apple Notes and Notion polish. Refuses the warm-cream ground and serif headings ListeNote had, which read as decoration rather than tool.

OWN-WORLD: Neutral cool greys; white content, light grey sidebar (dark: near-black content, slightly lighter sidebar). One blue accent for primary actions, selection and timestamps; red only for recording and danger. System sans for everything, semibold headings, tabular numerals for times. 8px radii, 1px hairline borders, no heavy shadows.

STORY: The student opens the app, sees courses and notes where every notes app keeps them, presses Record, types, and the live transcript fills the right panel. Nothing competes with the note while recording.

FIRST VIEWPORT: Left, grey sidebar: search, New note, All notes, Study, course folders. Next, the course's notes as bordered cards with the open one outlined in blue and a red Recording badge. Centre, the note title in semibold sans, toolbar, then lines each led by a blue time chip. Right, Transcript tab with speaker and time above each line. Bottom, a red-tinted record bar with time, Pause and a red Stop.

FORM: canon (the category standard, the standing exit chosen over the roll); seed:d4503cd43202ceb6.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
