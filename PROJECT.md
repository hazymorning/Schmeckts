# Schmeckt’s?

Android app that records which food a cat likes and how well it went down.

**Local first.** Everything is stored on the phone, and the app works in full without a network or a server. An
optional server on the home network adds two conveniences for a household: syncing the phones, and recognising
packaging photos with an AI model. The app never depends on it. Whatever the server offers, the phone either does
itself as well or simply goes without, and an unreachable server never blocks, loses or delays anything the user does.

The interface and the two READMEs are German. Code, comments, tests and this file are English. Values in backticks
in the tables below are stored on phones and servers and are never renamed.

## Layout

- `app/`: the app, one Gradle project. Kotlin and Jetpack Compose in `src/main/kotlin/de/schmeckts/app/`, Android
  resources in `src/main/res/`, data modules as JSON in `src/main/resources/` (`vocab.json` written by
  `scripts/vocab.py`), tests in `src/test/kotlin/de/schmeckts/app/`.
- `server/`: the optional server. Go, standard library only, with its .deb packaging and its own README.
- `tests/`, `scripts/`, `design/`: fixtures and the cross-file checks, build and lint scripts, icon sources.

minSdk 24 (Android 7), target SDK 36, compile SDK 37. App ID `de.schmeckts.app`. The version lives only in
`app/gradle.properties`; `versionCode` is 20000 + 10203 for 1.2.3, the offset keeps it above builds from before the
version restart at 0.1.0. ARM builds only. Up to 0.42 the app was a Capacitor WebView; its files, notifications and
shortcuts carry over as they are.

## Modules

`app/src/main/kotlin/de/schmeckts/app/`, each layer using only the ones above it:

1. Foundations: `Json`, `Text`, `Dates`, `Report`, `Native` (the interfaces to the phone), `Net`, `Reading`, `Config`,
   `Fields`, `Clock`, `Disk`, `content/*` (the texts of the overview card and the cat calendar)
