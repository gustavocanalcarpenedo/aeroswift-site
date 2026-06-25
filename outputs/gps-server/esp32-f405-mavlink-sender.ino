/*
  AeroSwift - ESP32 lendo GPS da controladora F405 por MAVLink

  Use este arquivo se a F405 estiver com ArduPilot ou PX4.
  Instale uma biblioteca MAVLink compativel na Arduino IDE.

  Ligacao sugerida:
  - F405 GND       -> ESP32 GND
  - F405 TELEM TX  -> ESP32 GPIO 16
  - F405 TELEM RX  -> ESP32 GPIO 17

  Na F405:
  - Configure a porta TELEM usada com protocolo MAVLink.
  - Confirme que o GPS aparece com fix no Mission Planner/QGroundControl.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <mavlink.h>

const char* WIFI_NAME = "NOME_DO_WIFI";
const char* WIFI_PASS = "SENHA_DO_WIFI";
const char* SERVER_URL = "http://192.168.21.153:8080/api/location";

HardwareSerial fcSerial(2);
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  fcSerial.begin(57600, SERIAL_8N1, 16, 17);

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
  mavlink_message_t msg;
  mavlink_status_t status;

  while (fcSerial.available()) {
    uint8_t c = fcSerial.read();

    if (mavlink_parse_char(MAVLINK_COMM_0, c, &msg, &status)) {
      if (msg.msgid == MAVLINK_MSG_ID_GLOBAL_POSITION_INT) {
        handleGlobalPosition(msg);
      }
    }
  }
}

void handleGlobalPosition(mavlink_message_t& msg) {
  mavlink_global_position_int_t position;
  mavlink_msg_global_position_int_decode(&msg, &position);

  if (millis() - lastSend < 1000 || WiFi.status() != WL_CONNECTED) {
    return;
  }

  lastSend = millis();

  float lat = position.lat / 10000000.0;
  float lng = position.lon / 10000000.0;
  float speedKmh = sqrt(
    pow(position.vx / 100.0, 2) +
    pow(position.vy / 100.0, 2)
  ) * 3.6;
  float altitudeMeters = position.relative_alt / 1000.0;

  sendLocation(lat, lng, speedKmh, altitudeMeters);
}

void sendLocation(float lat, float lng, float speedKmh, float altitudeMeters) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String body = "{";
  body += "\"lat\":" + String(lat, 7) + ",";
  body += "\"lng\":" + String(lng, 7) + ",";
  body += "\"speed\":" + String(speedKmh, 2) + ",";
  body += "\"altitude\":" + String(altitudeMeters, 2) + ",";
  body += "\"source\":\"f405-mavlink\"";
  body += "}";

  int status = http.POST(body);
  Serial.print("POST ");
  Serial.print(status);
  Serial.print(" -> ");
  Serial.println(body);
  http.end();
}
