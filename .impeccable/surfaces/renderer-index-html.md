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

THESIS: The familiar notes app done right, light and soft, at Apple Notes and Notion polish, with one quiet ListeNote move: each typed line is a stop on a thin line through the lecture. Refuses bold themes, square corners, colour bands and pill badges (the user rejected them).

OWN-WORLD: Neutral cool greys: light grey sidebar, near-white notes list, white note. One blue accent for actions, selection, the route and the linked moment; red only for recording and danger. System sans, mono tabular times. 8px radii on controls and cards, 10px on soft surfaces (note rows, tabs, the recording tag), 1px hairlines, no heavy shadows. Courses marked by a short coloured line, never a pill.

STORY: The student presses Record; status and time sit in a band under the title with Pause and Stop. They type, each line gets a time and a stop on the route, the newest stop is red, and the transcript beside it tints what was being said around the line the caret is on.

FIRST VIEWPORT: Left, grey sidebar with search, New note, Study, course folders with line markers. Next, the course's notes as quiet rows, the open one lifted onto white. Centre, title and course/date meta, then the recording band (status tag, time, Pause, Stop; no track), toolbar, then lines with mono times left of a thin blue route. Right, soft-filled tabs (Transcript, Summary, Ask, More) and transcript rows of time over text with no speaker labels.

FORM: user-directed: variant C of the light-shell sketches (.impeccable/mocks/decision/light-c-top.html), recording track removed at the user's request; seed:d4503cd43202ceb6.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
