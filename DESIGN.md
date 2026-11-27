---
name: ListeNote
description: A lecture recorder and notes app that looks like the notes app you already know, with each typed line a stop on a thin line through the lecture.
colors:
  paper: "#ffffff"
  raised: "#ffffff"
  sunken: "#f5f6f7"
  sidebar-grey: "#f4f5f7"
  list-grey: "#fafafb"
  ink: "#1f2328"
  muted: "#59636e"
  line: "#e5e7ea"
  line-strong: "#d0d5db"
  accent: "#2563eb"
  accent-fill: "#2563eb"
  accent-soft: "#eaf1fe"
  on-accent: "#ffffff"
  record: "#d92d20"
  danger: "#b42318"
  danger-fill: "#c4291c"
  danger-soft: "#fef3f2"
  ok: "#16723f"
  ok-soft: "#e6f4ec"
  warn: "#8a5a00"
  warn-soft: "#fdf3da"
  mark: "#fff1a8"
  paper-dark: "#1b1c1e"
  raised-dark: "#242528"
  sunken-dark: "#151617"
  sidebar-grey-dark: "#222326"
  list-grey-dark: "#1f2023"
  ink-dark: "#ececee"
  muted-dark: "#a3a8af"
  line-dark: "#2d2f33"
  line-strong-dark: "#3e4146"
  accent-dark: "#7eaaff"
  accent-fill-dark: "#2f6bf0"
  accent-soft-dark: "#1d2a44"
  record-dark: "#d33a2f"
  danger-dark: "#ff8f86"
  danger-soft-dark: "#36191a"
  ok-dark: "#6fd3a0"
  ok-soft-dark: "#15302a"
  warn-dark: "#f0c36a"
  warn-soft-dark: "#362a10"
  mark-dark: "#5e4f10"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.5
  note-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
    fontFeature: "tnum"
  route-time:
    fontFamily: "ui-monospace, \"SF Mono\", \"Cascadia Mono\", Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.5
    fontFeature: "tnum"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  soft: "10px"
  lg: "12px"
spacing:
  gap-tight: "6px"
  gap: "8px"
  gap-loose: "12px"
  card: "12px 14px"
  pane: "16px 20px"
  note-head: "22px 32px 14px"
  band: "10px 32px"
  route-gutter: "92px"
  page: "40px 48px 64px"
components:
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 13px"
    height: "34px"
  button-hover:
    backgroundColor: "{colors.sunken}"
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 13px"
    height: "34px"
  button-danger:
    backgroundColor: "{colors.danger-fill}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 13px"
    height: "34px"
  button-small:
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-small-pressed:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  button-record:
    backgroundColor: "{colors.record}"
    textColor: "{colors.on-accent}"
    padding: "0 16px"
    height: "36px"
  icon-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    size: "32px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "34px"
  nav-item:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  course-marker:
    rounded: "2px"
    width: "12px"
    height: "4px"
  note-row:
    textColor: "{colors.ink}"
    rounded: "{rounded.soft}"
    padding: "{spacing.card}"
  note-row-active:
    backgroundColor: "{colors.raised}"
  recording-band:
    backgroundColor: "{colors.list-grey}"
    padding: "{spacing.band}"
    height: "54px"
  rec-tag:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.soft}"
    padding: "5px 12px"
  rec-tag-paused:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.muted}"
  route-time:
    textColor: "{colors.muted}"
    typography: "{typography.route-time}"
    width: "48px"
  route-stop:
    backgroundColor: "{colors.paper}"
    size: "10px"
  route-stop-playing:
    backgroundColor: "{colors.accent}"
  route-stop-live:
    backgroundColor: "{colors.record}"
  note-line-linked:
    backgroundColor: "{colors.accent-soft}"
    rounded: "{rounded.xs}"
  badge-recording:
    textColor: "{colors.danger}"
  time-link:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  time-link-hover:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.on-accent}"
  tab:
    textColor: "{colors.muted}"
    rounded: "{rounded.soft}"
    padding: "5px 7px"
  tab-hover:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
  tab-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  tab-more-current:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  transcript-time:
    textColor: "{colors.muted}"
    typography: "{typography.route-time}"
  transcript-row-linked:
    backgroundColor: "{colors.accent-soft}"
    rounded: "{rounded.md}"
    padding: "7px 8px"
  menu:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.md}"
    padding: "5px"
  dialog:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "22px 24px"
    width: "460px"
