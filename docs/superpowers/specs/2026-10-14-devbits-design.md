# Devgram: DevBits

Date: 2026-10-14
Status: design approved in chat; this document awaits review

## Why

The user asked for "DevBits [reels for developers]": short vertical videos people swipe through, the way Reels and TikTok work. Photo and video uploads went live on 2026-10-14 (master `2fadc29`); DevBits reuse that video pipeline (Mux direct uploads, wait-then-post, Mux playback) and fill the fifth slot of the phone tab bar.

## Decisions already made

| Question | Decision |
| --- | --- |
| What DevBits are for | Quick tips and tricks, and fun dev content. A DevBit is a video and a caption, with nothing attached (no code, no links). |
| Where they show | The DevBits tab and a DevBits grid on each profile. Not in Home, Explore, search or similar posts. |
| Length | Up to 90 seconds and 200 MB. Video posts keep their 2-minute limit. |
| Feed order | Shuffled on every visit. |
| How they are stored | A post with `kind: "devbit"`, so likes, comments, notifications, deleting and Mux cleanup work as they do for posts. |
| Mux plan | Free for now: at most 10 videos stored at once, shared by video posts and DevBits. |

## Scope

In scope:

- The DevBits screen: a full-screen, swipe-up feed, with sound, likes, comments, sharing, following and deleting.
- Posting a DevBit from the Create screen.
- A DevBits tab on profiles.
- A DevBits tab in the phone tab bar and a DevBits link in the desktop sidebar.
- Keeping DevBits out of every list of regular posts.

Out of scope: saving DevBits; follow-based or personalised order; view counts; sounds or music; trimming and filters; DevBits in Home, Explore or search; a separate Mux environment for local runs; removing uploads that were never posted (a known gap from the uploads work).

## What users see

**Tab bar.** Five tabs: Home · Explore · Create · **DevBits** · Profile, with a clapperboard icon for DevBits (where Instagram puts Reels). The desktop sidebar gets a DevBits link.

**The DevBits screen (`/devbits`).** A black screen showing one DevBit at a time in the space between the top bar and the tab bar. Swiping up shows the next one and swiping down the previous; each snaps into place. The order is shuffled on every visit and stays the same while the person swipes.

- The DevBit on screen plays and loops; the others are paused. Videos start muted, because browsers only allow muted autoplay. A speaker button turns sound on, and it stays on for the rest of the visit as the person swipes. Tapping the video (not its buttons) pauses or resumes it.
- On wider screens the clip sits in a centred column as tall as the space, keeping its shape.
- Bottom left: the author's picture and name (a link to their profile), a **Follow** button when the viewer doesn't follow them yet (never on their own DevBits), and the caption, two lines long, with a tap to show all of it.
- Right side, top to bottom: ♥ like with its count, 💬 comments with their count, ↗ share, and on the viewer's own DevBits ⋯ with **Delete**.
- Comments open in a panel that slides up over the video, where the person reads and adds comments. Closing it leaves the video where it was.
- Share opens the phone's share sheet with the DevBit's link; where there is none, it copies the link and says "Link copied".
- Delete asks for confirmation, removes the DevBit and moves on to the next one.
- A vertical clip fills the screen; a landscape one is shown whole, with black bars.
- With no DevBits yet: "No DevBits yet" and a button to post the first one.
- A **+** button on the screen opens Create on its DevBit tab.

**Posting.** Create gets a fourth tab, **DevBit**, next to Image, Video and Code. It works like the Video tab without the paste-a-link field: choose a video of up to 90 seconds, write a caption and press Post. Pressing Post before Mux is ready shows "Processing video…" and posts once the video is ready, as for video posts. After posting, the person lands on their new DevBit in the DevBits screen.

