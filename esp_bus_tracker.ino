/*
 * TUA Bus Tracker - ESP32/ESP8266 GPS Tracker
 * Sends real-time bus position to TUA Transit Server
 * 
 * Hardware Required:
 * - ESP32 or ESP8266
 * - NEO-6M GPS Module (or any serial GPS)
 * 
 * Connections:
 * GPS TX -> ESP RX (GPIO16 for ESP8266, GPIO16 for ESP32)
 * GPS RX -> ESP TX (GPIO17 for ESP8266, GPIO17 for ESP32)
 * GPS VCC -> 3.3V
 * GPS GND -> GND
 */

#include <ESP8266WiFi.h>  // For ESP8266
// #include <WiFi.h>      // For ESP32
#include <SoftwareSerial.h>
#include <ArduinoJson.h>

// ===== CONFIGURATION =====
// WiFi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration
const char* serverHost = "denisa-g1t.github.io";
const int serverPort = 443;  // HTTPS port
const String serverPath = "/tirana-bus-tracker/api/esp_receiver.php";

// Bus Configuration - CHANGE THIS FOR EACH BUS
const String deviceId = "TUA-501";     // Bus ID (TUA-501, TUA-502, etc.)
const String busLine = "L5";           // Bus line (L5, L7, L12, L2, L9)
const int busNumber = 5;               // Line number

// GPS Configuration
#define GPS_RX_PIN D6    // GPIO12 for ESP8266, change for ESP32
#define GPS_TX_PIN D7    // GPIO13 for ESP8266, change for ESP32
SoftwareSerial gpsSerial(GPS_RX_PIN, GPS_TX_PIN);

// Update interval (milliseconds)
const unsigned long UPDATE_INTERVAL = 5000;  // Send data every 5 seconds

// ===== GPS Data Variables =====
float currentLat = 0.0;
float currentLon = 0.0;
float currentSpeed = 0.0;
int satellites = 0;
bool gpsFixed = false;

// ===== Timing Variables =====
unsigned long lastUpdate = 0;
unsigned long lastGpsRead = 0;

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600);
  
  Serial.println();
  Serial.println("TUA Bus Tracker v1.0");
  Serial.print("Device ID: ");
  Serial.println(deviceId);
  Serial.print("Bus Line: ");
  Serial.println(busLine);
  
  // Connect to WiFi
  connectToWiFi();
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connection failed - restarting");
    delay(5000);
    ESP.restart();
  }
}

void readGPS() {
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    
    // Parse NMEA sentences
    if (c == '$') {
      String sentence = gpsSerial.readStringUntil('\n');
      
      // GGA sentence - contains latitude, longitude, satellites
      if (sentence.startsWith("GGA")) {
        parseGGA(sentence);
      }
      // RMC sentence - contains speed
      else if (sentence.startsWith("RMC")) {
        parseRMC(sentence);
      }
    }
  }
}

void parseGGA(String sentence) {
  int comma1 = sentence.indexOf(',');
  int comma2 = sentence.indexOf(',', comma1 + 1);
  int comma3 = sentence.indexOf(',', comma2 + 1);
  int comma4 = sentence.indexOf(',', comma3 + 1);
  int comma5 = sentence.indexOf(',', comma4 + 1);
  int comma6 = sentence.indexOf(',', comma5 + 1);
  
  String timeStr = sentence.substring(comma1 + 1, comma2);
  String latStr = sentence.substring(comma2 + 1, comma3);
  String latDir = sentence.substring(comma3 + 1, comma4);
  String lonStr = sentence.substring(comma4 + 1, comma5);
  String lonDir = sentence.substring(comma5 + 1, comma6);
  String fixStr = sentence.substring(comma6 + 1, sentence.indexOf(',', comma6 + 1));
  
  satellites = sentence.substring(sentence.indexOf(',', comma6 + 1) + 1, sentence.indexOf(',', sentence.indexOf(',', comma6 + 1) + 1)).toInt();
  
  if (fixStr.toInt() > 0 && latStr.length() > 0 && lonStr.length() > 0) {
    // Convert lat/lon from DDMM.MMMM to Decimal Degrees
    float latDeg = latStr.substring(0, 2).toFloat();
    float latMin = latStr.substring(2).toFloat();
    currentLat = latDeg + (latMin / 60.0);
    if (latDir == "S") currentLat = -currentLat;
    
    float lonDeg = lonStr.substring(0, 3).toFloat();
    float lonMin = lonStr.substring(3).toFloat();
    currentLon = lonDeg + (lonMin / 60.0);
    if (lonDir == "W") currentLon = -currentLon;
    
    gpsFixed = true;
  } else {
    gpsFixed = false;
  }
}

void parseRMC(String sentence) {
  int comma1 = sentence.indexOf(',');
  int comma2 = sentence.indexOf(',', comma1 + 1);
  int comma3 = sentence.indexOf(',', comma2 + 1);
  int comma4 = sentence.indexOf(',', comma3 + 1);
  int comma5 = sentence.indexOf(',', comma4 + 1);
  int comma6 = sentence.indexOf(',', comma5 + 1);
  int comma7 = sentence.indexOf(',', comma6 + 1);
  
  String speedStr = sentence.substring(comma7 + 1, sentence.indexOf(',', comma7 + 1));
  currentSpeed = speedStr.toFloat() * 1.852;  // Convert knots to km/h
}

void sendBusData() {
  if (!gpsFixed) {
    Serial.println("No GPS fix - waiting...");
    return;
  }
  
  // Create JSON payload
  StaticJsonDocument<256> doc;
  doc["device_id"] = deviceId;
  doc["bus_line"] = busLine;
  doc["bus_number"] = busNumber;
  doc["lat"] = currentLat;
  doc["lon"] = currentLon;
  doc["speed"] = currentSpeed;
  doc["satellites"] = satellites;
  doc["timestamp"] = time(nullptr);
  
  String jsonData;
  serializeJson(doc, jsonData);
  
  Serial.print("Sending data: ");
  Serial.println(jsonData);
  
  // Send to server
  WiFiClientSecure client;
  client.setInsecure();  // Skip SSL verification for testing
  
  if (client.connect(serverHost, serverPort)) {
    Serial.println("Connected to server");
    
    // Send HTTP POST request
    client.print("POST ");
    client.print(serverPath);
    client.println(" HTTP/1.1");
    client.print("Host: ");
    client.println(serverHost);
    client.println("Content-Type: application/json");
    client.print("Content-Length: ");
    client.println(jsonData.length());
    client.println();
    client.println(jsonData);
    
    // Read response
    unsigned long timeout = millis();
    while (client.available() == 0) {
      if (millis() - timeout > 5000) {
        Serial.println("Server response timeout");
        client.stop();
        return;
      }
    }
    
    while (client.available()) {
      String line = client.readStringUntil('\n');
      Serial.println(line);
    }
    
    client.stop();
    Serial.println("Data sent successfully");
  } else {
    Serial.println("Connection to server failed");
  }
}

void loop() {
  // Read GPS data continuously
  readGPS();
  
  // Send data at interval
  if (millis() - lastUpdate >= UPDATE_INTERVAL) {
    lastUpdate = millis();
    sendBusData();
  }
  
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected - reconnecting");
    connectToWiFi();
  }
}
