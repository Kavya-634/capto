import { AUDIO_SAMPLE_RATE, MAX_TRANSCRIPTION_LABEL, MAX_TRANSCRIPTION_SECONDS } from './config';

export function checkAudio(samples: Float32Array) {
  if (!samples.length)
    throw new Error('There’s no audio to listen to. Try a video with a clear speaking voice.');
  let sum = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample))
      throw new Error('The audio could not be decoded. Please try an MP4 with AAC audio.');
    sum += sample * sample;
  }
  if (Math.sqrt(sum / samples.length) < 0.0001) {
    throw new Error(
      'This video seems silent or extremely quiet. Try a clip with audible speech, or add captions manually.',
    );
  }
}

/** Native, local decode/resample. No microphone, media upload, or remote decoder. */
export async function decodeVideoAudio(url: string, signal: AbortSignal): Promise<Float32Array> {
  signal.throwIfAborted();
  if (!window.AudioContext)
    throw new Error(
      'Local audio decoding isn’t available in this browser. Try a recent Chrome or Edge browser.',
    );
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('We couldn’t read this video. Please choose the file again.');
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const context = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
  const close = () => {
    if (context.state !== 'closed') void context.close().catch(() => {});
  };
  signal.addEventListener('abort', close, { once: true });
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(bytes);
    } catch {
      signal.throwIfAborted();
      throw new Error(
        'We couldn’t read an audio track from this file. Try an MP4 with AAC audio or a WebM with Opus, and check that it contains speech.',
      );
    }
    signal.throwIfAborted();
    if (decoded.duration > MAX_TRANSCRIPTION_SECONDS + 0.1) {
      throw new Error(
        `The audio track is longer than ${MAX_TRANSCRIPTION_LABEL}. Trim the video and audio together, then try again.`,
      );
    }
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    signal.throwIfAborted();
    checkAudio(mono);
    return mono;
  } finally {
    signal.removeEventListener('abort', close);
    close();
  }
}
