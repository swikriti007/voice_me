import datetime
import socket

from bson import ObjectId
from bson.errors import InvalidId
from django.contrib import messages
from django.contrib.auth.decorators import user_passes_test
from django.contrib.auth.forms import AuthenticationForm
from django.core.exceptions import ValidationError
from django.contrib.auth.hashers import make_password
from django.http import Http404
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from authentication.accounts import delete_user_and_data
from authentication.db import users_collection
from authentication.security import (
    INVALID_EMAIL_ERROR,
    decrypt_password,
    encrypt_password,
    is_valid_gmail,
    normalize_email,
    password_policy_error,
)
from dashboard.db import children_collection
from dashboard.views import _generate_connect_code, _merge_contact, pair_device

# Only the centre's own staff (Django users with "staff status") get in;
# parents and caregivers have app accounts, which can't sign in here.
staff_required = user_passes_test(lambda u: u.is_active and u.is_staff, login_url='centre:login')


class StaffAuthenticationForm(AuthenticationForm):
    # Refuse non-staff at sign-in; letting them in would just bounce them
    # between the login page and staff_required forever.
    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        if not user.is_staff:
            raise ValidationError('This account is not centre staff.', code='not_staff')

FAMILY = 'family'
CAREGIVER = 'caregiver'
NOT_SET_UP = 'not_set_up'


def _get_user_or_404(user_id):
    try:
        user = users_collection.find_one({'_id': ObjectId(user_id)})
    except InvalidId:
        user = None
    if not user:
        raise Http404('No such account.')
    return user


def _account_rows():
    """
    One row per app account. An account's role isn't stored on it: it's a
    family (parent + child) account if it owns a child profile, a caregiver
    if a child's profile links to it, and "not set up" if it registered but
    never finished either step.
    """
    users = list(users_collection.find().sort('created_at', -1))
    emails_by_id = {str(u['_id']): u['email'] for u in users}

    child_by_owner = {}
    child_by_caregiver = {}
    for child in children_collection.find():
        child_by_owner[child.get('user_id')] = child
        caregiver_id = (child.get('caregiver') or {}).get('user_id')
        if caregiver_id:
            # One caregiver can be linked to several children.
            child_by_caregiver.setdefault(caregiver_id, []).append(child)

    rows = []
    for user in users:
        user_id = str(user['_id'])
        row = {
            'id': user_id,
            'name': user.get('name') or '',
            'email': user['email'],
            'password': decrypt_password(user.get('password_encrypted')),
            'created_at': user.get('created_at'),
            'email_verified': user.get('email_verified', False),
            'created_by_centre': user.get('created_by_centre', False),
            'child': None,
            'children': [],
            'parent_name': '',
            'caregiver_name': '',
            'caregiver_email': '',
        }
        if user_id in child_by_owner:
            child = child_by_owner[user_id]
            caregiver = child.get('caregiver') or {}
            row.update({
                'role': FAMILY,
                'child': child,
                'parent_name': (child.get('parent') or {}).get('name', ''),
                'caregiver_name': caregiver.get('name', ''),
                'caregiver_email': emails_by_id.get(caregiver.get('user_id'), ''),
            })
        elif user_id in child_by_caregiver:
            row.update({'role': CAREGIVER, 'children': child_by_caregiver[user_id]})
        else:
            row['role'] = NOT_SET_UP
        rows.append(row)
    return rows


@staff_required
def dashboard(request):
    rows = _account_rows()

    families = [r for r in rows if r['role'] == FAMILY]
    stats = {
        'total': len(rows),
        'families': len(families),
        'caregivers': sum(r['role'] == CAREGIVER for r in rows),
        'families_without_caregiver': sum(not r['caregiver_name'] for r in families),
        'not_set_up': sum(r['role'] == NOT_SET_UP for r in rows),
    }

    role = request.GET.get('role', '')
    if role in (FAMILY, CAREGIVER, NOT_SET_UP):
        rows = [r for r in rows if r['role'] == role]

    query = (request.GET.get('q') or '').strip().lower()
    if query:
        def matches(r):
            child = r['child'] or {}
            haystack = ' '.join([
                r['name'], r['email'], r['parent_name'], r['caregiver_name'],
                str(child.get('name', '')), str(child.get('connect_code', '')),
            ]).lower()
            return query in haystack
        rows = [r for r in rows if matches(r)]

    return render(request, 'centre/dashboard.html', {
        'rows': rows,
        'stats': stats,
        'role': role,
        'query': request.GET.get('q', ''),
    })


