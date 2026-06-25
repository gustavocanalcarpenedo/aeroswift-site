const priority = document.querySelector("#priority");
const priorityLabel = document.querySelector("#priorityLabel");
const form = document.querySelector("#pedido");
const trackingTitle = document.querySelector("#trackingTitle");
const orderCode = document.querySelector("#orderCode");
const unlockCode = document.querySelector("#unlockCode");
const lockerPassword = document.querySelector("#lockerPassword");
const unlockMessage = document.querySelector("#unlockMessage");
const eta = document.querySelector("#eta");
const cargo = document.querySelector("#cargo");
const progressText = document.querySelector("#progressText");
const progressBar = document.querySelector("#progressBar");
const statusPill = document.querySelector("#statusPill");
const googleMap = document.querySelector("#googleMap");
const mapRouteLabel = document.querySelector("#mapRouteLabel");

const priorityNames = {
  1: "Entrega economica",
  2: "Entrega expressa",
  3: "Entrega maxima prioridade",
};

const unlockStorageKey = "aeroswiftUnlockCodes";
const storedUnlockCodes = JSON.parse(localStorage.getItem(unlockStorageKey) || "[]");
const usedUnlockCodes = new Set(storedUnlockCodes);
let lastUnlockCode = storedUnlockCodes.at(-1) || "";

function setPriorityLabel() {
  priorityLabel.textContent = priorityNames[priority.value];
}

function randomCode() {
  return `AS-${Math.floor(1000 + Math.random() * 9000)}`;
}

function randomUnlockCode() {
  let code = "";
  let attempts = 0;

  do {
    const randomValue = window.crypto?.getRandomValues
      ? window.crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 9000);

    code = String(1000 + (randomValue % 9000));
    attempts += 1;

    if (attempts > 120) {
      usedUnlockCodes.clear();
    }
  } while (code === lastUnlockCode || usedUnlockCodes.has(code));

  lastUnlockCode = code;
  usedUnlockCodes.add(code);
  localStorage.setItem(unlockStorageKey, JSON.stringify([...usedUnlockCodes].slice(-120)));
  return code;
}

function updateTracking(data) {
  const progress = data.priority === "3" ? 78 : data.priority === "2" ? 64 : 42;
  const arrival = data.priority === "3" ? "8 min" : data.priority === "2" ? "12 min" : "19 min";
  const mapQuery = encodeURIComponent(`${data.origin} to ${data.destination}`);

  trackingTitle.textContent = `${data.code} em rota`;
  orderCode.textContent = data.code;
  unlockCode.textContent = data.unlockCode;
  lockerPassword.textContent = data.unlockCode;
  unlockMessage.textContent = "Digite este codigo na senha do cofre da caixa para liberar seu pedido.";
  eta.textContent = arrival;
  cargo.textContent = data.packageType;
  progressText.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;
  statusPill.textContent = "Pedido confirmado";
  googleMap.src = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
  mapRouteLabel.textContent = `${data.origin} -> ${data.destination}`;
}

priority.addEventListener("input", setPriorityLabel);

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const data = {
    code: randomCode(),
    unlockCode: randomUnlockCode(),
    packageType: document.querySelector("#packageType").value,
    origin: document.querySelector("#origin").value,
    destination: document.querySelector("#destination").value,
    priority: priority.value,
  };

  updateTracking(data);
  document.querySelector("#rastreamento").scrollIntoView({ behavior: "smooth", block: "center" });
});

setPriorityLabel();
