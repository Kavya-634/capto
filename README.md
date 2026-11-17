# Capto

**Good videos. Great captions.** A browser-local caption studio for English, Hindi and Hinglish video. Speech recognition, caption styling, word-level editing and the final burned-in MP4 all happen on your device.

**Live:** https://capto-captions.vercel.app · **Source:** https://github.com/Kavya-634/capto

## At a glance

|                 |                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Recognition** | Whisper in-browser (WASM). Two tiers: **Fast** (small, ~250 MB) and **Accurate** (large‑v3‑turbo, ~1.1 GB). English, Hindi (Devanagari) and **Hinglish** (Hindi speech in casual Roman letters — not translation). Up to 5 minutes per clip.                       |
| **Timing**      | Model-aligned word timestamps drive karaoke / one-word / typewriter effects. Edit a word's text without touching its time; split or merge lines; a **sync slider** shifts everything ±2 s.                                                                         |
| **Styling**     | 6 presets, 16 animations, 15 fonts (6 with native Devanagari), full colour controls incl. screen dropper, and **saved presets** stored on your device.                                                                                                             |
| **Exports**     | **Burned-in MP4** (WebCodecs; audio copied bit-for-bit, resolution/aspect preserved, video re-encoded at matched bitrate), **SRT**, **VTT**, and word-timing **JSON**. All honour the sync slider.                                                                 |
| **Privacy**     | Video and audio never leave the browser. Model weights download from Hugging Face on first use. The only optional network feature is **Improve with AI**, which sends caption _text_ (never media) to OpenAI via your own server key, after explicit confirmation. |

### Measured, not promised

The numbers below come from real runs on an 8 GB Apple M1 in Chrome 157 with the **Accurate** tier, reported exactly:

| Clip                                | Orientation             | WER                    | Export                      |
| ----------------------------------- | ----------------------- | ---------------------- | --------------------------- |
| English, 6.3 s synthetic            | 320×568 portrait        | **0%** (16/16)         | 1.3 s, audio hash identical |
| Hindi, 8.3 s synthetic              | 320×568 portrait        | **33%** (6 edits / 18) | 0.8 s, audio hash identical |
| Hinglish, 6.2 s synthetic mixed     | **1920×1080 landscape** | **0%** (13/13)         | 1.4 s, audio hash identical |
| Hindi, native FLEURS speaker, 9.1 s | —                       | **42%** (10 / 24)      | —                           |

English and code-switched Hinglish on clear synthetic speech were perfect; **Hindi is still a draft** that needs review, and native-speaker Hindi more so. These are short synthetic clips on one machine, not a benchmark. Full raw results, transcripts and frame grabs: [docs/acceptance](docs/acceptance/), [docs/speech-tests](docs/speech-tests/), [docs/hinglish-tests](docs/hinglish-tests/), [docs/export-tests](docs/export-tests/).

### Known limitations

- **Not real-time.** Accurate tier runs ~8–25× slower than real time here; a one-minute clip can take ten minutes. Fast tier is ~1× but materially worse on Hindi. WebGPU is not used (not exposed in the test browser).
- **Hindi accuracy depends on the tier.** Fast (whisper-small) mishears Hindi aspirates — छ→ट्छ, ख→क — at roughly one word in three on clean speech; Accurate (large-v3-turbo) got the same sentences right. Hindi and Hinglish therefore default to Accurate. Even there, names and English loanwords are spelled by ear (स्टूडियो → स्तूदियो). Review every line. Repetition loops are detected and refused rather than shown.
- **Hinglish is romanisation, not understanding.** It converts whatever Devanagari the recogniser produced; it cannot fix a misheard word. If the Hinglish looks wrong, switch to the हिन्दी view — if the Hindi is wrong too, the model misheard; if the Hindi is right, it's a spelling-rule gap in the romaniser (please report the word).
- **English phrases inside Hindi speech are often dropped.** The recogniser is told the audio is Hindi (`<|hi|>`); a whole English clause like "bro the lighting was crazy" can vanish. Letting Whisper auto-detect the language per window was tested and is worse — it labelled the whole mixed clip as English and the Hindi check refused it. No Whisper size fixes intra-sentence code-switching in the browser; add such phrases by hand.
- **Video export re-encodes the picture.** Burning text into pixels makes this unavoidable; bitrate is matched (1.1× source), audio is untouched. Chrome/Edge only (WebCodecs). Firefox/Safari get subtitle exports.
- **Browser memory** bounds everything: 5-minute clip cap, 250 MB upload cap, export built in memory.
- Not tested: 4K, HEVC/VP9/AV1 sources, rotated-metadata phone footage, native iOS Safari.

## Run

Requires Node.js 22.12+ and npm.

```sh
cd capto
npm install
npm run dev
```

Open **http://127.0.0.1:4200**. `npm run build` produces a static `dist/` site. No key or backend is needed for speech recognition, Hinglish, local English translation, editing, styles or export. Optional AI correction needs the server described below. The production deployment is at https://capto-captions.vercel.app (see **Deployment**).

**Recommended:** a recent desktop Chrome/Edge browser with several GB of available RAM. Use a 10–15-second clip for your first try, especially on a phone. The default **Fast** model downloads about **250 MB** on first use; the optional **Accurate** model downloads about **1.1 GB**. Both come on top of the locally hosted WASM runtime (~22 MB). Inference can take minutes, and the Accurate model is several times slower than real time on this class of hardware. Keep the tab open.

