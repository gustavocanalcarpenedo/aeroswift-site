/*
  AeroSwift - ESP32 lendo GPS da controladora F405 por MSP

  Use este arquivo se a F405 estiver com Betaflight ou iNav.
  O NEO-6M fica conectado na F405. O ESP32 le a telemetria da F405 e envia
  latitude/longitude para o servidor AeroSwift.

  Ligacao sugerida:
  - F405 GND      -> ESP32 GND
  - F405 UART TX  -> ESP32 GPIO 16
  - F405 UART RX  -> ESP32 GPIO 17

  Na F405:
  - Ative MSP na UART usada para falar com o ESP32.
  - O GPS deve aparecer funcionando no configurador do firmware.
*/

#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_NAME = "NOME_DO_WIFI";
const char* WIFI_PASS = "SENHA_DO_WIFI";
const char* SERVER_URL = "http://192.168.21.153:8080/api/location";

HardwareSerial fcSerial(2);
unsigned long lastRequest = 0;
unsigned long lastSend = 0;

const uint8_t MSP_RAW_GPS = 106;

void setup() {
  Serial.begin(115200);
  fcSerial.begin(115200, SERIAL_8N1, 16, 17);

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
  if (millis() - lastRequest > 500) {
    lastRequest = millis();
    requestMsp(MSP_RAW_GPS);
  }

  readMsp();
}

void requestMsp(uint8_t command) {
  uint8_t checksum = 0;

  fcSerial.write('$');
  fcSerial.write('M');
  fcSerial.write('<');
  fcSerial.write((uint8_t)0);
  checksum ^= 0;
  fcSerial.write(command);
  checksum ^= command;
  fcSerial.write(checksum);
}

void readMsp() {
  static uint8_t state = 0;
  static uint8_t size = 0;
  static uint8_t command = 0;
  static uint8_t checksum = 0;
  static uint8_t offset = 0;
  static uint8_t payload[32];

  while (fcSerial.available()) {
    uint8_t c = fcSerial.read();

    switch (state) {
      case 0: state = c == '$' ? 1 : 0; break;
      case 1: state = c == 'M' ? 2 : 0; break;
      case 2: state = c == '>' ? 3 : 0; break;
      case 3:
        size = c;
        checksum = c;
        offset = 0;
        state = 4;
        break;
      case 4:
        command = c;
        checksum ^= c;
        state = size == 0 ? 6 : 5;
        break;
      case 5:
        payload[offset++] = c;
        checksum ^= c;
        if (offset >= size) {
          state = 6;
        }
        break;
      case 6:
        if (checksum == c && command == MSP_RAW_GPS) {
          handleRawGps(payload, size);
        }
        state = 0;
        break;
    }
  }
}

int32_t readInt32(uint8_t* data, uint8_t index) {
  return (int32_t)data[index] |
         ((int32_t)data[index + 1] << 8) |
         ((int32_t)data[index + 2] << 16) |
         ((int32_t)data[index + 3] << 24);
}

uint16_t readUInt16(uint8_t* data, uint8_t index) {
  return (uint16_t)data[index] | ((uint16_t)data[index + 1] << 8);
}

void handleRawGps(uint8_t* data, uint8_t size) {
  if (size < 16) {
    return;
  }

  uint8_t fix = data[0];
  uint8_t satellites = data[1];
  int32_t latRaw = readInt32(data, 2);
  int32_t lonRaw = readInt32(data, 6);
  uint16_t altitudeMeters = readUInt16(data, 10);
  uint16_t speedCms = readUInt16(data, 12);

  if (fix < 2 || satellites < 4) {
    Serial.println("GPS sem fix suficiente na F405.");
    return;
  }

  if (millis() - lastSend < 1000 || WiFi.status() != WL_CONNECTED) {
    return;
  }

  lastSend = millis();
  float lat = latRaw / 10000000.0;
  float lng = lonRaw / 10000000.0;
  float speedKmh = speedCms * 0.036;

  sendLocation(lat, lng, speedKmh, satellites, altitudeMeters);
}

void sendLocation(float lat, float lng, float speedKmh, uint8_t satellites, uint16_t altitudeMeters) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String body = "{";
  body += "\"lat\":" + String(lat, 7) + ",";
  body += "\"lng\":" + String(lng, 7) + ",";
  body += "\"speed\":" + String(speedKmh, 2) + ",";
  body += "\"satellites\":" + String(satellites) + ",";
  body += "\"altitude\":" + String(altitudeMeters) + ",";
  body += "\"source\":\"f405-msp\"";
  body += "}";

  int status = http.POST(body);
  Serial.print("POST ");
  Serial.print(status);
  Serial.print(" -> ");
  Serial.println(body);
  http.end();
}
