from .db import email_codes_collection, notes_collection, users_collection


def delete_user_and_data(user):
    """
    Removes an account and everything that belongs to it, so no orphaned
    child profile, routine or SOS history is left behind. Used by both the
    app's own "delete account" screen and the centre admin panel.
    """
    # Imported here: these apps' db modules import authentication.db.
    from dashboard.db import children_collection, sos_alerts_collection
    from routines.db import routines_collection

    user_id = str(user['_id'])

    child = children_collection.find_one({'user_id': user_id})
    if child:
        sos_alerts_collection.delete_many({'child_id': child['_id']})
        children_collection.delete_one({'_id': child['_id']})

    # A caregiver's account going away just unlinks it; the child stays.
    children_collection.update_many({'caregiver.user_id': user_id}, {'$unset': {'caregiver': ''}})

    routines_collection.delete_many({'user_id': user_id})
    notes_collection.delete_many({'user_id': user_id})
    email_codes_collection.delete_many({'email': user['email']})
    users_collection.delete_one({'_id': user['_id']})
