from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from backend.tts import synthesize
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from authentication.views import get_authenticated_user
from dashboard.db import children_collection
from routines.db import routines_collection
from routines.services import apply_daily_reset, current_slot_index

from .rules import (
    DEFAULT_ROUTINE_SEQUENCE,
    EVERYDAY_NEEDS,
    LOCATION_STEP_SEQUENCES,
    ROUTINE_STEP_SEQUENCES,
    match_routine_sequence,
)


def _current_routine_item(items):
    """
    Picks whichever routine item's time slot has most recently started — the
    one the child should be doing "right now" — rather than requiring an
    exact time match, so a few minutes into a routine still shows it.
    """
    if not items:
        return None
    now_slot = current_slot_index()
    started = [i for i in items if i.get('slot_index', 0) <= now_slot]
    if started:
        return max(started, key=lambda i: i.get('slot_index', 0))
    # Before the day's first routine starts, show the earliest one so
    # there's still something contextual on screen.
    return min(items, key=lambda i: i.get('slot_index', 0))


def _next_routine_item(items, current):
    """The routine that comes right after the current one today, if any."""
    if not current:
        return None
    later = [i for i in items if i.get('slot_index', 0) > current.get('slot_index', 0)]
    return min(later, key=lambda i: i.get('slot_index', 0)) if later else None


@api_view(['GET'])
def contextual_flashcards(request):
    """
    The AI MVP: combines the current time-of-day (via the child's own daily
    routine) and current GPS location (via the child's place_category) into
    a short, ordered, audible flashcard sequence for whichever of those two
    contexts is available right now.
    """
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    response_data = {
        'time_context': None,
        'next_context': None,
        'location_context': None,
        # Needs and feelings the child may have to say at any moment, so the
        # screen always has something useful even with no routine or GPS.
        'needs_context': {'items': EVERYDAY_NEEDS},
    }

    routine_doc = apply_daily_reset(routines_collection.find_one({'user_id': user_id}))
    routine_items = (routine_doc or {}).get('items', [])
    current_item = _current_routine_item(routine_items)
    if current_item:
        sequence = match_routine_sequence(current_item.get('title')) or DEFAULT_ROUTINE_SEQUENCE
        response_data['time_context'] = {
            'routine_title': current_item.get('title'),
            'time': current_item.get('time'),
            'items': sequence,
        }

    # A heads-up for what's coming next helps with the transition between
    # activities; only shown when there's a specific sequence for it.
    next_item = _next_routine_item(routine_items, current_item)
    next_sequence = match_routine_sequence(next_item.get('title')) if next_item else None
    if next_sequence:
        response_data['next_context'] = {
            'routine_title': next_item.get('title'),
            'time': next_item.get('time'),
            'items': next_sequence,
        }

    child = children_collection.find_one({'user_id': user_id})
    gps = (child or {}).get('gps') or {}
    place_category = gps.get('place_category')
    sequence = LOCATION_STEP_SEQUENCES.get(place_category) if place_category else None
    if sequence:
        response_data['location_context'] = {
            'place_category': place_category,
            'location_label': gps.get('location_label'),
            'items': sequence,
        }

    return Response(response_data, status=status.HTTP_200_OK)


# Flattened lookup of every step's text, for the audio endpoint below. Built
# once at import time from the fixed vocabulary in rules.py.
_ALL_STEPS = {}
for _rule in ROUTINE_STEP_SEQUENCES:
    for _step in _rule['sequence']:
        _ALL_STEPS[_step['id']] = _step
for _step in DEFAULT_ROUTINE_SEQUENCE + EVERYDAY_NEEDS:
    _ALL_STEPS[_step['id']] = _step
for _sequence in LOCATION_STEP_SEQUENCES.values():
    for _step in _sequence:
        _ALL_STEPS[_step['id']] = _step

TTS_CACHE_DIR = Path(settings.MEDIA_ROOT) / 'tts_assistant'


@api_view(['GET'])
def contextual_flashcard_audio(request, step_id, lang):
    # Mirrors flashcards.views.flashcard_audio: text is only ever looked up
    # from the fixed dict above, never taken from the request, so this can't
    # be used to generate speech for arbitrary attacker-supplied text.
    step = _ALL_STEPS.get(step_id)
    if not step or lang not in ('ne', 'en'):
        raise Http404('Unknown step or language.')

    TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = TTS_CACHE_DIR / f'{step_id}_{lang}.mp3'

    if not cache_path.exists():
        synthesize(step[lang], lang, cache_path)

    return FileResponse(open(cache_path, 'rb'), content_type='audio/mpeg')
