import asyncio
import logging
import os
from pathlib import Path

import edge_tts
from gtts import gTTS

logger = logging.getLogger(__name__)

# Microsoft neural voices via edge-tts: free and no API key, and unlike gTTS
# it has natural-sounding Nepali voices. Override per language in .env, e.g.
# EDGE_TTS_VOICE_NE=ne-NP-SagarNeural for a male voice
# (list them all with `python -m edge_tts --list-voices`).
EDGE_TTS_VOICES = {
    'ne': os.getenv('EDGE_TTS_VOICE_NE', 'ne-NP-HemkalaNeural'),
    'en': os.getenv('EDGE_TTS_VOICE_EN', 'en-US-JennyNeural'),
}


def synthesize(text: str, lang: str, path) -> None:
    """
    Saves `text` spoken in `lang` as an mp3 at `path`. edge-tts is an
    unofficial client for Edge's read-aloud service, so if it fails (or ever
    gets blocked) this falls back to gTTS rather than leaving the child with
    a silent card.
    """
    path = Path(path)
    # Write to a temp file and rename, so a failed or half-finished download
    # never sits at `path` where the audio endpoints would serve it as cached.
    tmp_path = path.with_name(path.name + '.part')
    try:
        voice = EDGE_TTS_VOICES.get(lang)
        if not voice:
            raise ValueError(f'No edge-tts voice configured for {lang!r}.')
        asyncio.run(edge_tts.Communicate(text, voice).save(str(tmp_path)))
    except Exception as exc:
        logger.warning('edge-tts failed for %s (%s), falling back to gTTS', path.name, exc)
        try:
            gTTS(text=text, lang=lang).save(str(tmp_path))
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise
    tmp_path.replace(path)