---

# Design System: ListeNote

## Overview

**Creative North Star: "The Lecture Line"**

ListeNote looks like the notes app a student already knows, light and soft, at Apple Notes and Notion polish. A light grey sidebar holds courses and study tools where every notes app keeps them, a near-white column lists the course's notes as quiet rows, and a white page holds the note. Convention is the commitment, with one quiet ListeNote move: every line typed during a lecture is a stop on a thin blue line through the lecture, its time set in small mono figures beside it.

The system is neutral, soft and content-first. Three greys step from sidebar to list to page, one blue accent marks actions, selection, the route and the linked moment, and red is held back for recording and danger. Words are set in the operating system's own sans so the app feels native on macOS and Windows alike; times are set in the system mono. Panes are divided by 1px hairlines rather than shadows, and depth is reserved for things that float. Density is that of a desktop productivity tool: 14px body, 34px controls, 8px control corners and 10px soft surfaces.

The user rejected bold themes, square corners, colour bands and pill badges for this world, and the earlier warm-cream ground with serif headings before it.

**Key Characteristics:**
- Three resizable panes stepping from grey sidebar to near-white list to white note, divided by hairlines.
- One accent colour (blue by default, user-selectable) for actions, selection, focus, the route and the linked transcript moment.
- Red only for the recording state, destructive actions and errors.
- System sans for words, system mono with tabular figures for lecture times.
- The route: a 2px accent line in the editor gutter with a 10px stop at every stamped line.
- Recording status, time, Pause and Stop sit in a band directly under the note header.
- The study panel is a full-height column beside the note, and the caret's line is linked to its transcript moment on both sides.
- Full light and dark themes that follow the operating system.

## Colors

A cool neutral ground in three close steps, one accent and one alarm colour; every pairing used for text is chosen to meet WCAG AA.

### Primary
- **Notes Blue** (accent / accent-fill): the single accent. Fills the primary button (New note, Save) and the play button, tints the active sidebar row and the selected tab, draws the focus ring, the caret, the resize divider highlight, the route and its stops, and colours inline time links in study panels. In dark mode the text-role accent lifts to a lighter blue (accent-dark) while the fill stays saturated (accent-fill-dark) so white labels on it still read.
- **Blue Wash** (accent-soft): the tint behind the selected tab, the active sidebar row, the "now playing" editor line, linked transcript rows, the user's own chat messages and text selection.
- **Route Blue**: the route line is the accent mixed to 45% opacity (`color-mix(in oklab, accent 45%, transparent)`), so it reads as a guide, not a rule.
- Students can swap the accent for Forest, Crimson or Ocean in Settings; each swap replaces accent, accent-fill and accent-soft together and nothing else.

### Secondary
- **Record Red** (record): the record button, the recording dot, and the newest stop on the route while recording. It is the colour of "the microphone is on".
- **Danger Red** (danger / danger-fill / danger-soft): destructive buttons (Stop, Delete), the recording status tag, error notices, wrong quiz answers, overdue assignments and the newest stamped time while recording. Danger-soft also rings the live stop with a 3px halo.

### Tertiary
- **Done Green** (ok / ok-soft): correct quiz answers, a connected AI status dot, "Good" grade labels.
- **Amber** (warn / warn-soft): warning notices, assignments due soon, an unconfigured AI status dot, "Hard" grade labels.
- **Highlighter** (mark): search-match highlighting in text.

### Neutral
- **Paper** (paper): the note page and study panel. Paper and surface share this value in both themes.
- **List Grey** (list-grey): the notes-list ground and the recording band, one quiet step off white.
- **Sidebar Grey** (sidebar-grey): the sidebar ground, the darkest of the three light steps. In dark mode the steps invert the same way the platform apps do: sidebar lightest, list between, note darkest.
- **Raised** (raised): buttons, inputs, cards, menus, dialogs and the open note row. White in light mode; one step lighter than paper in dark mode so lifted things separate.
- **Sunken** (sunken): button and tab hover fill, the paused recording tag.
- **Ink** (ink): all primary text.
- **Muted Slate** (muted): secondary text, meta lines, placeholders, idle icons and route times. At least 5.6:1 on every ground it sits on.
- **Hairline** (line): pane dividers, card borders, the open note row's ring, and subtle hover fills on icon buttons and nav rows.
- **Strong Hairline** (line-strong): control borders (buttons, inputs, chips, menus, dialogs) and scrollbar thumbs.

