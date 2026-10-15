# Devgram: GitHub connect

Date: 2026-10-16
Status: design approved in chat; this document awaits review

## Why

The user wants "GitHub connect": sharing a file from GitHub with some of its code highlighted, the "look at this cool code" kind of post. On 2026-10-14 they described it as "show from repository, select from repository". Code posts (several files, Monaco, Run) went live on 2026-10-15, and this builds on them.

## Decisions already made

| Question | Decision |
| --- | --- |
| Whose code | Both: connect GitHub and pick from your own repositories, or paste a link to any public file, someone else's included. |
| "Highlighted" | Marking a range of lines, like GitHub's `#L83-L85` links. Code posts already have syntax colours. |
| Feed view | A file with marked lines opens on them: the marked lines tinted, 3 lines either side, real line numbers, and "Show whole file". The whole file is stored. |
| Profile | A connected account shows on the profile: a GitHub icon and the username, linked to the GitHub page. |
| How Devgram talks to GitHub | Connect once, keep no token (approach A below). Devgram stores the GitHub account number and username; everything else is read with the app's own ID and secret. |
| Repositories | Public only, so private code can't reach a post. |
| Version shown | The commit the file was taken from. A post doesn't change when the repository does. |

### Approaches considered

- **A. Connect once, keep no token (chosen).** GitHub's sign-in asks for no permissions. Devgram uses the token once to learn who you are, then deletes its authorization on GitHub. Browsing and fetching use the OAuth app's client ID and secret, which GitHub accepts for public data at 5,000 requests an hour per app.
- **B. Keep each person's token, encrypted.** Per-person rate limits and room for private repositories later, but it needs an encryption key, token refresh (new OAuth apps issue 8-hour tokens) and revoke handling.
- **C. A GitHub App installed on chosen repositories.** It could read private repositories, which would let private code into public posts, and it is the most setup.

## Scope

In scope: connecting and disconnecting a GitHub account; the GitHub link on profiles; a picker in Create's Code tab (your repositories, pasted links, folders and files); GitHub files in code posts, read-only, with one marked range each; the code view's GitHub line and marked lines; a Plain text language; the data, API and limits behind them.

Out of scope: private repositories; keeping GitHub tokens; browsing branches other than the default (pasted links reach any branch, tag or commit); more than one marked range per file; marking lines in files you write; gists; repository lists or stats on profiles; updating a post when its repository changes; searching GitHub from Devgram.

## What users see

### Connecting

