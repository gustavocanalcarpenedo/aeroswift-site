const http = require("http");
const fs = require("fs");
const path = require("path");

const host = "0.0.0.0";
const port = 8080;
const root = __dirname;
const clients = new Set();
const history = [];
let latestLocation = null;

function sendCommonHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function normalizeLocation(data) {
  const lat = data.lat ?? data.latitude;
  const lng = data.lng ?? data.lon ?? data.longitude;

  if (lat === undefined || lng === undefined) return null;

  return {
    lat: Number(lat),
    lng: Number(lng),
    speed: data.speed ?? data.velocidade ?? "",
    satellites: data.satellites ?? data.satelites ?? "",
    altitude: data.altitude ?? "",
    battery: data.battery ?? data.bateria ?? "",
    source: data.source ?? "gps",
    receivedAt: Date.now(),
  };
}

function broadcast(location) {
  const event = `data: ${JSON.stringify(location)}\n\n`;

  for (const res of clients) {
    res.write(event);
  }
}

function serveFile(res, requestPath) {
  const cleanPath = requestPath === "/" ? "dashboard.html" : requestPath.slice(1);
  const filePath = path.resolve(root, cleanPath);

  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Arquivo nao encontrado");
    return;
  }

  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
  };

  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  sendCommonHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    clients.add(res);

    if (latestLocation) {
      res.write(`data: ${JSON.stringify(latestLocation)}\n\n`);
    }

    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/latest") {
    sendJson(res, 200, { latest: latestLocation, history: history.slice(-50) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/location") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const location = normalizeLocation(JSON.parse(body));

        if (!location) {
          sendJson(res, 400, { ok: false, error: "Envie lat e lng no JSON." });
          return;
        }

        latestLocation = location;
        history.push(location);
        history.splice(0, Math.max(0, history.length - 200));
        broadcast(location);
        sendJson(res, 200, { ok: true, location });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
    });
    return;
  }

  if (req.method === "GET") {
    serveFile(res, url.pathname);
    return;
  }

  res.writeHead(405);
  res.end("Metodo nao permitido");
});

server.listen(port, host, () => {
  console.log(`AeroSwift GPS server rodando em http://localhost:${port}`);
  console.log("Endpoint para o ESP32/Arduino: POST /api/location");
});
