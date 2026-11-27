---
name: ListeNote
description: A lecture recorder and notes app that looks like the notes app you already know.
colors:
  paper: "#ffffff"
  raised: "#ffffff"
  sunken: "#f5f6f7"
  sidebar-grey: "#f5f6f7"
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
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  bubble: "10px"
  lg: "12px"
spacing:
  gap-tight: "6px"
  gap: "8px"
  gap-loose: "12px"
  card: "12px 14px"
  pane: "16px 20px"
  note-head: "22px 32px 14px"
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
  note-card:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.md}"
    padding: "{spacing.card}"
  time-chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  time-chip-hover:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.on-accent}"
  tab:
    textColor: "{colors.muted}"
    padding: "8px 9px 9px"
  tab-selected:
    textColor: "{colors.accent}"
  tab-more:
    textColor: "{colors.muted}"
    padding: "8px 7px 9px"
  tab-more-current:
    textColor: "{colors.accent}"
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
  record-bar:
    backgroundColor: "{colors.danger-soft}"
    padding: "10px 24px"
    height: "54px"
---

# Design System: ListeNote

## Overview

**Creative North Star: "The Familiar Notebook"**

ListeNote looks like the notes app a student already knows, done with care: Apple Notes and Notion are the bar, and convention is the commitment. A grey sidebar holds courses and study tools where every notes app keeps them, a column of bordered note cards sits beside it, and a white page holds the note. The only thing that makes it ListeNote rather than any notes app is the recording: a blue time chip leads every line typed during a lecture, and a red-tinted bar runs along the bottom while the microphone is on.

The system is neutral, quiet and content-first. Cool greys carry structure, one blue accent marks what is selected or actionable, and red is held back for recording and danger. Everything is set in the operating system's own sans, so the app feels native on macOS and on Windows alike. Panes are separated by 1px hairlines rather than shadows; depth is reserved for things that float. Density is that of a desktop productivity tool: 14px body, 34px controls, 8px corners.

This look replaced an earlier warm-cream ground with serif headings, which read as decoration rather than tool. That direction is rejected.

**Key Characteristics:**
- Three resizable panes on a neutral grey and white ground, divided by hairlines.
- One accent colour (blue by default, user-selectable) for primary action, selection, focus and timestamps.
- Red only for the recording state, destructive actions and errors.
- System sans throughout, semibold headings, tabular numerals for every time and count.
- 8px corners and 1px borders; flat at rest, shadow only on floating layers.
- Full light and dark themes that follow the operating system.

## Colors

A cool neutral ground with one accent and one alarm colour; every pairing used for text is chosen to meet WCAG AA.

### Primary
- **Notes Blue** (accent / accent-fill): the single accent. Fills the primary button (New note, Save) and the play button, outlines the open note card, tints the active sidebar row and selected tab, draws the focus ring, the text caret and the resize divider highlight, and colours every time chip. In dark mode the text-role accent lifts to a lighter blue (accent-dark) while the fill stays a saturated blue (accent-fill-dark) so white labels on it still read.
- **Blue Wash** (accent-soft): the tint behind selected rows, time chips, the "now playing" line, the user's own chat messages and text selection.
- Students can swap the accent for Forest, Crimson or Ocean in Settings; each swap replaces accent, accent-fill and accent-soft together and nothing else.

### Secondary
- **Record Red** (record): the record button, the pulsing recording dot and the input level meter. It is the colour of "the microphone is on".
- **Danger Red** (danger / danger-fill / danger-soft): destructive buttons (Stop, Delete), error notices, wrong quiz answers, overdue assignments and the Recording badge. Danger-soft also tints the whole record bar while recording.

### Tertiary
- **Done Green** (ok / ok-soft): correct quiz answers, a connected AI status dot, "Good" grade labels.
- **Amber** (warn / warn-soft): warning notices, assignments due soon, an unconfigured AI status dot, "Hard" grade labels.
- **Highlighter** (mark): search-match highlighting in text.

### Neutral
- **Paper** (paper): the content ground for the note, notes list and panes. The surface and paper roles share this value in both themes.
- **Raised** (raised): buttons, inputs, cards, menus and dialogs. White in light mode; one step lighter than paper in dark mode so floating things separate.
- **Sidebar Grey** (sidebar-grey): the sidebar ground. In dark mode it is slightly lighter than the content, as in the platform notes apps.
- **Sunken** (sunken): button hover fill.
- **Ink** (ink): all primary text.
- **Muted Slate** (muted): secondary text, meta lines, placeholders, idle icons. Still at least 5.6:1 on every ground it sits on.
- **Hairline** (line): pane dividers, card borders, subtle hover fills on icon buttons and nav rows.
- **Strong Hairline** (line-strong): control borders (buttons, inputs, chips, menus, dialogs) and scrollbar thumbs.

### Named Rules
**The One Blue Rule.** One accent at a time, and only for primary action, selection, focus and timestamps. Never use the accent for decoration, headings or illustration.

