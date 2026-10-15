from django.core.management.base import BaseCommand, CommandError

from authentication.db import users_collection
from dashboard.db import children_collection
from dashboard.views import pair_device


class Command(BaseCommand):
    """
    Links an SOS hardware device to a child and prints the key to paste into
    the ESP8266 sketch (DEVICE_KEY). The key is shown only once; only its
    hash is stored. Running it again for the same child issues a new key and
    the old one stops working (e.g. if a device is lost).
    Centre staff can do the same from the admin panel (/centre/devices/pair/).
    """

    help = "Pair an SOS device with a child's account and print its device key."

    def add_arguments(self, parser):
        parser.add_argument('email', help="Email of the child's (parent's) VoiceMe account")
        parser.add_argument('--device-id', default='SOS-DEVICE-01', help='Label for the device')

    def handle(self, *args, **options):
        user = users_collection.find_one({'email': options['email']})
        if not user:
            raise CommandError(f"No account with email {options['email']}.")
        child = children_collection.find_one({'user_id': str(user['_id'])})
        if not child:
            raise CommandError('That account has no child profile yet. Register the child in the app first.')

        key = pair_device(child, options['device_id'])

        self.stdout.write(self.style.SUCCESS(f"Paired {options['device_id']} with {child.get('name') or 'child'}."))
        self.stdout.write('Put this in the ESP8266 sketch (it will not be shown again):')
        self.stdout.write(f'  #define DEVICE_KEY "{key}"')