@staff_required
def create_account(request):
    """
    Lets centre staff register a family or caregiver directly, e.g. during an
    intake meeting. It skips the emailed code because staff create it in
    person; the family can still reset the password by email later.
    """
    form = {
        'role': FAMILY, 'name': '', 'email': '', 'child_name': '', 'child_age': '',
        'phone': '', 'connect_code': '',
    }
    if request.method != 'POST':
        return render(request, 'centre/account_form.html', {'form': form})

    for field in form:
        form[field] = (request.POST.get(field) or '').strip()
    form['email'] = normalize_email(form['email'])
    form['connect_code'] = form['connect_code'].upper()
    password = request.POST.get('password') or ''

    errors = []
    if form['role'] not in (FAMILY, CAREGIVER):
        errors.append('Choose whether this is a family or a caregiver account.')
    if not form['name']:
        errors.append('Name is required.')
    if not is_valid_gmail(form['email']):
        errors.append(INVALID_EMAIL_ERROR)
    elif users_collection.find_one({'email': form['email']}):
        errors.append('An account with this email already exists.')
    policy_error = password_policy_error(password)
    if policy_error:
        errors.append(policy_error)

    child_to_link = None
    if form['role'] == FAMILY and not form['child_name']:
        errors.append("The child's name is required for a family account.")
    if form['role'] == CAREGIVER and form['connect_code']:
        child_to_link = children_collection.find_one({'connect_code': form['connect_code']})
        if not child_to_link:
            errors.append('No child has that connect code.')

    if errors:
        for error in errors:
            messages.error(request, error)
        return render(request, 'centre/account_form.html', {'form': form}, status=400)

    now = datetime.datetime.utcnow()
    result = users_collection.insert_one({
        'name': form['name'],
        'email': form['email'],
        'age': None,
        'password': make_password(password),
        'password_encrypted': encrypt_password(password),
        'email_verified': False,
        'created_by_centre': True,
        'created_at': now,
    })
    user_id = str(result.inserted_id)

    if form['role'] == FAMILY:
        children_collection.insert_one({
            'user_id': user_id,
            'name': form['child_name'],
            'age': form['child_age'],
            'avatar': '',
            'parent': _merge_contact(None, {'name': form['name'], 'phone': form['phone'] or None}, 'P'),
            'connect_code': _generate_connect_code(),
            'created_at': now,
        })
    elif child_to_link:
        caregiver = _merge_contact(child_to_link.get('caregiver'), {
            'name': form['name'], 'phone': form['phone'] or None,
        }, 'CG')
        caregiver['user_id'] = user_id
        children_collection.update_one({'_id': child_to_link['_id']}, {'$set': {'caregiver': caregiver}})

    messages.success(request, f"Account created for {form['email']}.")
    return redirect('centre:dashboard')


def _device_backend_url(request):
    """
    BACKEND_URL for the ESP8266 sketch. The device can't reach "localhost",
    so when staff open the panel that way, swap in this machine's Wi-Fi IP.
    """
    host = request.get_host()
    name, _, port = host.partition(':')
    if name in ('localhost', '127.0.0.1'):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(('8.8.8.8', 80))  # picks the outgoing interface; sends nothing
                name = s.getsockname()[0]
        except OSError:
            pass
    return f"{request.scheme}://{name}{':' + port if port else ''}"


@staff_required
def pair_sos_device(request):
    """
    Staff paste a family's Gmail and get the DEVICE_KEY for the SOS band,
    the same as `manage.py pair_device`. The key is shown on this page only.
    """
    form = {'email': normalize_email(request.GET.get('email') or ''), 'device_id': 'SOS-DEVICE-01'}
    if request.method != 'POST':
        return render(request, 'centre/pair_device.html', {'form': form})

    form['email'] = normalize_email(request.POST.get('email') or '')
    form['device_id'] = (request.POST.get('device_id') or '').strip() or 'SOS-DEVICE-01'

    user = users_collection.find_one({'email': form['email']})
    child = children_collection.find_one({'user_id': str(user['_id'])}) if user else None
    if not user:
        messages.error(request, f"No account with email {form['email'] or '(blank)'}.")
    elif not child:
        messages.error(request, 'That account has no child profile yet. Register the child in the app first.')
    if not child:
        return render(request, 'centre/pair_device.html', {'form': form}, status=400)

    return render(request, 'centre/pair_device.html', {
        'form': form,
        'child_name': child.get('name') or 'child',
        'replaced': bool(child.get('device')),
        'key': pair_device(child, form['device_id']),
        'backend_url': _device_backend_url(request),
    })


@staff_required
@require_POST
def set_password(request, user_id):
    user = _get_user_or_404(user_id)
    new_password = request.POST.get('new_password') or ''

    policy_error = password_policy_error(new_password)
    if policy_error:
        messages.error(request, f"{user['email']}: {policy_error}")
        return redirect('centre:dashboard')

    users_collection.update_one({'_id': user['_id']}, {'$set': {
        'password': make_password(new_password),
        'password_encrypted': encrypt_password(new_password),
    }})
    messages.success(request, f"Password changed for {user['email']}.")
    return redirect('centre:dashboard')


@staff_required
@require_POST
def delete_account(request, user_id):
    user = _get_user_or_404(user_id)
    delete_user_and_data(user)
    messages.success(request, f"Deleted {user['email']} and all of its data.")
    return redirect('centre:dashboard')
