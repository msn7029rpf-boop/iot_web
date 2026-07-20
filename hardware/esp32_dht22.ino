/*
 * ======================================================================================
 * 📡 ESP32 + DHT22 IoT Telemetry Code
 * Project: ระบบรายงานสภาพแวดล้อม Real-time IoT Dashboard
 * Target Endpoint: https://iot-web-nine.vercel.app/api/environment/telemetry
 * ======================================================================================
 * 
 * 🛠️ การต่อสายฮาร์ดแวร์ (Hardware Wiring):
 * - VCC  (DHT22) -> 3.3V หรือ 5V ของ ESP32
 * - GND  (DHT22) -> GND ของ ESP32
 * - DATA (DHT22) -> GPIO 4 ของ ESP32 (พร้อมต่อตัวต้านทาน Pull-up 10k โอห์ม ระหว่าง VCC กับ DATA)
 * 
 * 📚 ไลบรารีที่ต้องติดตั้งใน Arduino IDE (Library Manager):
 * 1. "DHT sensor library" โดย Adafruit
 * 2. "Adafruit Unified Sensor" โดย Adafruit
 * 3. "ArduinoJson" โดย Benoit Blanchon (แนะนำ Version 6.x หรือ 7.x)
 * ======================================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// -----------------------------------------------------------------------------
// 1. ตั้งค่า WiFi (เปลี่ยนเป็นชื่อและรหัสผ่าน WiFi ของคุณ)
// -----------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_NAME";        // ชื่อ WiFi
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // รหัสผ่าน WiFi

// -----------------------------------------------------------------------------
// 2. ตั้งค่าการเชื่อมต่อ API Server (Vercel Production Endpoint)
// -----------------------------------------------------------------------------
const char* API_ENDPOINT  = "https://iot-web-nine.vercel.app/api/environment/telemetry";

// -----------------------------------------------------------------------------
// 3. ตั้งค่าพินและประเภทของเซนเซอร์ DHT
// -----------------------------------------------------------------------------
#define DHTPIN 4          // พิน DATA ของ DHT22 ต่อเข้ากับ GPIO 4
#define DHTTYPE DHT22     // ประเภทเซนเซอร์ (DHT22 / AM2302)

DHT dht(DHTPIN, DHTTYPE);

// กำหนดรอบการส่งข้อมูลทุกๆ 10 วินาที (10,000 มิลลิวินาที)
const unsigned long SEND_INTERVAL_MS = 10000;
unsigned long lastSendTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=========================================");
  Serial.println("🚀 ESP32 IoT Environment Telemetry Client");
  Serial.println("=========================================");

  // เริ่มต้นทำงานเซนเซอร์ DHT
  dht.begin();
  Serial.println("✅ เซนเซอร์ DHT22 เริ่มทำงานเรียบร้อยแล้ว");

  // เชื่อมต่อ WiFi
  connectToWiFi();
}

void loop() {
  // ตรวจสอบการเชื่อมต่อ WiFi หากหลุดให้พยายามต่อใหม่
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  // ส่งข้อมูลทุกๆ 10 วินาที
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS || lastSendTime == 0) {
    lastSendTime = currentMillis;
    readAndSendSensorData();
  }
}

// -----------------------------------------------------------------------------
// ฟังก์ชันเชื่อมต่อ WiFi
// -----------------------------------------------------------------------------
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
    Serial.print("📡 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ ไม่สามารถเชื่อมต่อ WiFi ได้ กรุณาตรวจสอบชื่อและรหัสผ่าน");
  }
}

// -----------------------------------------------------------------------------
// ฟังก์ชันอ่านค่าเซนเซอร์ DHT22 และส่งข้อมูลผ่าน HTTP POST ไปยัง Server
// -----------------------------------------------------------------------------
void readAndSendSensorData() {
  // อ่านค่าความชื้นและอุณหภูมิจาก DHT22
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature(); // หน่วยองศาเซลเซียส (°C)

  // ตรวจสอบว่าอ่านค่าสำเร็จหรือไม่ (NaN = Not a Number)
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("⚠️ อ่านค่าจากเซนเซอร์ DHT22 ไม่สำเร็จ! (กรุณาเช็กการต่อสาย)");
    return;
  }

  Serial.println("-----------------------------------------");
  Serial.printf("📊 ค่าที่อ่านได้: อุณหภูมิ = %.1f °C | ความชื้น = %.1f %%RH\n", temperature, humidity);

  // สร้าง JSON Payload
  StaticJsonDocument<128> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // ส่งข้อมูลไปยัง API Server ด้วย HTTP POST
  HTTPClient http;
  http.begin(API_ENDPOINT);
  http.addHeader("Content-Type", "application/json");

  Serial.print("🚀 กำลังส่งข้อมูลไปยัง: ");
  Serial.println(API_ENDPOINT);

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("✅ ส่งข้อมูลสำเร็จ! Response Code: %d\n", httpResponseCode);
    Serial.print("📩 ตอบกลับจาก Server: ");
    Serial.println(response);
  } else {
    Serial.printf("❌ เกิดข้อผิดพลาดในการส่งข้อมูล! HTTP Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end(); // คืนทรัพยากร
}