- **Settings → Account** gets a GitHub section. Not connected: **Connect GitHub**, with "Show your GitHub on your profile and pick files from your repositories." Connected: "Connected as @login" and **Disconnect**.
- Connect GitHub opens GitHub's page asking to let Devgram see your public profile; nothing else is requested. GitHub then sends you back to where you started, which shows "Connected GitHub as @login".
- You connect once and stay connected until you press Disconnect; nothing expires. Devgram deletes its authorization on GitHub straight after reading your username (it never needs GitHub's permission again), so GitHub shows its approval page again only if you disconnect and later connect again. This is deliberate: it leaves no access to your GitHub account behind.
- Connecting again with a different GitHub account replaces the first one.
- Disconnecting removes the profile link and the repository list. Posts made from GitHub stay as they are.

### Profile

A connected account shows under the bio, next to the website: a GitHub icon and the username, linking to `https://github.com/<login>`.

### Picking a file (Create → Code → From GitHub)

- A **From GitHub** button sits next to **Add file**. It opens a picker: a dialog on computers, the full screen on phones.
- **Paste a GitHub link:** a repository, a folder or a file, on any branch, tag or commit. A repository or folder link opens it in the picker. A file link adds that file to the post and closes the picker; if the link has lines (`#L83-L85`, `#L83`), they arrive marked.
- **Your repositories:** your public repositories, most recently pushed first, with a filter box. When you haven't connected, a **Connect GitHub** button shows instead. Your caption and files are kept while you're away and come back when GitHub returns you to Create.
- **Inside a repository:** the folders and files of its default branch at its latest commit, folders first, a path at the top to step back up, and a **Find a file** box that matches anywhere in a file's path and shows the first 50 matches. Choosing a file adds it to the post as a new tab and closes the picker. If the post is a single empty, unnamed file, the GitHub file takes its place.
- **Add file** and **From GitHub** are both disabled when the post has 5 files.

### In the Code tab

- A GitHub file's tab has a small GitHub icon, and `owner/repo · path` shows above its code.
- Its code is read-only, shown with line numbers and colours in a scrolling box (not in Monaco or the plain box), so what's posted is exactly what's on GitHub at that commit. A note says "Code from GitHub can't be edited."
- **Marking lines:** click a line number to mark that line; shift-click another to mark everything between; or type in **Lines [from] to [to]**. **Clear** removes the mark. One range per file. Tapping numbers works on phones too, but the two boxes are easier there.
- The tab name starts as the file's name (`code-files.ts`, cut to 100 characters) and can be changed. The language starts as the one the name points to (Plain text when none does) and can be changed, which only changes the colours.
- GitHub files and files you write mix in one post, up to 5 in all, and Run treats them alike.

### In the feed and on the post page

- The code view's header stays as it is (file tabs, Copy, Run). For a GitHub file, a second line follows: the GitHub icon, `owner/repo · path`, and **View on GitHub**, which opens the file at its commit, at the marked lines when there are some. Long names shorten with … instead of scrolling sideways.
- **A file with marked lines opens on them:** the lines from 3 before the mark to 3 after it, with their real line numbers; the marked lines tinted, with a coloured bar by their numbers; a "⋯" row where lines are hidden above or below; and **Show whole file (N lines)**, which shows every line, the marked ones still tinted. In the feed this window, like any code, folds at 20 lines. A screen reader hears "Marked lines 83 to 85" before the code.
- A file without marks shows as code posts do now: folded at 20 lines in the feed, whole on the post page.
- **Copy** copies the whole file.

### Errors

In plain words:

- "That isn't a GitHub link"
- "That repository doesn't exist or is private"
- "That file isn't in this repository"
- "This repository is too big to browse here — paste a link to the file instead"
- "This file is over 100,000 characters"
- "This file isn't text, so it can't be shared"
- "A post's files can add up to 100,000 characters"
- "Marked lines must be inside the file"
- "GitHub is busy — try again in a few minutes"
- "Couldn't reach GitHub — try again"
- "Connect GitHub first" (asking for your repositories when not connected)
- "This GitHub account is connected to another Devgram account"
- "Couldn't connect GitHub — try again" (the connection didn't finish)
- "GitHub isn't set up on this server" (the app's ID and secret are missing)

## How it works

### Accounts

- Users get an optional `github: { id, login }`: GitHub's account number, which never changes, and the username at the time of connecting.
- A unique, sparse index on `github.id` keeps one GitHub account to one Devgram account, even when two connects race. (Sparse, so users who haven't connected don't collide.)
- Your own account (`GET /api/users/profile`) and public profiles (`GET /api/users/:username`) return `github: { login }`, or `null`.
- No GitHub token is stored, in the database or anywhere else.

### Post files

Each file in a post's `files` can carry two more fields:

- `github: { owner, repo, commit, path }`: the repository as GitHub spells it, the full 40-character commit, and the file's path in it. Only the server sets it.
- `marked: { from, to }`: the marked lines, counted from 1, with `from` ≤ `to`, both inside the file. Only GitHub files can have it.

Posts without these fields, and files you write, are unchanged. A post's `language` is still its first file's, so similar posts keep matching on it.

### Rules

Pure modules, which the unit tests load directly:

- **`lib/code-files.ts` gains:** a GitHub file's code up to 100,000 characters (written files stay at 20,000); all of a post's files together up to 100,000 characters (five written files already top out at 100,000, so the total never stops a post that works today); marks as whole numbers with 1 ≤ `from` ≤ `to` ≤ the file's line count, counted the way the code view counts lines, and only on GitHub files; **Plain text** (`text`, the 27th language: no colours, `.txt`, and the default for names the other 26 don't claim); and the window a marked file opens on, from `from − 3` to `to + 3`, kept inside the file.
- **A new `lib/github-links.ts` reads GitHub links:** `https://github.com/<owner>/<repo>`, `…/tree/<ref>/<folder>` and `…/blob/<ref>/<file>`, with or without `www.`, ignoring the query string, a trailing `.git` on the repository, and columns in a line anchor (`#L10C5-L12C20` marks lines 10 to 12). Owners and repositories must follow GitHub's naming rules. It returns the owner, the repository, the rest of the path (branch and path not yet told apart, since only GitHub can tell where a branch name ends) and any marked lines. It also builds View on GitHub links and checks return pages (below).

### Talking to GitHub

- One server-only module (`lib/github.ts`) makes every call: to `api.github.com` with the OAuth app's client ID and secret (HTTP Basic), GitHub's JSON media type and API version header, and a 10-second timeout. The connect flow also calls `github.com/login/oauth/access_token`.
- Pasted links are read, never fetched: Devgram only ever calls `api.github.com` and `github.com`. Path segments are encoded one at a time.
- GitHub's answers become the messages above: 404 means the repository doesn't exist or is private (or, for a file, that it isn't there); 403 or 429 with the rate limit used up means busy; a timeout or network failure means GitHub couldn't be reached.
- The client secret never leaves the server. Without `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, every GitHub route answers 503 "GitHub isn't set up on this server".

### Connecting

1. **`GET /api/github/connect?return=<page>`** is a plain link. The sign-in cookie (the `token` cookie middleware already reads) says who you are; without a valid one you go to `/login`. It sets a cookie for `/api/github` (httpOnly, SameSite=Lax, Secure in production, valid for 10 minutes) holding a signed record of a random `state`, a PKCE verifier, your user id and the return page. Then it redirects to GitHub's authorize page with the client ID, the callback address on the same origin, the `state`, the PKCE challenge (S256) and no scopes.
2. **`GET /api/github/callback`** is where GitHub returns you. It:
   - refuses unless the cookie's `state` matches GitHub's and the sign-in cookie belongs to the same user (so nobody can attach their GitHub account to yours with a crafted link), and deletes the cookie;
   - exchanges the code, with the PKCE verifier, for a token;
   - reads `GET /user` with that token for the account number and username;
   - deletes Devgram's authorization for you on GitHub (`DELETE /applications/<client id>/grant`), which also revokes the token; if that call fails, the token is still never stored;
   - saves `github` on your account, or reports the GitHub account as taken;
   - redirects to the return page with `github=connected`, `taken`, `cancelled` (you pressed Cancel on GitHub) or `error`. That page shows "Connected GitHub as @login", "This GitHub account is connected to another Devgram account" or "Couldn't connect GitHub — try again"; a cancel shows nothing.

   The return page must be a Devgram path (`/…`, not `//…`); anything else becomes `/settings`.
3. **Keeping your post:** before Create sends you to GitHub, it saves the caption and files to sessionStorage, and restores them once when you come back to `/create?tab=code`. If storage fails, you come back to an empty post.
4. **`DELETE /api/github/connect`** removes `github` from your account and returns your account.

### Browsing

All need you signed in, with the Bearer token like the rest of the API:

- **`GET /api/github/repos`:** your public repositories that you own (not ones you only contribute to), most recently pushed first, up to 100, each with its name, description, language and default branch. "Connect GitHub first" when not connected.
- **`GET /api/github/resolve?url=`:** a pasted link, or a repository chosen from the list, becomes: the owner and repository as GitHub spells them, the full commit, the path, whether it's a repository, folder or file, and any marked lines. A repository link uses its default branch. For `tree/` and `blob/` links, the branch is found by trying the shortest possible branch name first (`feature`, then `feature/login`, …), at most 5 tries; a full commit is used as it is.
- **`GET /api/github/tree?owner&repo&commit`:** every folder and file at that commit, in one GitHub call (`git/trees/<commit>?recursive=1`), leaving out submodules and symlinks. When GitHub says the list is truncated, or it has more than 10,000 entries: "This repository is too big to browse here — paste a link to the file instead".
- **`GET /api/github/file?owner&repo&commit&path`:** the file's text, its suggested name and language, and its line count, after two checks: at most 100,000 characters (a file whose size already rules that out isn't downloaded) and text (valid UTF-8 with no null characters).

### Posting

- `POST /api/posts` accepts, among a code post's files, `{ name, language, github: { owner, repo, commit, path }, marked? }`. The commit must be a full 40-character one, so posts point at fixed versions.
- For each GitHub file the server fetches the code at that commit, the same way and with the same checks as `/api/github/file`. Any code sent with it is ignored. Then the rules run on the whole post: names, languages, sizes, the total and the marks.
- A failed fetch fails the whole post with GitHub's message, so nothing half-made is stored.

### Code view

- `components/code-view.tsx` adds the GitHub line and the marked window. `components/highlighted-code.tsx` learns to show a range of lines with their real numbers and to tint marked lines.
- Colours are worked out on the whole file and then cut to the lines shown, so a window that starts inside a long comment or string is still coloured right.
- View on GitHub links to `https://github.com/<owner>/<repo>/blob/<commit>/<path>`, plus `#L<from>-L<to>` (or `#L<from>` for one line) when marked, and `?plain=1` for Markdown files so GitHub shows lines rather than the rendered page. It opens in a new tab.

## Setup

1. On GitHub: Settings → Developer settings → OAuth apps → **New OAuth App**. Name "Devgram", homepage `https://devgram-nine.vercel.app`, callback URLs `https://devgram-nine.vercel.app/api/github/callback` and `http://localhost:3000/api/github/callback`. Other local ports can be added, up to 10 URLs in all. Leave "Expire user access tokens" on, so that if deleting the authorization ever fails, the unused token still dies within 8 hours. Then **Generate a new client secret**.
2. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to Vercel for Production, Preview and Development, and to `.env.local`. The secret doesn't pass through chat: the user types it into `vercel env add` or the dashboard.
3. Preview deployments can't connect, because their addresses aren't registered callbacks. They can still browse and post GitHub files.
4. The README gains the feature, the setup and the new routes, says 27 languages, and drops "GitHub link on profiles" from "Not yet built".

## Testing

- **Unit:** reading links (repository, folder and file links, `www.`, `.git`, query strings, `#L5`, `#L5-L9`, column anchors, links that aren't GitHub's or break the naming rules); the window (marks at the top and bottom of a file, a one-line file, a mark covering the whole file); the rules (GitHub file size, the post total, marks inside the file, marks only on GitHub files, Plain text); View on GitHub links; the return page check.
- **Smoke (API, against real GitHub, using this public repository at a fixed commit):** every GitHub route refuses signed-out callers; resolving repository, folder, file and marked-file links; the tree; a file; posting a GitHub file stores the code GitHub has at that commit, not code the request sent; each broken rule gets its message; a missing repository gets its message; a branch name in place of a commit is refused; the callback refuses a missing or wrong `state` and a missing sign-in; disconnect. The GitHub sections skip themselves without the app's ID and secret.
- **Phone check (390 and 320 px):** the picker fills the screen, with rows at least 44 px tall; a GitHub post's second header line shortens long names instead of scrolling sideways; the marked window and Show whole file work; the Lines boxes fit in the Code tab; the profile's GitHub link fits. Its GitHub parts skip themselves without the keys.
- **By hand, once:** a real connect and disconnect in the browser, on localhost and on the live site, since GitHub's sign-in page can't be automated.

## Known gaps

- The whole site shares GitHub's 5,000 requests an hour for the app. Opening a repository costs about 3 requests; adding a file costs 1, and posting it 1 more.
- If you rename your GitHub account, your profile shows the old username until you connect again.
- The feed still sends every post with all its code. GitHub files don't raise the most a post can hold (100,000 characters), but the feed keeps growing with the number of posts, as it does today.
- Repositories with more files than the picker lists can't be browsed; links to their files still work.

## References

- [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps): the authorize and token URLs, PKCE, redirect URL rules.
- [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api): an OAuth app's client ID and secret read public data at 5,000 requests an hour.
- [Multiple redirect URIs for OAuth apps](https://github.blog/changelog/2026-08-14-multiple-redirect-uris-and-token-refresh-for-oauth-apps) (August 2026): up to 10 callback URLs per app, so one app serves the live site and local work.
