# Capto browser speech-to-text test report

Tested on 2026-11-13 in desktop Chrome on macOS, through the production Vite build at `http://127.0.0.1:4201`. All speech recognition below ran in a **browser Web Worker using ONNX Runtime WASM**, with no server transcription or mocked model output.

## Shipped configuration

- Transformers.js 3.8.1, `Xenova/whisper-small`, revision `2d67713f236afa48a18992566e7647f6ca848e13`.
- q8 encoder and q8 merged decoder; single-thread WASM inside the worker.
- Explicit English/Hindi transcription, no translation; 20-second windows and 3-second overlap; model word timestamps.
- Browser-native decode of MP4/AAC audio to 16 kHz mono. Test clips contain a mountain still image so the real upload/video/audio path is exercised.
- The model download is about 250 MB. Model files are cached by the browser. Actual elapsed times include initialization and, where noted, download. They are observations on this machine, not performance guarantees.

## Actual results

| Test                                | Duration | Words in reference | Word edits | Normalized WER | Lines (words each) | Elapsed                                               |
| ----------------------------------- | -------- | ------------------ | ---------- | -------------- | ------------------ | ----------------------------------------------------- |
| English, synthesized Samantha voice | 6.344 s  | 16                 | 0          | **0%**         | 6, 5, 5            | **242.188 s**, cold download included                 |
| Hindi, synthesized Lekha voice      | 8.326 s  | 18                 | 8          | **44.4%**      | 6, 6, 4, 3         | **232.993 s**, cached files; concurrent browser tests |
| Hindi, native FLEURS speaker        | 9.120 s  | 24                 | 14         | **58.3%**      | 6, 6, 6, 6         | **53.150 s**, cached files                            |

Evidence: [English JSON](english.json), [English screenshot](english.png), [synthetic Hindi JSON](hindi.json), [synthetic Hindi screenshot](hindi.png), [native Hindi JSON](hindi-native.json), [native Hindi screenshot](hindi-native.png).

Final-build repeat checks reproduced the same English and native-Hindi transcripts, at **42.720 s** and **70.456 s** with cached model files. They also sought to the first four actual word midpoints and verified one-word text plus the karaoke active-word highlight in the rendered editor (`actualWordPlaybackVerified: true`). The same generated results were visually inspected in mobile dark-mode caption/word-timing and preview panels. Evidence: [final English data](english-final.json), [final native Hindi data](hindi-native-final.json), [mobile word review](english-final-mobile.png), [mobile English karaoke](english-final-mobile-preview.png), [mobile Hindi karaoke](hindi-native-final-mobile-preview.png). Timing varied with other local work; no real-time performance claim is made.

### English

Reference and recognized text matched:

> Hello everyone. Today we are making short videos with clear captions. Every word tells a story.

Examples of model word intervals: `Hello` 0.00–0.26 s, `everyone.` 0.26–0.86 s, `Today` 1.36–1.58 s, `story.` 5.84–6.20 s. The 0.86–1.36 s pause remains a gap in word highlights; it is not evenly stretched into a word.

This single, clear synthetic clip does not establish general English accuracy.

### Hindi (synthetic)

Reference:

> नमस्ते दोस्तों। आज हम छोटे वीडियो बनाना सीखेंगे। साफ आवाज़ में बोलिए और अपनी कहानी दुनिया तक पहुँचाइए।

Recognized:

> नमस्ते डुस्तों, आज फम चोर्ते वीडियो बनाना सेखेंगे. साफ आबास में बोलिए और अपनी कहानी दुन्या तक पहुट चाये.

The output is Devanagari, but spelling and recognition need substantial correction. Examples include `दोस्तों → डुस्तों`, `हम → फम`, `आवाज़ → आबास`, and a split/misrecognized `पहुँचाइए → पहुट चाये`.

### Hindi (native speaker)

FLEURS test recording `10011266027513218401.wav`, dataset ID 1766, Hindi `hi_in` test split. The first matching member of the audio archive was selected, not hand-picked for success.

Reference:

> कुछ अणुओं में अस्थिर केंद्रक होता है, जिसका मतलब यह है कि उनमें थोड़े या बिना किसी झटके से टूटने की प्रवृत्ति होती है,

Recognized:

