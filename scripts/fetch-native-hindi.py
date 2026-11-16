"""Fetch the first audio member of the FLEURS Hindi test archive (CC BY 4.0).
Streams the archive, stopping after one recording instead of downloading it all.
"""
import argparse
import csv
import io
import json
from pathlib import Path
import subprocess
import tarfile
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
out = root / 'e2e/fixtures/speech'
base = 'https://huggingface.co/datasets/google/fleurs/resolve/main/data/hi_in/'
metadata = urllib.request.urlopen(base + 'test.tsv', timeout=30).read().decode()
rows = {row[1]: row for row in csv.reader(io.StringIO(metadata), delimiter='\t')}
with urllib.request.urlopen(base + 'audio/test.tar.gz', timeout=60) as response:
    with tarfile.open(fileobj=response, mode='r|gz') as archive:
        for member in archive:
            name = Path(member.name).name
            if member.isfile() and name in rows and member.size < 20_000_000:
                audio = archive.extractfile(member).read()
                row = rows[name]
                break
        else:
            raise RuntimeError('No matching audio found')
source = out / 'hindi-native.wav'
source.write_bytes(audio)
# FLEURS metadata gives the number of samples at its documented 16 kHz rate.
# Its IEEE-float WAV is not supported by Python 3.9's wave reader.
duration = int(row[5]) / 16000
video = out / 'hindi-native.mp4'
subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '12', '-i', str(root / 'public/images/mountains.jpg'), '-i', str(source), '-vf', 'scale=320:568:force_original_aspect_ratio=increase,crop=320:568', '-t', str(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(video)], check=True)
manifest = [{'language': 'hindi', 'reportName': 'hindi-native', 'reference': row[2], 'normalizedReference': row[3], 'duration': duration, 'video': 'e2e/fixtures/speech/hindi-native.mp4', 'source': 'Google FLEURS Hindi test split; first matching audio archive member', 'originalFile': name, 'datasetId': row[0], 'license': 'CC BY 4.0', 'attribution': 'FLEURS — Google; Conneau et al. 2022', 'url': 'https://huggingface.co/datasets/google/fleurs', 'modification': 'Original audio muxed to AAC with a still-image video for browser upload testing.'}]
(out / 'native-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(manifest, ensure_ascii=False, indent=2))
