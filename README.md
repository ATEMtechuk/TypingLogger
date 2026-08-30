# TypingLogger

A privacy-first browser extension (Firefox & Chrome, Manifest V3) that measures
your **real-world typing speed and accuracy** as you type across the web — then
helps you type better with **phone-style autocorrect** and **word suggestions**,
and shows your progress on a local **dashboard with graphs**.

Unlike a typing test, it measures how you actually type — in emails, docs, search
boxes and comment fields — not a canned paragraph. Everything runs and is stored
**locally on your machine**. There is no account, no server, and no analytics.

> **Scope:** the extension can only see typing **inside web pages**. It cannot see
> your browser's address/search bar, or typing in other desktop apps — those are
> outside what any browser extension is allowed to access.

---

## Features

- **Typing speed (WPM)** — measured continuously from your natural typing, using
  the standard "5 characters = 1 word" convention over active typing time (idle
  pauses are excluded so they don't drag your speed down).
- **Accuracy** — two complementary measures:
  - *Spelling accuracy* — share of words you spelled correctly, checked against a
    dictionary (so typos count even if you don't fix them).
  - *Keystroke accuracy* — how clean your keystrokes are, using backspaces as the
    error signal, the same character-level method typing-test sites use.
- **Autocorrect** — finishes a word (space/punctuation) and silently fixes common
  typos, phone-style. Press **Backspace** immediately after to undo a correction.
- **Predictive typing** — a small suggestion bar offers dictionary completions as
  you type, and next-word suggestions learned from your own typing. **Tab** or
  click to accept, **Esc** to dismiss.
- **Dashboard** — daily WPM and accuracy graphs, a per-site breakdown, and a list
  of **words you often misspell** with an on-demand **Define** button.

Autocorrect and predictions work in standard `<input>` and `<textarea>` fields
(search boxes, Gmail fields, comment boxes, forms). Rich `contenteditable`
editors (Google Docs, Notion) are not yet supported.

---

## Install

### Firefox — try it (temporary)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** and select **`manifest.json`** in this folder
3. Type into any text box on a web page, then click the toolbar icon for the popup

A temporary add-on is removed when you close Firefox.

### Firefox — install permanently

Regular Firefox only installs signed add-ons. Sign a private ("unlisted") copy
for yourself with a free Mozilla account:

1. Create API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/>
2. From this folder:
   ```bash
   npm run sign -- --api-key=YOUR_ISSUER --api-secret=YOUR_SECRET
   ```
3. Install the signed `.xpi` (written to `web-ext-artifacts/`) via
   `about:addons` → gear → **Install Add-on From File…**

(Alternatively, Firefox Developer Edition / ESR can install an unsigned `.xpi`
after setting `xpinstall.signatures.required` to `false` in `about:config`.)

### Chrome / Edge — install unpacked

1. Open `chrome://extensions` and enable **Developer mode**
2. Click **Load unpacked** and select this folder

Chrome keeps unpacked extensions loaded across restarts.

---

## Usage

1. Type normally in any text field on a web page.
2. **Autocorrect:** misspell a word and press space — it's fixed. Hit Backspace
   right after to restore your original.
3. **Suggestions:** as you type, a bar shows completions; press **Tab** to accept
   the first. After a space, it suggests likely next words it has learned from you.
4. Click the **toolbar icon** for today's WPM/accuracy at a glance.
5. Click **Open dashboard** for graphs over time, per-site stats, and your
   commonly-misspelled words (with **Define** to look up meanings).

---

## Privacy

TypingLogger is designed to keep your data on your device.

- **Stored locally, never uploaded:** all data lives in `browser.storage.local`
  in your browser. There is no account, no server, and no analytics or telemetry.
- **What it records:** mostly *aggregate counts* — characters, words, backspaces,
  active typing time — bucketed by day and by site **hostname** (e.g.
  `mail.google.com`). It does **not** record the full text you type.
- **Two features do store individual words, locally:**
  1. *Misspelled-word memory* — the correct spelling of longer words you commonly
     mistype, plus the typo you tend to make.
  2. *Next-word model* — pairs of consecutive words you type, so it can suggest
     what usually comes next.
  These stay on your machine and are never transmitted.
- **Password fields are ignored** entirely, and predictions never appear in them.
- **The one time data leaves your device is when *you* click "Define":** that
  single word is sent to the Free Dictionary API (`api.dictionaryapi.dev`) to
  fetch its definition. Nothing else is ever sent anywhere. If you never click
  Define, nothing leaves your browser.
- **Reset anytime:** the popup's *Reset all stats* button erases everything —
  daily stats, the next-word model, and the misspelled-word memory.

The extension requests only the `storage` permission (to save your stats) plus
access to pages so it can watch typing in text fields.

---

## Development

Requires Node.js 18+. Tooling is run via `npx` (no install needed) or `npm i`.

```bash
npm test            # run the unit tests (metrics + corrector)
npm run lint        # validate the extension with Mozilla's web-ext linter
npm run start:firefox   # launch Firefox with the extension, auto-reloading on edits
npm run build       # produce an unsigned .xpi/.zip in web-ext-artifacts/
```

The `web-ext lint` step reports 0 errors; it emits 3 harmless warnings noting
that Firefox ignores the Chrome-only `service_worker` background key — which is
intentional in this cross-browser build (the manifest also provides a
`background.scripts` entry that Firefox uses).

### How it fits together

```
manifest.json          Manifest V3, cross-browser (Firefox + Chrome)
data/dict.txt          ~83k-word English frequency dictionary (see credits)
lib/                   Mozilla webextension-polyfill (browser.* in both browsers)
assets/                Toolbar / store icons
src/
  metrics.js           WPM + accuracy math (pure, unit-tested)
  content.js           Capture layer — counts keystrokes in editable fields
  autocorrect.js       Phone-style autocorrect, spelling stats, next-word learning
  predict.js           Predictive-typing suggestion bar (closed shadow DOM)
  corrector.js         Background: spell-correct + completion engine (dictionary)
  background.js        Service worker — aggregation, next-word model, word memory
  popup.html / .js     Toolbar popup (today + all-time)
  dashboard.html / .js  Dashboard: graphs, per-site, misspelled-word memory
test/                  Unit tests (node --test)
```

Only additive counters are stored; WPM and accuracy are derived when read:

```
daily:    { "YYYY-MM-DD": { typedChars, backspaces, words, cleanWords, activeMs,
                            wordsChecked, misspelledWords, autoCorrections,
                            bySite: { "host": { ...same counters... } } } }
lifetime: { ...same counters... }
bigrams:      { prevWord: { nextWord: count } }          # personal next-word model
misspellings: { correctWord: { count, typos, lastSeen } } # word memory
```

---

## Credits & licenses

This project is licensed under the **MIT License** (see [LICENSE](LICENSE)).

It bundles third-party components under their own licenses — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md):

- **`data/dict.txt`** — derived from SymSpell's `frequency_dictionary_en_82_765.txt`
  (Wolf Garbe, MIT), itself compiled from the Google Books Ngram corpus and SCOWL.
- **`lib/browser-polyfill.min.js`** — Mozilla webextension-polyfill (MPL-2.0).
- **Define** definitions come from the Free Dictionary API (dictionaryapi.dev).
