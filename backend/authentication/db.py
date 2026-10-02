import os
from pymongo import MongoClient, ASCENDING
from pymongo.errors import PyMongoError
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/voiceme_db")
FALLBACK_LOCAL_URI = "mongodb://localhost:27017/voiceme_db"
# Off by default: quietly switching to a local database splits accounts per
# machine, so sign-ups on one PC never show up in the centre admin on another.
ALLOW_LOCAL_FALLBACK = os.getenv("MONGO_ALLOW_LOCAL_FALLBACK", "False").lower() == "true"

if MONGO_URI.startswith("mongodb+srv://"):
    # Some home routers time out on the SRV lookup "mongodb+srv" needs, so ask
    # public DNS first and keep the system's own servers as a fallback.
    import dns.resolver
    resolver = dns.resolver.Resolver()
    resolver.nameservers = ["8.8.8.8", "1.1.1.1"] + resolver.nameservers
    dns.resolver.default_resolver = resolver

client = None
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    client.admin.command('ping')
except Exception as error:
    if not ALLOW_LOCAL_FALLBACK:
        raise RuntimeError(
            f"Could not connect to MongoDB at MONGO_URI ({error}). If this is Atlas, "
            "add this machine's IP under Network Access in the Atlas dashboard. "
            "Set MONGO_ALLOW_LOCAL_FALLBACK=True in backend/.env to use a local database instead."
        ) from error
    client = MongoClient(FALLBACK_LOCAL_URI, serverSelectionTimeoutMS=5000)

# Use a local database name regardless of which URI worked.
db = client['voiceme_db']

# Collections
users_collection = db['users']
notes_collection = db['voice_notes']
# Short-lived 6-digit codes emailed for sign-up verification and password
# reset. One live code per (email, purpose); a new request replaces the old.
email_codes_collection = db['email_codes']

# Enforce Unique Email Constraint directly in MongoDB
try:
    users_collection.create_index([("email", ASCENDING)], unique=True)
    email_codes_collection.create_index([("email", ASCENDING), ("purpose", ASCENDING)], unique=True)
    # MongoDB deletes each code on its own once it expires.
    email_codes_collection.create_index("expires_at", expireAfterSeconds=0)
except PyMongoError:
    # The server may not be running yet; the app should still boot for local development.
    pass