> कुछ आड़ूमे आजद्टर के न्दर कोता है, जिसका मतला भी आहा की उन्मे थोडे या बिना किसी जटके से तुटने की प्रवत्ती होती है.

This materially wrong result is why Hindi is explicitly described in the UI and README as draft/experimental quality. It is not ready to publish without review.

### Word timestamps

All three outputs had non-empty word lists with positive, ordered, non-overlapping intervals bounded by clip duration. Caption bounds use the first/last word interval. The overlay uses these actual model intervals, and word-time editing/validation and JSON export are implemented.

**Not verified:** absolute onset/offset error against human-annotated word boundaries. These fixtures provide reference text, not independent word alignment. “Model-aligned” is not a claim of millisecond accuracy. Bad recognized words can have internally valid timestamps. Karaoke/one-word timing therefore also requires listening review.

## Five-minute clip (duration limit raised to 300 s)

Fixture: `e2e/fixtures/speech/english-long.mp4`, **291.06 s**, synthesized Samantha voice reading 54 varied sentences (776 reference words) with the script grown until just under five minutes so the reference matches the audio exactly. Served from the production preview with COOP/COEP headers; `crossOriginIsolated` was `true`, so the worker used 4 WASM threads.

| Metric                    | Result                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- |
| Elapsed (cached model)    | **241.97 s** — 0.83× real time                                                  |
| Word edits / WER          | 35 / 776 — **4.5%**                                                             |
| Recognized word count     | 776 (equal to reference)                                                        |
| Coverage                  | last word ends at 290.82 s of 291.06 s                                          |
| Lines                     | 148, every line 3–6 words                                                       |
| Word intervals            | 776, ordered, no overlaps, max silent gap 0.72 s                                |
| Boundary clipping warning | 1 word (clip end)                                                               |
| Progress samples          | 16, advancing 5% → 95% as windows completed                                     |
| Word-playback probe       | first 4 and last 4 words rendered at their midpoints; karaoke highlight correct |

Error breakdown by position (reference and output are the same length, so a positional diff is exact): `five → 5` ×9, `one → 1` ×5, `two/three/four/six/seven → digits` ×4 each, and one genuine misrecognition `vlogs → blogs`. Spoken-number normalization accounts for 34 of 35 edits; the 20-second window joins did not drop or duplicate any words in this clip.

A first attempt took ≈9.5 minutes while a Playwright suite ran concurrently and ended in a test-script failure (the karaoke probe did not seek before asserting); transcription itself completed. The probe was fixed and the clean rerun is the number above. Evidence: [english-long.json](english-long.json), [desktop screenshot](english-long.png), [mobile captions](english-long-mobile.png), [mobile preview](english-long-mobile-preview.png), [network log](network-english-long.json) (GET/HEAD only, no request bodies).

**Not tested:** a five-minute Hindi clip, single-thread timing for a five-minute clip, mobile devices, or a host without COOP/COEP headers. The 60-second over-limit fixture was replaced by a 301-second one; the UI test confirms it is refused with the five-minute message.

## Rejected higher-precision experiment

The same model was tested with an fp32 encoder and q8 decoder (~510 MB weights) to see whether encoder quantization caused Hindi errors.

| Clip            | q8 WER | fp32 encoder WER                | Precision-test elapsed                   |
| --------------- | ------ | ------------------------------- | ---------------------------------------- |
| Synthetic Hindi | 44.4%  | **50.0%** (9 edits / 18 words)  | 67.431 s, cached weights                 |
| Native Hindi    | 58.3%  | **54.2%** (13 edits / 24 words) | 370.775 s, new encoder download included |

The native output also included an unexpected Arabic-script character in `कुچ`. This did not justify doubling the download, so the experiment was **reverted**. The app ships q8 for both languages. Comparison files: [synthetic precision JSON](hindi-precision.json), [native precision JSON](hindi-native-precision.json). These are historical experiments, not the current configuration.

Hindi-specific community fine-tunes were investigated, but the inspected ONNX exports did not expose the cross-attention outputs required for this word-alignment path. They were not substituted silently or presented as tested solutions. A future improvement needs a validated Hindi fine-tune with alignment-capable ONNX export, or an independently tested local alignment model—not fabricated word times.

## User-reported failures on a real upload (two rounds)

