# ListeNote

Record lectures, type notes that are linked to the recording, and study from them using the AI subscription you already pay for. Everything is stored on your own computer.

- **Timestamped notes.** Every line you type while recording is linked to that moment. Click the time beside a line to hear what was being said.
- **On-device transcription.** Whisper runs on your computer. Audio is never uploaded.
- **Study tools powered by your own AI.** Summaries, questions about a lecture, flashcards, practice quizzes and exam study guides run through a command-line AI tool you have already signed in to (Claude Code, Codex, Gemini CLI) or a local model (Ollama). No API keys.
- **Built for school.** Courses grouped by term, spaced-repetition flashcard review, an assignment tracker that picks up deadlines mentioned in lectures, `#tags`, search across notes and transcripts.
- **Record anything.** Microphone, computer audio (Zoom, Teams, Meet, a YouTube lecture), or both. Live transcription while you record, speaker labels you can rename, three recording qualities, noise reduction, mic and speaker choice, and a shortcut that starts recording from any app (⌘⌥⇧R / Ctrl+Alt+Shift+R).
- **Playback.** 0.7× to 2× speed, skip pauses, non-destructive trim, a three-band EQ, and the line being spoken highlighted as it plays.
- **Course materials.** Add slides, textbook chapters and handouts (PDF, PowerPoint, Word, text). Every AI answer draws on the most relevant passages and cites the page or slide.
- **Practice.** Fundamentals, practice and challenge problems with hints and worked solutions, plus AI-drawn concept diagrams.
- **Schedule.** Import your Google, Apple or Outlook calendar (file or iCal link) and let the AI pick out your classes, or have it read a syllabus for class dates, topics, exams and deadlines. You get a notification when class starts and a one-click note for each session.
- **Master notes.** Pick the lectures a test covers and combine them into one note to study and keep editing.
- **Notes.** Images and file attachments, text document import, multiple-recording import, import from a video link, lock a note (Touch ID or a password, encrypted on disk), reminders, open a note in a second window, share a note as a single web page with its recording, export to PDF, Markdown, text or audio, and calendar export of due dates.

## Install

**Mac (Apple silicon):** download `ListeNote-0.1.0-arm64.dmg` from the [latest release](https://github.com/Sean13L/ListeNote/releases/latest), open it and drag ListeNote to Applications. The app is not notarized by Apple, so the first time, right-click it and choose **Open** (or allow it under System Settings → Privacy & Security).

**From source** (macOS, Windows or Linux) requires [Node.js](https://nodejs.org) 22 or newer.

```bash
git clone https://github.com/Sean13L/ListeNote.git
cd ListeNote
npm install
npm start
```

To build an installable app (a `.dmg` on macOS) into `dist/`:

```bash
npm run dist
```

The build is signed locally (ad hoc), not by an Apple developer account, so macOS asks for confirmation the first time it opens.

## Set up the AI

ListeNote looks for these tools on your computer and uses whichever you pick in **Settings**:

| Tool | Uses | Status |
| --- | --- | --- |
| [Claude Code](https://claude.com/claude-code) (`claude`) | your Claude subscription | tested |
| [Codex CLI](https://developers.openai.com/codex/cli) (`codex`) | your ChatGPT subscription | written from the CLI's documentation, not yet tested |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`gemini`) | your Google account | written from the CLI's documentation, not yet tested |
| [Ollama](https://ollama.com) (`ollama`) | a model on your machine, fully offline | not yet tested |
| Custom command | any program that reads a prompt on stdin and prints an answer | |

For Claude, Settings offers Haiku, Sonnet and Opus 5.5 and an effort level (low to max).

Install one, sign in by running it once in a terminal, then use **Settings → Test connection**.

To import a YouTube or other video lecture by link, install [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`brew install yt-dlp`). Only the audio is downloaded.

Recording, notes, transcription, search, assignments and manual flashcard review all work with no AI configured.

## Privacy

- Notes, recordings and transcripts live in a folder on your computer (**Settings → Show folder**). There is no account, server, analytics or tracking.
- Locked notes are encrypted with your computer's keychain. Their recordings and attachments are not encrypted.
- Transcription is local. Speaker labels use a second local model (385 MB, downloaded once). The only download is the Whisper model itself (150 MB to 970 MB depending on the size you pick), fetched once from huggingface.co.
- When you use Summary, Ask, Cards, Quiz, Practice or Study guides, the **text** of that note, its transcript and the most relevant course-material passages are sent to the AI you chose. Calendar import sends event names and times; syllabus import sends the syllabus text. All of this goes under your own account and that provider's terms. Audio is never sent. Choose Ollama to keep this step local too.
- The AI tool is launched with its tools switched off (Claude) or read-only (Codex), in an empty folder, so text in a lecture cannot make it run commands or read your files.
- **Settings → Delete all data** removes everything.

## Recording other people

Recording a class can need permission. Rules differ by school and by region, and some places require everyone being recorded to agree. Check your school's policy or ask your lecturer before you record.

## Keyboard

| | |
| --- | --- |
| New note | ⌘N / Ctrl+N |
| Start or stop recording | ⌘⇧R / Ctrl+Shift+R |
| Play or pause | ⌘⇧Space / Ctrl+Shift+Space |
| Play from the current line | Alt+P |
| Search | ⌘F / Ctrl+F |
| Highlight | ⌘⇧H / Ctrl+Shift+H |
| Flashcard review | Space to show, 1 to 4 to grade |

## Not included

ListeNote is a desktop app only: no phone, tablet or watch app, no Apple Pencil handwriting, and no sync between devices. Sharing creates a web page file you send yourself; there is no hosted link. Reminders and class notifications only appear while ListeNote is open. Calendar times with a time zone are read as this computer's local time.

## Development

```bash
npm test     # unit tests (node --test)
npm start    # run the app
```

- `main/` Electron main process: storage, the AI command runner, the Whisper worker.
- `renderer/` the window: plain ES modules, no build step.
- `renderer/lib/` pure logic shared with the tests.

## Licence

MIT. See [LICENSE](LICENSE). Speech recognition uses OpenAI's Whisper models (MIT) through [Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0) and ONNX Runtime (MIT).