**The Red Means Recording Rule.** Red appears only for the live recording, destructive actions and errors. A red element anywhere else will be read as "something is recording" or "something went wrong".

## Typography

**Display Font:** the system UI sans (-apple-system / SF on macOS, Segoe UI Variable on Windows, with system-ui, Roboto, Helvetica Neue, Arial fallbacks)
**Body Font:** the same system UI sans
**Label/Mono Font:** ui-monospace (SF Mono, Menlo) for inline code only

**Character:** one family at different weights, as the platform notes apps do. Headings are semibold and slightly tightened; body is regular; small labels are semibold rather than uppercase.

### Hierarchy
- **Display** (600, 32px, 1.15, -0.02em): the welcome screen heading only.
- **Headline** (600, 26px, 1.2, -0.015em): the note title and page titles (Settings, Assignments, Study guides).
- **Title** (600, 20px, 1.4, -0.01em): the notes-list heading and headings inside a note.
- **Title Small** (600, 18px): dialog and empty-state headings. Rendered markdown headings in the study panel step down to 17px, 14.5px and 13.5px at the same weight.
- **Note Body** (400, 16px, 1.7): the note editor and flashcard backs. Line length is capped at 620px (narrow) or 820px (normal) by the student's width setting.
- **Body** (400, 14px, 1.5): everything else: lists, panels, settings, chat.
- **Meta** (400, 13px): snippets in note cards, the note's meta line, toolbar-adjacent text, small buttons.
- **Caption** (400, 12.5px): footnotes, field help, assignment meta, AI status.
- **Label** (600, 12px, tabular numerals): sidebar section headings (sentence case), time chips, transcript speaker and time lines.

### Named Rules
**The One Family Rule.** Every word is in the system sans. No second display face, no serif headings; monospace is for code only.

**The Tabular Time Rule.** Every time, duration and count (time chips, transcript times, the recording timer, playback time, list counts) uses tabular numerals so digits do not shuffle as they change.

## Layout

A three-pane desktop grid: sidebar (default 250px, 180 to 420px), notes list (default 272px, 200 to 520px) and the note, which always takes the remaining width and is the widest pane. Inside a note a study panel sits on the right (default 340px, 280 to 760px). Every pane is resizable by dragging a 9px divider whose hairline turns into a 2px accent line on hover, focus or drag, and collapsible with an arrow button at its top. Pages without a list (Settings, Assignments, Study) span the sidebar's neighbour and centre their content at 720px.

Below 1020px the study panel moves under the editor instead of beside it. Below 1180px the editor's left gutter tightens from 72px to 68px.

The note editor reserves a 72px left gutter where time chips hang outside the text, so typed lines stay left-aligned whether or not they carry a time. Spacing runs on a small set of steps: 6px and 8px gaps between items, 12px between groups, card padding of 12px by 14px, pane padding of 16px by 20px, note header padding of 22px by 32px, and page padding of 40px by 48px. On macOS the sidebar leaves 44px at its top for the window buttons, and any pane that becomes leftmost leaves room for them.

**The Note Is Widest Rule.** The note pane takes whatever width is left after the sidebar, list and study panel; side panes never grow past their maximum to squeeze it.

## Elevation & Depth

