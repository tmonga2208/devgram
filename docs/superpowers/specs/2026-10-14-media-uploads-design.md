# Devgram: photo and video uploads

Date: 2026-10-14
Status: design approved in chat; this document awaits review

## Why

The user: "no way to upload images, videos". Today a post's image or video and a profile picture can only be set by pasting a link. People want to pick a photo or video from their phone or computer. The video pipeline built here is also the base for DevBits (short vertical videos), which gets its own design later.

## Decisions already made

| Question | Decision |
| --- | --- |
| Where files live | Photos (post images and profile pictures) in **Vercel Blob**, public store. Videos in **Mux**, added through the Vercel Marketplace. |
| When a video post goes live | **Wait, then post.** The Create screen shows upload progress, then "Processing video…", and publishes the post once Mux reports the video ready. No webhooks. |
| Paste-a-link | Kept on both tabs, so YouTube and Vimeo links and links to images elsewhere keep working. |
| Limits | Photos up to 10 MB (JPEG, PNG, WebP, GIF). Videos up to 2 minutes and 200 MB. |
| Local development | Its own Blob store, separate from the live site's. |

## Scope

In scope:

- Uploading a photo for a post, from the Image tab of Create.
- Uploading a video for a post, from the Video tab of Create.
- Uploading a profile picture from Settings.
- Playing uploaded videos in the feed and on the post page, and showing their thumbnails in the Explore and profile grids.
- Removing stored files when they are no longer used (post deleted, profile picture replaced).
- Provisioning both services, and the environment variables for the live site, previews and local development.
- Tests and documentation.

Out of scope: DevBits; more than one photo or video per post; cropping, filters or trimming; video profile pictures; content moderation; private (signed-in-only) media; removing videos that were uploaded but never posted (see Known gaps).

## What users see

**Create, Image tab.** A large "Choose photo" button opens the camera roll on a phone and the file picker on a computer. After choosing, a preview replaces the button with a "Change" action, and a progress bar shows the upload. "Post" stays disabled until the upload finishes. Below it, "Or paste an image link" keeps today's URL field; filling it clears a chosen file and the other way round.

**Create, Video tab.** "Choose video" works the same way, and the upload starts as soon as a video is chosen, so it runs while the user writes the caption. The screen shows the upload progress, then "Processing video…" while Mux prepares it. "Post" can be pressed at any point after choosing: if the video is ready the post is created at once; if not, the button shows "Processing video…" and the post is created automatically the moment Mux reports the video ready. Leaving the page cancels an upload in progress; a video that already reached Mux stays there unused (Known gaps). "Or paste a YouTube, Vimeo or video link" keeps today's field.

**Settings, Edit Profile.** An "Upload photo" button under the profile picture uploads an image and fills the existing picture URL field. "Save Profile" saves it as today.

**Viewing.** Uploaded videos play in Mux Player (on the post card in the feed and on the post page), with Mux's thumbnail as the poster, and nothing plays until tapped. Explore, profile and similar-post grids show the video's thumbnail instead of the generic video icon. Videos keep their shape (vertical stays vertical).

**Errors** appear in the form, in plain words, and leave the chosen caption untouched: a file of the wrong type, too big, a video longer than 2 minutes, a failed upload ("Upload failed. Try again."), a video Mux cannot process, or a photo format the browser cannot read (for example HEIC outside Safari: "This photo format isn't supported here. Choose a JPEG, PNG, WebP or GIF.").

## How it works

### Photos (Vercel Blob)

