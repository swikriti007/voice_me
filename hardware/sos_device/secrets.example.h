// Copy this file to "secrets.h" (same folder) and fill in your values.
// secrets.h is git-ignored so passwords and the device key never get uploaded.

#define WIFI_SSID      "YourWiFiName"
#define WIFI_PASSWORD  "YourWiFiPassword"

// Address of the VoiceMe Django backend, WITHOUT a trailing slash.
//  - Testing on the same Wi-Fi: your laptop's IP, e.g. "http://192.168.1.25:8000"
//    (find it with `ipconfig`, and start Django with: python manage.py runserver 0.0.0.0:8000)
//  - Backend hosted online: e.g. "https://voiceme-backend.example.com"
#define BACKEND_URL    "http://192.168.1.25:8000"

// Printed by: python manage.py pair_device <child-account-email>
#define DEVICE_KEY     "PASTE_KEY_FROM_PAIR_DEVICE"
