import jwt
import datetime
import hashlib
import re
import secrets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.contrib.auth.hashers import make_password, check_password
from django.shortcuts import render
from bson import ObjectId
from .db import users_collection, notes_collection, password_resets_collection

SECRET_KEY = "your_jwt_secret_key_change_in_production"

# Accounts must use a Gmail address (e.g. "name@gmail.com"); anything else,
# like a bare "name@", is rejected at registration and login.
GMAIL_RE = re.compile(r'^[A-Za-z0-9._%+-]+@gmail\.com$', re.IGNORECASE)
INVALID_EMAIL_ERROR = 'Invalid email. Please use a Gmail address (example@gmail.com).'


def is_valid_gmail(email):
    return bool(GMAIL_RE.match((email or '').strip()))

# How long an emailed reset link stays usable.
RESET_LINK_TTL_MINUTES = 30

def generate_token(user_id):
    payload = {
        'user_id': str(user_id),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7),
        'iat': datetime.datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def get_authenticated_user(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ')[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return payload['user_id']
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

@api_view(['POST'])
def create_account(request):
    data = request.data
    email = data.get('email')
    password = data.get('password')
    name = data.get('name', '')
    age = data.get('age')

    if not email or not password:
        return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not is_valid_gmail(email):
        return Response({'error': INVALID_EMAIL_ERROR}, status=status.HTTP_400_BAD_REQUEST)

    if users_collection.find_one({'email': email}):
        return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

    user_doc = {
        'name': name,
        'email': email,
        'age': age,
        'password': make_password(password),
        'created_at': datetime.datetime.utcnow()
    }

    result = users_collection.insert_one(user_doc)
    token = generate_token(result.inserted_id)
    user_payload = {
        'id': str(result.inserted_id),
        'name': name,
        'email': email,
        'age': age,
    }

    return Response({
        'message': 'Account created successfully!',
        'token': token,
        'user_id': str(result.inserted_id),
        'user': user_payload
    }, status=status.HTTP_201_CREATED)

@api_view(['POST'])
def login_user(request):
    data = request.data
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not is_valid_gmail(email):
        return Response({'error': INVALID_EMAIL_ERROR}, status=status.HTTP_400_BAD_REQUEST)

    user = users_collection.find_one({'email': email})
    if not user or not check_password(password, user['password']):
        return Response({'error': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    token = generate_token(user['_id'])
    return Response({
        'message': 'Login successful!',
        'token': token,
        'user': {
            'id': str(user['_id']),
            'name': user.get('name'),
            'email': user['email'],
            'age': user.get('age')
        }
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
def delete_account(request):
    data = request.data
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    user = users_collection.find_one({'email': email})
    if not user or not check_password(password, user['password']):
        return Response({'error': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    user_id = str(user['_id'])
    users_collection.delete_one({'_id': user['_id']})
    notes_collection.delete_many({'user_id': user_id})
    password_resets_collection.delete_many({'email': email})

    return Response({'message': 'Account deleted successfully.'}, status=status.HTTP_200_OK)

def _hash_reset_token(token):
    """Reset tokens are looked up by value, so they need a deterministic hash."""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

def _reset_link_base(request):
    """
    Where the emailed link should point. PASSWORD_RESET_BASE_URL matters once the
    app runs on a phone: the request may arrive at 10.0.2.2 or a LAN address that
    means nothing inside an email client.
    """
    configured = getattr(settings, 'PASSWORD_RESET_BASE_URL', '')
    if configured:
        return configured.rstrip('/')
    return request.build_absolute_uri('/').rstrip('/')

@api_view(['POST'])
def forgot_password(request):
    email = (request.data.get('email') or '').strip()

    if not email:
        return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Always answer the same way so this endpoint cannot be used to discover
    # which email addresses have an account.
    generic_response = {
        'message': 'If an account exists for that email, a password reset link has been sent.'
    }

    user = users_collection.find_one({'email': email})
    if not user:
        return Response(generic_response, status=status.HTTP_200_OK)

    token = secrets.token_urlsafe(32)
    now = datetime.datetime.utcnow()

    # One live link per account: requesting a new one retires the previous link.
    password_resets_collection.replace_one(
        {'email': email},
        {
            'email': email,
            'token_hash': _hash_reset_token(token),
            'created_at': now,
            'expires_at': now + datetime.timedelta(minutes=RESET_LINK_TTL_MINUTES)
        },
        upsert=True
    )

    reset_url = f"{_reset_link_base(request)}/api/reset-password/{token}/"
    greeting = user.get('name') or 'there'
    text_body = (
        f"Namaste {greeting},\n\n"
        "We received a request to reset your Voice Me password.\n"
        f"Open this link to choose a new password:\n\n{reset_url}\n\n"
        f"The link stops working in {RESET_LINK_TTL_MINUTES} minutes.\n"
        "If you did not ask for this, you can ignore this email."
    )
    html_body = (
        f"<p>Namaste {greeting},</p>"
        "<p>We received a request to reset your Voice Me password.</p>"
        f'<p><a href="{reset_url}" style="background:#28552F;color:#FFF8ED;'
        'padding:12px 22px;border-radius:24px;text-decoration:none;'
        'font-family:sans-serif;display:inline-block">Reset my password</a></p>'
        f"<p>Or paste this into your browser:<br>{reset_url}</p>"
        f"<p>The link stops working in {RESET_LINK_TTL_MINUTES} minutes. "
        "If you did not ask for this, you can ignore this email.</p>"
    )

    message = EmailMultiAlternatives(
        subject='Reset your Voice Me password',
        body=text_body,
        to=[email],
    )
    message.attach_alternative(html_body, 'text/html')
    message.send(fail_silently=True)

    # Development convenience: with the console email backend the message only
    # reaches the server terminal, so hand the link back while DEBUG is on.
    # Remove this once real email delivery is configured for production.
    if settings.DEBUG:
        generic_response['debug_reset_url'] = reset_url

    return Response(generic_response, status=status.HTTP_200_OK)

def reset_password(request, token):
    """
    The page the emailed link opens. GET shows the new-password form, POST saves it.
    This is a plain Django view rather than a DRF one because the reader is a
    browser opening a link from their inbox, not the mobile app.
    """
    reset_entry = password_resets_collection.find_one({'token_hash': _hash_reset_token(token)})
    expired_message = 'This reset link is invalid or has expired. Please request a new one.'

    # MongoDB clears expired documents on its own schedule, so check the time here too.
    if not reset_entry or reset_entry['expires_at'] <= datetime.datetime.utcnow():
        return render(
            request,
            'authentication/reset_password.html',
            {'error': expired_message, 'link_dead': True},
            status=400
        )

    if request.method != 'POST':
        return render(request, 'authentication/reset_password.html', {'email': reset_entry['email']})

    new_password = request.POST.get('new_password') or ''
    confirm_password = request.POST.get('confirm_password') or ''

    if len(new_password) < 6:
        return render(
            request,
            'authentication/reset_password.html',
            {'email': reset_entry['email'], 'error': 'Password must be at least 6 characters.'},
            status=400
        )

    if new_password != confirm_password:
        return render(
            request,
            'authentication/reset_password.html',
            {'email': reset_entry['email'], 'error': 'The two passwords do not match.'},
            status=400
        )

    user = users_collection.find_one({'email': reset_entry['email']})
    if not user:
        password_resets_collection.delete_one({'_id': reset_entry['_id']})
        return render(
            request,
            'authentication/reset_password.html',
            {'error': expired_message, 'link_dead': True},
            status=400
        )

    users_collection.update_one(
        {'_id': user['_id']},
        {'$set': {'password': make_password(new_password)}}
    )
    # Burn the link so it cannot be replayed.
    password_resets_collection.delete_one({'_id': reset_entry['_id']})

    return render(request, 'authentication/reset_password.html', {'success': True})

@api_view(['GET'])
def get_profile(request):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    user = users_collection.find_one({'_id': ObjectId(user_id)}, {'password': 0})
    user['_id'] = str(user['_id'])
    return Response(user, status=status.HTTP_200_OK)

@api_view(['GET', 'POST'])
def voice_notes_list(request):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        notes = list(notes_collection.find({'user_id': user_id}))
        for note in notes:
            note['_id'] = str(note['_id'])
        return Response(notes, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        title = request.data.get('title', 'Untitled Note')
        audio_url = request.data.get('audio_url', '')

        note_doc = {
            'user_id': user_id,
            'title': title,
            'audio_url': audio_url,
            'created_at': datetime.datetime.utcnow()
        }
        result = notes_collection.insert_one(note_doc)
        return Response({
            'message': 'Voice note created successfully!',
            'note_id': str(result.inserted_id)
        }, status=status.HTTP_201_CREATED)