## Generate captions

1. Upload a video (MP4, MOV, or WebM; up to 250 MB), or open the included English/Hindi speech demo.
2. Open **Captions** on mobile. Select **English**, **Hindi → हिन्दी**, or **Hinglish → Hindi in English letters**. Hinglish uses the same Hindi recognizer, not English recognition or translation.
   Then choose **Recognition quality**. **Fast · Whisper small** is the default. **Accurate · Whisper large‑v3‑turbo** is markedly better on Hindi, Hinglish and English loanwords (see measurements below) but is ~1.1 GB and several times slower; the app asks for confirmation before using it and warns when the device reports less than ~8 GB of memory. Your choice is remembered in this browser.
3. Click **Generate Captions**. The stages are **Preparing audio**, **Loading speech model**, **Listening**, and **Writing captions**. Model download progress is measured in bytes. During **Listening**, the bar reports how much of the clip has been heard (counted from completed 20-second windows) plus the running token count; it is capped at 99% until the final merge finishes.
4. Use **Cancel generation** whenever needed. Existing captions are not replaced until a complete, valid result arrives. Regeneration asks for confirmation, and a successful replacement can be undone.
5. **Review every line and listen back.** Switch script with **हिन्दी / Hinglish / English**. Expand **Model-aligned word timings** to edit individual words or their start/end times; scissors split after a word, and **Merge with next line** joins lines. Undo/redo covers all these edits.
6. Pick a caption style and export **SRT**, **WebVTT**, or **Word timing JSON**.

The old prefilled sample captions are gone. The bundled demo videos contain synthesized English/Hindi speech; their captions are produced by the same real inference path as uploaded videos, not by a canned transcript. Native-speaker test audio is kept separately under `e2e/fixtures/speech/`.

### Duration limit

Generation is limited to **5 minutes (300 seconds)**. A longer video shows a friendly trim warning and disables generation; it can still be played and captioned manually. Both video metadata and decoded audio duration are checked. The app does **not** silently transcribe only the first five minutes. Clips longer than 90 seconds also show a notice before you start, because on-device captioning can take longer than the video itself.

The cap bounds decoded-audio memory (about 19 MB of 16 kHz mono float samples at five minutes), the number of 20-second windows (22 at the limit), token/alignment work, and accidental multi-hour browser jobs. It is not a guarantee that a five-minute clip will run quickly on every device; see the measured long-clip result below.

## On-device approach