2. Data: `Store`, `Api`, `Sync`, `Smart`, `Glance`, `Derive`, `Images`, `Photos`, `Recognize`, `Ai`, `Ocr`, `Vocab`,
   `Online`, `Update`, `Phone` (one phone's data parts together)
3. Interface: `ui/*` (theme, icons, sheets, toast, slider, viewer, camera, crop)
4. Views: `views/*`, composables
5. Logic: `logic/*`
6. Control: `Actions`, `Main`; `App`, `MainActivity`, `Receivers` and `Android` (the phone's parts) are the Android
   side

- A lower layer reaches an upper one through callbacks (`store.onChanged`, `disk.failed`, `sync.onReachable`,
  `release.onChanged`) that `Main` wires up. One `Main` lives in the `Application`; there is no ViewModel layer.
- Records stay JSON (`Rec` over a `JsonObject`), so fields of newer versions survive. Change data by mutating `db`
  and calling `save()`. Replace it wholesale only with `replaceDb()`. `revision`, `ui.tick` and the sheets' tick are
  Compose state; every view reads them through `watch()` and is drawn again on a change.
- A button names an action; the entry of that name in `Actions` runs, with `ui.on(name)` as its click.
- Texts with `<b>` are written as in the old views and drawn by `markup()`. Foreign text always goes through `esc()`.
- An error not handled where it happens goes to `report(where, error)`. What the user needs to know is said in
  German where it happens, as a toast or a banner. A deliberately empty `catch` says why in a comment.
- The phone's parts (camera, scanner, text recognition, notifications, sharing, installer, haptics, HTTP) sit behind
  `Platform`, `Notifications` and `Http`; the tests put fakes in their place. Pure logic uses no `android.*` and runs in
  plain JUnit.

## Storage

`db.json`, `prefs.json`, `sync.json` and `queue.json` in `filesDir` (Capacitor's `DATA` before), each written
atomically through `.tmp` and a rename, in the order queue, data, clocks. After a crash the next start replays the queue. A file that cannot be read is set aside and the
app writes nothing until restarted. Packaging photos are files in `photos/<productId>.jpg`, one per variety, and are
in neither `db.json`, a backup nor an exchange file. `ai.json` holds the phone's own AI key and its model, and goes
nowhere else. Nothing goes to Google's cloud backup; device-to-device transfer takes everything but `ai.json`
(`app/src/main/res/xml`).

## Data

```js
db = { version: 3,
  pets:         [{ id, name, nicknames, species, sex, photo, birthday, createdAt }],
  products:     [{ id, brand, variety, type, animal, texture, thumb, lastPets, createdAt, codes: { [ean]: true }, kaufen, sharedPhoto }],
  servings:     [{ id, productId, servedAt, note, by, thumb,
                   pets: { [petId]: { r: <key from RATINGS>|null, at, by } },
                   photo, status, error, autoPets, scanCode, guess }],   // last line: this phone only, never synced
  observations: [{ id, kind, at, pets: { [petId]: true }, by }] }
```

Fields this phone does not know, written by a newer app version, are left untouched, and so are `birthday`, which
the app no longer shows or changes since 0.33, and `animal`, which it no longer reads or writes since 0.35. Barcodes
are stored as EAN-13 (UPC-A gets a leading 0) or EAN-8. Sample data carries ids starting with `demo` and is removed on
connecting to a server.

| Where | Value | Meaning |
|---|---|---|
| `RATINGS`, scale `portion` (wet food) | `top` `gut` `mittel` `eager` `sosse` `schlecht` | 100, 80, 50, 35, 30, 0 points |
| `RATINGS`, scale `bowl` (dry food) | `gern` `normal` `wenig` `liegen` | 100, 80, 35, 0 points |
| `RATINGS`, scale `bite` (treats, other) | `verputzt` `spaeter` `angeknabbert` `unberuehrt` | 100, 70, 35, 0 points |
| `products[].type` | `Nassfutter` `Trockenfutter` `Snack` `Sonstiges` | food type, decides the scale |
| `products[].texture` | `sosse` `gelee` `pastete` `mousse` `block` `suppe`, treats `knusprig` `weich` `creme` `milch` `stick` `kau` | consistency or treat type |
| `products[].kaufen` | `immer`, `nicht`, absent | set by hand, beats the computed verdict |
| `products[].sharedPhoto` | `true` or a number (ms) | the server holds the large photo; a number stamps a replaced one |
| `observations[].kind` | `happy` `stink` `hungry` `tired` `vomit` | unknown kinds from newer phones are kept |
| `pets[].species` | `Katze` | set on every new pet; only versions before 0.35 read it, for the icon and the cat calendar. Their `Hund` `Kaninchen` `Vogel` `Nager` `Andere` are left as they are |
| `pets[].sex` | `f` `m`, absent | female, male, not given |
| `servings[].status` | `reading` `recognizing` `waiting` `failed` `noserver` | recognition state, this phone only |
| `prefs.hiddenHints` | `stop:` `sosse:` `liebling:<variety>`, `appetit:<pet>:<YYYY-MM-DD>`, `tipp:erinnern`, `neu:<version>` | hints hidden on this phone; `tipp:erinnern`: the rating reminder was set, or asked about once after a meal; `neu:` news seen, all of them on a phone without pets of its own (`news.json`). `tipp:beobachtung` from before 0.33 stays unread |
| `prefs.sheetDay` | `<YYYY-MM-DD>` | the day of the cat calendar's top sheet on this phone; before today it still hangs over today's until torn off. Set on first sight; `prefs.torn` from 0.28 to 0.30 and `prefs.milestones` from before 0.33 are dropped |
| rating reminders | channel `default`, id `idOf(serving.id)`; the intent's `LocalNotificationUserAction` (`tap` or a rating key) and `LocalNotficationObject` (JSON with `extra.serving`, `extra.pet`, `extra.rate`) | as Capacitor wrote them, so a reminder 0.42 showed still opens and rates; planned from the data at start, after changes and after a restart or update |
| exchange file `kind` | `exchange` | written by „Änderungen teilen“ |

## Without and with a server

Without a server nothing goes out as long as the product lookup („Sortensuche im Internet“, off by default) stays off,
no AI key of the phone's own is set and the update check is off; a test holds that. The update check (`prefs.updates`,
on by default, only in the app) asks GitHub's API for the latest release once at start. A newer release's
`schmeckts.apk` is loaded into the cache (`update/`, cleared on the next start) and handed to Android's installer,
which asks before it replaces the app (`install()` in `Android.kt`, `REQUEST_INSTALL_PACKAGES`). The phone reads the packaging
text itself (ML Kit, on device), and one of the household's own varieties found on the packaging is served at once
with undo. Google's barcode scanner in Play services sends its own usage data to Google.

With a key of its own („Fotos mit eigener KI erkennen“, `Ai.kt`) the phone sends packaging photos straight to that
provider: Anthropic, OpenAI or Google, told apart by the key's prefix. The model is picked from the provider's model
list when the key is checked and picked again when the provider no longer knows it, so a retired model needs no app
update.

Connected (`prefs.code` set), everything is still saved on the phone first and the server is one more peer:

- Changes wait in the queue until the server confirms them. Offline nothing is lost and nothing waits for it.
- Photo recognition: the phone's own key goes first. The server is asked while „Fotos über den Server erkennen“ is
  on, it has a key and the last sync reached it, and only once the own key found nothing; otherwise, or if it
  fails, the phone reads the photo itself (`identify()` in `Recognize.kt` keeps the whole chain).
- Feeding reminders ask the server whether anyone has fed already, and remind as usual when it does not answer.
- Packaging photos are shared through the server so other phones can show them large.
- „Verbindung trennen“ keeps all data on the phone.

## Sync protocol, version 1

Save locally first, then send. The server confirms after writing to disk. Sending twice is harmless.

- **Fields.** Every key except `id` is a field with its own clock. Maps are split per entry (`pets.<petId>`,
  `codes.<EAN>`, `MAPS` in `Fields.kt`), `null` removes an entry. `_del` is a field: `true` deleted, `false` present.
- **Clock.** `<ms, 13 digits>-<counter, 4 digits>-<device, 4-16 chars a-z0-9>`, sortable as text. `ms` is
  `Date.now()` plus the offset to server time (`now` in the sync answers).
- **Merge.** Per field the larger clock wins. A change to a deleted record does not bring it back; only `_del: false`
  with a newer clock does.
- **Collections.** `pets`, `products`, `servings` are known to every server. From server 1.5.0 (`collections` in its
  features) it keeps any collection named `^[a-z][A-Za-z0-9]{1,23}$`, at most 16. Against an older server changes to
  other collections stay in the queue and are not sent (`pending()`, `held()` in `Sync.kt`).
- **Change.** `{id, c, r, t, f}`: change id (8-64 chars), collection, record id (4-40 chars), clock, fields. Created
  or restored: all fields plus `_del: false`. Changed: only the changed fields. Deleted: `{_del: true}`.
- **Queue.** Stays until the server confirms it in `ok`. `rejected` with `reason: "invalid"` is dropped and logged,
  with `"clock"` the app restamps and sends again. At most 500 changes and 12 MB per request.
- **Catching up.** `GET /api/changes?since=<seq>&epoch=<epoch>` returns changed records in full,
  `{c, r, s, f: {field: {v, t}}}`. On a different epoch (the server set an unreadable state aside and started empty)
  the server sends everything and the app resends every field it holds with a newer clock.
- **Checksum.** SHA-256 over the sorted lines `collection/id/field@clock\n` of the collections asked for. Compared
  whenever the queue is empty, at most every five minutes; a mismatch triggers a full sync.
- **Manual exchange** (`logic/Exchange.kt`, no server needed): a file with our clocks and the records changed since
  the last exchange with that device, merged by the same rules. It holds no settings and no household code.

## Server API

All requests except `/api/info` need `Authorization: Bearer <code>`; only `/api/events` takes `?code=` instead.
Errors are `{"error": "<German message>"}`. Requests are only accepted from private address ranges.

| Request | Purpose |
|---|---|
| `GET /api/info` | version, protocol, epoch, server time, recognition set up, `features` |
| `POST /api/changes`, `GET /api/changes?since=N` | send and fetch changes |
| `GET /api/events` | server-sent events with the newest sequence number |
| `GET /api/checksum?c=` | checksum over the collections named |
| `POST /api/recognize` | photo in, `{brand, variety, type}` out; the server's API key never leaves it |
| `GET /api/fed?since=<ms>` | whether a meal was served since then (server 1.2.0) |
| `POST`/`GET /api/photo/<variety>` | the shared packaging photo (1.3.0; replacing from 1.4.0) |

The app checks the server's protocol version on connecting. Plain http is allowed only for private addresses
(`normServer()` in `Api.kt`).

## Evaluation

All of it is pure functions in `Smart.kt` (`analyze()` and what derives from it), cached in `Derive.kt`. Thresholds
are named constants at the top of `Smart.kt` and `views/Overview.kt`.

- A rating key alone decides points, wording and icon, whatever the variety's type is now. From `GOOD` (70) points a
  meal went down well, under `NO` (40) it was left.
- A verdict per pet and variety rests on the newest eight ratings of the last 180 days: „Nachkaufen“ from 3
  ratings with at least two thirds good, „Nicht mehr kaufen“ from 2 with more than half left, „Geht so“ from 3
  otherwise, below that „Noch zu wenig bewertet“. Across pets: a yes and no no is yes, the other way round no, both
  „Gemischt“. `kaufen` set by hand beats the verdict.
- Observations are shown beside the ratings and never change a rating, verdict or hint.
- An insight and a link from an observation to a variety need their gap to be a few pooled standard errors wide, as a
  trend does, so chance makes hardly any. A brand, consistency or flavour is set against the rest of the wet food, a
  flavour only within varieties of the same brand and consistency, so it does not take the blame for its sauce. `PersonasTest` holds on simulated households how rarely one shows
  for a cat without that habit and how often for a cat with it.
- The texts never give a percentage or a score; they say it in words („3 von 4 Mal gut gefressen“).

## Design

- Colours (light and dark), type styles, distances, radii and timings live in `ui/Theme.kt`. The palette and the
  lists of type styles and distances there are fixed; `DesignTest` holds them. Material 3 is only the ground, coloured
  through and through with the palette; no dynamic colours.
- The building blocks are in `ui/Kit.kt`; the views put them together.
- Colour carries meaning: `accent` for actions, selection and focus; rating colours only for ratings.
- Type only through the `Type` styles, spacing only from `Space`, radii only from `Radius`. One CSS px of the old app
  is one dp, text is in sp and follows the system's font size.
- Made for 390 to 412px width; at 360px nothing is cut off. Text wraps as it comes; none is swapped or shrunk to fit.
- A sheet rises from below for a task, a page comes in from the side for a place, back leaves the way it came.
- Undo instead of confirmation prompts. Own SVG icons, no emoji. Nothing moves under reduced motion. Text contrast at
  least 4.5:1 in light and dark.

## Working

- **Setup:** `scripts/setup-build-env.sh` sets up JDK 21, the Android SDK and Go; Python 3 with
  `pip install -r tests/requirements.txt` for the file checks.
- **Build:** `scripts/build-apk.sh <key file>` builds the R8 release and signs it; `server/build-deb.sh` the server
  packages. After changing the app icon, `design/render-icons.py` draws the Android 7 launcher icons in
  `app/src/main/res` again.
- **Checks:** `scripts/lint.sh` (ktlint, Android Lint, gofmt, go vet, ruff, shellcheck, `scripts/text-style.py`).
- **Tests:** `scripts/test.sh [go app files]`. `app` runs every Gradle test: pure modules in JUnit, the screens in
  Robolectric with Compose's test rule and fakes for the phone's parts, `SyncTest` and `SyncAppTest` phones against the
  real server, built with `go build`. `tests/fixtures/ocr/` holds real packaging readings; `schmeckts://ocr-dump`
  exports a new one from the phone. `tests/fixtures/household/` holds a real diary, names changed, that
  `HouseholdTest` replays as it grew. `tests/fixtures/files-0.42/` are the files 0.42 wrote, which the app must read
  and write back unchanged.
- **CI:** `.github/workflows/tests.yml` on pull requests and on `main`, jobs `lint` and `test`.
- **Release:** raise the version in `app/gradle.properties` (and the server's in `server/VERSION`, `debian/changelog`
  and the metainfo when it changed), merge, publish a GitHub release tagged `v<version>`.
  `release.yml` runs the tests, builds the signed APK (secret `SCHMECKTS_SIGNING_KEY`) as `schmeckts.apk` and the
  server packages, and attaches them. The README links to `releases/latest/download/schmeckts.apk`.
- **Signing key:** always the same one, or updates over an installed app fail. `schmeckts-signing-key.txt`
  (`scripts/signing-key.py`) stays outside the repository.
