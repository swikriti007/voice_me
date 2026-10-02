from pathlib import Path
from backend.tts import synthesize
from rest_framework.decorators import api_view
from django.conf import settings
from django.http import FileResponse, Http404

# Kept in sync with FLASHCARDS in frontend/.../src/app/Flashcardpage.tsx. Text is
# fixed server-side (rather than accepted from the request) so this endpoint can't
# be used to generate speech for arbitrary attacker-supplied text.
FLASHCARD_WORDS = {
    'food': {'ne': 'खाना', 'en': 'Food'},
    'water': {'ne': 'पानी', 'en': 'Water'},
    'toilet': {'ne': 'शौचालय', 'en': 'Toilet'},
    'help': {'ne': 'सहयोग', 'en': 'Help me'},
    'brush': {'ne': 'ब्रश', 'en': 'Brush'},
    'play': {'ne': 'खेल', 'en': 'Play'},
    'medicine': {'ne': 'औषधि', 'en': 'Medicine'},
}

TTS_CACHE_DIR = Path(settings.MEDIA_ROOT) / 'tts'


@api_view(['GET'])
def flashcard_audio(request, card_id, lang):
    words = FLASHCARD_WORDS.get(card_id)
    if not words or lang not in words:
        raise Http404('Unknown flashcard or language.')

    TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = TTS_CACHE_DIR / f'{card_id}_{lang}.mp3'

    # Generated once per card+language, then served straight from disk on every
    # later request so playback has no TTS-generation delay.
    if not cache_path.exists():
        synthesize(words[lang], lang, cache_path)

    return FileResponse(open(cache_path, 'rb'), content_type='audio/mpeg')
