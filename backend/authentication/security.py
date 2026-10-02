import datetime
import hashlib
import hmac
import logging
import os
import re
import secrets

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from .db import email_codes_collection

logger = logging.getLogger(__name__)


# --- Email -----------------------------------------------------------------

# Accounts must use a Gmail address (e.g. "name@gmail.com"); anything else,
# like a bare "name@", is rejected at registration and login.
GMAIL_RE = re.compile(r'^[A-Za-z0-9._%+-]+@gmail\.com$', re.IGNORECASE)
INVALID_EMAIL_ERROR = 'Invalid email. Please use a Gmail address (example@gmail.com).'


def is_valid_gmail(email):
    return bool(GMAIL_RE.match((email or '').strip()))


def normalize_email(email):
    # Gmail addresses are case-insensitive, so store and look them up in one
    # form; otherwise "Name@gmail.com" and "name@gmail.com" become two accounts.
    return (email or '').strip().lower()


# --- Password policy ---------------------------------------------------------

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 14
PASSWORD_POLICY_ERROR = (
    f'Password must be {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} characters and include '
    'an uppercase letter, a lowercase letter and a special character.'
)


def password_policy_error(password):
    """None if `password` meets the policy, otherwise the message to show."""
    password = password or ''
    if not (PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH):
        return PASSWORD_POLICY_ERROR
    if not re.search(r'[A-Z]', password) or not re.search(r'[a-z]', password):
        return PASSWORD_POLICY_ERROR
    if not re.search(r'[^A-Za-z0-9]', password):
        return PASSWORD_POLICY_ERROR
    return None


# --- Centre-viewable password copy -----------------------------------------
#
# Login always checks the one-way hash in `password`. The autism centre asked
# to be able to look up a family's password from its admin panel, so a second
# copy is kept encrypted with CREDENTIALS_ENCRYPTION_KEY from backend/.env.
# Without that key the copy is unreadable, so the key must never be committed
# and should be backed up: losing it only hides the copies, logins still work.

def _fernet():
    key = os.getenv('CREDENTIALS_ENCRYPTION_KEY', '')
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except ValueError:
        logger.error('CREDENTIALS_ENCRYPTION_KEY in .env is not a valid Fernet key.')
        return None


def encrypt_password(password):
    f = _fernet()
    return f.encrypt(password.encode()).decode() if f else None


def decrypt_password(token):
    f = _fernet()
    if not f or not token:
        return None
    try:
        return f.decrypt(token.encode()).decode()
    except InvalidToken:
        return None


# --- Emailed 6-digit codes ---------------------------------------------------

CODE_TTL_MINUTES = 10
CODE_RESEND_SECONDS = 60
CODE_MAX_ATTEMPTS = 5

SIGNUP = 'signup'
PASSWORD_RESET = 'password_reset'

_CODE_EMAILS = {
    SIGNUP: (
        'Your Voice Me verification code',
        'Use this code to finish creating your Voice Me account:',
    ),
    PASSWORD_RESET: (
        'Your Voice Me password reset code',
        'We received a request to reset your Voice Me password. Use this code to choose a new one:',
    ),
}


def _hash_code(email, purpose, code):
    # Keyed with Django's SECRET_KEY: a 6-digit code has only a million
    # values, so a plain hash could be reversed from a leaked database.
    message = f'{email}|{purpose}|{code}'.encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def code_retry_after(email, purpose):
    """Seconds until another code may be sent to this email (0 = now)."""
    entry = email_codes_collection.find_one({'email': email, 'purpose': purpose})
    if not entry:
        return 0
    elapsed = (datetime.datetime.utcnow() - entry['created_at']).total_seconds()
    return max(0, int(CODE_RESEND_SECONDS - elapsed))


def send_code(email, purpose, name=None):
    """
    Emails a fresh code, replacing any earlier one for the same purpose.
    Raises if the email could not be sent, so the caller can say so instead
    of leaving the user waiting for a message that never arrives.
    """
    code = f'{secrets.randbelow(10**6):06d}'
    now = datetime.datetime.utcnow()
    email_codes_collection.replace_one(
        {'email': email, 'purpose': purpose},
        {
            'email': email,
            'purpose': purpose,
            'code_hash': _hash_code(email, purpose, code),
            'attempts': 0,
            'created_at': now,
            'expires_at': now + datetime.timedelta(minutes=CODE_TTL_MINUTES),
        },
        upsert=True,
    )

    subject, intro = _CODE_EMAILS[purpose]
    greeting = name or 'there'
    text_body = (
        f'Namaste {greeting},\n\n{intro}\n\n    {code}\n\n'
        f'The code stops working in {CODE_TTL_MINUTES} minutes.\n'
        'If you did not ask for this, you can ignore this email.'
    )
    html_body = (
        f'<p>Namaste {greeting},</p><p>{intro}</p>'
        f'<p style="font-size:30px;font-weight:700;letter-spacing:8px;font-family:monospace;'
        f'color:#28552F">{code}</p>'
        f'<p>The code stops working in {CODE_TTL_MINUTES} minutes. '
        'If you did not ask for this, you can ignore this email.</p>'
    )
    message = EmailMultiAlternatives(subject=subject, body=text_body, to=[email])
    message.attach_alternative(html_body, 'text/html')
    try:
        message.send(fail_silently=False)
    except Exception:
        email_codes_collection.delete_one({'email': email, 'purpose': purpose})
        raise


def check_code(email, purpose, code):
    """
    None if `code` is the live code for this email and purpose (it is then
    used up), otherwise the error to show. Wrong guesses are counted, and the
    code is burned after CODE_MAX_ATTEMPTS so it can't be brute-forced.
    """
    code = (code or '').strip()
    entry = email_codes_collection.find_one({'email': email, 'purpose': purpose})
    # MongoDB clears expired codes on its own schedule, so check the time here too.
    if not entry or entry['expires_at'] <= datetime.datetime.utcnow():
        return 'This code has expired. Please request a new one.'

    if not hmac.compare_digest(entry['code_hash'], _hash_code(email, purpose, code)):
        attempts = entry.get('attempts', 0) + 1
        if attempts >= CODE_MAX_ATTEMPTS:
            email_codes_collection.delete_one({'_id': entry['_id']})
            return 'Too many wrong attempts. Please request a new code.'
        email_codes_collection.update_one({'_id': entry['_id']}, {'$set': {'attempts': attempts}})
        return 'Incorrect code. Please check the email and try again.'

    email_codes_collection.delete_one({'_id': entry['_id']})
    return None
