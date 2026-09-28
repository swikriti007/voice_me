from django.urls import path
from .views import (
    child_profile, gps_status, trigger_sos, connect_caregiver, caregiver_dashboard,
    device_location, device_sos, sos_latest, sos_resolve,
)

urlpatterns = [
    path('child/profile/', child_profile, name='child-profile'),
    path('child/gps/', gps_status, name='child-gps'),
    path('sos/trigger/', trigger_sos, name='sos-trigger'),
    path('sos/latest/', sos_latest, name='sos-latest'),
    path('sos/resolve/', sos_resolve, name='sos-resolve'),
    path('device/location/', device_location, name='device-location'),
    path('device/sos/', device_sos, name='device-sos'),
    path('caregiver/connect/', connect_caregiver, name='caregiver-connect'),
    path('caregiver/dashboard/', caregiver_dashboard, name='caregiver-dashboard'),
]
