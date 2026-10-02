import math
import struct
import wave
from io import BytesIO
from pathlib import Path

from backend.tts import synthesize
from rest_framework.decorators import api_view
from django.conf import settings
from django.http import FileResponse, Http404

BELL_CACHE_DIR = Path(settings.MEDIA_ROOT) / 'bell'

# Kept in sync with the Nepali line spoken in Attentionbellpage.tsx.
BELL_PROMPT_WORDS = {
    'ne': 'ध्यान दिनुहोस्',
}

SAMPLE_RATE = 44100


def _synthesize_bell_tone() -> bytes:
    # A soft two-note "ding-dong" synthesized from sine waves with an
    # exponential decay envelope, so the ring sound is generated and owned
    # by the backend instead of depending on an externally hosted file.
    notes = [(880.0, 0.35), (659.25, 0.45)]
    frames = bytearray()

    for frequency, duration in notes:
        sample_count = int(SAMPLE_RATE * duration)
        for i in range(sample_count):
            t = i / SAMPLE_RATE
            envelope = math.exp(-3.5 * t)
            sample = math.sin(2 * math.pi * frequency * t) * envelope
            frames += struct.pack('<h', int(sample * 32767 * 0.6))

    buffer = BytesIO()
    with wave.open(buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(bytes(frames))

    return buffer.getvalue()


@api_view(['GET'])
def bell_ring_audio(request):
    BELL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = BELL_CACHE_DIR / 'ring.wav'

    if not cache_path.exists():
        cache_path.write_bytes(_synthesize_bell_tone())

    return FileResponse(open(cache_path, 'rb'), content_type='audio/wav')


@api_view(['GET'])
def bell_prompt_audio(request, lang):
    text = BELL_PROMPT_WORDS.get(lang)
    if not text:
        raise Http404('Unknown attention bell prompt language.')

    BELL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = BELL_CACHE_DIR / f'prompt_{lang}.mp3'

    if not cache_path.exists():
        synthesize(text, lang, cache_path)

    return FileResponse(open(cache_path, 'rb'), content_type='audio/mpeg')