Both messages below were produced by **Capto’s own post-processing in `alignWords()`**, not by the user’s video, browser, or network. In each case the model had already transcribed and timed the clip; a validation rule rejected the entire result because of one imperfect word interval, and a generic “check your connection” suffix was appended that had nothing to do with the cause.

**Round 1 — “Word alignment was incomplete.”** The code rejected any timed unit whose text contained whitespace. Transformers.js’ `splitTokensOnSpaces` / `mergePunctuations` can legitimately emit one word-timestamp entry such as `" world ,"` when a space-prefixed token is merged with a trailing punctuation token. Fix: keep the unit with its single model interval and collapse the spacing; report the count of joins as a review warning.

**Round 2 — “Some words have missing or zero-length timing.”** After round 1 the same clip progressed further and hit the next rule: any word whose bounded interval was non-positive aborted the job. This happens when Whisper gives a short function word identical start/end (`[0.6, 0.6]`), or when a 20-second window merge pushes a word’s clamped start past its model end. The library also sets `end = null` for the last token of a window by design. None of these indicate a bad recording.

**Fix (round 2).** `alignWords()` no longer throws for an individual word. A collapsed interval gets a minimal **50 ms** slot immediately after the previous word (shifted back inside the clip if it lands on the final sample); a missing start is taken from the previous word’s end; a missing end becomes start + 50 ms. Order is kept strict. Each repair is counted and surfaced in the result panel (`repaired`, `unaligned`, `joined`) so the user is pointed at exactly the lines to check. The only remaining hard failure is a transcript with no recognisable word at all. The misleading “check your connection” suffix is now added only when the failure occurred during the model download stage or the message mentions a fetch/network error.

These repairs touch only the affected words. They do **not** spread timing evenly across a caption, and the word-level JSON export records the repaired interval as-is so the edit is visible downstream.

**Verification.** Four new unit tests cover the zero-length, null-start, null-end, end-of-clip and empty cases (24 unit tests total). The four real-inference fixtures were re-run after each round with identical WER, coverage and timing (`*-fix.json`, `*-fix2.json`). The 22-test browser suite passes.

**Not reproduced on demand.** None of the test fixtures trigger either tokenizer path, so the specific word in the user’s clip is unknown. The fixes are defensive and cover the whole class of per-word timing defects rather than one word. If a further failure appears on the same clip it will now be a different message, and the result panel will list repair counts.

## User-reported failure, round 3: Hindi transcript was one word repeated (“तुछ तुछ तुछ…”)

After rounds 1–2 the same user’s Hindi clip “succeeded” — 43 captions, every one the single word तुछ, with the panel reporting _229 words had a zero-length or overlapping model interval_. This is a **Whisper repetition loop**: the decoder locks onto one token and emits it until the window’s token budget runs out. It is a known failure mode of Whisper (especially small models on lower-resource languages, music, echo, or fast speech), and the zero-length intervals are its fingerprint — the alignment heads have nothing to attend to for a token the model is just repeating.

**Diagnosis.** Two app faults compounded a model weakness:

1. The round-2 repair logic treated 229 collapsed intervals as 229 individually fixable words and shipped the result as “ready.” It should have recognised that a transcript where _every_ word needed repair is not a transcript.
2. Decoding used plain greedy search with no repetition control, so once the loop began nothing stopped it.

**Fixes.**

- **Degenerate-transcript detector** (`detectDegenerate` in `alignment.ts`) runs before captions are built. It refuses the result — with a specific message naming the cause — when any of these hold on a transcript of ≥12–20 words: the same word runs ≥10 times consecutively; one word is ≥50% of all words; or ≥60% of words needed interval repair. Thresholds are deliberately conservative so genuine repeated speech (“no no no”, a chant, a short jingle) is not refused; unit tests cover both sides.
- **Anti-repetition decoding**: `no_repeat_ngram_size: 3` and a uniform mild `repetition_penalty: 1.05`. Measured on the real fixtures:

  | Clip                       | Before (greedy) | Tried: penalty 1.15 for Hindi | **Shipped: 1.05 + no-repeat-3gram** |
  | -------------------------- | --------------- | ----------------------------- | ----------------------------------- |
  | English, 6.3 s             | 0%              | 0%                            | **0%**                              |
  | Hindi synthetic, 8.3 s     | 44.4%           | 55.6% (worse)                 | **38.9%** (7 edits / 18)            |
  | Hindi native FLEURS, 9.1 s | 58.3%           | 62.5% (worse)                 | **66.7%** (16 edits / 24)           |

  The stronger Hindi penalty was rejected because it hurt both Hindi clips. The shipped setting improved the synthetic clip and worsened the native clip; with two short Hindi samples that is noise around an already-poor baseline, not evidence either way. It is kept because the n-gram block is what actually stops a loop from running away, and English is unaffected. Raw results: `*-antiloop.json` (1.15 variant), `*-final.json` (shipped).

