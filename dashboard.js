const statusEl = document.querySelector("#status");
const latEl = document.querySelector("#lat");
const lngEl = document.querySelector("#lng");
const speedEl = document.querySelector("#speed");
const satellitesEl = document.querySelector("#satellites");
const updatedAtEl = document.querySelector("#updatedAt");
const lastPointEl = document.querySelector("#lastPoint");
const mapLink = document.querySelector("#mapLink");
const canvas = document.querySelector("#trailCanvas");
const ctx = canvas.getContext("2d");
const trail = [];

function formatValue(value, suffix = "") {
  if (value === "" || value === undefined || value === null) {
    return "--";
  }

  return `${value}${suffix}`;
}

function updateLocation(location) {
  trail.push(location);
  trail.splice(0, Math.max(0, trail.length - 80));

  latEl.textContent = Number(location.lat).toFixed(7);
  lngEl.textContent = Number(location.lng).toFixed(7);
  speedEl.textContent = formatValue(location.speed, location.speed === "" ? "" : " km/h");
  satellitesEl.textContent = formatValue(location.satellites);
  updatedAtEl.textContent = new Date(location.receivedAt || Date.now()).toLocaleTimeString("pt-BR");
  lastPointEl.textContent = `${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)}`;
  mapLink.href = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  drawTrail();
}

function drawTrail() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (trail.length === 0) {
    ctx.fillStyle = "rgba(168, 183, 202, 0.9)";
    ctx.font = "22px Arial";
    ctx.fillText("Aguardando coordenadas do GPS...", 36, 62);
    return;
  }

  const lats = trail.map((point) => point.lat);
  const lngs = trail.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 52;

  const points = trail.map((point) => {
    const xRange = maxLng - minLng || 0.0001;
    const yRange = maxLat - minLat || 0.0001;
    const x = pad + ((point.lng - minLng) / xRange) * (canvas.width - pad * 2);
    const y = canvas.height - pad - ((point.lat - minLat) / yRange) * (canvas.height - pad * 2);
    return { x, y };
  });

  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#68e7ff";
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, index === points.length - 1 ? 11 : 5, 0, Math.PI * 2);
    ctx.fillStyle = index === points.length - 1 ? "#42e68d" : "#13a7ff";
    ctx.fill();
  });
}

async function loadLatest() {
  try {
    const response = await fetch("/api/latest");
    const data = await response.json();
    (data.history || []).forEach(updateLocation);
  } catch (error) {
    console.warn(error);
  }
}

function connectEvents() {
  let fallbackStarted = false;
  const events = new EventSource("/events");

  const startFallback = () => {
    if (fallbackStarted) {
      return;
    }

    fallbackStarted = true;
    events.close();
    statusEl.textContent = "Online";
    statusEl.classList.add("online");
    setInterval(loadLatest, 1000);
  };

  events.onopen = () => {
    statusEl.textContent = "Online";
    statusEl.classList.add("online");
  };

  events.onmessage = (event) => {
    updateLocation(JSON.parse(event.data));
  };

  events.onerror = () => {
    statusEl.textContent = "Polling";
    statusEl.classList.add("online");
    startFallback();
  };
}

drawTrail();
loadLatest();
connectEvents();
