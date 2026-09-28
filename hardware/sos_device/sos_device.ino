/*
 * ESP8266 GPS SOS Alert System  (VoiceMe)
 * ------------------------------------------------------------
 * Hardware : NodeMCU / Wemos D1 Mini (ESP8266)
 *            NEO-6M GPS, 0.96" 128x64 I2C OLED (SH1106 or SSD1306), push button, buzzer (optional)
 * Backend  : VoiceMe Django API (alerts show in the Parent & Caregiver app)
 * Location : OpenStreetMap Nominatim reverse geocoding (place name)
 *
 * SETUP
 *   1. Copy secrets.example.h to secrets.h and fill in Wi-Fi, BACKEND_URL and DEVICE_KEY.
 *   2. DEVICE_KEY comes from:  python manage.py pair_device <child-account-email>
 *   3. Start Django with:  python manage.py runserver 0.0.0.0:8000
 *   4. The ESP8266 and the laptop must be on the same Wi-Fi.
 *
 * WIRING
 *   NEO-6M  TX  -> D5 (GPIO14)   (ESP RX)
 *   NEO-6M  RX  -> D6 (GPIO12)   (ESP TX)
 *   NEO-6M  VCC -> 3V3 (or 5V if your module has a regulator), GND -> GND
 *   OLED    SDA -> D2 (GPIO4)
 *   OLED    SCL -> D1 (GPIO5)
 *   OLED    VCC -> 3V3, GND -> GND
 *   Button  one leg -> D7 (GPIO13), other leg -> GND (internal pull-up used)
 *   Buzzer (optional, active) -> D8 (GPIO15) via transistor/resistor, other side GND
 *          (D8 must be LOW at power-on or the board will not boot)
 *
 * LIBRARIES (Library Manager)
 *   U8g2               (oliver)          - OLED, works with SH1106 and SSD1306
 *   TinyGPSPlus        (Mikal Hart)
 *   ArduinoJson        (version 6.x, e.g. 6.21.5)
 *   ESP8266 board package (built-in WiFi/HTTPClient)
 *
 * USAGE
 *   Hold the button for 1.5 seconds to send an SOS (prevents accidental sends).
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <ArduinoJson.h>

#include "secrets.h"   // WIFI_SSID, WIFI_PASSWORD, BACKEND_URL, DEVICE_KEY

// ===================== USER CONFIGURATION =====================
#define DEVICE_ID        "SOS-DEVICE-01"     // unique per device

// OLED chip. Most cheap 0.96" modules are SH1106 -> keep 1.
// If the screen stays blank or looks wrong, change to 0 (SSD1306).
#define OLED_IS_SH1106   1

// Time zone offset from UTC in seconds. Nepal = UTC+5:45 = 20700
#define TZ_OFFSET_SEC    20700L

// Timing
#define HOLD_TIME_MS         1500UL     // hold button this long to trigger SOS
#define SOS_COOLDOWN_MS      10000UL    // min gap between two SOS sends
#define LIVE_UPDATE_MS       30000UL    // send live location to the backend every 30 s
#define GEOCODE_INTERVAL_MS  60000UL    // refresh place name at most every 60 s
#define GEOCODE_MIN_MOVE_M   100.0      // ...or sooner if moved this far
#define OLED_REFRESH_MS      500UL
#define GPS_DEBUG_RAW        false
// ==============================================================

// ---------- Pins ----------
#define GPS_RX_PIN     14   // D5  <- GPS TX
#define GPS_TX_PIN     12   // D6  -> GPS RX
#define BUTTON_PIN     13   // D7
#define BUZZER_PIN     15   // D8 (optional)
#define LED_PIN        LED_BUILTIN   // active LOW on ESP8266
#define OLED_SDA_PIN   4    // D2
#define OLED_SCL_PIN   5    // D1

// ---------- OLED (U8g2, full frame buffer) ----------
#define SCREEN_WIDTH   128
#if OLED_IS_SH1106
U8G2_SH1106_128X64_NONAME_F_HW_I2C  display(U8G2_R0, U8X8_PIN_NONE, OLED_SCL_PIN, OLED_SDA_PIN);
#else
U8G2_SSD1306_128X64_NONAME_F_HW_I2C display(U8G2_R0, U8X8_PIN_NONE, OLED_SCL_PIN, OLED_SDA_PIN);
#endif
#define FONT_SMALL  u8g2_font_6x10_tf    // 21 characters per line
#define FONT_BIG    u8g2_font_10x20_tf   // 12 characters per line

// ---------- GPS ----------
SoftwareSerial gpsSerial(GPS_RX_PIN, GPS_TX_PIN);
TinyGPSPlus gps;

// ---------- State ----------
String   placeName        = "Locating...";
double   lastGeoLat       = 0, lastGeoLng = 0;
unsigned long lastGeoTime = 0;
bool     hasGeocoded      = false;

double   lastLat = 0, lastLng = 0;     // last valid fix (kept if GPS is lost)
bool     everHadFix = false;

unsigned long pressStart      = 0;
bool     sosLatched           = false;
unsigned long lastSosTime     = 0;
unsigned long lastLiveUpdate  = 0;
unsigned long lastOled        = 0;
unsigned long lastWifiTry     = 0;
unsigned long lastDebugPrint  = 0;

String   statusMsg = "";               // short message shown on OLED bottom
unsigned long statusUntil = 0;

// ============================================================
//                       HELPER FUNCTIONS
// ============================================================

void setStatus(const String &msg, unsigned long ms = 4000) {
  statusMsg = msg;
  statusUntil = millis() + ms;
}

void beep(int times, int onMs = 120, int offMs = 100) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    digitalWrite(LED_PIN, LOW);
    delay(onMs);
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, HIGH);
    delay(offMs);
  }
}

// Feed GPS parser - call as often as possible
void feedGPS() {
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    if (GPS_DEBUG_RAW) Serial.write(c);
    gps.encode(c);
  }

  if (gps.location.isValid() && gps.location.age() < 5000) {
    lastLat = gps.location.lat();
    lastLng = gps.location.lng();
    everHadFix = true;
  }
}

bool gpsFixNow() {
  return gps.location.isValid() && gps.location.age() < 5000;
}

// Local time HH:MM:SS string from GPS UTC time + timezone
String getLocalTimeStr() {
  if (!gps.time.isValid()) return "--:--:--";
  long secs = gps.time.hour() * 3600L + gps.time.minute() * 60L + gps.time.second();
  secs = (secs + TZ_OFFSET_SEC) % 86400L;
  if (secs < 0) secs += 86400L;
  char buf[12];
  snprintf(buf, sizeof(buf), "%02ld:%02ld:%02ld", secs / 3600, (secs % 3600) / 60, secs % 60);
  return String(buf);
}

String getUtcDateTimeStr() {
  if (!gps.date.isValid() || !gps.time.isValid()) return "";
  char buf[24];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
           gps.date.year(), gps.date.month(), gps.date.day(),
           gps.time.hour(), gps.time.minute(), gps.time.second());
  return String(buf);
}

// ---------- OLED helpers ----------
// Draws text horizontally centred at baseline y with the current font.
void drawCentered(int y, const char *text) {
  int x = (SCREEN_WIDTH - display.getStrWidth(text)) / 2;
  display.drawStr(x < 0 ? 0 : x, y, text);
}

// Full-screen message: big line + optional small line underneath.
void showMessage(const char *big, const char *small = nullptr) {
  display.clearBuffer();
  display.setFont(FONT_BIG);
  drawCentered(28, big);
  if (small) {
    display.setFont(FONT_SMALL);
    drawCentered(48, small);
  }
  display.sendBuffer();
}

// ---------- WiFi ----------
void connectWiFi(bool showOnOled) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    if (showOnOled) {
      display.clearBuffer();
      display.setFont(FONT_SMALL);
      display.drawStr(0, 10, "Connecting WiFi...");
      display.drawStr(0, 22, WIFI_SSID);
      display.sendBuffer();
    }
    delay(300);
    feedGPS();
  }
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiTry < 10000) return;
  lastWifiTry = millis();
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ---------- Reverse geocoding (place name) ----------
void updatePlaceName(bool force = false) {
  if (!gpsFixNow() || WiFi.status() != WL_CONNECTED) return;

  double moved = TinyGPSPlus::distanceBetween(lastLat, lastLng, lastGeoLat, lastGeoLng);
  bool due = (millis() - lastGeoTime > GEOCODE_INTERVAL_MS) || (moved > GEOCODE_MIN_MOVE_M);
  if (!force && hasGeocoded && !due) return;
  if (!force && !hasGeocoded && millis() - lastGeoTime < 8000 && lastGeoTime != 0) return;

  lastGeoTime = millis();

  BearSSL::WiFiClientSecure client;
  client.setInsecure();
  client.setBufferSizes(1024, 512);
  HTTPClient http;
  http.setTimeout(6000);

  String url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=";
  url += String(lastLat, 6);
  url += "&lon=";
  url += String(lastLng, 6);

  if (!http.begin(client, url)) return;
  http.addHeader("User-Agent", "ESP8266-SOS-Tracker/1.0");
  http.addHeader("Accept", "application/json");
  http.addHeader("Accept-Language", "en");   // English names: the OLED font can't draw Nepali

  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    // Only keep the fields we need to save RAM
    StaticJsonDocument<256> filter;
    filter["address"]["road"] = true;
    filter["address"]["neighbourhood"] = true;
    filter["address"]["suburb"] = true;
    filter["address"]["village"] = true;
    filter["address"]["town"] = true;
    filter["address"]["city"] = true;
    filter["address"]["county"] = true;
    filter["address"]["state"] = true;

    DynamicJsonDocument doc(1536);
    DeserializationError err = deserializeJson(doc, http.getStream(),
                                               DeserializationOption::Filter(filter));
    if (!err) {
      JsonObject a = doc["address"];
      String part1 = a["road"] | a["neighbourhood"] | a["suburb"] | "";
      String part2 = a["village"] | a["town"] | a["city"] | a["county"] | "";
      String name = part1;
      if (part1.length() && part2.length()) name += ", ";
      name += part2;
      if (name.length() == 0) name = a["state"] | "Unknown area";
      placeName = name;
      hasGeocoded = true;
      lastGeoLat = lastLat;
      lastGeoLng = lastLng;
    }
  }
  http.end();
}

// ---------- I2C scanner / OLED diagnostics ----------
// Returns the first I2C address found (the OLED), or 0 if nothing answered.
byte scanI2C() {
  Serial.println(F("[I2C] Scanning bus..."));
  byte first = 0;
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.print(F("[I2C] Found device at 0x"));
      if (address < 16) Serial.print('0');
      Serial.println(address, HEX);
      if (first == 0) first = address;
    }
  }
  if (first == 0) Serial.println(F("[I2C] No I2C devices found. Check OLED VCC, GND, SDA=D2, SCL=D1."));
  else Serial.println(F("[I2C] Scan complete."));
  return first;
}

// ---------- VoiceMe backend ----------
// Sends JSON to the Django backend with this device's key.
// Returns the HTTP status code (negative number = could not connect).
int backendPost(const String &path, const String &payload) {
  if (WiFi.status() != WL_CONNECTED) return -1;

  String url = String(BACKEND_URL) + path;
  Serial.println();
  Serial.println(F("[Backend] Request"));
  Serial.print(F("  URL: ")); Serial.println(url);
  Serial.print(F("  Payload: ")); Serial.println(payload);

  // http:// for a laptop on the same Wi-Fi, https:// for a backend hosted online
  WiFiClient plainClient;
  BearSSL::WiFiClientSecure secureClient;
  bool https = url.startsWith("https://");
  if (https) {
    secureClient.setInsecure();
    secureClient.setBufferSizes(1024, 1024);
  }

  HTTPClient http;
  http.setTimeout(8000);
  bool began = https ? http.begin(secureClient, url) : http.begin(plainClient, url);
  if (!began) {
    Serial.println(F("  ERROR: HTTP begin failed"));
    return -1;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.POST(payload);

  Serial.print(F("  HTTP code: ")); Serial.println(code);
  Serial.print(F("  Response: ")); Serial.println(http.getString());
  http.end();

  if (code == 401) Serial.println(F("  401: Wrong DEVICE_KEY - run pair_device again and paste the new key."));
  if (code == 404) Serial.println(F("  404: Wrong BACKEND_URL - check the IP and port."));
  if (code < 0)    Serial.println(F("  Cannot reach backend - is Django running with 0.0.0.0:8000 on the same Wi-Fi?"));
  return code;
}

String buildPayload() {
  StaticJsonDocument<512> doc;
  doc["deviceId"]   = DEVICE_ID;
  doc["lat"]        = serialized(String(lastLat, 6));
  doc["lng"]        = serialized(String(lastLng, 6));
  doc["gpsFix"]     = gpsFixNow();
  // Empty until the first lookup, so the app never shows "Locating..." as a place
  doc["place"]      = hasGeocoded ? placeName : "";
  doc["localTime"]  = getLocalTimeStr();
  doc["utcTime"]    = getUtcDateTimeStr();
  doc["satellites"] = gps.satellites.isValid() ? (int)gps.satellites.value() : 0;
  doc["speedKmph"]  = gps.speed.isValid() ? gps.speed.kmph() : 0.0;
  doc["rssi"]       = WiFi.RSSI();

  String out;
  serializeJson(doc, out);
  return out;
}

// ---------- SOS ----------
void sendSOS() {
  showMessage("SENDING", "SOS...");

  beep(2, 200, 100);

  // Refresh place name once (only if we have GPS + WiFi)
  if (gpsFixNow()) updatePlaceName(true);

  bool ok = false;
  for (int attempt = 1; attempt <= 3 && !ok; attempt++) {
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.reconnect();
      unsigned long t0 = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - t0 < 5000) { delay(100); feedGPS(); }
    }
    int code = backendPost("/api/device/sos/", buildPayload());
    ok = (code == HTTP_CODE_CREATED);   // backend replies 201 when the SOS is saved
    if (code == 401) break;             // wrong key: retrying won't help
    if (!ok) delay(800);
    feedGPS();
  }

  if (ok) {
    setStatus("SOS SENT OK", 6000);
    beep(3, 300, 150);
  } else {
    setStatus("SOS FAILED-RETRY", 6000);
    beep(1, 1000, 0);
  }
  lastSosTime = millis();
}

// ---------- OLED UI ----------
void drawScreen() {
  display.clearBuffer();
  display.setFont(FONT_SMALL);

  // Row 0: status icons
  String top = WiFi.status() == WL_CONNECTED ? "WiFi " : "noWiFi ";
  top += gpsFixNow() ? "GPS " : "noGPS ";
  top += "S:";
  top += gps.satellites.isValid() ? (int)gps.satellites.value() : 0;
  display.drawStr(0, 8, top.c_str());

  // Row 1: big time
  display.setFont(FONT_BIG);
  drawCentered(26, getLocalTimeStr().c_str());

  // Row 2-3: place name (wrapped to two lines, 21 chars each)
  display.setFont(FONT_SMALL);
  String p = placeName;
  if (p.length() > 42) p = p.substring(0, 42);
  display.drawStr(0, 37, p.substring(0, min((int)p.length(), 21)).c_str());
  if (p.length() > 21) {
    display.drawStr(0, 46, p.substring(21).c_str());
  }

  // Row 4: coordinates
  if (everHadFix) {
    String coords = String(lastLat, 5) + "," + String(lastLng, 5);
    display.drawStr(0, 55, coords.c_str());
  } else {
    display.drawStr(0, 55, "Waiting for GPS fix");
  }

  // Row 5: status message or hold hint
  if (millis() < statusUntil) {
    display.drawStr(0, 64, statusMsg.c_str());
  } else {
    display.drawStr(0, 64, "Hold BTN = SOS");
  }

  display.sendBuffer();
}

void drawHoldProgress(unsigned long held) {
  int w = map(constrain(held, 0UL, HOLD_TIME_MS), 0, HOLD_TIME_MS, 0, SCREEN_WIDTH);
  display.clearBuffer();
  display.setFont(FONT_BIG);
  drawCentered(20, "HOLD FOR");
  drawCentered(42, "SOS");
  display.drawFrame(0, 52, SCREEN_WIDTH, 10);
  display.drawBox(0, 52, w, 10);
  display.sendBuffer();
}

// ---------- Button handling ----------
void handleButton() {
  bool pressed = (digitalRead(BUTTON_PIN) == LOW);

  if (pressed) {
    if (pressStart == 0) pressStart = millis();
    unsigned long held = millis() - pressStart;

    if (held > 200 && !sosLatched) {
      drawHoldProgress(held);
    }
    if (held >= HOLD_TIME_MS && !sosLatched) {
      sosLatched = true;                                   // one trigger per press
      if (millis() - lastSosTime > SOS_COOLDOWN_MS || lastSosTime == 0) {
        sendSOS();
      } else {
        setStatus("Wait, cooldown...", 2000);
      }
    }
  } else {
    pressStart = 0;
    sosLatched = false;
  }
}

// ---------- Live tracking ----------
void pushLiveLocation() {
  if (millis() - lastLiveUpdate < LIVE_UPDATE_MS) return;
  // The backend only stores a live location from a current GPS fix
  if (WiFi.status() != WL_CONNECTED || !gpsFixNow()) return;
  lastLiveUpdate = millis();
  backendPost("/api/device/location/", buildPayload());
}

// ============================================================
//                          SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, HIGH);

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  byte oledAddr = scanI2C();

  // U8g2 wants the 8-bit address (7-bit address x 2). Most modules are 0x3C.
  display.setI2CAddress((oledAddr ? oledAddr : 0x3C) * 2);
  display.begin();
  Serial.println(OLED_IS_SH1106 ? F("[OLED] Started as SH1106.") : F("[OLED] Started as SSD1306."));

  showMessage("GPS SOS", "Starting...");
  delay(1200);

  connectWiFi(true);
  Serial.println(WiFi.status() == WL_CONNECTED ? "WiFi connected" : "WiFi failed (will retry)");
  beep(1, 100, 0);
}

// ============================================================
//                          LOOP
// ============================================================
void loop() {
  feedGPS();
  maintainWiFi();
  handleButton();

  // While the button is being held, handleButton() draws the progress screen
  if (pressStart == 0) {
    updatePlaceName();
    pushLiveLocation();

    if (millis() - lastDebugPrint >= 5000) {
      lastDebugPrint = millis();
      Serial.println();
      Serial.println(F("========== SYSTEM STATUS =========="));
      Serial.print(F("WiFi: ")); Serial.println(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");
      if (WiFi.status() == WL_CONNECTED) {
        Serial.print(F("IP: ")); Serial.println(WiFi.localIP());
        Serial.print(F("RSSI: ")); Serial.println(WiFi.RSSI());
      }
      Serial.print(F("GPS location valid: ")); Serial.println(gps.location.isValid() ? "YES" : "NO");
      Serial.print(F("GPS fix age ms: ")); Serial.println(gps.location.age());
      Serial.print(F("Satellites: ")); Serial.println(gps.satellites.isValid() ? String(gps.satellites.value()) : "N/A");
      Serial.print(F("Last lat/lng: ")); Serial.print(lastLat, 6); Serial.print(", "); Serial.println(lastLng, 6);
      Serial.print(F("GPS chars processed: ")); Serial.println(gps.charsProcessed());
      Serial.print(F("GPS failed checksum: ")); Serial.println(gps.failedChecksum());
      Serial.print(F("Place: ")); Serial.println(placeName);
      Serial.println(F("==================================="));

      if (gps.charsProcessed() < 10) {
        Serial.println(F("[GPS WARNING] No/very little GPS serial data. Check TX/RX, GND, power, and baud rate."));
      } else if (!gps.location.isValid()) {
        Serial.println(F("[GPS WARNING] GPS is receiving data but has no position fix. Test outdoors with clear sky."));
      }
    }

    if (millis() - lastOled >= OLED_REFRESH_MS) {
      lastOled = millis();
      drawScreen();
    }
  }
  yield();
}
