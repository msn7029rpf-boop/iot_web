/*
 * 📡 ESP32 + DHT22 IoT Telemetry Code
 * Project: ระบบรายงานสภาพแวดล้อม Real-time IoT Dashboard
 * Target Endpoint: https://iot-web-nine.vercel.app/api/environment/telemetry
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// -----------------------------------------------------------------------------
// 1. ตั้งค่า WiFi (เปลี่ยนเป็นชื่อและรหัสผ่าน WiFi ของคุณ)
// -----------------------------------------------------------------------------
const char* WIFI_SSID     = "Maesamai";        // 👈 แก้ไขเป็นชื่อ WiFi
const char* WIFI_PASSWORD = "50327029";    // 👈 แก้ไขเป็นรหัสผ่าน WiFi

// -----------------------------------------------------------------------------
// 2. ตั้งค่าการเชื่อมต่อ API Server (Vercel Production Endpoint)
// -----------------------------------------------------------------------------
const char* API_ENDPOINT  = "https://iot-web-nine.vercel.app/api/environment/telemetry";

// -----------------------------------------------------------------------------
// 3. ตั้งค่าพินและประเภทของเซนเซอร์ DHT
// -----------------------------------------------------------------------------
#define DHTPIN 4          // พิน DATA ของ DHT22 ต่อเข้ากับ GPIO 4
#define DHTTYPE DHT22     // ประเภทเซนเซอร์

DHT dht(DHTPIN, DHTTYPE);

const unsigned long SEND_INTERVAL_MS = 10000; // ส่งข้อมูลทุกๆ 10 วินาที
unsigned long lastSendTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n🚀 ESP32 IoT Environment Telemetry Client Starting...");
  dht.begin();
  connectToWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS || lastSendTime == 0) {
    lastSendTime = currentMillis;
    readAndSendSensorData();
  }
}

void connectToWiFi() {
  Serial.print("🌐 กำลังเชื่อมต่อ WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ เชื่อมต่อ WiFi สำเร็จแล้ว!");
  } else {
    Serial.println("\n❌ ไม่สามารถเชื่อมต่อ WiFi ได้ กรุณาเช็กชื่อและรหัสผ่าน");
  }
}

void readAndSendSensorData() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("⚠️ อ่านค่าจาก DHT22 ไม่สำเร็จ! (กรุณาเช็กการต่อสาย)");
    return;
  }

  Serial.printf("📊 ค่าจริงจากเซนเซอร์: Temp = %.1f °C | Humidity = %.1f %%RH\n", temperature, humidity);

  StaticJsonDocument<128> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  HTTPClient http;
  http.begin(API_ENDPOINT);
  http.addHeader("Content-Type", "application/json");

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.printf("✅ ส่งข้อมูลขึ้น Vercel สำเร็จ! HTTP Code: %d\n", httpResponseCode);
  } else {
    Serial.printf("❌ ส่งข้อมูลไม่สำเร็จ HTTP Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}
