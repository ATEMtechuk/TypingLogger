# Third-party notices

TypingLogger bundles the following third-party components. Each is the property
of its respective authors and is used under the license shown.

---

## 1. Frequency dictionary - `data/dict.txt`

Derived from **`frequency_dictionary_en_82_765.txt`** in the **SymSpell** project
(<https://github.com/wolfgarbe/SymSpell>), Copyright © Wolf Garbe, used under the
**MIT License**. That word-frequency list is itself compiled from the
**Google Books Ngram** corpus and the **SCOWL** (Spell Checker Oriented Word Lists)
project.

A small number of common English contractions (e.g. `can't`, `won't`, `don't`)
were appended locally to improve autocorrect coverage.

SymSpell MIT License:

```
MIT License

Copyright (c) Wolf Garbe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```

---

## 2. WebExtension polyfill - `lib/browser-polyfill.min.js`

**webextension-polyfill** v0.12.0
(<https://github.com/mozilla/webextension-polyfill>), Copyright © Mozilla, used
under the **Mozilla Public License 2.0 (MPL-2.0)**. The file is included
unmodified and retains its upstream license header. The MPL-2.0 source form is
available at the URL above.

---

## 3. Definitions API (runtime, optional)

The dashboard's optional **Define** button fetches word definitions from the
**Free Dictionary API** (<https://dictionaryapi.dev>). This is a network request
made only when you click Define; no bundled code from that project is included.