1. The user picks a file. The browser checks its type.
2. The browser prepares it: a JPEG, PNG or WebP larger than 2048 px on its longer side, or larger than 2 MB, is drawn onto a white canvas (so transparent areas turn white, not black), scaled so the longer side is at most 2048 px, and saved as JPEG at 90% quality. Smaller ones, and all GIFs (so animation survives), are uploaded unchanged. Anything still over 10 MB is refused before uploading.
3. The browser asks the app for an upload pass: `POST /api/uploads/image` with `{ purpose: "post" | "avatar", contentType, size }`, sent with the usual `Authorization: Bearer` token. The route signs nothing for a signed-out caller (401) and refuses a disallowed type or a size over 10 MB (400). Otherwise it returns a Blob client token that is valid for 10 minutes, accepts only that content type and at most 10 MB, and only for one path: `posts/<user id>/<random>.<ext>` or `avatars/<user id>/<random>.<ext>`.
4. The browser uploads the file straight to Blob with that token and reports progress. The Blob store's long-lived read-write token never leaves the server.
5. The file's public URL goes into the post's existing `image` field or the profile's existing `avatar` field through the existing APIs, which keep accepting any http(s) URL.

The app issues the client token itself instead of relying on Blob's "upload completed" callback, because that callback cannot reach a local machine and nothing here needs it.

### Videos (Mux)

1. The user picks a file. The browser refuses a non-video type or a file over 200 MB, then reads the video's length from its metadata and refuses anything over 2 minutes.
2. The browser asks the app for an upload address: `POST /api/uploads/video` (signed-in only). The route creates a Mux direct upload with public playback, `video_quality: "basic"`, `passthrough` set to the user's id, `cors_origin` set to the request's origin, and a one-hour timeout. It returns `{ uploadId, url }`.
3. The browser uploads the file to that address in chunks (Mux UpChunk), so a dropped connection resumes. It shows progress.
4. Every two seconds the browser asks `GET /api/uploads/video/<uploadId>`. The route reads the upload and, once Mux has created the asset, the asset. It answers 404 unless the upload's `passthrough` is the caller's id, and otherwise `{ status: "uploading" | "processing" | "ready" | "failed" }` plus, when ready, `playbackId`, `aspectRatio` and `duration`. The browser gives up after 5 minutes of processing with an error.
5. On "ready" the browser creates the post with `videoUploadId`. `POST /api/posts` looks the upload up in Mux again and accepts it only when the asset is ready, its `passthrough` is the caller's id, it has a public playback id and it is no longer than 2 minutes (a longer one is deleted from Mux and refused). It then stores `muxVideo: { assetId, playbackId, aspectRatio, duration }` on the post. A post cannot have both `videoUploadId` and a video link.

### Data

`Post` gains an optional `muxVideo` subdocument: `assetId`, `playbackId` (strings, required inside it), `aspectRatio` (string such as "9:16") and `duration` (seconds). `image` and `video` keep their meaning: an image URL (now often a Blob URL) and a video link. API responses include `muxVideo`; the client types gain it too. No migration is needed.

### Cleanup

- Deleting a post deletes its Mux asset if it has `muxVideo`, and its Blob file if `image` is a URL in this app's Blob store whose path starts with `posts/<id of the user deleting it>/`. The path check means a post that borrows someone else's uploaded image cannot be used to delete their file.
- Replacing or clearing a profile picture deletes the old file under the same rule (`avatars/<user id>/`).
- A failed delete at Blob or Mux is logged and does not fail the request; the post or profile change still goes through.

### New code, by responsibility

- `lib/blob.ts`: the photo rules (types, size, path for a purpose and user), issuing client tokens, recognising this store's URLs, deleting a file.
- `lib/mux.ts`: the Mux client (created on first use, so builds without Mux credentials still work), creating an upload, reading upload and asset status, deleting an asset.
- `app/api/uploads/image/route.ts`, `app/api/uploads/video/route.ts`, `app/api/uploads/video/[id]/route.ts`.
- `lib/image-prepare.ts` (browser only): the resize step.
- A client upload helper for each kind, used by the Create form and Edit Profile, reporting progress through callbacks.
- `components/media-picker.tsx`: the choose / preview / progress / change block used by both Create tabs, with a `kind` of "image" or "video".
- `components/avatar-upload.tsx`: the "Upload photo" button in Edit Profile, which reuses the photo upload helper but not the picker's layout.
- `components/mux-video.tsx`: Mux Player loaded lazily (`@mux/mux-player-react/lazy`) so pages without a video don't download it.