### Named Rules
**The One Blue Rule.** One accent at a time, and only for actions, selection, focus, the route and the linked moment. Never use the accent for decoration, headings or illustration.

**The Red Means Recording Rule.** Red appears only for the live recording, destructive actions and errors. A red element anywhere else will be read as "something is recording" or "something went wrong".

## Typography

**Display Font:** the system UI sans (-apple-system / SF on macOS, Segoe UI Variable on Windows, with system-ui, Roboto, Helvetica Neue, Arial fallbacks)
**Body Font:** the same system UI sans
**Label/Mono Font:** the system mono (ui-monospace: SF Mono on macOS, Cascadia Mono or Consolas on Windows) for route times and inline code

**Character:** one sans family at different weights, as the platform notes apps do, with the platform mono reserved for lecture times so they read as a timecode column. Headings are semibold and slightly tightened; small labels are semibold rather than uppercase.

### Hierarchy
- **Display** (600, 32px, 1.15, -0.02em): the welcome screen heading only.
- **Headline** (600, 26px, 1.2, -0.015em): the note title and page titles (Settings, Assignments, Study guides).
- **Title** (600, 20px, 1.4, -0.01em): the notes-list heading and headings inside a note.
- **Title Small** (600, 18px): dialog and empty-state headings. Rendered markdown headings in the study panel step down to 17px, 14.5px and 13.5px at the same weight.
- **Note Body** (400, 16px, 1.7): the note editor and flashcard backs. Line length is capped at 620px (narrow) or 820px (normal) by the student's width setting.
- **Body** (400, 14px, 1.5): everything else: lists, panels, settings, chat.
- **Meta** (400, 13px): snippets in note rows, the note's meta line, small buttons.
- **Caption** (400, 12.5px): footnotes, field help, assignment meta, AI status.
- **Label** (600, 12px, tabular): sidebar section headings (sentence case) and inline time links.
- **Route Time** (500, 12.5px mono, tabular, right-aligned in 48px): the time beside each stamped line in the editor; the newest one while recording turns danger at 600. Transcript times use the same mono at 12px.

### Named Rules
**The Two Voices Rule.** Words are in the system sans; lecture times (editor gutter and transcript) and code are in the system mono. No third face, no decorative display face, no serif headings.

**The Tabular Time Rule.** Every time, duration and count (route times, transcript times, the recording timer, playback time, list counts) uses tabular figures so digits do not shuffle as they change.

## Layout

A three-pane desktop grid: sidebar (default 250px, 180 to 420px), notes list (default 272px, 200 to 520px) and the note, which always takes the remaining width and is the widest pane. Inside a note the study panel (default 340px, 280 to 760px) is a full-height column on the right; the note column beside it runs, from top, the header (title, then course and date meta), the recording band, the toolbar and the editor. Header and band span the note column only, never the panel. Every pane is resizable by dragging a 9px divider whose hairline turns into a 2px accent line on hover, focus or drag, and collapsible with an arrow button at its top. Pages without a list (Settings, Assignments, Study) centre their content at 720px.

Below 1020px the study panel drops below the editor, still under the header and band. Below 1180px the editor's route gutter tightens from 92px to 88px.

The editor reserves a 92px left gutter: the mono time sits right-aligned in its first 48px, the 2px route runs 21px in from the text edge, and each stop sits centred on the route at the first line of its paragraph, so typed lines stay left-aligned whether or not they carry a time. Spacing runs on a small set of steps: 6px and 8px gaps between items, 12px between groups, row padding of 12px by 14px, pane padding of 16px by 20px, note header and recording band side padding of 32px, and page padding of 40px by 48px. On macOS the sidebar leaves 44px at its top for the window buttons, and any pane that becomes leftmost leaves room for them.

**The Note Is Widest Rule.** The note pane takes whatever width is left after the sidebar, list and study panel; side panes never grow past their maximum to squeeze it.

## Elevation & Depth

