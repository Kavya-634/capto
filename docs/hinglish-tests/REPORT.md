# Hinglish implementation and real speech tests

These tests run the actual browser WASM Hindi recognizer with `language: 'hinglish'` mapped to Hindi. They do not inject a transcript or mock recognition. Fixtures are synthetic code-switching speeches using macOS Lekha (Hindi) and Rishi (English-India), concatenated with 50 ms gaps, not a native-speaker benchmark. Source text, duration and construction notes are in [the fixture manifest](../../e2e/fixtures/hinglish/manifest.json).

## Results

| Clip                     | Audio  | Inference elapsed | End-to-end Roman-text word edits | Preserved all returned word intervals? |
| ------------------------ | ------ | ----------------- | -------------------------------- | -------------------------------------- |
| Creator / video editing  | 6.70 s | 60.97 s           | 5 / 13 (38.5%)                   | Yes, exact equality                    |
| Office / team meeting    | 6.16 s | 110.47 s          | 11 / 13 (84.6%)                  | Yes, exact equality                    |
| Weekend / coffee & reels | 6.16 s | 144.33 s          | 5 / 11 (45.5%)                   | Yes, exact equality                    |

These percentages compare the intended casual-Roman reference to the final output after recognition **and** romanisation. They are not pure ASR WER or a broad accuracy benchmark. Case and punctuation are removed; spelling variants count as edits. CPU time overlapped UI regression tests, so durations are not isolated speed benchmarks.

### 1. Creator

Spoken reference:

> आज हम video editing सीखेंगे। पहले clip upload करो और captions save करो।

Actual Hindi recognition:

> आज हम विडीो एदिटिं सीखेंगे पहले क्लिप अपलोड करो और क्याप्षन्सेव करू

Actual Hinglish:

> aaj hum videe editin seekhenge pehle clip upload karo aur kyaapshansev karoo

Incorrect words: `video → विडीो → videe`, `editing → एदिटिं → editin`, `captions save → क्याप्षन्सेव → kyaapshansev`, and `करो → करू → karoo`. The recognizer's malformed/misheard inputs are not repaired by a spelling-only transliterator. `क्लिप → clip` and `अपलोड → upload` are restored through the loanword dictionary; source Hindi, timing and text remain inspectable.

### 2. Office

Spoken reference:

> कल हमारी team meeting है। project update भेजो और deadline ध्यान में रखो।

Actual Hindi recognition:

> अपने आप देजो और दिडलान में रको

Actual Hinglish:

> apne aap dejo aur didlaan mein rako

Major ASR failure: the opening `कल हमारी team meeting है` was omitted, `project update` became `अपने आप`, `भेजो` became `देजो`, and `deadline ध्यान` was reduced to `दिडलान`. `रखो → रको` lost the aspirated consonant. The remaining text is romanised, but no words are invented to conceal omissions. This clip needs substantial manual correction or a better recognition model; transliteration alone cannot solve it.

### 3. Weekend

Spoken reference:

> दोस्तों weekend पर coffee और lunch के बाद Instagram reel बनाएंगे।

Actual Hindi recognition:

> दोस्तों वीक अद पर कोफी और लान्ज के बाद, अन्स्टाग्राम रील बनाएंगे.

Actual Hinglish:

> doston veek ad par kophee aur laanj ke baad, anstaagraam reel banayenge.

Incorrect/missed words: `weekend → वीक अद → veek ad` (split and misheard); `coffee → कोफी → kophee` (recognition spelling plus phonetic fallback rather than standard English loan spelling); `lunch → लान्ज → laanj`; `Instagram → अन्स्टाग्राम → anstaagraam`. `रील → reel` and `बनाएंगे → banayenge` are correct. These failures are retained in the report instead of silently replacing ASR output with the expected script.

## What was verified independently of recognition quality

- Hindi/Hinglish view toggles preserve exact `start`/`end` arrays and restore edited Roman spellings. No second ASR request occurs.
- Original Hindi words remain available, including recognizer errors. Roman edits do not rewrite the Hindi source. Hindi spelling edits regenerate the local Roman spelling for that word.
- Single-word spelling edits, split at a chosen word and merge of non-overlapping adjacent lines preserve every original word interval. These operations are undoable. Free-text structural rewrites are explicitly estimated.
- Actual generated Hinglish words drive karaoke highlights at their original interval midpoints. Desktop/mobile dark-mode output was captured under this directory.
- English text translation was run locally on the creator transcript and cached. It produced: **“Today we learn to be dido Adro Avit Upload clip and what do you want to do?”** This poor translation reflects the bad source plus the small translation model; it is not an accurate reference translation. Switching back to Hindi/Hinglish preserved original word times; switching to cached English did not reprocess audio/video.
- Local test flow produced no outgoing POST requests or request bodies. Network reads downloaded model/app assets only.
- The optional AI backend has no real API key configured. Missing-key behaviour, origin/CSRF checks, text-only schema, stable word mapping, redacted provider failures, review/apply/undo and provider request construction were tested with mocks. **No live AI correction quality was measured.**

## Issues found and fixed during implementation

- Script switching initially allowed an out-of-date textarea draft to be read for a frame while timed word inputs had already switched. Draft handling now reflects external view/undo changes synchronously; the real three-clip rerun passed exact round-trip checks.
- The old Hindi font selection used a numeric font-list index that changed when fonts were added. It now selects Noto Sans Devanagari by name.
- A same-count word correction used to discard alignment. It now preserves it; changes that add/remove words explicitly become estimated instead.
- Heavy concurrent ASR caused several first-pass browser tests to time out. The final rerun, without concurrent recognition, passed all **34 desktop/mobile browser tests**. All **44 unit/server tests**, the strict TypeScript/production build and formatting checks passed; `npm audit` reported zero vulnerabilities.

## Evidence and reproduction

- [Creator raw result](creator.json), [office raw result](office.json), [weekend raw result](weekend.json), [run summary](summary.json).
- [Creator screenshot](creator.png), [office screenshot](office.png), [weekend screenshot](weekend.png); `*-mobile.png` captures phone layouts.
- Run `npm run build`, start `npm run preview -- --port 4201`, then `TEST_TRANSLATION=1 npm run test:speech:hinglish` with Chrome installed. This uses the actual Whisper and local text-translation models and may take minutes. `CHROME_PATH` overrides the Chrome executable.
- `scripts/create-hinglish-fixtures.py --ffmpeg /path/to/ffmpeg` regenerates fixtures using local macOS `say`; none of those test tools run in the website.

**Conclusion:** format conversion, local text translation, editing and timestamp preservation are functional without a key. Casual spellings are good on known Hindi words and loanwords, but code-switched recognition remains unreliable. Every caption—including AI suggestions—must be reviewed before sharing.
