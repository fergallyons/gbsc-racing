# Claude artifacts (backup)

Source of the sailing artifacts that were published from the old (work) Claude
account, saved 2026-11-10 so they can be republished from the personal account.
Republishing gives each one a new link; the old links stop working once the old
account loses access.

| Folder | Type | Notes |
|---|---|---|
| `gbsc-2026-series-summary/` | Slides deck | `project/deck.json` + `project/slides/*.html` |
| `raceops-kinsale/` | Slides deck | Same layout. The cover slide's logo was an uploaded asset (`/_blob/c1d0fe93775e45c41e4bc2d8301bf525`); the image is in `assets/irish-sailing-logo.jpg` and must be re-uploaded and the `src` in `project/slides/cover.html` updated to the new asset URL. |
| `out-of-the-blue-crew/` | Single page | `index.html` |
| `sailpro-field-notes/` | Single page | `index.html` |

## Skills

- `skills/renville-pier-tide-window/SKILL.md`: the Renville pier tide-window
  skill (an account skill, not part of this project). Add it to the personal
  account's skills by uploading this folder (zip it if the upload asks for a
  .zip).

## Republishing

- **Single pages:** ask Claude to publish `index.html` as a new artifact.
- **Slides decks:** ask Claude to create a new Slides artifact and publish the
  `project/` files into it. The Slides type's own files (player, fonts,
  references) are supplied by the type and are deliberately not saved here.
- The decks' comments and shared database (if anything was stored there) were
  not exported.
