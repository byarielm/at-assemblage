# Assemblage

A desktop web app that turns your [Semble](https://semble.so) collections into an editable node graph. Sign in with an AT Protocol **App Password**, pick one or more of your collections, add cards and collections, and draw typed connections between cards. Every change is written straight to your own PDS as standard Semble and Margin records, so it shows up in Semble and Margin too.

There is no Assemblage server and no database. The browser talks directly to your PDS.

> **Beta.** Single user, own records only, App Passwords only. See [Known limitations](#known-limitations).

## Quick start

```bash
npm install        # also generates TypeScript from ./lexicons (postinstall → lex build)
npm run dev        # http://localhost:5173
```

You need Node 22+. Sign in with your handle (or DID) and an App Password, which looks like `xxxx-xxxx-xxxx-xxxx`. On Bluesky-hosted accounts you create one under **Settings → Privacy and security → App passwords**.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build to `dist/` (static, host anywhere) |
| `npm test` | Unit and integration tests (Vitest + happy-dom) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm run lex:build` | Regenerate `src/lexicons/` from `lexicons/` |
| `npm run lex:install` | Verify the vendored lexicons against `lexicons.json` CIDs |

### Environment variables

All variables are optional, and all of them point at public, unauthenticated endpoints. No credentials are ever sent to them. Copy `.env.example` to `.env` to override them.

| Variable | Default | Used for |
| --- | --- | --- |
| `VITE_HANDLE_RESOLVER` | `https://public.api.bsky.app` | `com.atproto.identity.resolveHandle` (handle → DID). No credentials are sent. |
| `VITE_PLC_DIRECTORY` | `https://plc.directory` | Resolving `did:plc` documents to find your PDS. |
| `VITE_LINK_PREVIEW_SERVICE` | `https://cardyb.bsky.app/v1/extract` | Title and description preview when adding a card. Bluesky's link-card service receives the pasted URL. Set it to an empty string to turn previews off; you can still type a title. |

## How it works

### Data model

These are what Semble actually stores. They differ in places from the original brief:

| Concept | Record | Notes |
| --- | --- | --- |
| Collection | `network.cosmik.collection` | Name, description, access type. |
| Card | `network.cosmik.card` | `URL` cards (URL plus metadata) or `NOTE` cards. A note with a `parentCard` is shown as a note on that card. |
| Card ↔ collection | `network.cosmik.collectionLink` | **Membership is a separate record.** It is not a field on the card. |
| Connection | `network.cosmik.connection` | `source`, `target` (URL **or** AT URI), optional `connectionType`, optional `note`. Semble's own UI writes card URLs, and so do we. |
| Margin note | `at.margin.note` (revision 4) | W3C Web Annotation model. Margin's older `at.margin.annotation` schema is not used. |

**Connection types.** These come from Semble's `ConnectionTypeEnum`: `RELATED`, `SUPPORTS`, `OPPOSES`, `ADDRESSES`, `HELPFUL`, `EXPLAINER`, `LEADS_TO`, `SUPPLEMENT`, `REFERENCES`, `SAME_AS`. The value is `SUPPLEMENT`, not `SUPPLEMENTS`. The lexicon allows any string, so unrecognised values are drawn as neutral dashed edges labelled with the raw value.

**Loading.** We read all of your cards, collection links and connections once each, following the cursors. Then we join them in the browser:

- **Cards:** those linked to the selected collections.
- **Edges:** every connection with at least one end on a selected card. Endpoints are matched by AT URI or by normalised URL.
- **Outside cards:** if the other end of a connection is not in the selection, it appears as a dashed card marked **Outside**. This covers three cases: a card in your library but in another collection, a card outside your library, or a bare URL. Outside cards can be inspected, connected to, and hidden with the "Show connected cards outside these collections" setting. Connections that touch no selected card are ignored.
- **Annotations:** your Margin notes, matched to cards by normalised URL.

### Adding cards and collections

**Cards.** Click the round **+** button at the top right of the canvas. The form follows Semble's: URL, optional note, and the collections to add the card to. The collections shown on the canvas are ticked by default. A preview prefills the title, which you can edit.

Everything is written in **one `applyWrites` commit**, exactly as Semble would write it:

- a `URL` card, with title and description in `content.metadata`
- an optional `NOTE` card that points at it with `parentCard`
- one `collectionLink` per chosen collection

Record keys are TIDs chosen in the browser, and record CIDs are computed locally with `@atproto/lex-cbor` (checked against the AT Protocol interop fixtures). That is what lets the note and the links reference the new card by strong ref within the same commit.

If the URL is already a card in your library (compared by normalised URL), no duplicate is made. The card is only added to the collections it isn't in yet. Semble keeps one note per link per user, so an existing note is kept and the note field is locked.

The new card is selected and zoomed to once it appears on the canvas. If none of the chosen collections is on the canvas, the form says so before you save.

**Collections.** Click **New collection** at the top of the sidebar's collection list. Enter a name (up to 100 characters), an optional description (up to 500), and a collaboration setting. The settings are Semble's: Personal (`CLOSED`, the default) or Open (`OPEN`). The new collection is ticked straight away.

**Account menu.** The button at the bottom of the sidebar shows your Bluesky display name and avatar. Both are read from the `app.bsky.actor.profile` record on your own PDS; the avatar is served by the PDS's public `getBlob` endpoint. The menu holds your handle and DID (with a copy button), the two display settings, and Sign out.

### Editing connections

| Action | How | What is written |
| --- | --- | --- |
| Edit the note | Select a connection, then edit it in the inspector | `putRecord` in place, with the same AT URI. A `swapRecord` guard refuses the write if the record changed elsewhere. |
| Change the type or reverse it | Inspector: type picker or **Reverse direction**, then **Save changes** | An atomic replace (see below) |
| Move one end | Drag the end of an edge onto another card, then confirm | An atomic replace |
| Bulk retype | Shift-select connections (or select cards, then **Select the connections between these cards**), pick a type, then confirm | Replaces, in `applyWrites` batches of at most 100 operations. Selected connections that already have that type, or that would duplicate another connection, are skipped. |
| Delete | **Delete** button, or the Delete key, with one or more connections selected. You confirm first. | `deleteRecord` for one connection, `applyWrites` for several |

**Why type and direction changes are replacements.** Semble's indexer only applies **note** changes from record updates. See `ProcessConnectionFirehoseEventUseCase` in Semble, where source, target and type changes are ignored. If we updated the type in place, your PDS and Semble would disagree.

So these edits delete the old record and create a new one in **one `applyWrites` commit**. Either both happen or neither does. The new record keeps the original `createdAt`, gets a fresh `updatedAt`, and has a new AT URI. The edited edge stays selected throughout.

All edits are optimistic and roll back on failure. A failed bulk batch is reloaded from the PDS, because a batch larger than 100 operations spans several commits and earlier ones may already have landed.

### Architecture

```
src/
  services/atproto/   identity resolution, App Password session, error mapping
  services/sources/   source adapters (Semble, Margin) → generic graph model
  graph/              source-agnostic model, filters, ELK layout, local positions
  queries/            TanStack Query hooks (server state, optimistic mutations)
  state/              Zustand store (selection, filters, drafts, notices)
  components/         sign-in, sidebar, React Flow canvas, inspector, dialogs
  lexicons/           GENERATED by `lex build` (git-ignored)
lexicons/             vendored lexicon JSON (committed)
lexicons.json         lexicon manifest with CIDs (committed)
```

- **The PDS is the source of truth.** TanStack Query caches PDS reads. Nothing is duplicated into a local database.
- **Graph-agnostic UI.** The canvas, filters, layout and inspector only use `GraphItem`, `GraphLink` and `Annotation` from `src/graph/model.ts`. Semble- and Margin-specific code lives in `src/services/sources/*`, and the two meet in `src/queries/useWorkspaceGraph.ts`. To add another AT Protocol app, write a new adapter and join it in there.
- **Typed records only.** Every read goes through `client.list`/`listAll`, which validates against the generated schemas. Records that fail validation are counted and reported, never used. Every write is built with `$build` and checked with `$parse` before it is sent.
- **Edge routing.** Every card has a handle on each side. Each edge attaches to the facing sides of its two cards: whichever axis has the larger clear gap, so side-by-side cards connect left↔right and stacked cards top↔bottom (`src/graph/edgeSides.ts`). This is recalculated from live positions, so edges follow a card while you drag it. Because edges use real handles, React Flow's drag-to-move anchors stay at the true ends.
- **Layout.** ELK runs once for cards without a saved position, and again when you click "Tidy layout". Manual positions are saved in `localStorage`, keyed by DID and the set of selected collections. They are never written to the PDS.

### Authentication and credentials

The sign-in flow works like this:

1. A handle is resolved to a DID, then to a DID document, then to your PDS. We call `createSession` **on your PDS**, not on a hard-coded host.
2. The password field only accepts the App Password format (`xxxx-xxxx-xxxx-xxxx`). A typed main account password is rejected before any request is made.
3. If the PDS returns `AuthFactorTokenRequired`, the form asks for the emailed code and retries.

`@atproto/lex-password-session` handles token refresh. Refresh is single-flight: concurrent requests trigger only one `refreshSession`, and each request is retried once with the new token.

Tokens are kept in memory. If you tick **Keep me signed in**, only the refresh token, DID, handle and PDS URL are saved to `localStorage`. The access token and the App Password are never stored. If the refresh token is revoked, local credentials are cleared and you are returned to sign-in.

"Sign out" calls `deleteSession` and clears local credentials and in-memory graph state. Saved layout positions are not cleared, because they contain no credentials.

Tokens never appear in URLs, logs or error messages. All errors go through `describeError`, which produces fixed, actionable text.

## Lexicons

The `lex` CLI normally resolves schemas over DNS (`_lexicon.<authority>` TXT records). That was not possible in the build environment, so the schemas are **vendored** in `lexicons/`. `lexicons.json` uses a local `directory` resolver, and every file is locked by CID. Network resolution is still the fallback for anything not vendored.

| Lexicons | Source | Revision |
| --- | --- | --- |
| `network.cosmik.*` | [cosmik-network/semble](https://github.com/cosmik-network/semble) `src/modules/atproto/infrastructure/lexicons/` | commit `ab1d9de` (2026-10-19) |
| `at.margin.note` | [margin-at/margin](https://github.com/margin-at/margin) `lexicons/at/margin/note.json` | commit `06a393e` (2026-09-12), lexicon revision 4 |
| `com.atproto.*` | [bluesky-social/atproto](https://github.com/bluesky-social/atproto) `lexicons/` | commit `a2840e2` (2026-10-20) |
| `app.bsky.richtext.facet` | [bluesky-social/bsky](https://github.com/bluesky-social/bsky) `lexicons/` (needed by `at.margin.note`) | commit `297ceac` (2026-10-17) |

To add or update a lexicon:

```bash
# With working DNS, from the network:
npx lex install <nsid>            # or: npx lex install --update
# Without DNS: drop the JSON into lexicons/<a>/<b>/<c>.json, then:
npx lex install <nsid>            # resolved via the local directory resolver
npm run lex:build
```

> The `lex` CLI README still shows a `"version": 1` manifest with `resolvers`. Version 0.4 only honours `resolvers` in a `"version": 2` manifest.

## Testing

```bash
npm test
```

| File | What it covers |
| --- | --- |
| `src/services/atproto/identity.test.ts` | Handle/DID validation, DID document parsing, PDS resolution |
| `src/services/atproto/session.test.ts` | App Password sign-in success and failure, two-factor flow, single-flight refresh after expiry, revoked refresh token, resume, sign-out, what gets persisted |
| `src/services/sources/semble/mapping.test.ts` | Semble records → graph, note folding, URL/AT URI endpoint resolution, outside cards, connection record building and lexicon validation, edit planning (in-place update vs replace), unknown-type fallback, duplicates |
| `src/services/sources/semble/api.test.ts` | Cursor pagination (250 records), invalid-record handling, connection create/delete, in-place note update and swap conflicts, atomic replace, 240-operation batches split without separating a replacement's delete and create, bulk delete |
| `src/services/sources/margin/notes.test.ts` | Margin note building, validation, round-trip |
| `src/queries/semble.test.tsx` | Optimistic create, rollback on failure (with retry draft), delete rollback, duplicate guard; edits that keep selection through a replace; rollback on a swap conflict; bulk retype and delete |
| `src/graph/filters.test.ts`, `src/services/sources/url.test.ts` | Search, filters, URL normalisation |
| `src/graph/edgeSides.test.ts` | Nearest-side choice for side-by-side, stacked, diagonal and overlapping cards |
| `src/components/auth/SignInScreen.test.tsx` | Rejecting non-App-Passwords, two-factor prompt, credential errors |
| `src/services/sources/semble/create.test.ts` | New card, note and link records shaped like Semble's; URL validation; reusing an existing card (links only for missing collections, one note per link); a single commit whose locally computed CIDs match the PDS's; collection records and lexicon limits |
| `src/services/linkPreview.test.ts` | Preview mapping; failure and disabled cases |

The integration tests use `src/test/fakePds.ts`. This is an in-memory PDS, PLC directory and handle resolver. The real `@atproto/lex` client and `PasswordSession` run against it over `fetch`, including token expiry, revocation, cursors and injected failures. Like a real PDS, it hashes each created record as received to produce its CID.

The tests use happy-dom rather than jsdom. Under jsdom, typed arrays come from a separate realm, which breaks the `instanceof Uint8Array` check in multiformats when hashing for CIDs.

### Manual checks performed

The app was driven end to end in Chromium (Playwright) against the fake PDS, with no console errors. The run covered:

- sign-in with "keep me signed in"
- selecting two collections
- inspector and Margin note display
- drag-to-connect and saving through the editor (record verified on the PDS)
- the duplicate guard
- an injected 500 error: rollback, then a successful retry
- keyboard Delete with confirmation
- creating a Margin note
- search and type filters
- dragging a card, reloading, and checking that the session, collections and position were restored
- transparent token refresh
- sign-out (`deleteSession` called, no stored session left)

A second run covered connection editing. It checked these against the stored records:

- outside cards
- an in-place note edit (same record key)
- a type change plus reversal as one `applyWrites` commit, with the note and `createdAt` kept and the edge still selected
- dragging an edge end to another card (the orphaned outside card disappears)
- a bulk retype of 3 connections
- a bulk delete with the keyboard
- hiding outside cards

A third run covered creation and the account menu:

- logo, display name and avatar (a content-addressed blob from the PDS)
- adding a card with preview, note and default collection: one commit of 3 records, and the card appears selected
- adding the same URL again: no new card, the note locked, and only the missing collection link written
- creating a collection: name validation, Open access, and the collection ticked afterwards
- the account menu: toggling a setting, closing with Escape (focus returns to the button), closing on an outside click, and signing out from it

Scale, measured in headless Chromium with software rendering:

| Cards | Load and first layout |
| --- | --- |
| 25 | ~1.3 s |
| 100 | ~1.7 s |
| 300 | ~2.2–2.8 s |

Panning stays usable at 300 cards: about 28 fps headless, which should be higher on GPU-backed browsers.

## Known limitations

- **Own records only.** Cards that other people added to your open collections live in their repos and are not loaded. The same applies to other people's connections and Margin notes. Reading those needs an AppView.
- **Margin notes are basic.** You can read your own notes on a card's URL and create plain `commenting` notes. Editing, highlights, selectors and bookmarks are not supported.
- **Changing a connection's type or ends gives it a new AT URI.** This is the price of staying in sync with Semble (see [Editing connections](#editing-connections)). Anything that linked to the old URI will not follow it.
- **Handle resolution uses a public resolver.** By default this is `public.api.bsky.app`. Enter a DID to skip it entirely.
- **Positions are per browser.** Layout is not synced across devices.
- **Favicons** are loaded directly from each card's domain, with no referrer.
- **The App Password format check** assumes the standard `xxxx-xxxx-xxxx-xxxx` format used by the reference PDS.
- **Cards and collections can be created, but not yet edited or deleted.** The same applies to notes and to removing a card from a collection. Use Semble for those for now.
- **Link previews use Bluesky's link-card service.** Turn them off with `VITE_LINK_PREVIEW_SERVICE=`. Without a preview, the card's title is whatever you type, or a cleaned-up URL; Semble fetches its own metadata either way.
- Out of scope for the beta: OAuth, public or other users' collections, network search, collaboration, offline sync, import/export, and AI features.
