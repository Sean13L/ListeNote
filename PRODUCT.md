# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

ListeNote is an Electron desktop app (plain ES modules in `renderer/`, no build step). macOS and Windows are equally first-class: a Windows student must feel as at home as a Mac student. Linux builds from source and is not a design target.

## Users

University students with a laptop in lectures and tutorials, carrying several courses per term. During class they record and type notes at the same time; later they study from those notes for assignments and exams. The author is one of these students.

## Product Purpose

ListeNote records a lecture while the student types, transcribes it on their own computer, and turns notes plus transcript into study material: summaries, answers to questions, flashcards, quizzes, practice problems and exam study guides. Success means a student can go from "I was in that lecture" to "I can study it" without retyping, re-listening end to end, or paying for another service.

## Positioning

Study tools run through an AI the student already pays for (Claude Code, Codex, Gemini CLI) or a local model (Ollama), with no API keys and no extra subscription. Everything else stays on the student's computer: no account, no server, no tracking. It is free and MIT-licensed. Code comments reference Noted as the feature benchmark for recording and sharing.

## Operating Context

- In the room: a lecture hall or tutorial, laptop open, often on battery, typing while the recording runs. A recording can last a whole lecture, and the student keeps using the rest of the app (other notes, courses, settings) while it runs.
- Online classes: Zoom, Teams, Meet or a YouTube lecture captured as computer audio, alone or mixed with the microphone.
- Study sessions: flashcard review with spaced repetition, master notes that combine the lectures a test covers, assignment tracking, study guides before exams.
- Term setup: courses grouped into folders (usually by term), calendar or syllabus import to build the class schedule, a notification when class starts.

## Capabilities and Constraints

- Core feature: every line typed while recording is linked to that moment; clicking its time replays what was being said.
- Transcription runs locally with Whisper (Transformers.js, ONNX Runtime). Audio is never uploaded. The only downloads are the Whisper model and an optional speaker-labelling model.
- AI study tools send only text (the note, its transcript, relevant course-material passages) to the AI the student picked, under their own account. The AI tool runs with its tools off or read-only, in an empty folder.
- Recording, notes, transcription, search, assignments and manual flashcard review all work with no AI configured.
- Locked notes are encrypted with the OS keychain; their recordings and attachments are not.
- Not included: phone, tablet or watch apps, handwriting, sync between devices, hosted share links. Reminders only fire while the app is open.
- Open decision: how Windows is shipped. Only a macOS Apple-silicon `.dmg` is published today; Windows builds from source.
- Provider status is stated honestly: Claude Code is tested; Codex, Gemini CLI and Ollama are written from documentation and not yet tested.

## Brand Commitments

- Name: ListeNote, with a capital N.
- App icon: a white microphone outline on black (`build/icon.png`).
- Look: the familiar notes-app category standard, executed at full craft. Apple Notes and Notion set the bar (chosen 2026-11-27 over distinctive directions). Convention is the commitment: no novelty styling smuggled in.
- Voice, observed in shipped copy: plain, direct and specific; says what happens to the student's data; labels limits and untested features instead of hiding them; uses Commonwealth spelling (colour, licence).

## Evidence on Hand

- README feature list, privacy section and keyboard reference (`README.md`).
- Public GitHub releases (`Sean13L/ListeNote`), version 0.1.3.
- No testimonials, user counts, reviews, benchmarks or press exist. Do not invent any, and do not make unsourced claims such as "#1", "most accurate" or "100% secure".

## Product Principles

1. Private by construction. Nothing leaves the computer except text the student chose to send to their own AI, and the app says exactly what goes.
2. Bring your own AI, never require one. Every AI feature uses a tool the student already has, and the core app works fully without any.
3. Free and honest. No paid tier, upsells, fake urgency or invented proof. Untested or missing things are labelled as such.
4. Never lose the lecture. Recording survives crashes and navigation, and nothing else in the app blocks or endangers it.
5. Equally at home on Mac and Windows. Shortcuts, window controls and conventions follow each OS.

## Accessibility & Inclusion

WCAG 2.1 AA: body text contrast of at least 4.5:1, full keyboard operation with visible focus and no traps, labelled controls, and meaningful alt text (empty for decorative images). Panes, shortcuts and dialogs must all be usable without a mouse.
