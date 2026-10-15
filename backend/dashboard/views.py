import datetime
import hashlib
import secrets

import requests
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from authentication.views import get_authenticated_user
from .db import children_collection, sos_alerts_collection

# Maps an OpenStreetMap place type/class (from Nominatim reverse geocoding)
# to the small vocabulary the context-aware assistant knows how to react to.
# Unrecognised OSM types just mean no location-based suggestion is shown.
PLACE_CATEGORY_MAP = {
    'restaurant': 'restaurant', 'fast_food': 'restaurant', 'cafe': 'restaurant', 'food_court': 'restaurant',
    'school': 'school', 'college': 'school', 'university': 'school', 'kindergarten': 'school',
    'hospital': 'hospital', 'clinic': 'hospital', 'pharmacy': 'hospital', 'doctors': 'hospital',
    'park': 'park', 'playground': 'park', 'garden': 'park', 'nature_reserve': 'park',
    'supermarket': 'store', 'convenience': 'store', 'mall': 'store', 'marketplace': 'store', 'shop': 'store',
    'house': 'home', 'residential': 'home', 'apartments': 'home',
    'place_of_worship': 'temple', 'temple': 'temple', 'shrine': 'temple',
    'bus_station': 'transport', 'bus_stop': 'transport', 'station': 'transport', 'taxi': 'transport',
    'library': 'library',
}