- **Audio extraction:** the browser fetches the local object URL and uses `AudioContext.decodeAudioData` to decode/resample to **16 kHz**, then mixes channels to mono. This is not a microphone recording, real-time playback capture, server call, or FFmpeg service.
- **Model:** [`Xenova/whisper-small`](https://huggingface.co/Xenova/whisper-small), multilingual, q8 encoder and decoder, pinned to revision `2d67713f236afa48a18992566e7647f6ca848e13`. The two weight files total 249,105,759 bytes; tokenizer/config files add a little more.
- **Runtime:** Transformers.js **3.8.1** with ONNX Runtime Web/WASM inside a dedicated module **Web Worker**. The WASM module is bundled and served by this site. When the page is **cross-origin isolated** (the dev and preview servers send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`), the worker uses up to 4 WASM threads; without those headers it falls back to a single thread, so generation still works but long clips take longer. A static host must send the same two headers to get the threaded path. This version deliberately does not depend on WebGPU.
- **Recognition:** explicit `language: 'english' | 'hindi'`, `task: 'transcribe'`, deterministic decoding, `return_timestamps: 'word'`, 20-second windows with 3-second overlapping strides. **Hinglish requests map to Hindi recognition.** A separate local romanisation layer creates Hinglish after recognition, without changing word intervals. Hindi results select Noto Sans Devanagari; Hinglish uses a Latin face.
- **Word alignment:** Whisper cross-attention alignment and the model’s configured alignment heads estimate individual word intervals. These are not evenly divided caption durations. Standalone punctuation attaches to its preceding word. Imperfect _individual_ word intervals are repaired rather than failing the whole job: a zero-length or overlapping word gets a minimal 50 ms slot after the previous word, a missing start is taken from the previous word, a missing end becomes start + 50 ms, and a timed unit containing a space (a word glued to a punctuation token) is kept as one highlight. Every repair is counted and shown in the result panel so you know which lines to check; the word-timing JSON export records the repaired interval as-is. Timing is never spread evenly across a caption. Earlier builds aborted with “Word alignment was incomplete” or “Some words have missing or zero-length timing” in these cases — those were app bugs, not problems with the video.
- **Line splitting:** original word order and intervals are preserved. Lines target **3–6 words** (maximum six), favor punctuation and pauses, and rebalance short trailing lines where possible. Very short utterances and long pauses can legitimately produce fewer than three words.
- **Playback:** karaoke highlights the active timed word; one-word-at-a-time uses the same interval and shows no word during gaps. The video playhead is sampled each animation frame rather than relying only on slower `timeupdate` events.
- **Cancellation:** the main thread aborts audio preparation and terminates the worker, including active inference/download work. Job IDs and unmount cleanup prevent stale results from applying after cancel, a new file, or navigation. Native `decodeAudioData` itself has no abort API; closing its AudioContext and ignoring its eventual result cannot guarantee immediate release of the browser’s decoder memory.
- **Cache:** the browser Cache API can retain completed model downloads. A loaded worker reuses the model for subsequent generations in that project. Cancellation/new projects discard the in-memory model; persistent browser cache may avoid another download. Storage quotas, private mode, eviction, or a new origin can require downloading again.

The pinned Transformers.js dependency brings a Node-only image library (`sharp`) that is unused by this browser speech path. A scoped override installs its patched `^0.35.5` release. The production browser worker does not use a Node runtime or image-decoding service.

## Hinglish, script switching, and word editing

**Hinglish means Hindi written in casual Roman letters, not translated English.** For example `आज हम सीखेंगे बहुत मस्त चीज़।` becomes `aaj hum seekhenge bahut mast cheez.`. Recognition still uses Hindi. `src/language/romanize.ts` converts each returned timed word independently using a familiar-spelling lexicon, English-loan dictionary, and a conservative Devanagari phonetic fallback. Existing Latin words/case/numbers are kept; supported English loans such as `वीडियो → video`, `क्लिप → clip`, `सेव → save` recover ordinary spelling. This is not a trained context-aware transliteration model: unknown names, unusual spellings, schwa deletion, loan ambiguity (`सेव` could also be a Hindi food word), and malformed recognition still need human review.

- **Hindi ⇄ Hinglish** is instant and entirely local. Both forms live on the same word record; original start/end values are not recalculated. Preview, timeline, word editor, and exports use the selected view.
- **English** means an English transcript for English speech, or an explicitly labelled **English translation** for Hindi speech. It is never a disguised name for Hinglish. Choose **Create English translation locally** once: only caption text goes to a separate in-browser `Xenova/opus-mt-hi-en` worker (pinned revision `99853100ed9d932987a6816e8cf7b1b6742a6116`, q8, ~109 MB weights on first use). It does not read the video/audio. After that, English switching uses cached text immediately and works without an API key.
- Translation preserves **line times**, not Hindi word alignment: English syntax and word counts differ. English translations therefore have no falsely assigned model word timings; original words remain available in Hindi/Hinglish and in JSON. Word-animation fallbacks on translation use the line duration, not speech alignment. Line translation quality can be poor on fragmented or misrecognized input. Source spelling/structure changes invalidate cached translations; generating them again still processes text only.
- Expand a line’s **word timings** to edit spelling without changing the interval. Roman spelling edits stay in the Hinglish view; Hindi edits update its corresponding automatic Roman form. One timed unit may contain several text fragments if the recognizer grouped them; no fake subword audio timestamps are invented.
- Use **scissors after a word** to split a line exactly there, or **Merge with next line** to combine adjacent, non-overlapping lines. Original word intervals, forms and order survive. Merging overlapping/out-of-order lines is refused with a useful message. Translation text is invalidated by restructuring, so restructure in Hindi/Hinglish first. Undo/redo restores the entire caption record.
- SRT/VTT export the selected display format and line times. Word JSON preserves script forms and original interval data (and `originalWords` for an English translation). These remain subtitle-data exports, not a burned-in video.

### Three real Hinglish tests

Three different synthetic mixed Hindi/English speeches were run through the production browser model: creator tutorial (6.70 s), office meeting (6.16 s), and weekend plans (6.16 s). All returned word intervals survived Hindi/Hinglish toggling exactly. End-to-end Roman-reference errors were **5/13**, **11/13**, and **5/11** respectively; most come from poor code-switched recognition, not from translating Hindi to English. Specific examples include `captions save → क्याप्षन्सेव → kyaapshansev`, omitted `team meeting`, and `weekend → वीक अद → veek ad`. The full uncorrected outputs, category-by-category errors, screenshots and methodology are in [the Hinglish test report](docs/hinglish-tests/REPORT.md). Do not treat these fixtures as a representative accuracy benchmark.

## Optional AI

**Everything above works without an API key.** Improve with AI is disabled with a setup note when the API server is absent or no key is configured. It only proposes spelling/mixed-language corrections; it does not retranscribe media or generate Hindi-to-English translations.

1. Copy [.env.example](.env.example) to `.env.local` locally. Keep it out of Git. Set `OPENAI_API_KEY` to your own provider key; never paste it into a browser field or a `VITE_` variable.
2. Optionally change `CAPTO_AI_MODEL` (default `gpt-4o-mini`), `CAPTO_API_PORT` (4202), or `CAPTO_APP_ORIGINS` (the exact frontend origins, comma-separated).
3. Run the API and frontend in separate terminals:

   ```sh
   npm run dev:api   # Node 22 reads the gitignored .env.local; no key is printed
   npm run dev      # Vite proxies /api/ai to 127.0.0.1:4202
   ```

4. Refresh the editor after configuring the key. Click **Improve with AI** and confirm the text-only disclosure. Read the before/after proposals, then **Apply suggestions** or **Discard**. Changes are one undoable operation; every original word timestamp stays exactly the same. No auto-apply occurs.

Only ordered `{id,text}` entries for the displayed view (up to 1,500 timed units) and a view flag are sent. The server uses OpenAI Chat Completions JSON mode, validates the ID/order/count mapping, rejects incompatible output, and never accepts provider timestamps. Prompt instructions forbid translating Hindi when the requested view is Hinglish; this does not make AI infallible. Suggestions can still misunderstand names or meaning: review them. Fully translated English lines must be edited manually; switch to Hindi/Hinglish to use AI on the timed source units.

The key exists only in the server environment; browser code, logs, response errors and status payloads never include it. Safeguards include exact Origin checks, an anti-CSRF token, a 256 KB JSON limit, 1,500-word schema bound, 6 requests/minute per socket IP, at most two concurrent provider requests, 90-second timeout, cancellation, and redacted provider errors. The local server binds to **loopback by default** and does not retain transcript bodies. These checks are not user authentication: **before enabling the key on a public deployment, add authenticated access and a durable per-user budget**, since anyone who can reach the site could otherwise spend against your key.

### Deployment (Vercel)

The site is a static Vite build plus one optional serverless function at `api/ai/[action].mjs` that wraps the same handler as the local server. [vercel.json](vercel.json) sets the **COOP/COEP headers** required for multi-threaded WASM, long-cache headers for hashed assets, and SPA rewrites.

- **No environment variables are required.** Deployed as-is, every local feature works and Improve with AI shows "not configured".
- To enable AI on a deployment, set `OPENAI_API_KEY` in the Vercel project's environment (Production and/or Preview), and optionally `CAPTO_CSRF_SECRET` (any long random string; if omitted the key itself seeds the CSRF token). `CAPTO_APP_ORIGINS` is auto-derived from the deployment URL; set it explicitly if you serve from a custom domain. Redeploy after changing variables.
- The function has `maxDuration: 60` to cover slow provider responses. Rate limiting is per-instance and therefore softer on serverless than locally — another reason not to enable the key without auth.
- Model weights are **not** served by Vercel; browsers fetch them from Hugging Face (which sends `Access-Control-Allow-Origin` for the deployment origin, as required under `require-corp`).

No real key was supplied in this workspace or on the deployment, so live AI correction quality is **not verified**. Server tests use a mock provider to verify requests, consent, ID/count validation and key handling; browser tests mock the endpoint for preview/apply/undo. Local ASR and local English translation were tested with real models. Provider reference: [Chat Completions API](https://developers.openai.com/api/reference/resources/chat), [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini).

## Privacy

**Uploaded video, decoded audio and timestamps are never sent to a transcription service.** There is no Web Speech API, cloud ASR fallback, analytics, login, or microphone access. Local Hinglish and English translation also stay in-browser. **Exception: Improve with AI sends the displayed caption text and temporary word IDs to OpenAI through your server, only after an explicit confirmation.** It never sends audio/video/timestamps, and never applies suggestions without review. Provider retention/data policies apply to this optional text request.

An internet connection is needed for the first model download from Hugging Face and its file CDN. Those hosts receive normal download requests (including connection metadata such as IP address); they do not receive your audio. App code, fonts, demo media, and WASM are served by the app host. After model files are cached, inference does not need a speech API, but this is not a fully installable/offline-cached PWA.

Edits remain in tab memory, not a database. Theme preference is saved in localStorage. Export your captions before leaving. The app requests confirmation before replacing/leaving work and uses the browser’s unsaved-work warning on reload/close.

## Accuracy, Hindi expectations, and review

**Automatic captions are a draft, not a verified transcript. Always review before publishing.**

- Whisper-small is a compromise between browser memory/download cost and recognition quality. Hindi is **experimental/draft quality**: both the synthetic and native-speaker test clips needed substantial corrections. Devanagari output alone does not imply correct spelling or meaning. This implementation does not claim publish-ready or generally accurate Hindi recognition.
- Hindi mistakes can include matras/nukta marks, names, inflections, word boundaries, similar consonants, and missing/extra words. Regional accents, fast or quiet speech, synthetic voices, background music, multiple speakers, and code-switching can worsen results. Hinglish romanisation cannot recover words the recognizer omitted or misheard. English words already in Latin script keep their spelling/case; common Devanagari loans (वीडियो, अपलोड, क्लिप, कॉफी) restore ordinary English spelling. Unknown/misheard loans still require editing.
- Noise/music can produce hallucinated words. Empty and near-silent audio are rejected before model loading, but this is a simple RMS guard, **not** a full voice-activity detector or hallucination-proof filter.
- Word boundaries are **model estimates**, not human-certified or forced-aligned ground truth. The tests check ordered, positive, bounded intervals and interval-driven playback; they do not establish millisecond-level accuracy against independently annotated words. Short function words, pauses, overlapping voices, and chunk boundaries need particular attention.
- Individual spelling edits and same-word-count line rewrites **preserve original intervals**. Changing the number of words in free-text line editing estimates new intervals and labels them **Estimated word timings**. Use word-level edit or split/merge to keep the original alignment exactly. Line-level text commits on blur; word edits are immediate. Changing line bounds invalidates word alignment; Undo restores it. Export is blocked for empty/invalid/overlapping word intervals.
- Native container/codec support varies. MP4 with AAC audio and WebM with Opus are the safest choices; MOV support depends on its codec. A playable video can still lack a decodable audio track. Unusual audio-track offsets/edit lists may require manual synchronization. There is no demux/transcode fallback for unsupported codecs.
- Mobile memory pressure, background-tab throttling, and thermal limits can make jobs slow or stop the worker. Recent desktop Chrome/Edge is recommended for generation. Responsive UI is tested with mobile Chromium emulation; native Safari/iOS inference has not been verified.

## Real speech test results

Actual production-build WASM inference was run on short English and Hindi clips; it was **not mocked**. Raw transcripts, word intervals, screenshots, reference text, and network-request records are in [docs/speech-tests/](docs/speech-tests/). See the [test report](docs/speech-tests/REPORT.md) for the full results and issues.

Real inference checks with the shipped q8 model:

| Clip                                                   | Reference | Recognition result                      | Lines                    | End-to-end time                                                       |
| ------------------------------------------------------ | --------- | --------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| English, macOS Samantha, 6.34 s                        | 16 words  | 0 word edits; 0% normalized WER         | 6 / 5 / 5 words          | 242.2 s including the cold model download                             |
| Hindi, macOS Lekha, 8.33 s                             | 18 words  | 8 word edits; **44.4% normalized WER**  | 6 / 6 / 4 / 3 words      | 233.0 s with cached model files                                       |
| Hindi, native FLEURS speaker, 9.12 s                   | 24 words  | 14 word edits; **58.3% normalized WER** | 6 / 6 / 6 / 6 words      | 53.2 s with cached model files                                        |
| English, macOS Samantha, **4 min 51 s** (54 sentences) | 776 words | 35 word edits; **4.5% normalized WER**  | 148 lines, all 3–6 words | **242.0 s** with cached model files, 4 WASM threads (0.83× real time) |

English matched this one reference exactly; that is **not** a general 100%-accuracy claim. Hindi included errors such as `दोस्तों → डुस्तों`, `हम → फम`, `दुनिया → दुन्या`, and `पहुँचाइए → पहुट चाये`. All three tests produced the requested script and valid, ordered word intervals. The synthetic Hindi runtime overlapped other browser checks and should not be treated as an isolated benchmark. These three clips are not a representative accuracy study.

With the current anti-repetition decoding (`no_repeat_ngram_size: 3`, `repetition_penalty: 1.05`) the Hindi numbers moved to **38.9%** (synthetic) and **66.7%** (native); English stayed at 0%. On two short Hindi clips that spread is noise around a poor baseline, not an improvement or regression claim.

### Fast vs Accurate model

The accuracy problem on Hindi/Hinglish is the small model, not post-processing. The same five fixtures were rerun through the **Accurate** tier (`onnx-community/whisper-large-v3-turbo_timestamped`, q8, pinned revision `b3f77bf9…`), with the model already cached:

| Clip                               | Fast (whisper-small) WER | **Accurate (large-v3-turbo) WER** | Accurate time         |
| ---------------------------------- | ------------------------ | --------------------------------- | --------------------- |
| Hindi, synthetic Lekha, 8.3 s      | 38.9%                    | **33.3%** (6/18)                  | 73 s (8.8× real time) |
| Hindi, native FLEURS, 9.1 s        | 66.7%                    | **41.7%** (10/24)                 | 73 s (8.0×)           |
| Hinglish — creator tutorial, 6.7 s | 38.5%                    | **38.5%** (5/13)                  | 126 s                 |
| Hinglish — office meeting, 6.2 s   | 84.6%                    | **0.0%** (0/13)                   | 172 s                 |
| Hinglish — weekend plans, 6.2 s    | 45.5%                    | **18.2%** (2/11)                  | 95 s                  |

Where the small model dropped entire phrases (`कल हमारी team meeting है` vanished), the Accurate tier recovered them verbatim; it also produced `team meeting`, `project update`, `deadline` as English words instead of Devanagari approximations, and the remaining Hinglish errors are now mostly spelling-level (`editing → edeting`, `upload → aplod`, `lunch → laanch`). Native-speaker Hindi is still far from publishable at 41.7%, so review remains mandatory. These are five short synthetic/benchmark clips on one machine, not a general accuracy guarantee. Cold download of the Accurate model took ~95 s on this connection; first-use cost is real.

The elapsed times above include fixed per-run overhead and were measured on an 8 GB Apple M1 (8 cores) through the cross-origin-isolated preview server, so the worker used 4 WASM threads. The Accurate model is roughly 8–25× real time here; expect a one-minute clip to take ten-plus minutes on similar hardware. Without the isolation headers it falls back to a single thread and will be slower still. It is not real-time in a browser today.

### Pipeline audit (listening vs. conversion)

A user reported "Ye jo tum piche dekh rahe ho" rendering as "do doom peech dekhaayon". `scripts/diagnose-asr.mjs` instruments the real worker request and reply so each link can be checked, and writes the raw Devanagari **before** romanisation. Verified facts, read from the runtime rather than assumed:

- **Model:** Fast = `Xenova/whisper-small` (249 MB q8); Accurate = `onnx-community/whisper-large-v3-turbo_timestamped` (1.09 GB q8). Both multilingual; no `.en`, tiny or base model is used anywhere.
- **Prompt:** `language: 'hindi'` → `whisper_language_to_code` → `hi` → `<|hi|>` then `<|transcribe|>`. Hinglish is mapped to `hindi` before this point. No `translate` path exists.
- **Audio:** the request carried a `Float32Array` of 32,391 samples for a 2.025 s clip (= 16 kHz), mono, RMS 0.11. Windows are 20 s with 3 s overlap each side (Whisper's native maximum is 30 s; a 30 s / 5 s A/B produced byte-identical output on the music clip, so the shorter window costs nothing and was kept for its lower loop risk).

Raw Devanagari for that sentence, Accurate tier, with the model cached:

| Clip                           | Reference                                 | Fast raw Hindi                  | **Accurate raw Hindi**                       |
| ------------------------------ | ----------------------------------------- | ------------------------------- | -------------------------------------------- |
| Clean voice, 7 words           | ये जो तुम पीछे देख रहे हो                      | ये जो तुम **पीट्छे देक** रहे हो (2/7) | ये जो तुम पीछे देख रहे हो (**0/7**)               |
| Clean voice, 18 words          | …नया स्टूडियो है आज हम आपको…                 | 6/18 (33%)                      | **2/18 (11%)** — स्टूडियो→स्तूदियो, आपको→आको     |
| Same + music bed               | (same)                                    | 7/18 (39%)                      | **2/18 (11%)** — identical to clean          |
| Fast casual Hinglish, 21 words | …आया हूं **bro the lighting was crazy** बस… | 13/21 (62%)                     | 11/21 (52%) — the English clause was dropped |

**Conclusion: the listening was wrong, not the conversion.** The romaniser transliterated exactly what whisper-small heard; the aspirate confusions (छ→ट्छ, ख→क) are the small model's, and large-v3-turbo does not make them. That is why Hindi/Hinglish now default to Accurate. The music bed cost Accurate nothing. The remaining Hinglish failure is the embedded English clause, which the forced `<|hi|>` token suppresses; auto-detecting the language instead labelled the whole clip English and was rejected by the Devanagari check — strictly worse. Raw reports: [docs/diagnostics](docs/diagnostics/).

**Server-side option, if browser speed is unacceptable.** The same `onnx-community/whisper-large-v3-turbo` weights run on a modest GPU server at roughly real-time, versus 8–25× real-time in WASM here. The trade-off is that **your audio would leave your device** — the only thing Capto currently guarantees never happens. If that's acceptable for your use, the shape is: a small Node/Python service exposing `POST /api/asr` that accepts 16 kHz mono PCM, runs the same model with the same `<|hi|>`/`transcribe` prompt and word timestamps, and returns the identical `{words, intervals}` JSON the worker emits today — so the editor is unchanged and privacy becomes a per-request choice ("process on device" vs "process on server"), stated at the moment you click Generate. This is not built; it is a proposal.

### Repetition loops

Whisper-small can lock onto a single token and repeat it for an entire window — a user hit this on a Hindi clip, receiving 43 captions of the same word. Capto now detects a degenerate transcript (same word ≥10× in a row, one word ≥50% of the transcript, or ≥60% of words with unusable timing) and refuses it with an explanation instead of presenting it as a result. The n-gram block above makes the loop less likely to start. Neither change can make the model understand audio it cannot follow; on such clips the honest outcome is now an explicit error with a suggestion to trim to one clear speaker or caption manually.

### Five-minute clip

The 291-second English fixture exercises the full duration limit: 22 overlapping 20-second windows merged into one transcript. Recognized and reference word counts were identical (776), coverage ran to **290.82 s** of the 291.06 s clip, every line had 3–6 words, and no word interval overlapped its neighbour. 34 of the 35 "errors" are the model writing digits for spoken numbers (`five → 5`, `one two three → 1 2 3`), which the WER metric counts as substitutions; the only true misrecognition was `vlogs → blogs`. One word boundary was clipped at the clip end and flagged for review.

Progress reporting advanced in real steps as each window finished (16 samples from 5% to 95%, roughly one window every 11 s). The first attempt on this clip was slowed to **≈9.5 min** by a concurrent Playwright suite and a test-script probe bug unrelated to the transcription; the clean rerun above is the reported number. Both runs used the cross-origin-isolated preview server; on a host without those headers expect single-thread speed, which is materially slower for long clips.

A five-minute Hindi clip was **not** tested. Given the short-clip Hindi WER above, long Hindi output should be expected to need substantial correction.

An additional fp32-encoder/q8-decoder experiment roughly doubled the Hindi download (~510 MB) but did **not** reliably solve the accuracy issue: synthetic Hindi worsened to 50.0% WER, native Hindi changed to 54.2% WER and introduced a non-Devanagari character. That experiment was rejected; the shipped code retains the smaller q8 model for both languages. The raw comparison results remain in the test report. Real inference cancellation stopped the worker in **428 ms** in one run and preserved the existing manual caption.

WER uses Levenshtein distance on whitespace-separated words after Unicode NFC normalization, lowercasing, and removing punctuation/symbols. Orthographic variants still count as errors. The test fixtures do not provide independent per-word timing ground truth.

## Other editor features

- Six fully customizable presets: **Bold & Punchy**, **One word at a time**, **Karaoke**, **Clean & Minimal**, **Boxed**, and **Neon**.
- **16 animations** in two groups. _Line_ effects play once per caption: none, pop, fade, slide, zoom, blur, flip, bounce, shake, glitch. _Word-timed_ effects follow each word's interval: one word at a time, karaoke highlight, word by word, word pop, typewriter (letters appear across the word's interval), wave. Word-timed effects use model-aligned intervals for generated captions and an even split for manual or edited lines; the panel says which applies.
- **15 bundled fonts** grouped as Sans (DM Sans, Manrope, Inter, Nunito, Space Grotesk), Display (Bebas Neue), Serif (Playfair Display, Lora), Mono (JetBrains Mono) and Latin + Devanagari (Poppins, Baloo 2, Mukta, Noto Sans Devanagari, Hind, Tiro Devanagari Hindi). Latin-only faces fall back to a matching Devanagari face so Hinglish lines still render; the Latin + Devanagari group carries both scripts in one design. The sample under the picker renders in the chosen family.
- **Colour controls** for text, outline, background and highlight share one component: a native colour picker, an editable hex field (shorthand `#abc` expands; invalid input reverts), a 12-swatch palette with the four Capto brand colours flagged as primary, and a **screen dropper** using the browser `EyeDropper` API. The dropper button appears only where the API exists (Chromium-based browsers); Firefox and Safari show the other controls and no dead button.
- Live size, outline width, background toggle, position, bold, uppercase and neon glow controls.
- Editable captions; 40-step undo/redo; seeking, ±5 seconds, looping, mute, and fullscreen where supported.
- Responsive preview/captions/style tabs, light/dark themes, keyboard focus, labeled controls, and reduced motion. Space toggles playback; Left/Right seek five seconds when focus is outside form controls.
- **Saved style presets.** Save the current look under a name; it appears in **My presets** and is stored in this browser's `localStorage` (up to 24). Reapply with one click, delete with the bin icon. Presets are per-device and per-browser: they do not sync and are lost if site data is cleared.
- **Sync slider** in the timeline footer shifts every caption −2 s…+2 s in 50 ms steps (positive = later). It applies to the preview, the timeline track, and every export. Double-click the slider or press **reset** to return to zero. Lines or words pushed off the ends of the clip are clamped rather than dropped.

## Exports

**Export captions** opens one dialog with four options:

- **Video with captions (.MP4)** — draws the captions into the frames so they play anywhere, with the same font, size, colour, outline, background, position and animation as the preview, including Hindi and Hinglish text and karaoke/word-timed effects. See the next section for what "preserve quality" does and does not mean.
- **SubRip (.SRT)** and **WebVTT (.VTT)** — line text and timing only, UTF-8, Devanagari preserved.
- **Word timing data (.JSON)** — per-word intervals, script forms and timing source.

All four honour the sync slider. Exports use whichever caption script (Hindi / Hinglish / English) is currently selected.

### How the video export works, and its limits

Everything runs in the browser using **WebCodecs** (`VideoDecoder`/`VideoEncoder`) through the [mediabunny](https://mediabunny.dev) muxer. No upload, no server, no FFmpeg.

- **Audio is copied bit-for-bit.** The original encoded audio packets are passed through untouched; the test below confirms the decoded PCM of source and export hash identically.
- **Resolution, aspect ratio, rotation metadata and frame timing are preserved.** The canvas is created at the source's display dimensions and each frame is drawn 1:1.
- **Video is necessarily re-encoded.** Burning text into pixels means the frames must be decoded, drawn on, and encoded again — there is no way to add pixels to an H.264 stream without re-encoding it. To keep the loss small, Capto measures the source bitrate and encodes at **1.1× that**, clamped to 1.5–40 Mbps. For typical phone/social footage this is visually indistinguishable; for a heavily compressed source it can only be as good as the source. "Original quality" here means _matched bitrate_, not lossless.
- **Codec is kept where the browser can encode it.** H.264 sources stay H.264 in MP4. If the browser can't encode the source codec (e.g. HEVC on many machines), Capto falls back to the next encodable one and says so in the plan before you start. VP9/AV1 fall back to WebM.
- **The output is built in memory**, so very long or very high-bitrate exports can exhaust tab memory; the 5-minute generation limit is a soft guard here too.
- **Browser support:** Chrome/Edge desktop. WebCodecs is not exposed in Firefox or Safari; the dialog says so and points to the subtitle exports.
- **Progress and ETA** are computed from frames actually encoded; the ETA appears after 5% so it isn't wild on the first frames. Cancel aborts the encoder and discards partial output.

#### Measured

Two real end-to-end runs (`scripts/test-export.mjs`, Chrome 157, 8 GB M1), each with two captions (Devanagari + Hinglish, karaoke style, Poppins) and a +0.5 s sync offset:

| Check             | 320×568 Hindi demo, 8.3 s                                            | **1080×1920 portrait, 30 s, 8 Mbps**          |
| ----------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Output dimensions | 320×568 (unchanged)                                                  | 1080×1920 (unchanged)                         |
| Video codec       | H.264 → H.264 / MP4                                                  | H.264 → H.264 / MP4                           |
| Bitrate           | 126 kbps → 407 kbps (clamped to 1.5 Mbps floor)                      | 8.11 Mbps → 9.13 Mbps (1.1× source)           |
| Audio             | AAC copied; decoded PCM SHA-256 **identical**                        | AAC copied; decoded PCM SHA-256 **identical** |
| Duration          | 8.33 s → 8.33 s                                                      | 30.00 s → 30.00 s                             |
| Encode time       | 100 frames in 1–2 s                                                  | **900 frames in 5.6 s (≈5× real time)**       |
| Output size       | 0.4 MB                                                               | 34.2 MB                                       |
| Sync in SRT/VTT   | `00:00:00,800` (0.3 + 0.5)                                           | same                                          |
| Sync in video     | Devanagari at t=2.0 s, Hinglish at t=6.0 s, nothing in the 3.9 s gap | same                                          |

Frame grabs are in [docs/export-tests](docs/export-tests/). The ETA shown in the dialog tracked the real finish within about a second on the 30 s run. One rendering bug was caught and fixed by this test: the karaoke highlight pill was sized from Latin glyph metrics and clipped Devanagari matras; it now uses the font's full ascent/descent.

**Not verified:** exports near the 5-minute limit, 4K sources, HEVC/VP9/AV1 sources, variable-frame-rate sources, rotated phone footage (mediabunny applies the rotation matrix; the caption is drawn on the rotated display frame, but this has not been exercised with a real rotated file), or exactness of every animation's easing curve versus CSS (entry animations are reimplemented in canvas and match within a frame or two).

## Verification and reproduction

```sh
npm test                  # pure timing, grouping, audio, duration and export tests
npm run build             # strict TypeScript + worker/production bundle
npm run test:e2e           # deterministic desktop/mobile UI tests
npm run format:check
npm audit
```

Install a test browser with `npx playwright install chromium`, or use:

```sh
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:e2e
```

The normal browser suite uses a **mock worker only for deterministic generation UI/edge cases**; real audio decoding, file upload, and video playback still run. It verifies cancellation/late-result protection, regeneration/undo, word timing edits, JSON/SRT exports, errors, the duration cap, Hindi language forwarding, accessibility, and responsive panels. Do not use these mocks as recognition-accuracy evidence.

For actual inference, build first and serve a **stable production preview** so Vite’s first-time dependency optimization/HMR cannot reload the project mid-job:

```sh
npm run build
npm run preview -- --port 4201
# In another terminal; these download/run the real model and may take several minutes:
CAPTO_URL=http://127.0.0.1:4201 node scripts/test-real-speech.mjs
CAPTO_URL=http://127.0.0.1:4201 node scripts/test-real-cancel.mjs
CAPTO_URL=http://127.0.0.1:4201 \
  CAPTO_SPEECH_FIXTURE=e2e/fixtures/speech/native-manifest.json \
  node scripts/test-real-speech.mjs
```

The real-test scripts accept `CHROME_PATH` and use a separate persistent test profile at `/private/tmp/capto-asr-browser-cache` on this macOS workspace. Run them sequentially, without concurrent UI tests when measuring performance. `scripts/create-speech-fixtures.py --ffmpeg /path/to/ffmpeg` recreates the synthetic clips with macOS `say`. `scripts/fetch-native-hindi.py --ffmpeg /path/to/ffmpeg` streams one licensed native-speaker recording from FLEURS and muxes it into a test MP4; neither Python, `say`, nor FFmpeg is part of the web app’s processing path.

`node scripts/capture.mjs` refreshes homepage/empty-studio screenshots. Actual generated-caption screenshots come from the real-test script. `node scripts/audit.mjs` checks themes and viewport widths.

## Source map

| File                              | Purpose                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| `src/SpeechPanel.tsx`             | Language selection, generation, real progress, cancel, warnings          |
| `src/speech/useTranscription.ts`  | Job lifecycle, stale-result guards, cancellation, worker ownership       |
| `src/speech/audio.ts`             | Local decode, 16 kHz mono audio, silence and duration guards             |
| `src/speech/transcribe.worker.ts` | Pinned multilingual model, WASM inference and alignment                  |
| `src/speech/alignment.ts`         | Word-boundary validation and readable line splitting                     |
| `src/WordTimings.tsx`             | Review/edit individual word intervals                                    |
| `src/captions.ts`                 | Timing selection, manual-edit invalidation, presets, validation, exports |
| `src/Editor.tsx`                  | Player, editable captions/history, timeline, mobile panels               |
| `src/CaptionOverlay.tsx`          | Word-aligned animation and mixed-script rendering                        |
| `src/App.tsx`                     | Local upload lifecycle, theme/language state, header, export modal       |

## Sources and asset attribution

- [Transformers.js ASR documentation](https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.AutomaticSpeechRecognitionPipeline) and [Whisper model documentation](https://huggingface.co/docs/transformers/model_doc/whisper).
- [Pinned Whisper-small alignment configuration](https://huggingface.co/Xenova/whisper-small/blob/2d67713f236afa48a18992566e7647f6ca848e13/generation_config.json).
- Native-speaker Hindi test audio: **FLEURS — Google; Conneau et al., 2022**, [google/fleurs](https://huggingface.co/datasets/google/fleurs), **CC BY 4.0**. The fixture manifest identifies the original recording. Audio is muxed to AAC with a still image for the test; the spoken content is unchanged. [License](https://creativecommons.org/licenses/by/4.0/).
- Demo backgrounds are local copies from Unsplash: [mountains](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b), [outdoor landscape](https://images.unsplash.com/photo-1500534623283-312aade485b7), [ocean](https://images.unsplash.com/photo-1518837695005-2083093ee35b).
- The no-audio test fixture is [MDN’s CC0 flower video](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4). Icons are from Lucide. Font licenses are included in their Fontsource packages.