Flat by default. Panes, rows, cards and the recording band sit on the ground and are separated by 1px hairlines and the three tonal steps of sidebar, list and paper. The open note row is lifted by tone alone: raised fill with a 1px hairline ring. A single two-layer shadow exists, and only things that float above the panes use it: menus, dialogs, toasts, a zoomed diagram, and the flashcard under review.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 1px 2px rgba(16, 24, 40, .06), 0 8px 24px rgba(16, 24, 40, .10)`; dark: `0 1px 2px rgba(0, 0, 0, .4), 0 10px 30px rgba(0, 0, 0, .45)`): menus, dialogs, toasts, the zoomed diagram and the review flashcard.
- **Hairline ring** (`box-shadow: 0 0 0 1px` line): outlines the open note row without a border or layout shift.
- **Live halo** (`box-shadow: 0 0 0 3px` danger-soft): rings the newest route stop while recording.

### Named Rules
**The Hairline Rule.** Structure is drawn with 1px lines and tonal steps, never with shadows. If it does not float over other content, it has no shadow.

## Shapes

Soft and consistent. Controls, inputs, cards, notices, menus and transcript rows take 8px corners. Soft surfaces that are selected or tagged rather than pressed (note rows, study tabs, the recording tag, toasts and chat messages) take 10px. Small inner pieces (menu items, inline time links, toolbar buttons, the focus ring) take 6px; inline code and keyboard keys take 4px. Dialogs and the review flashcard take 12px. Actions that are pills by convention (the record button, suggestion and attachment chips) are rounded at half their height; status is never a pill. Course colour markers are short 12 by 4px lines with 2px ends, never dots or pills. Route stops, status dots, swatches and the play button are circles. Borders are 1px; the only 2px lines are the focus ring, the route, the stop outline and the active divider. Linked transcript rows that touch merge into one block by squaring their shared corners.

## Components

### Buttons
Quiet, native-feeling, never loud except where they must be.
- **Shape:** 8px corners, 34px tall (28px small), 1px strong-hairline border, medium (500) label, optional 16px stroke icon before it.
- **Default:** raised fill, ink label. Hover steps to sunken, press to hairline.
- **Primary:** accent fill and border, white label; hover brightens the fill by 8%. Used once per area for the main action (New note, Save, Start review).
- **Danger:** danger-fill, white label (Stop, Delete).
- **Small toggle:** when pressed, accent-soft fill with accent border and label.
- **Record:** record red, white semibold label, mic icon, in the note header. While its note records it steps aside, because the recording band holds the one Stop control.
- **Icon button:** 32px square, 8px corners, no border, muted icon; hover fills with hairline and darkens the icon to ink.
- **Disabled:** 55% opacity, not-allowed cursor.

### Chips
- **Inline time link:** semibold 12px tabular label in accent on accent-soft, 6px corners; hover fills it with accent and turns the label white. Used where a summary, card or quiz question points back into the lecture.
- **Suggestion and attachment chips:** rounded at half height, raised fill, hairline border, 12.5 to 13px label; hover turns the border accent.
- **Recording label (notes list):** plain danger text at 600 in the row's meta line, with no fill or corners.

### Cards / Containers
- **Note rows:** borderless and transparent on the list grey, 10px corners, 12px by 14px padding, a course marker before the semibold title (in a single-course list the marker appears once, widened to 16px, before the list heading instead of on every row), a two-line muted snippet and a caption meta line. Hover lifts the row to raised; the open row is raised with a 1px hairline ring and shows its ••• menu.
- **Content cards** (flashcards in the panel, quiz questions, assignments, guides, settings providers): 8px corners, raised or paper fill, 1px hairline border that moves to strong hairline on hover. A checked provider takes an accent border on accent-soft.
- **Notices:** 8px corners, 12px by 14px padding; warning and error variants drop the border and use warn-soft or danger-soft.

### Inputs / Fields
- **Style:** 34px tall (28px small), 8px corners, 1px strong-hairline border on raised fill, muted placeholder. Search inputs carry a muted 16px magnifier inset 9px from the left.
- **Hover:** the border darkens to muted.
- **Focus:** the global 2px accent focus ring at 2px offset; the caret is accent.
- **Labels:** 13px medium above the field with 5px gap; help text in muted caption below.
- **Inline select in the note header:** borderless, transparent and sized to its content so it reads as meta text; the border and ink colour return on hover or focus.
- **Note title:** borderless 26px semibold; focus shows a 2px accent underline instead of a ring.

### Navigation
- **Sidebar rows:** 14px ink label with a muted 18px stroke icon or a course marker, 7px by 10px padding, full-width. Hover fills with hairline; the active row fills with accent-soft and turns label and icon accent at semibold.
- **Section headings:** 12px semibold muted, sentence case, foldable with a rotating chevron.
- **Counts:** 12px muted tabular numbers at the row's end; an accent or danger filled count when something needs attention.
- **Study panel tabs:** soft-filled, not underlined. 13.5px medium muted labels with 10px corners; hover fills sunken and turns the label ink; the selected tab fills accent-soft with an accent semibold label. Tabs stay on one row: those that do not fit move, last first, into a "More" tab with a small chevron outside the tablist that opens a menu of the hidden tabs, and More takes the selected fill when the current tab is one of them.

### The Route (signature component)
The editor gutter is the lecture's timeline. A 2px route line in 45% accent runs the full height of a note that has any stamped line. Each line typed while recording carries its time in muted mono to the left of the route and a 10px hollow stop on it (paper fill, 2px accent outline). The line now playing, and the stamped line the caret is on, get a filled accent stop and an accent-soft highlight on their text; while recording, the newest line's stop is filled record red with a danger-soft halo and its time turns danger semibold. Hovering a time turns it accent and underlined; clicking it replays that moment.

### Recording Band (signature component)
A band directly under the note header: 54px tall, 10px by 32px padding, list-grey fill, hairline bottom border. While recording it holds a recording tag (danger-soft, 10px corners, red dot and danger label; sunken and muted when paused), the elapsed time in 16px semibold ink tabular figures, then Pause and a danger Stop at the far end. There is no level meter or track. During playback it holds a 38px circular accent play button, an accent seek bar and a muted tabular time label. A compact recording box (danger-soft, 8px corners, static dot, muted time) sits in the sidebar on every other view while a recording runs.

### Transcript
Each row is a muted time in the system mono (500, 12px, tabular) over the spoken text, 7px by 8px padding with 8px corners, and no speaker labels. The link shows on both sides at once: the stamped note line the caret is on is tinted with a filled stop (see The Route), and the transcript rows around the moment it was typed fill accent-soft, their times turn accent, and adjacent linked rows merge into one block. While anything is linked, a muted 12.5px one-line hint saying what the tint means is pinned to the foot of the study panel (sticky, paper fill, hairline top border, 10px by 28px padding so its text lines up with the transcript, balanced line breaks). It is first-run only: it shows on the first three notes that have a link, then retires for good.

### Editor Toolbar
A single row of 30 by 28px borderless tool buttons with muted stroke icons and 6px corners, grouped by 1px strong-hairline separators, between the recording band and the editor.

## Do's and Don'ts

### Do:
- **Do** take every colour from the tokens and set both the light and the dark value together.
- **Do** use the accent only for actions, selection, focus, the route and the linked moment (The One Blue Rule).
- **Do** keep headings semibold (600) in the system sans, and set lecture times in the system mono with tabular figures.
- **Do** draw structure with 1px hairlines and tonal steps; give controls 8px corners and selected or tagged soft surfaces 10px.
- **Do** mark courses with the 12 by 4px coloured line.
- **Do** reserve the Float shadow for menus, dialogs, toasts and other layers that sit above the panes.
- **Do** keep sidebar and section labels in sentence case at 12px semibold muted.
- **Do** use 16 to 18px stroke icons (1.8 stroke, round caps) drawn inline as SVG.
- **Do** keep text pairings at 4.5:1 or better in both themes, including text on record and danger fills.

### Don't:
- **Don't** bring back the warm-cream ground, serif headings, bold themes or square corners; the user rejected them.
- **Don't** use tinted colour bands or pill badges; the recording band stays list grey, and status is a soft 10px tag or plain coloured text.
- **Don't** mark courses with dots or pills.
- **Don't** add a third typeface or a decorative display face.
- **Don't** use red for anything but recording, destructive actions and errors (The Red Means Recording Rule).
- **Don't** put shadows on panes, list rows or cards (The Hairline Rule).
- **Don't** add uppercase eyebrow labels, kickers or tracked-out small caps above headings.
- **Don't** introduce novelty styling (gradients, glass, oversized radii, coloured backgrounds behind sections) that the platform notes apps would not use.