- The Hindi error text now says plainly that recognition is weakest with music, echo or fast speech and suggests trimming to one clear speaker.

**What this does and does not fix.** The detector guarantees a looped transcript is never presented as a result. The decoding change reduces how often the loop _starts_, but cannot make Whisper-small understand audio it fundamentally cannot follow — on that clip the honest outcome may now be an explicit error instead of garbage. That is the intended behaviour. The user’s clip itself was not available for testing; the fixture set (clear synthetic Hindi, one clean FLEURS sentence) does not trigger the loop, so the detector was validated on synthetic word lists shaped like the reported output.

Also in this round: the “Captions are ready” result box now has a dismiss (×) control and is cleared automatically when a new generation starts, so it no longer permanently occupies caption-list space.

## Real cancellation and privacy checks

- Started inference using the real cached model, waited for **Listening**, then cancelled.
- Worker count went from **1 to 0**; cancellation UI/termination check completed in **428 ms**.
- An existing manual caption remained unchanged. See [cancellation.json](cancellation.json) and [screenshot](cancelled.png).
- Network capture of the real runs contained only GET/HEAD asset/model reads; no POST requests or request bodies sent the audio. App/video/WASM were local, and model files were fetched from Hugging Face/CDN. See network JSON records in this directory.
- This is observation of the tested flow plus source inspection, not a third-party privacy audit. Hugging Face still receives ordinary download connection metadata.

## Regression and issues found

- **20 unit tests pass**: actual-vs-estimated word selection, timing gaps, manual-edit invalidation, validation, exports, line grouping, duration guard, silence/corrupt audio, null/zero alignment handling.
- **22 desktop/mobile browser tests pass**: generation states, language forwarding, cancellation and delayed-message safety, retry, preservation/undo, word editing, subtitle/JSON export, real local video playback/decode, missing audio, duration warning, light/dark accessibility, and responsive panels.
- These UI tests mock only the worker output for deterministic states. Their assertions are **not** the speech accuracy evidence above.
- First dev-mode worker import triggered a Vite dependency-optimization reload during an early test; no recognition result was recorded from that interrupted run. The dependency is now prebundled up front, and real recognition tests use the stable production preview.
- Under concurrent inference load, initial UI tests timed out and a loop test missed a brief playhead window. The loop assertion now observes the actual loop-seek event, the multi-scan accessibility test has an appropriate timeout, and the complete suite passed afterward. Do not run concurrent browser jobs when benchmarking inference time.
- No-audio video fails gracefully before a model download; a 61-second video disables generation with a friendly trim warning and keeps manual editing available.
- Native Safari/iOS inference, a representative accent/noise dataset, and human-ground-truth word-boundary error are not tested. The included short tests do not validate accuracy across the entire 60-second limit.

## Method and attribution

WER is word-level Levenshtein distance after Unicode NFC normalization, lowercasing, and removing punctuation/symbols. It counts substitutions, deletions, and insertions; Hindi orthographic variants still count. No output was manually corrected before scoring. Scripts and raw results are retained for reproduction.

- Synthetic voices: macOS `say` Samantha (English) and Lekha (Hindi). Reference text, settings and lengths: [fixture manifest](../../e2e/fixtures/speech/manifest.json).
- Native Hindi: **FLEURS — Google; Conneau et al., 2022**, [dataset](https://huggingface.co/datasets/google/fleurs), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Original audio was muxed to AAC plus a still image; spoken content was not edited. [Native fixture manifest](../../e2e/fixtures/speech/native-manifest.json).
- Background image: [Unsplash mountain photograph](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b).

**Conclusion:** real, private browser-local generation and model word timing are working. English passed the short reference test; Hindi script generation works but measured text accuracy is weak and requires substantial human correction. Review captions and synchronization before sharing.