def _lookup_place(lat, lng):
    """
    Reverse-geocodes coordinates to a place category using OpenStreetMap's
    free Nominatim API (no key needed). Used once the GPS band is actually
    sending coordinates; best-effort only — a failed/slow lookup just means
    no location-based suggestion for this update, never a broken request.
    """
    try:
        resp = requests.get(
            'https://nominatim.openstreetmap.org/reverse',
            params={'lat': lat, 'lon': lng, 'format': 'jsonv2', 'zoom': 18},
            headers={'User-Agent': 'VoiceMeApp/1.0 (accessibility app for children)'},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return None, None

    osm_type = (data.get('type') or '').lower()
    osm_class = (data.get('category') or data.get('class') or '').lower()
    category = PLACE_CATEGORY_MAP.get(osm_type) or PLACE_CATEGORY_MAP.get(osm_class)
    label = data.get('name') or (data.get('display_name') or '').split(',')[0] or None
    return category, label


def _merge_contact(existing, incoming, id_prefix):
    """
    Merge a caregiver/parent update into whatever contact info is already on
    file, assigning a stable display id (e.g. "CG4F9A2B") the first time this
    contact is saved rather than regenerating one on every edit.
    """
    merged = dict(existing or {})
    merged.update({k: v for k, v in incoming.items() if v is not None})
    if not merged.get('id'):
        merged['id'] = f"{id_prefix}{secrets.token_hex(3).upper()}"
    return merged


def _generate_connect_code():
    """
    Short code a parent shares out-of-band (verbally, text message) so a
    caregiver's own account can be linked to this child. Retries on the
    astronomically unlikely chance of a collision.
    """
    for _ in range(5):
        code = secrets.token_hex(3).upper()
        if not children_collection.find_one({'connect_code': code}):
            return code
    return secrets.token_hex(4).upper()


def _public_contact(contact):
    """
    Strips a stored contact down to the fields a viewer (parent or caregiver
    app) is meant to see, so internal bookkeeping like the caregiver's own
    account user_id never leaves the backend in a profile response.
    """
    if not contact:
        return None
    return {
        'id': contact.get('id'),
        'name': contact.get('name'),
        'phone': contact.get('phone'),
    }


# The device reports every ~30 s, so three missed reports means the band is
# off or out of range: it's no longer "live", and the stored position is shown
# as its last known location instead.
GPS_STALE_AFTER = datetime.timedelta(seconds=90)


def _gps_for_response(child):
    gps = dict(child.get('gps') or {'connected': False, 'location_label': None, 'place_category': None, 'updated_at': None})
    try:
        updated_at = datetime.datetime.fromisoformat(gps.get('updated_at') or '')
    except ValueError:
        updated_at = None
    # Only the hardware itself counts as live; test locations posted from the
    # app (gps_status POST) never do.
    if (gps.get('source') != 'device' or updated_at is None
            or datetime.datetime.utcnow() - updated_at > GPS_STALE_AFTER):
        gps['connected'] = False
    return gps


def _serialize_child(child, include_connect_code=True):
    serialized = {
        'id': str(child['_id']),
        'name': child.get('name', ''),
        'age': child.get('age', ''),
        'avatar': child.get('avatar', ''),
        'caregiver': _public_contact(child.get('caregiver')),
        'parent': _public_contact(child.get('parent')),
        # The child's doctor, entered with the parent's details at child
        # registration; the parent and caregiver both see it and can call it.
        'doctor': _public_contact(child.get('doctor')),
        'gps': _gps_for_response(child),
    }
    if include_connect_code:
        # The connect code is the parent's own invite secret for linking
        # caregiver accounts; only the parent's app should ever see it, never
        # a caregiver's dashboard (which would let them re-share it further).
        serialized['connect_code'] = child.get('connect_code')
    return serialized


def _children_for_caregiver(caregiver_user_id):
    """Every child linked to this caregiver account, oldest link first."""
    return list(children_collection.find({'caregiver.user_id': caregiver_user_id}).sort('_id', 1))


def _pick_child(children, child_id):
    """The child with this id from the list, the first one if no id is given, or None."""
    if not child_id:
        return children[0] if children else None
    return next((c for c in children if str(c['_id']) == str(child_id)), None)


def _child_summary(child):
    """Just enough to list a child in the caregiver's child switcher."""
    return {
        'id': str(child['_id']),
        'name': child.get('name', ''),
        'age': child.get('age', ''),
        'avatar': child.get('avatar', ''),
    }


@api_view(['GET', 'POST'])
def child_profile(request):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        child = children_collection.find_one({'user_id': user_id})
        if not child:
            return Response({'error': 'No child profile found for this account.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_child(child), status=status.HTTP_200_OK)

    # POST: create the child profile the first time, update it on later calls.
    data = request.data
    existing = children_collection.find_one({'user_id': user_id}) or {}
    update_fields = {}
    for field in ('name', 'age', 'avatar'):
        if data.get(field) is not None:
            update_fields[field] = data.get(field)
    if data.get('caregiver') is not None:
        update_fields['caregiver'] = _merge_contact(existing.get('caregiver'), data.get('caregiver'), 'CG')
    if data.get('parent') is not None:
        update_fields['parent'] = _merge_contact(existing.get('parent'), data.get('parent'), 'P')
    if data.get('doctor') is not None:
        update_fields['doctor'] = _merge_contact(existing.get('doctor'), data.get('doctor'), 'DR')

    if not update_fields:
        return Response({'error': 'No profile fields provided.'}, status=status.HTTP_400_BAD_REQUEST)

    # Assigned once and kept stable so the parent can keep sharing the same
    # code with new caregivers later; backfilled here for any doc that
    # predates this field, not just brand new ones.
    if not existing.get('connect_code'):
        update_fields['connect_code'] = _generate_connect_code()

    children_collection.update_one(
        {'user_id': user_id},
        {
            '$set': update_fields,
            '$setOnInsert': {'user_id': user_id, 'created_at': datetime.datetime.utcnow()},
        },
        upsert=True,
    )
    child = children_collection.find_one({'user_id': user_id})
    return Response(_serialize_child(child), status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
def gps_status(request):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    child = children_collection.find_one({'user_id': user_id})
    if not child:
        return Response({'error': 'No child profile found for this account.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(_gps_for_response(child), status=status.HTTP_200_OK)

    # POST: the GPS band reports raw coordinates here once it's built, and
    # they get reverse-geocoded into a place category. Until then this also
    # accepts a place_category/location_label directly, so the context-aware
    # assistant (which reacts to place_category) can be built and tested
    # without the hardware existing yet.
    data = request.data
    lat = data.get('lat')
    lng = data.get('lng')
    place_category = data.get('place_category')
    location_label = data.get('location_label')

    if lat is not None and lng is not None:
        looked_up_category, looked_up_label = _lookup_place(lat, lng)
        place_category = place_category or looked_up_category
        location_label = location_label or looked_up_label
    elif not place_category:
        return Response({'error': 'lat/lng or place_category is required.'}, status=status.HTTP_400_BAD_REQUEST)

    gps = {
        'connected': True,
        'location_label': location_label,
        'place_category': place_category,
        'lat': lat,
        'lng': lng,
        'updated_at': datetime.datetime.utcnow().isoformat(),
    }
    children_collection.update_one({'user_id': user_id}, {'$set': {'gps': gps}})
    return Response(gps, status=status.HTTP_200_OK)


@api_view(['POST'])
def connect_caregiver(request):
    """
    Links the caregiver's OWN account (they already registered/logged in
    separately) to a child by the code its parent shared with them, rather
    than the caregiver creating or editing the child profile directly.
    """
    caregiver_user_id = get_authenticated_user(request)
    if not caregiver_user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    data = request.data
    code = (data.get('code') or '').strip().upper()
    name = (data.get('name') or '').strip()
    phone = data.get('phone')

    # One caregiver can look after many children: connecting another code
    # adds that child alongside the ones already linked. A caregiver who is
    # already linked reuses the name/phone they gave the first time.
    already_linked = _children_for_caregiver(caregiver_user_id)
    if already_linked:
        known = already_linked[0].get('caregiver') or {}
        name = name or known.get('name', '')
        phone = phone or known.get('phone')
    if not code or not name:
        return Response({'error': 'Connect code and name are required.'}, status=status.HTTP_400_BAD_REQUEST)

    child = children_collection.find_one({'connect_code': code})
    if not child:
        return Response({'error': 'Invalid connect code.'}, status=status.HTTP_404_NOT_FOUND)

    caregiver = _merge_contact(child.get('caregiver'), {
        'name': name,
        'phone': phone,
    }, 'CG')
    caregiver['user_id'] = caregiver_user_id

    children_collection.update_one({'_id': child['_id']}, {'$set': {'caregiver': caregiver}})
    child = children_collection.find_one({'_id': child['_id']})
    return Response(_serialize_child(child, include_connect_code=False), status=status.HTTP_200_OK)


@api_view(['GET'])
def caregiver_dashboard(request):
    caregiver_user_id = get_authenticated_user(request)
    if not caregiver_user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    children = _children_for_caregiver(caregiver_user_id)
    if not children:
        return Response(
            {'error': 'Not connected to a child yet. Ask the parent for their connect code.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    # ?child_id= picks which linked child to show; default is the first.
    child = _pick_child(children, request.query_params.get('child_id'))
    if not child:
        return Response({'error': 'This child is not linked to your account.'}, status=status.HTTP_404_NOT_FOUND)

    data = _serialize_child(child, include_connect_code=False)
    data['children'] = [_child_summary(c) for c in children]
    return Response(data, status=status.HTTP_200_OK)


@api_view(['POST'])
def trigger_sos(request):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    child = children_collection.find_one({'user_id': user_id})
    if not child:
        return Response({'error': 'No child profile found for this account.'}, status=status.HTTP_404_NOT_FOUND)

    data = request.data
    location_label = data.get('location_label') or (child.get('gps') or {}).get('location_label')
    lat = data.get('lat')
    lng = data.get('lng')
    now = datetime.datetime.utcnow()

    alert_doc = {
        'child_id': child['_id'],
        'user_id': user_id,
        'location_label': location_label,
        'lat': lat,
        'lng': lng,
        'source': 'app',
        'status': 'active',
        'created_at': now,
    }
    result = sos_alerts_collection.insert_one(alert_doc)

    return Response({
        'alert_id': str(result.inserted_id),
        'triggered_at': now.isoformat(),
        'location_label': location_label,
        'caregiver': _public_contact(child.get('caregiver')),
        'parent': _public_contact(child.get('parent')),
        'doctor': _public_contact(child.get('doctor')),
    }, status=status.HTTP_201_CREATED)


# How long an unresolved SOS keeps showing on the parent/caregiver screens.
# Past this it is treated as stale rather than a live emergency.
SOS_ACTIVE_WINDOW = datetime.timedelta(hours=24)


def hash_device_key(key):
    return hashlib.sha256(key.encode('utf-8')).hexdigest()


def pair_device(child, device_id='SOS-DEVICE-01'):
    """
    Links an SOS device to a child and returns its new key. Only the hash is
    stored, so the key can't be shown again; pairing again issues a new key
    and the old one stops working (e.g. if a device is lost).
    """
    key = secrets.token_urlsafe(24)
    children_collection.update_one({'_id': child['_id']}, {'$set': {'device': {
        'id': device_id,
        'key_hash': hash_device_key(key),
        'paired_at': datetime.datetime.utcnow(),
    }}})
    return key


def _authenticate_device(request):
    """
    The SOS hardware has no user login, so it sends the key printed by
    `manage.py pair_device` in an X-Device-Key header. Only the key's hash is
    stored, so a leaked database dump can't be used to fake alerts.
    """
    key = (request.headers.get('X-Device-Key') or '').strip()
    if not key:
        return None
    return children_collection.find_one({'device.key_hash': hash_device_key(key)})


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _device_gps_update(child, data):
    """
    Saves the device's position as the child's GPS status (the same shape
    gps_status writes), so the child's home screen and the context-aware
    assistant react to where the hardware actually is. Returns the saved
    gps dict, or None when the device has no GPS fix yet.
    """
    lat = _to_float(data.get('lat'))
    lng = _to_float(data.get('lng'))
    if not data.get('gpsFix') or lat is None or lng is None:
        return None

    place_category, looked_up_label = _lookup_place(lat, lng)
    gps = {
        'connected': True,
        'location_label': data.get('place') or looked_up_label,
        'place_category': place_category,
        'lat': lat,
        'lng': lng,
        'source': 'device',
        'updated_at': datetime.datetime.utcnow().isoformat(),
    }
    children_collection.update_one({'_id': child['_id']}, {'$set': {'gps': gps}})
    return gps


@api_view(['POST'])
def device_location(request):
    child = _authenticate_device(request)
    if not child:
        return Response({'error': 'Unknown device.'}, status=status.HTTP_401_UNAUTHORIZED)

    gps = _device_gps_update(child, request.data)
    if gps is None:
        return Response({'error': 'No GPS fix yet.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(gps, status=status.HTTP_200_OK)


@api_view(['POST'])
def device_sos(request):
    child = _authenticate_device(request)
    if not child:
        return Response({'error': 'Unknown device.'}, status=status.HTTP_401_UNAUTHORIZED)

    data = request.data
    # Without a fix the device still reports its last known position (or
    # 0,0 if it never had one); keep it, but flag it so the apps don't
    # present it as the current location.
    gps = _device_gps_update(child, data)
    now = datetime.datetime.utcnow()
    alert_doc = {
        'child_id': child['_id'],
        'user_id': child.get('user_id'),
        'location_label': (gps or {}).get('location_label') or data.get('place')
                          or (child.get('gps') or {}).get('location_label'),
        'lat': _to_float(data.get('lat')),
        'lng': _to_float(data.get('lng')),
        'gps_fix': bool(data.get('gpsFix')),
        'source': 'device',
        'device_id': (child.get('device') or {}).get('id'),
        'status': 'active',
        'created_at': now,
    }
    result = sos_alerts_collection.insert_one(alert_doc)
    return Response({'alert_id': str(result.inserted_id), 'triggered_at': now.isoformat()},
                    status=status.HTTP_201_CREATED)


def _children_for_viewer(user_id):
    """
    The children a logged-in account looks after: the parent's own child, or
    every child a caregiver has connected to.
    """
    own = children_collection.find_one({'user_id': user_id})
    return [own] if own else _children_for_caregiver(user_id)


def _serialize_alert(alert):
    lat, lng = alert.get('lat'), alert.get('lng')
    has_coords = lat is not None and lng is not None and not (lat == 0 and lng == 0)
    return {
        'id': str(alert['_id']),
        'source': alert.get('source', 'app'),
        'location_label': alert.get('location_label'),
        'lat': lat,
        'lng': lng,
        'gps_fix': alert.get('gps_fix', has_coords),
        'maps_link': f'https://www.google.com/maps?q={lat},{lng}' if has_coords else None,
        'created_at': alert['created_at'].isoformat() + 'Z',
    }


# Alerts saved before statuses existed have no status field; count them as open.
_OPEN_ALERT = {'status': {'$in': ['active', None]}}


@api_view(['GET'])
def sos_latest(request):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    children = _children_for_viewer(user_id)
    if not children:
        return Response({'alert': None}, status=status.HTTP_200_OK)

    # Newest open alert across every child this account looks after, so a
    # caregiver with several children sees whichever one needs help.
    alert = sos_alerts_collection.find_one(
        {
            'child_id': {'$in': [c['_id'] for c in children]},
            **_OPEN_ALERT,
            'created_at': {'$gte': datetime.datetime.utcnow() - SOS_ACTIVE_WINDOW},
        },
        sort=[('created_at', -1)],
    )
    if not alert:
        return Response({'alert': None}, status=status.HTTP_200_OK)
    serialized = _serialize_alert(alert)
    child = next(c for c in children if c['_id'] == alert['child_id'])
    serialized['child_id'] = str(child['_id'])
    serialized['child_name'] = child.get('name', '')
    return Response({'alert': serialized}, status=status.HTTP_200_OK)


@api_view(['POST'])
def sos_resolve(request):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    children = _children_for_viewer(user_id)
    if not children:
        return Response({'error': 'No child found for this account.'}, status=status.HTTP_404_NOT_FOUND)
    # A caregiver with several children says which one is safe; without a
    # child_id the first (a parent's only) child is meant.
    child = _pick_child(children, request.data.get('child_id'))
    if not child:
        return Response({'error': 'This child is not linked to your account.'}, status=status.HTTP_404_NOT_FOUND)

    # Resolves every open alert: the child is safe, whichever button (phone
    # or device) raised the alarm and however many times it was pressed.
    result = sos_alerts_collection.update_many(
        {'child_id': child['_id'], **_OPEN_ALERT},
        {'$set': {'status': 'resolved', 'resolved_by': user_id, 'resolved_at': datetime.datetime.utcnow()}},
    )
    return Response({'resolved': result.modified_count}, status=status.HTTP_200_OK)
