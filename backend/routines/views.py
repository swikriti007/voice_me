import secrets

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from authentication.views import get_authenticated_user
from dashboard.db import children_collection
from dashboard.views import _children_for_caregiver, _pick_child
from .db import routines_collection
from .services import apply_daily_reset, today_str


def _serialize_item(item):
    return {
        'id': item.get('id'),
        'time': item.get('time', ''),
        'slot_index': item.get('slot_index', 0),
        'title': item.get('title', ''),
        'icon': item.get('icon') or '⏰',
        'completed': bool(item.get('completed', False)),
    }


def _serialize_items(doc):
    items = (doc or {}).get('items', [])
    return [_serialize_item(item) for item in sorted(items, key=lambda i: i.get('slot_index', 0))]


def _is_caregiver_account(user_id):
    """
    Routines are set for the child only. A caregiver account (linked to a
    child via the connect code, with no child profile of its own) supervises
    the child's routine through caregiver_routines and must never create or
    change routine entries under its own account.
    """
    if children_collection.find_one({'user_id': user_id}):
        return False
    return children_collection.find_one({'caregiver.user_id': user_id}) is not None


def _caregiver_forbidden():
    return Response(
        {'error': "Routines are set from the child's account. Caregivers can only view them."},
        status=status.HTTP_403_FORBIDDEN,
    )


@api_view(['GET', 'POST'])
def routine_list(request):
    """
    A child's own daily routine: what to do and at what time, first set up
    during ChildRegistrationPage and editable later from the same account.
    """
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        doc = apply_daily_reset(routines_collection.find_one({'user_id': user_id}))
        return Response({'items': _serialize_items(doc)}, status=status.HTTP_200_OK)

    if _is_caregiver_account(user_id):
        return _caregiver_forbidden()

    # POST replaces the whole list — the child sets up their day as a set
    # rather than one entry at a time. Items are not capped in number here;
    # the child can add as many routines as they want.
    incoming = request.data.get('items')
    if not isinstance(incoming, list):
        return Response({'error': 'A list of routine items is required.'}, status=status.HTTP_400_BAD_REQUEST)

    existing = apply_daily_reset(routines_collection.find_one({'user_id': user_id})) or {}
    existing_by_id = {item.get('id'): item for item in existing.get('items', [])}

    items = []
    for entry in incoming:
        title = (entry.get('title') or '').strip()
        if not title:
            continue
        item_id = entry.get('id') or secrets.token_hex(4)
        # Keep the checked/unchecked state for any item the caller echoes
        # back by id, so re-saving the list doesn't reset today's progress.
        previous = existing_by_id.get(item_id, {})
        items.append({
            'id': item_id,
            'time': entry.get('time', ''),
            'slot_index': entry.get('slot_index', 0),
            'title': title,
            'icon': entry.get('icon') or '⏰',
            'completed': bool(previous.get('completed', False)),
        })

    routines_collection.update_one(
        {'user_id': user_id},
        {'$set': {'items': items, 'reset_date': today_str()}, '$setOnInsert': {'user_id': user_id}},
        upsert=True,
    )
    return Response({'items': _serialize_items({'items': items})}, status=status.HTTP_200_OK)


@api_view(['PATCH'])
def toggle_routine_item(request, item_id):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    if _is_caregiver_account(user_id):
        return _caregiver_forbidden()

    doc = apply_daily_reset(routines_collection.find_one({'user_id': user_id}))
    if not doc:
        return Response({'error': 'No routine found for this account.'}, status=status.HTTP_404_NOT_FOUND)

    items = doc.get('items', [])
    found = False
    for item in items:
        if item.get('id') == item_id:
            item['completed'] = not item.get('completed', False)
            found = True
            break

    if not found:
        return Response({'error': 'Routine item not found.'}, status=status.HTTP_404_NOT_FOUND)

    routines_collection.update_one({'user_id': user_id}, {'$set': {'items': items}})
    return Response({'items': _serialize_items({'items': items})}, status=status.HTTP_200_OK)


@api_view(['GET'])
def caregiver_routines(request):
    """
    Read-only view of the connected child's routine for the caregiver's own
    dashboard, resolved the same way caregiver_dashboard finds its child: via
    the caregiver contact's own account id stored on the child document.
    """
    caregiver_user_id = get_authenticated_user(request)
    if not caregiver_user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    children = _children_for_caregiver(caregiver_user_id)
    if not children:
        return Response(
            {'error': 'Not connected to a child yet. Ask the parent for their connect code.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    # ?child_id= picks which linked child's routine to show; default is the first.
    child = _pick_child(children, request.query_params.get('child_id'))
    if not child:
        return Response({'error': 'This child is not linked to your account.'}, status=status.HTTP_404_NOT_FOUND)

    doc = apply_daily_reset(routines_collection.find_one({'user_id': child.get('user_id')}))
    return Response({'items': _serialize_items(doc)}, status=status.HTTP_200_OK)
