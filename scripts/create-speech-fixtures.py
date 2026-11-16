"""Reproducible synthetic speech fixtures. Requires macOS say and an ffmpeg binary."""
import argparse
import json
from pathlib import Path
import subprocess
import wave

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
fixtures = root / 'e2e/fixtures/speech'
demos = root / 'public/demos'
fixtures.mkdir(parents=True, exist_ok=True)
demos.mkdir(parents=True, exist_ok=True)
cases = [
    ('english', 'Samantha', 145, 'Hello everyone. Today we are making short videos with clear captions. Every word tells a story.'),
    ('hindi', 'Lekha', 130, 'नमस्ते दोस्तों। आज हम छोटे वीडियो बनाना सीखेंगे। साफ आवाज़ में बोलिए और अपनी कहानी दुनिया तक पहुँचाइए।'),
]
manifest = []
for language, voice, rate, text in cases:
    audio = fixtures / f'{language}.wav'
    subprocess.run(['say', '-v', voice, '-r', str(rate), '-o', str(audio), '--data-format=LEI16@16000', text], check=True)
    with wave.open(str(audio)) as wav:
        duration = wav.getnframes() / wav.getframerate()
    video = demos / f'{language}.mp4'
    subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '12', '-i', str(root / 'public/images/mountains.jpg'), '-i', str(audio), '-vf', 'scale=320:568:force_original_aspect_ratio=increase,crop=320:568', '-t', str(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(video)], check=True)
    manifest.append({'language': language, 'reference': text, 'voice': voice, 'rate': rate, 'duration': duration, 'video': f'public/demos/{language}.mp4', 'source': 'Synthetic macOS speech; not a native-speaker accuracy benchmark'})
subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=1', '-t', '301', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(fixtures / 'over-limit.mp4')], check=True)

# Five-minute English fixture: varied sentences so repetition does not mask chunk-merge errors.
long_sentences = [
    'Welcome back to the studio, and thanks for joining this longer recording.',
    'Today we are testing how captions hold up across a full five minute video.',
    'Each sentence is a little different, so merged windows can be checked for dropped or repeated words.',
    'Creators often record tutorials, vlogs, and product reviews that run well past one minute.',
    'Good captions make those videos easier to follow with the sound off.',
    'They also help viewers who speak a second language or watch in a noisy place.',
    'Let us talk about lighting, framing, pacing, and the small details that keep people watching.',
    'A clean background and a steady camera go a long way toward a professional look.',
    'Short pauses between ideas give the audience a moment to breathe.',
    'Now we will count a few numbers for timing checks: one, two, three, four, five, six, seven.',
    'Remember to review every caption before you publish, because automatic text can still make mistakes.',
    'That is the end of this section, so let us move on to the next idea.',
]
long_audio = fixtures / 'english-long.wav'


def synthesize(sentences):
    subprocess.run(['say', '-v', 'Samantha', '-r', '150', '-o', str(long_audio), '--data-format=LEI16@16000', ' '.join(sentences)], check=True)
    with wave.open(str(long_audio)) as wav:
        return wav.getnframes() / wav.getframerate()


# Grow the script sentence by sentence until the speech is just under five minutes, so the
# reference transcript matches the audio exactly and nothing is cut mid-sentence.
spoken = []
long_duration = 0.0
for index in range(200):
    candidate = spoken + [long_sentences[index % len(long_sentences)]]
    candidate_duration = synthesize(candidate)
    if candidate_duration > 297:
        long_duration = synthesize(spoken)
        break
    spoken = candidate
    long_duration = candidate_duration
assert 240 < long_duration <= 300, long_duration
long_text = ' '.join(spoken)
target = long_duration
long_video = fixtures / 'english-long.mp4'
subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '6', '-i', str(root / 'public/images/mountains.jpg'), '-i', str(long_audio), '-vf', 'scale=320:568:force_original_aspect_ratio=increase,crop=320:568', '-t', str(target), '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', str(long_video)], check=True)
(fixtures / 'long-manifest.json').write_text(json.dumps([{
    'language': 'english', 'reportName': 'english-long', 'reference': long_text, 'sentences': len(spoken),
    'voice': 'Samantha', 'rate': 150, 'duration': target, 'fullSpeechDuration': long_duration, 'video': 'e2e/fixtures/speech/english-long.mp4',
    'source': 'Synthetic macOS speech; long-form timing and chunk-merge test, not a native-speaker benchmark',
}], ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'longDuration': long_duration, 'trimmedTo': target}, indent=2))
(fixtures / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(manifest, ensure_ascii=False, indent=2))