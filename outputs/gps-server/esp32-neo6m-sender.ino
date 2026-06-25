/*
  AeroSwift - Envio de GPS NEO-6M para o servidor em tempo real

  Placa: ESP32
  Biblioteca: TinyGPSPlus
  Ligacao sugerida:
  - NEO-6M VCC -> 3V3 ou 5V, conforme o modulo
  - NEO-6M GND -> GND
  - NEO-6M TX  -> GPIO 16 do ESP32
  - NEO-6M RX  -> GPIO 17 do ESP32, opcional
*/

#include <TinyGPSPlus.h>
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_NAME = "NOME_DO_WIFI";
const char* WIFI_PASS = "SENHA_DO_WIFI";
const char* SERVER_URL = "http://SEU_IP_DO_COMPUTADOR:8080/api/location";

TinyGPSPlus gps;
HardwareSerial gpsSerial(2);
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, 16, 17);

  WiFi.begin(WIFI_NAME, WIFI_PASS);
  Serial.print("Conectando no Wi-Fi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("IP do ESP32: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  if (millis() - lastSend >= 2000 && gps.location.isValid() && WiFi.status() == WL_CONNECTED) {
    lastSend = millis();
    sendLocation();
  }
}

void sendLocation() {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String body = "{";
  body += "\"lat\":" + String(gps.location.lat(), 7) + ",";
  body += "\"lng\":" + String(gps.location.lng(), 7) + ",";
  body += "\"speed\":" + String(gps.speed.kmph(), 2) + ",";
  body += "\"satellites\":" + String(gps.satellites.value()) + ",";
  body += "\"altitude\":" + String(gps.altitude.meters(), 2);
  body += "}";

  int status = http.POST(body);
  Serial.print("POST ");
  Serial.print(status);
  Serial.print(" -> ");
  Serial.println(body);
  http.end();
}
