from pathlib import Path

from django.core.management.base import BaseCommand
from backend.tts import synthesize

from assistant.views import _ALL_STEPS, TTS_CACHE_DIR as ASSISTANT_CACHE_DIR
from attentionbell.views import BELL_PROMPT_WORDS, BELL_CACHE_DIR
from flashcards.views import FLASHCARD_WORDS, TTS_CACHE_DIR as FLASHCARD_CACHE_DIR


class Command(BaseCommand):
    """
    Pre-generates every fixed TTS clip the app can play (AI flashcards,
    basic flashcards, attention bell prompts). The audio endpoints only
    generate a clip the first time it's requested, which means a round trip
    to the TTS service on that first tap; running this once after adding new
    vocabulary makes every tap play straight from disk. Pass --refresh after
    changing voices (backend/tts.py) to regenerate clips already on disk.
    """

    help = 'Pre-generate and cache all fixed text-to-speech audio clips.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--refresh', action='store_true',
            help='Regenerate clips that are already cached (e.g. after changing voices).',
        )

    def handle(self, *args, **options):
        jobs = []
        for step_id, step in _ALL_STEPS.items():
            for lang in ('ne', 'en'):
                jobs.append((ASSISTANT_CACHE_DIR / f'{step_id}_{lang}.mp3', step[lang], lang))
        for card_id, words in FLASHCARD_WORDS.items():
            for lang, text in words.items():
                jobs.append((FLASHCARD_CACHE_DIR / f'{card_id}_{lang}.mp3', text, lang))
        for lang, text in BELL_PROMPT_WORDS.items():
            jobs.append((BELL_CACHE_DIR / f'prompt_{lang}.mp3', text, lang))

        created = skipped = failed = 0
        for path, text, lang in jobs:
            path = Path(path)
            if path.exists() and not options['refresh']:
                skipped += 1
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                synthesize(text, lang, path)
                created += 1
            except Exception as exc:  # network hiccup: leave it for on-demand generation
                failed += 1
                self.stderr.write(f'  failed {path.name}: {exc}')

        self.stdout.write(self.style.SUCCESS(
            f'Audio cache ready: {created} generated, {skipped} already cached, {failed} failed.'
        ))
