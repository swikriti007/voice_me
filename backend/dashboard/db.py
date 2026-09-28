from pymongo import ASCENDING
from pymongo.errors import PyMongoError

from authentication.db import db

# Collections
children_collection = db['children']
sos_alerts_collection = db['sos_alerts']

try:
    # Sparse: older docs saved before connect codes existed have no such field.
    children_collection.create_index([('connect_code', ASCENDING)], unique=True, sparse=True)
    # The SOS hardware authenticates by the hash of its device key.
    children_collection.create_index([('device.key_hash', ASCENDING)], unique=True, sparse=True)
    sos_alerts_collection.create_index([('child_id', ASCENDING), ('created_at', ASCENDING)])
except PyMongoError:
    pass
