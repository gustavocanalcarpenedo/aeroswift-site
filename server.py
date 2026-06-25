from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Queue
import json
import mimetypes
import time
import urllib.parse

HOST = "0.0.0.0"
PORT = 8080
ROOT = Path(__file__).resolve().parent

latest_location = None
history = []
clients = []


def make_event(payload):
    return f"data: {json.dumps(payload)}\n\n".encode("utf-8")


def broadcast(payload):
    dead_clients = []
    event = make_event(payload)

    for client in clients:
        try:
            client.put_nowait(event)
        except Exception:
            dead_clients.append(client)

    for client in dead_clients:
        clients.remove(client)


def parse_nmea(raw):
    sentence = raw.strip()
    parts = sentence.split(",")

    if not sentence.startswith("$") or len(parts) < 6:
        return None

    if parts[0].endswith("GGA"):
        lat_raw, lat_dir = parts[2], parts[3]
        lon_raw, lon_dir = parts[4], parts[5]
        satellites = parts[7] if len(parts) > 7 else ""
        altitude = parts[9] if len(parts) > 9 else ""
        speed = ""
    elif parts[0].endswith("RMC"):
        lat_raw, lat_dir = parts[3], parts[4]
        lon_raw, lon_dir = parts[5], parts[6]
        speed = parts[7] if len(parts) > 7 else ""
        satellites = ""
        altitude = ""
    else:
        return None

    lat = convert_nmea_coordinate(lat_raw, lat_dir)
    lon = convert_nmea_coordinate(lon_raw, lon_dir)

    if lat is None or lon is None:
        return None

    return {
        "lat": lat,
        "lng": lon,
        "speed": speed,
        "satellites": satellites,
        "altitude": altitude,
        "source": "nmea",
    }


def convert_nmea_coordinate(value, direction):
    if not value or not direction:
        return None

    dot = value.find(".")
    degrees_length = dot - 2
    degrees = float(value[:degrees_length])
    minutes = float(value[degrees_length:])
    decimal = degrees + (minutes / 60)

    if direction in ("S", "W"):
        decimal *= -1

    return round(decimal, 7)


def normalize_location(data):
    lat = data.get("lat", data.get("latitude"))
    lng = data.get("lng", data.get("lon", data.get("longitude")))

    if lat is None or lng is None:
        return None

    payload = {
        "lat": float(lat),
        "lng": float(lng),
        "speed": data.get("speed", data.get("velocidade", "")),
        "satellites": data.get("satellites", data.get("satelites", "")),
        "altitude": data.get("altitude", ""),
        "battery": data.get("battery", data.get("bateria", "")),
        "source": data.get("source", "gps"),
        "receivedAt": int(time.time() * 1000),
    }

    return payload


class GpsHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_common_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/events":
            self.handle_events()
            return

        if parsed.path == "/api/latest":
            self.send_json({"latest": latest_location, "history": history[-50:]})
            return

        path = "dashboard.html" if parsed.path == "/" else parsed.path.lstrip("/")
        self.serve_file(path)

    def do_POST(self):
        global latest_location

        if self.path != "/api/location":
            self.send_error(404, "Endpoint nao encontrado")
            return

        size = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(size).decode("utf-8", errors="ignore")
        content_type = self.headers.get("Content-Type", "")

        try:
            if "application/json" in content_type:
                payload = normalize_location(json.loads(raw_body))
            else:
                payload = parse_nmea(raw_body)
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)
            return

        if not payload:
            self.send_json({"ok": False, "error": "Envie lat/lng em JSON ou uma sentenca NMEA valida."}, status=400)
            return

        latest_location = payload
        history.append(payload)
        del history[:-200]
        broadcast(payload)
        self.send_json({"ok": True, "location": payload})

    def handle_events(self):
        queue = Queue()
        clients.append(queue)

        self.send_response(200)
        self.send_common_headers()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        if latest_location:
            self.wfile.write(make_event(latest_location))
            self.wfile.flush()

        try:
            while True:
                self.wfile.write(queue.get(timeout=30))
                self.wfile.flush()
        except Exception:
            if queue in clients:
                clients.remove(queue)

    def serve_file(self, path):
        file_path = (ROOT / path).resolve()

        if not str(file_path).startswith(str(ROOT)) or not file_path.exists() or file_path.is_dir():
            self.send_error(404, "Arquivo nao encontrado")
            return

        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_common_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_common_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        print(f"[GPS] {self.address_string()} - {format % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), GpsHandler)
    print(f"AeroSwift GPS server rodando em http://localhost:{PORT}")
    print("Endpoint para o ESP32/Arduino: POST /api/location")
    server.serve_forever()