**Profiles.** A third tab, **DevBits**, next to Posts (and Saved, on one's own profile): a grid of tall thumbnails. Tapping one opens the DevBits screen at that DevBit and swipes through that person's DevBits, newest first.

**Links.** `/devbits/<id>` opens the DevBits screen at that DevBit, followed by the rest of the feed, shuffled. `/devbits/<id>?user=<username>` does the same within one person's DevBits, newest first. `/p/<id>` for a DevBit forwards to `/devbits/<id>`, so notifications and older links land in the viewer.

**Errors**, in plain words:

- The feed can't be loaded: "Couldn't load DevBits" with **Try again**.
- A clip can't be played: its thumbnail stays, with "Couldn't play this one"; swiping still works.
- The browser blocks autoplay (some phones in power saving block even muted video): a ▶ button over the thumbnail starts it.
- A DevBit deleted while someone is watching it: liking or commenting says "This DevBit was removed", and it leaves the feed.
- Posting: the same messages as video posts, plus "DevBits can be at most 90 seconds long."

## How it works

### Data

Posts get a `kind` field: `"post"` (the default) or `"devbit"`. Existing posts have no `kind` and count as posts. A DevBit always has `muxVideo` and a caption, and never `image`, `code` or `video`. An index on `kind` and `createdAt` keeps the DevBits list quick.

### Rules

- A DevBit is at most 90 seconds (`MAX_DEVBIT_SECONDS = 90`) and 200 MB. The browser checks the length before uploading, as for video posts; the server checks it again when the DevBit is posted.
- The upload status route keeps checking against the video post limit (2 minutes), because it can't tell what the upload is for. Posting a DevBit longer than 90 seconds is refused, and that video is deleted from Mux, as posting an over-long video post already does.
- Locally, Mux cuts test videos to 10 seconds, so the 90-second rule is pinned by unit tests.

### API

- `POST /api/posts` with `kind: "devbit"` requires `videoUploadId` and a caption, and refuses `image`, `code` or `video` (400). Anything other than `"post"` or `"devbit"` in `kind` is refused (400).
- `GET /api/devbits` returns the 200 newest DevBits in a random order, shuffled on the server for each request. `GET /api/devbits?user=<username>` returns that person's DevBits (up to 200), newest first. Both answer in the same shape as `GET /api/posts`.
- `GET /api/posts`, similar posts (`/api/posts/similar/:id`) and search (`/api/search`) leave DevBits out, through one shared filter.
- Likes, comments, notifications and deleting (including removing the video from Mux) use the existing post routes, unchanged.

### Screens and pieces

- **`/devbits` and `/devbits/[id]`**, rendered by one viewer component.
- **The viewer** is a vertical list with CSS scroll snapping, one DevBit per screen height. An IntersectionObserver plays the DevBit that is at least 60% on screen and pauses the rest. Clips play in Mux's bare video element, `<mux-video>` (from `@mux/mux-video`, already installed as part of Mux Player and added as a direct dependency at the same version, 0.31.5), with the app's own overlay instead of player controls. The viewer's code loads only on the DevBits screen. Clips off screen show their Mux thumbnail and load nothing else, except the next one, which loads its video's metadata so it starts quickly.
- **Comments:** the post page's comment list and form move into one shared component, used by the post page and the DevBits comments panel. The panel is the existing dialog, styled as a sheet from the bottom on phones.
- **Create:** the DevBit tab reuses the video upload (`useVideoUpload`) with a 90-second limit, and its Post creates the DevBit without adding it to the Home list.
- **Profile:** the DevBits tab loads `GET /api/devbits?user=<username>`.
- **Navigation:** the tab bar and the sidebar gain DevBits; `/p/<id>` forwards DevBits to `/devbits/<id>`.

## Setup

Nothing new to set up: DevBits use the Mux resource already connected to the project. `@mux/mux-video@0.31.5` becomes a direct dependency.

## Testing

- **Unit:** the 90-second rule; the shared filter that leaves DevBits out.
- **Smoke (API):** posting a DevBit needs an uploaded video; a DevBit with a photo, code or link is refused, and so is an unknown `kind`; DevBits never appear in `GET /api/posts`, similar posts or search; `GET /api/devbits` returns them and `?user=` returns one person's; liking, commenting and deleting work on a DevBit, and deleting removes its video from Mux.
- **Phone check (390 px and 320 px):** the tab bar has five tabs, each at least 44 px, with DevBits marked current on `/devbits`; one DevBit fills the space between the bars with no sideways scrolling; scrolling snaps to the next one; the one on screen is playing and muted while the others are paused; the speaker button turns sound on; the profile's DevBits tab opens the viewer; Create's DevBit tab posts and lands on the new DevBit, which isn't in Home; `/p/<id>` for a DevBit forwards to `/devbits/<id>`. The existing check that expects four tabs changes to five.

## Known gaps

- Mux's Free plan stores at most 10 videos at once, shared by video posts, DevBits and, while they run, local test runs. When it is full, new uploads fail until videos are deleted or the plan becomes Pay as You Go.
- Uploads that never become a post or a DevBit stay in Mux (from the uploads work).
- The feed holds the 200 newest DevBits, and refreshing the page gives a new order.
- A looping DevBit counts toward Mux's 100,000 viewing minutes a month for as long as it plays.
