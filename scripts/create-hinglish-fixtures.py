"""Three mixed-language speech fixtures. macOS say + ffmpeg are test tools, not app dependencies."""
import argparse, json, subprocess, wave
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
out = root / 'e2e/fixtures/hinglish'
out.mkdir(parents=True, exist_ok=True)
cases = [
    ('creator', [('hi', 'आज हम'), ('en', 'video editing'), ('hi', 'सीखेंगे। पहले'), ('en', 'clip upload'), ('hi', 'करो और'), ('en', 'captions save'), ('hi', 'करो।')], 'aaj hum video editing seekhenge. pehle clip upload karo aur captions save karo.'),
    ('office', [('hi', 'कल हमारी'), ('en', 'team meeting'), ('hi', 'है।'), ('en', 'project update'), ('hi', 'भेजो और'), ('en', 'deadline'), ('hi', 'ध्यान में रखो।')], 'kal hamari team meeting hai. project update bhejo aur deadline dhyan mein rakho.'),
    ('weekend', [('hi', 'दोस्तों'), ('en', 'weekend'), ('hi', 'पर'), ('en', 'coffee'), ('hi', 'और'), ('en', 'lunch'), ('hi', 'के बाद'), ('en', 'Instagram reel'), ('hi', 'बनाएंगे।')], 'doston weekend par coffee aur lunch ke baad Instagram reel banayenge.'),
]
manifest = []
for name, segments, reference in cases:
    pcm = bytearray()
    for i, (language, text) in enumerate(segments):
        chunk = out / f'{name}-segment-{i}.wav'
        subprocess.run(['say', '-v', 'Lekha' if language == 'hi' else 'Rishi', '-r', '135', '-o', str(chunk), '--data-format=LEI16@16000', text], check=True)
        with wave.open(str(chunk)) as w:
            assert w.getnchannels() == 1 and w.getsampwidth() == 2 and w.getframerate() == 16000
            pcm.extend(w.readframes(w.getnframes()))
        pcm.extend(bytes(16000 * 2 // 20))
        chunk.unlink()
    audio = out / f'{name}.wav'
    with wave.open(str(audio), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(pcm)
    duration = len(pcm) / (16000 * 2)
    video = out / f'{name}.mp4'
    subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '12', '-i', str(root/'public/images/mountains.jpg'), '-i', str(audio), '-vf', 'scale=320:568:force_original_aspect_ratio=increase,crop=320:568', '-t', str(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(video)], check=True)
    manifest.append({'name': name, 'language': 'hinglish', 'speechReference': ' '.join(t for _, t in segments), 'hinglishReference': reference, 'duration': duration, 'video': f'e2e/fixtures/hinglish/{name}.mp4', 'source': 'Synthetic code-switching speech: macOS Lekha (hi) + Rishi (en-IN); 50 ms between segments. Not natural-speaker benchmark.'})
(out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(manifest, ensure_ascii=False, indent=2))
