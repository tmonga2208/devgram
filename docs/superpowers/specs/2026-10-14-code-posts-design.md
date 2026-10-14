# Devgram: code posts, upgraded

Date: 2026-10-14
Status: design approved in chat; this document awaits review

## Why

The user: "add monaco in code one too and also more things for code". Today a code post is written in a plain text box with a choice of 8 languages, and shown in a dark box with the language name and Prism highlighting. There is no copy button, no line numbers, no file name, and a post holds one piece of code. Feed cards also show the language label twice.

## Decisions already made

| Question | Decision |
| --- | --- |
| Editor | **Monaco** (VS Code's editor) on computers. Phones and tablets get a plain code box with a live, highlighted preview, because Monaco doesn't support phone browsers. |
| Extras | All four: more languages; Copy, line numbers and file names; several files in one post; Run in the browser. |
| Run | HTML posts (with their CSS and JS files) run as a live preview; JavaScript-only posts run with their console output shown. Code runs in a locked-down sandbox, and never automatically. |
| Order | Built after DevBits. GitHub connect (choosing files from a repository) is a separate project after this one. |

## Scope

In scope: the editor (Monaco and the plain box), several files per post, about 25 languages, one shared code view (tabs, Copy, line numbers, folding in the feed), Run, and the data and API changes behind them.

Out of scope: running Python or other languages; importing npm packages in a run; drafts; editing a post after posting; code in comments; diff views; GitHub connect (the next project); searching inside code.

## What users see

**Writing (Create → Code tab).**

- On computers (a mouse or trackpad, and a screen at least 768 px wide): the **Monaco** editor in a dark theme, with highlighting, auto-indent and bracket matching.
- On phones and tablets: a plain code box with autocorrect, auto-capitals and spellcheck off, and a live highlighted preview right under it.
- **Files:** a post holds up to 5 files, shown as tabs above the editor, with **+ Add file**, rename and remove. The language follows the file name (`app.ts` → TypeScript), with a dropdown to change it. A one-file post may leave the name empty; its header then shows just the language. Posts with several files need a name on each.
- **Languages (26):** JavaScript, TypeScript, JSX, TSX, HTML, CSS, SCSS, JSON, Python, Java, C#, C, C++, Go, Rust, PHP, Ruby, Kotlin, Swift, Dart, SQL, Bash, YAML, Markdown, Dockerfile, GraphQL.
- If Monaco can't load, the plain box appears with "The full editor couldn't load — you can still write here.", so posting always works.

**Reading (feed and post page): one code view everywhere.**

- A header with the file tabs (or, for one file, its name or language), **Copy**, which copies the open file and shows "Copied ✓", and **Run** where it applies.
- Line numbers, Prism highlighting, and sideways scrolling for long lines.
- In the feed, code longer than 20 lines folds, with **Show all**. The post page shows everything.
- Existing code posts show as one file, as before, without the doubled label.

**Run** (only for posts with an HTML or a JavaScript file; never automatic).

- A post with an HTML file: Run shows a live preview of that page under the code, with the post's CSS and JS files included.
- A post with JavaScript and no HTML: Run shows the console output (logs and errors) in a panel.
- **Stop** removes the running code. Errors from the code show in red in the panel; an HTML preview's errors appear there too.

**Errors**, in plain words: "A post can have up to 5 files", "Give each file a name", "Two files can't have the same name", "Each file can be up to 20,000 characters", "A file can't be empty", "Stopped after 5 seconds" (a JavaScript run that didn't finish), "Couldn't copy — select the code instead".

## How it works

### Data

- Posts get `files`: a list of up to 5 `{ name, language, code }`. New code posts store their code there.
- Existing posts keep `code` and `language`. Everything that shows code reads such a post as one file with no name. Nothing is migrated.
- A post's own `language` stays and is set to its first file's language, so similar posts keep matching on it.

### Rules

One module, with no imports so unit tests load it directly, holds:

- Up to 5 files; each file's code 1–20,000 characters (today's limit); file names up to 100 characters, unique within the post, without `/` or `\`; a name may be empty only when the post has one file.
- The 26 languages, each with its Prism and Monaco names (for example HTML is `markup` in Prism, Bash is `shell` in Monaco), and the file extensions that select it (`.ts` TypeScript, `.py` Python, a file named `Dockerfile` Dockerfile, and so on). The ids already stored by the old form (`javascript`, `typescript`, `jsx`, `html`, `css`, `python`, `java`, `csharp`) keep their meaning.
- Reading any post as files (old posts become one file).
- Building the document Run loads (see Run).

### API

- `POST /api/posts` accepts `files` for a code post and refuses it with the messages above when a rule fails (400). The old form, `code` plus `language`, is still accepted and stored as one file.
- Responses return a post as it is stored: posts made after this change carry `files`; older ones carry `code` and `language`, which the code view reads as one file.

### Editor

- `@monaco-editor/react` (pinned to one version) loads only on the Create screen and only when the browser reports a fine pointer and a screen at least 768 px wide; everyone else gets the plain box.
- It fetches Monaco from the jsDelivr CDN, pinned to one version. If Monaco fails or hasn't loaded within 10 seconds, the plain box is used.

### Code view

One component replaces `components/code-block.tsx` and the separate code header in feed cards. It uses Prism with the 26 languages, draws its own line numbers, copies through the browser's clipboard, and folds feed code at 20 lines.

### Run

- The code runs in an iframe with `sandbox="allow-scripts"` and nothing else. Without `allow-same-origin` it has no access to Devgram's origin: no storage, no cookies, no login token. It can't open popups or move the page.
- **HTML:** the first HTML file is the page; CSS files are added as styles and JavaScript files as scripts, in file order. A small script added first forwards errors and console output to the panel.
- **JavaScript only:** the scripts run in a worker started inside that frame, which is stopped after 5 seconds, so an endless loop can't freeze the page. Console output goes to the panel, which keeps the last 200 lines.
- The preview is a fixed-height frame that scrolls.

## Setup

Nothing to set up. `@monaco-editor/react` becomes a dependency, and the extra Prism languages come with `prismjs`, already installed.

## Testing

- **Unit:** the file rules (names, duplicates, sizes, empty files, the language list, guessing from the extension); reading old posts as one file; building the Run document for HTML with CSS and JS, and for JavaScript alone.
- **Smoke (API):** posting one file and several files works; each broken rule gets its 400 message; the old `code` plus `language` still works; similar posts still match on language; responses carry `files`.
- **Phone check (390 px and 320 px):** the Code tab shows the plain box and live preview on phones, not Monaco; the file tabs fit and their buttons are at least 44 px; a three-file HTML/CSS/JS post shows tabs, line numbers and Copy; Run shows the preview in a frame whose sandbox is exactly `allow-scripts`; a JavaScript post with an endless loop stops after 5 seconds; at desktop size Monaco loads; existing code posts still display.

## Known gaps

- An HTML preview whose own script never stops can freeze the page in some browsers. Desktop Chrome runs sandboxed frames in their own process; JavaScript-only runs are protected by the 5-second worker.
- Monaco comes from the jsDelivr CDN; if that is blocked, the plain box is used.
- Search doesn't look inside code.