Flat by default. Panes, cards, rows and the record bar sit on the ground and are separated by 1px hairlines and tonal steps (sidebar grey against paper, raised against paper in dark mode). A single two-layer shadow exists, and only things that float above the panes use it: menus, dialogs, toasts, a zoomed diagram, and the flashcard under review.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 1px 2px rgba(16, 24, 40, .06), 0 8px 24px rgba(16, 24, 40, .10)`; dark: `0 1px 2px rgba(0, 0, 0, .4), 0 10px 30px rgba(0, 0, 0, .45)`): menus, dialogs, toasts, the zoomed diagram and the review flashcard.
- **Selection ring** (`box-shadow: 0 0 0 1px` accent): doubles the 1px accent border of the open note card into a 2px outline without shifting layout.

### Named Rules
**The Hairline Rule.** Structure is drawn with 1px lines, never with shadows. If it does not float over other content, it has no shadow.

## Shapes

Gently rounded and consistent. Controls, inputs, cards, notices and menus take 8px corners. Small inner pieces (menu items, time chips, toolbar buttons, the focus ring) take 6px; inline code and keyboard keys take 4px. Toasts and chat messages take 10px; dialogs and the review flashcard take 12px. Pills (suggestion chips, attachment chips, the record button) are fully rounded at half their height, and dots (course colours, status, recording, swatches, play button) are circles. Borders are always 1px; the only 2px lines are the focus ring, the selected-tab underline and the active divider.

## Components

### Buttons
Quiet, native-feeling, never loud except where they must be.
- **Shape:** 8px corners, 34px tall (28px small), 1px strong-hairline border, medium (500) label, optional 16px stroke icon before it.
- **Default:** raised fill, ink label. Hover steps to sunken, press to hairline.
- **Primary:** accent fill and border, white label; hover brightens the fill by 8%. Used once per area for the main action (New note, Save, Start review).
- **Danger:** danger-fill, white label (Stop, Delete).
- **Small toggle:** when pressed, accent-soft fill with accent border and label.
- **Record:** a pill in record red with a white semibold label and a mic icon, in the note header. While its note records it steps aside, because the record bar holds the one Stop control.
- **Icon button:** 32px square, 8px corners, no border, muted icon; hover fills with hairline and darkens the icon to ink.
- **Disabled:** 55% opacity, not-allowed cursor.

### Chips
- **Time chip:** semibold 11.5 to 12px tabular label in accent on accent-soft, 6px corners. In the editor it hangs in the left gutter, 56px wide; hover fills it with accent and turns the label white. Clicking it replays that moment. In the transcript the time is plain muted text beside the speaker name instead, turning accent and underlined on hover.
- **Suggestion and attachment chips:** pill-shaped, raised fill, hairline border, 12.5 to 13px label; hover turns the border accent.
- **Badges:** the Recording badge is semibold danger text on danger-soft with 5px corners.

### Cards / Containers
- **Corner Style:** 8px (12px for the review flashcard).
- **Background:** raised, on a paper or sidebar-grey ground.
- **Shadow Strategy:** none at rest (see Elevation & Depth); only the review flashcard carries Float.
- **Border:** 1px hairline; hover moves to strong hairline. The open note card takes a 1px accent border plus a 1px accent ring.
- **Internal Padding:** 12px by 14px for note cards and questions; 10px by 13px for settings and assignment rows.
- **Notices:** 8px corners, 12px by 14px padding; warning and error variants drop the border and use warn-soft or danger-soft.

### Inputs / Fields
- **Style:** 34px tall (28px small), 8px corners, 1px strong-hairline border on raised fill, muted placeholder. Search inputs carry a muted 16px magnifier inset 9px from the left.
- **Hover:** the border darkens to muted.
- **Focus:** the global 2px accent focus ring at 2px offset; the caret is accent.
- **Labels:** 13px medium above the field with 5px gap; help text in muted caption below.
- **Inline select in the note header:** borderless and muted so it reads as meta text; the border and ink colour return on hover or focus.
- **Note title:** borderless 26px semibold; focus shows a 2px accent underline instead of a ring.

### Navigation
- **Sidebar rows:** 14px ink label with a muted 18px stroke icon, 7px by 10px padding, full-width. Hover fills with hairline; the active row fills with accent-soft and turns label and icon accent at semibold.
- **Section headings:** 12px semibold muted, sentence case, foldable with a rotating chevron.
- **Counts:** 12px muted tabular numbers at the row's end; an accent or danger filled pill when something needs attention.
- **Tabs (study panel):** 13.5px medium muted labels with a 2px underline slot; the selected tab is accent with a 2px accent underline at semibold. Tabs never scroll or wrap: those that do not fit the panel's width move, last first, into a "More" tab button with a small chevron that sits outside the tablist and opens a menu of the hidden tabs. When the current tab is one of the hidden ones, More takes the selected treatment (accent label, accent underline, semibold).

### Record Bar (signature component)
The transport along the bottom of a note: 54px tall, 10px by 24px padding, hairline top border on raised fill. While recording the whole bar tints danger-soft and shows a pulsing 11px record dot, the elapsed time (16px semibold ink, tabular), a 120px level meter in record red, Pause, and a danger Stop. During playback it holds a 38px circular accent play button, an accent seek bar and a tabular time label. A compact version (danger-soft, 8px corners, static dot) sits in the sidebar on every other view while a recording runs, its time in muted tabular figures.

### Editor Toolbar
A single row of 30 by 28px borderless tool buttons with muted stroke icons and 6px corners, grouped by 1px strong-hairline separators, under the note header and above the editor.

## Do's and Don'ts

### Do:
- **Do** take every colour from the tokens and set both the light and the dark value together.
- **Do** use the accent only for primary action, selection, focus and time chips (The One Blue Rule).
- **Do** keep headings semibold (600) in the system sans and give every time or count tabular numerals.
- **Do** draw structure with 1px hairlines and give 8px corners to controls, cards, inputs and menus.
- **Do** reserve the Float shadow for menus, dialogs, toasts and other layers that sit above the panes.
- **Do** keep sidebar and section labels in sentence case at 12px semibold muted.
- **Do** use 16 to 18px stroke icons (1.8 stroke, round caps) drawn inline as SVG.
- **Do** keep text pairings at 4.5:1 or better in both themes, including text on record and danger fills.

### Don't:
- **Don't** bring back the warm-cream ground or serif headings; this world replaced them.
- **Don't** add a second typeface or a decorative display face.
- **Don't** use red for anything but recording, destructive actions and errors (The Red Means Recording Rule).
- **Don't** put shadows on panes, list cards or rows (The Hairline Rule).
- **Don't** add uppercase eyebrow labels, kickers or tracked-out small caps above headings.
- **Don't** introduce novelty styling (gradients, glass, oversized radii, coloured backgrounds behind sections) that the platform notes apps would not use.
