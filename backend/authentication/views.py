import jwt
import datetime
import logging
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.hashers import make_password, check_password
from bson import ObjectId
from .accounts import delete_user_and_data
from .db import users_collection, notes_collection
from .security import (
    INVALID_EMAIL_ERROR,
    PASSWORD_RESET,
    SIGNUP,
    check_code,
    code_retry_after,
    encrypt_password,
    is_valid_gmail,
    normalize_email,
    password_policy_error,
    send_code,
)

logger = logging.getLogger(__name__)

SECRET_KEY = "your_jwt_secret_key_change_in_production"


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


def _too_soon_response(retry_after):
    return Response(
        {'error': f'Please wait {retry_after} seconds before asking for another code.',
         'retry_after': retry_after},
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


@api_view(['POST'])
def send_signup_code(request):
    """
    Step 1 of sign-up: emails a 6-digit code to the Gmail address. Only
    someone who can open that inbox can finish registering, so made-up
    addresses that merely end in @gmail.com can no longer get an account.
    """
    email = normalize_email(request.data.get('email'))

    if not is_valid_gmail(email):
        return Response({'error': INVALID_EMAIL_ERROR}, status=status.HTTP_400_BAD_REQUEST)
    if users_collection.find_one({'email': email}):
        return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

    retry_after = code_retry_after(email, SIGNUP)
    if retry_after:
        return _too_soon_response(retry_after)

    try:
        send_code(email, SIGNUP)
    except Exception:
        logger.exception('Could not send sign-up code to %s', email)
        return Response({'error': 'Could not send the code right now. Please try again shortly.'},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return Response({'message': 'A verification code has been sent to your Gmail.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
def create_account(request):
    data = request.data
    email = normalize_email(data.get('email'))
    password = data.get('password')
    name = data.get('name', '')
    age = data.get('age')

    if not email or not password:
        return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not is_valid_gmail(email):
        return Response({'error': INVALID_EMAIL_ERROR}, status=status.HTTP_400_BAD_REQUEST)

    policy_error = password_policy_error(password)
    if policy_error:
        return Response({'error': policy_error}, status=status.HTTP_400_BAD_REQUEST)

    if users_collection.find_one({'email': email}):
        return Response({'error': 'An account with this email already exists.'}, status=status.HTTP_400_BAD_REQUEST)

    if not data.get('code'):
        return Response({'error': 'Please enter the verification code sent to your Gmail.'},
                        status=status.HTTP_400_BAD_REQUEST)
    code_error = check_code(email, SIGNUP, data.get('code'))
    if code_error:
        return Response({'error': code_error}, status=status.HTTP_400_BAD_REQUEST)

    user_doc = {
        'name': name,
        'email': email,
        'age': age,
        'password': make_password(password),
        'password_encrypted': encrypt_password(password),
        'email_verified': True,
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
    email = normalize_email(data.get('email'))
    password = data.get('password')

    if not email or not password:
        return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if not is_valid_gmail(email):
        return Response({'error': INVALID_EMAIL_ERROR}, status=status.HTTP_400_BAD_REQUEST)

    # Only accounts that actually registered can log in: an unknown Gmail
    # gets the same answer as a wrong password.
    user = users_collection.find_one({'email': email})
    if not user or not check_password(password, user['password']):
        return Response({'error': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    # Accounts created before the centre panel existed have no viewable copy
    # yet; fill it in now that the correct password has been typed.
    if not user.get('password_encrypted'):
        encrypted = encrypt_password(password)
        if encrypted:
            users_collection.update_one({'_id': user['_id']}, {'$set': {'password_encrypted': encrypted}})

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
    email = normalize_email(data.get('email'))
    password = data.get('password')

    if not email or not password:
        return Response({'error': 'Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    user = users_collection.find_one({'email': email})
    if not user or not check_password(password, user['password']):
        return Response({'error': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    delete_user_and_data(user)

    return Response({'message': 'Account deleted successfully.'}, status=status.HTTP_200_OK)

@api_view(['POST'])
def forgot_password(request):
    """Emails a 6-digit reset code to the account's Gmail inbox."""
    email = normalize_email(request.data.get('email'))

    if not email:
        return Response({'error': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Always answer the same way so this endpoint cannot be used to discover
    # which email addresses have an account.
    generic_response = {
        'message': 'If an account exists for that email, a reset code has been sent to it.'
    }

    user = users_collection.find_one({'email': email})
    if not user:
        return Response(generic_response, status=status.HTTP_200_OK)

    retry_after = code_retry_after(email, PASSWORD_RESET)
    if retry_after:
        return _too_soon_response(retry_after)

    try:
        send_code(email, PASSWORD_RESET, name=user.get('name'))
    except Exception:
        # Logged rather than reported: an error here would reveal that the
        # account exists.
        logger.exception('Could not send password reset code to %s', email)

    return Response(generic_response, status=status.HTTP_200_OK)

@api_view(['POST'])
def reset_password(request):
    """Sets a new password once the emailed reset code is confirmed."""
    data = request.data
    email = normalize_email(data.get('email'))
    new_password = data.get('new_password') or ''

    if not email or not data.get('code'):
        return Response({'error': 'Email and code are required.'}, status=status.HTTP_400_BAD_REQUEST)

    policy_error = password_policy_error(new_password)
    if policy_error:
        return Response({'error': policy_error}, status=status.HTTP_400_BAD_REQUEST)

    code_error = check_code(email, PASSWORD_RESET, data.get('code'))
    if code_error:
        return Response({'error': code_error}, status=status.HTTP_400_BAD_REQUEST)

    user = users_collection.find_one({'email': email})
    if not user:
        return Response({'error': 'This code has expired. Please request a new one.'},
                        status=status.HTTP_400_BAD_REQUEST)

    users_collection.update_one(
        {'_id': user['_id']},
        {'$set': {'password': make_password(new_password),
                  'password_encrypted': encrypt_password(new_password)}}
    )
    return Response({'message': 'Your password has been changed. You can now log in.'}, status=status.HTTP_200_OK)

@api_view(['GET'])
def get_profile(request):
    user_id = get_authenticated_user(request)
    if not user_id:
        return Response({'error': 'Unauthorized access.'}, status=status.HTTP_401_UNAUTHORIZED)

    user = users_collection.find_one({'_id': ObjectId(user_id)}, {'password': 0, 'password_encrypted': 0})
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