Changes to existing code: `models/Post.ts`, `lib/types.ts`, `app/api/posts/route.ts` (accept `videoUploadId`), `app/api/posts/[id]/route.ts` (cleanup on delete), `app/api/users/profile/route.ts` (cleanup on avatar change), `components/create-post-form.tsx`, `components/edit-profile-form.tsx`, `components/post.tsx`, `components/post-detail.tsx`, `components/explore-post.tsx`, `components/profile-post.tsx`, `contexts/posts-context.tsx` (send `videoUploadId`).

New packages: `@vercel/blob`, `@mux/mux-node`, `@mux/upchunk`, `@mux/mux-player-react`, at their current versions. The plan confirms each API used against the installed package before writing code.

## Setup

These steps happen after the implementation plan is approved:

1. Create the public Blob store `devgram-media`, connected to Production and Preview, and `devgram-media-dev`, connected to Development. Each connection sets `BLOB_READ_WRITE_TOKEN` (and the store's OIDC variables) for its environments.
2. Add Mux with `vercel integration add mux`. If it needs the user's Mux account or terms in the dashboard, the user completes that step; Mux shows its plans there. It sets `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`.
3. Local development: pull the Development variables into a scratch file and copy only the Blob and Mux keys into `.env.local`, never printing them. A plain `vercel env pull .env.local` would replace the file and lose its database and JWT settings.
4. README: the new variables, the two stores, and the Mux step.

The service worker needs no change: Blob and Mux URLs are on other origins, which it never intercepts.

## Testing

- **Smoke test**, new `media` section. Upload routes: 401 when signed out, 400 for a disallowed type or size, a token whose path is under the caller's folder. One real photo: upload a small PNG with the issued token, confirm the URL serves it, post it, delete the post, confirm the file is gone. Ownership: a post that borrows another user's uploaded image, when deleted, leaves that file in place. Videos: 401 when signed out; another user's upload id answers 404 on the status route and is refused by `POST /api/posts`; a video link plus `videoUploadId` is refused. One real video: upload a 2-second MP4 fixture, wait for "ready", post it, check `muxVideo`, delete the post, confirm the asset is gone from Mux. When the Blob or Mux variables are missing, the section says it is skipped and why, instead of failing.
- **Test cleanup** also deletes the test users' files from Blob (by their folders) and the Mux assets of their posts, so neither service fills up with test data.
- **Phone check**: the Create screen's photo and video buttons are shown and at least 44px tall; a real photo is chosen through the file input in headless Chrome, uploaded and posted, and the post appears in the feed with its image.
- **By hand, once, on a real phone**: I cannot hold a phone, so after deploying I give the user three short steps to try (post a camera-roll photo, post a phone video, change the profile picture) and fix whatever they report.
- Typecheck, lint and the production build stay clean.

## Known gaps

- A video that reaches Mux but is never posted (the user left during processing, or the post was refused) stays in Mux. A cleanup script that removes assets no post refers to is a possible follow-up.
- A photo uploaded on the Create screen or in Settings that is never posted or saved stays in its owner's Blob folder.
- Nothing limits how many photos an account uploads. Registration is open, so a per-account cap alone would only mean an abuser makes more accounts; protecting the Hobby plan's 1 GB needs a site-wide upload budget, slower sign-ups, or a paid Blob plan.
- Uploaded files are public to anyone with the link, like everything posted today.
- The Hobby plan includes 1 GB of Blob storage and 10 GB of Blob downloads a month. If the live site goes past that, Blob stops serving files for 30 days unless the plan is upgraded. Shrinking photos before upload keeps typical use far below it. Mux usage is billed through the Vercel account at the plan the user picks when connecting it.
- Preview deployments share the live site's Blob store and database.
