import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* =====================================
   FIREBASE CONFIGURATION
===================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAk4_SagoGgbGkhitVssSwLNu9cNRLlJ-M",
  authDomain: "smartpark-iot-47150.firebaseapp.com",
  databaseURL: "https://smartpark-iot-47150-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smartpark-iot-47150",
  storageBucket: "smartpark-iot-47150.firebasestorage.app",
  messagingSenderId: "331689603671",
  appId: "1:331689603671:web:9b005295b743fa4abfe912",
  measurementId: "G-S6JW9XDZSK"
};

/* =====================================
   PARKING SLOT CONFIGURATION
===================================== */

const EXPECTED_SLOTS = {
  M1: { type: "Motorcycle", label: "Motorcycle 1" },
  C1: { type: "Car", label: "Car 1" },
  C2: { type: "Car", label: "Car 2" },
  E1: { type: "EV", label: "EV 1" },
  P1: { type: "PWD", label: "PWD 1" }
};

/* =====================================
   GLOBAL VARIABLES
===================================== */

const $ = id => document.getElementById(id);

const pageInfo = {
  dashboard: [
    "Dashboard Overview",
    "Live parking status from your ESP32 sensors."
  ],
  slots: [
    "Parking Slots",
    "Actual status of the five parking sensors."
  ],
  reports: [
    "Live Parking Report",
    "Calculated from actual Firebase records only."
  ],
  connection: [
    "Firebase Connection",
    "Connection information for your ESP32 system."
  ]
};

let parkingSlots = {};
let previousSlots = null;
let activity = [];
let lastDataReceived = null;

/* =====================================
   CONNECTION STATUS
===================================== */

function setConnection(status, message, isConnected = false) {
  $("connectionStatus").textContent = status;
  $("connectionMessage").textContent = message;

  $("firebaseStatus").textContent = status;
  $("firebaseDetails").textContent = message;

  $("connectionDot").style.background =
    isConnected ? "#20df84" : "#f7b955";

  $("liveDot").style.background =
    isConnected ? "#20df84" : "#f7b955";
}

/* =====================================
   TOAST NOTIFICATION
===================================== */

function showToast(message) {
  const toast = $("toast");

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

/* =====================================
   HTML SECURITY
===================================== */

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

/* =====================================
   NORMALIZE FIREBASE DATA
===================================== */

function normalizeSlots(data) {
  const result = {};

  if (!data || typeof data !== "object") {
    return result;
  }

  for (const [id, value] of Object.entries(data)) {
    const expected = EXPECTED_SLOTS[id];

    if (!expected || !value || typeof value !== "object") {
      continue;
    }

    // Accept either:
    // occupied: true/false
    // OR status: "occupied"/"available"/"unknown"

    let status = "unknown";

    if (["occupied", "available", "unknown"].includes(value.status)) {
      status = value.status;
    } else if (typeof value.occupied === "boolean") {
      status = value.occupied ? "occupied" : "available";
    }

    const updatedAt = Number(value.updatedAt);

    result[id] = {
      id,
      type: expected.type,
      label: expected.label,
      status,
      occupied: status === "occupied",
      distanceCm: Number.isFinite(Number(value.distanceCm))
        ? Number(value.distanceCm)
        : null,
      updatedAt: Number.isFinite(updatedAt) && updatedAt > 0
        ? updatedAt
        : null
    };
  }

  return result;
}

/* =====================================
   PARKING COUNTS
===================================== */

function getCounts(type = null) {
  const slots = Object.values(parkingSlots).filter(slot => {
    return (!type || slot.type === type) &&
      slot.status !== "unknown";
  });

  return {
    total: slots.length,
    available: slots.filter(slot => slot.status === "available").length,
    occupied: slots.filter(slot => slot.status === "occupied").length
  };
}

/* =====================================
   DASHBOARD METRICS
===================================== */

function renderMetrics() {
  const cars = getCounts("Car");
  const motorcycles = getCounts("Motorcycle");
  const ev = getCounts("EV");
  const pwd = getCounts("PWD");

  const total = getCounts();

  $("carsAvailable").textContent =
    cars.total ? `${cars.available} / ${cars.total}` : "—";

  $("carsOccupied").textContent =
    cars.total ? `${cars.occupied} / ${cars.total}` : "—";

  $("motorcyclesAvailable").textContent =
    motorcycles.total
      ? `${motorcycles.available} / ${motorcycles.total}`
      : "—";

  $("evAvailable").textContent =
    ev.total ? `${ev.available} / ${ev.total}` : "—";

  $("pwdAvailable").textContent =
    pwd.total ? `${pwd.available} / ${pwd.total}` : "—";

  $("carsAvailableDetail").textContent =
    cars.total ? `${cars.total} car sensor(s) reporting` : "No car sensor data";

  $("carsOccupiedDetail").textContent =
    cars.total ? `${cars.occupied} occupied` : "No car sensor data";

  $("motorcyclesDetail").textContent =
    motorcycles.total
      ? `${motorcycles.occupied} occupied`
      : "No motorcycle sensor data";

  $("evDetail").textContent =
    ev.total ? `${ev.occupied} occupied` : "No EV sensor data";

  $("pwdDetail").textContent =
    pwd.total ? `${pwd.occupied} occupied` : "No PWD sensor data";

  $("totalSlots").textContent =
    total.total || "—";

  $("totalAvailable").textContent =
    total.total ? total.available : "—";

  $("totalOccupied").textContent =
    total.total ? total.occupied : "—";

  $("occupancyRate").textContent =
    total.total
      ? `${Math.round(total.occupied / total.total * 100)}%`
      : "—";

  const unreported = Object.keys(EXPECTED_SLOTS).length -
    Object.keys(parkingSlots).length;

  $("reportNote").textContent =
    `${total.total} valid sensor record(s). ${Math.max(0, unreported)} slot(s) not yet reporting.`;

  $("downloadReport").disabled =
    Object.keys(parkingSlots).length === 0;
}

/* =====================================
   SLOT DISPLAY HELPERS
===================================== */

function getSlotStatus(id) {
  return parkingSlots[id] || {
    id,
    type: EXPECTED_SLOTS[id].type,
    label: EXPECTED_SLOTS[id].label,
    status: "unknown",
    occupied: false,
    distanceCm: null,
    updatedAt: null
  };
}

function statusText(status) {
  if (status === "occupied") return "Occupied";
  if (status === "available") return "Available";
  return "No sensor data";
}

function statusClass(status) {
  if (status === "occupied") return "occupied";
  if (status === "available") return "available";
  return "unknown";
}

function slotIcon(type, status) {
  if (type === "Motorcycle") return "🏍️";
  if (type === "EV") return "🔌";
  if (type === "PWD") return "♿";
  return status === "occupied" ? "🚘" : "🚗";
}

/* =====================================
   PARKING MAP SLOT HTML
===================================== */

function slotHTML(slot, compact = false) {
  const name = escapeHTML(slot.id);
  const icon = slotIcon(slot.type, slot.status);
  const cssStatus = statusClass(slot.status);
  const text = statusText(slot.status);

  if (compact) {
    return `
      <div class="motorcycle-slot ${cssStatus}">
        ${icon} ${name}<br>
        ${text}
      </div>
    `;
  }

  let specialClass = "";

  if (slot.type === "EV") {
    specialClass = "ev-map-slot";
  }

  if (slot.type === "PWD") {
    specialClass = "pwd-map-slot";
  }

  return `
    <div class="parking-slot ${cssStatus} ${specialClass}">
      <span class="slot-light"></span>
      <span class="slot-icon">${icon}</span>
      <span class="slot-name">${name}</span>
      <span class="slot-status">${text}</span>
    </div>
  `;
}

/* =====================================
   PARKING MAP RENDERING
===================================== */

function renderParkingMap() {
  const motorcycle = getSlotStatus("M1");
  const car1 = getSlotStatus("C1");
  const car2 = getSlotStatus("C2");
  const ev = getSlotStatus("E1");
  const pwd = getSlotStatus("P1");

  $("motorcycleSlots").innerHTML =
    slotHTML(motorcycle, true);

  $("carLeft").innerHTML =
    slotHTML(car1);

  $("carRight").innerHTML =
    slotHTML(car2);

  $("evSlots").innerHTML =
    slotHTML(ev);

  $("pwdSlots").innerHTML =
    slotHTML(pwd);
}

/* =====================================
   ALL PARKING SLOTS PAGE
===================================== */

function renderAllSlots() {
  const ids = Object.keys(EXPECTED_SLOTS);

  $("allSlots").innerHTML = ids.map(id => {
    const slot = getSlotStatus(id);
    const cssStatus = statusClass(slot.status);
    const text = statusText(slot.status);

    const distance = slot.distanceCm !== null
      ? `${slot.distanceCm.toFixed(1)} cm`
      : "No distance reading";

    return `
      <div class="all-slot-card">
        <div>
          <strong>
            ${escapeHTML(slot.type)} · ${escapeHTML(slot.id)}
          </strong>

          <small>${distance}</small>
        </div>

        <span class="status ${cssStatus}">
          ● ${text}
        </span>
      </div>
    `;
  }).join("");
}

/* =====================================
   RECENT ACTIVITY
===================================== */

function addActivity(slot) {
  activity.unshift({
    id: slot.id,
    type: slot.type,
    status: slot.status,
    time: new Date().toLocaleTimeString()
  });

  activity = activity.slice(0, 20);
}

function renderActivity() {
  $("activityBody").innerHTML = activity.length
    ? activity.map(item => `
        <tr>
          <td>${escapeHTML(item.time)}</td>
          <td><strong>${escapeHTML(item.id)}</strong></td>
          <td>
            <span class="status ${statusClass(item.status)}">
              ● ${statusText(item.status)}
            </span>
          </td>
          <td>${escapeHTML(item.type)}</td>
        </tr>
      `).join("")
    : `
        <tr>
          <td colspan="4" class="empty-cell">
            No sensor activity received.
          </td>
        </tr>
      `;
}

/* =====================================
   MAIN RENDER FUNCTION
===================================== */

function render() {
  renderMetrics();
  renderParkingMap();
  renderAllSlots();
  renderActivity();

  if (lastDataReceived) {
    $("lastUpdate").textContent =
      `Last Firebase update: ${lastDataReceived.toLocaleTimeString()}`;
  } else {
    $("lastUpdate").textContent = "No data received";
  }
}

/* =====================================
   FIREBASE DATA HANDLER
===================================== */

function handleFirebaseData(snapshot) {
  const rawData = snapshot.val();
  const newSlots = normalizeSlots(rawData);

  // Do not record initial readings as new activity.
  if (previousSlots !== null) {
    for (const [id, slot] of Object.entries(newSlots)) {
      const previous = previousSlots[id];

      if (previous && previous.status !== slot.status) {
        addActivity(slot);
      }
    }
  }

  previousSlots = newSlots;
  parkingSlots = newSlots;
  lastDataReceived = new Date();

  const count = Object.keys(parkingSlots).length;

  if (count > 0) {
    setConnection(
      "Connected — receiving data",
      `${count} of 5 parking sensor record(s) received from Firebase.`,
      true
    );
  } else {
    setConnection(
      "Connected — no slot records",
      "Firebase is reachable, but no valid parking sensor records have been received yet."
    );
  }

  render();
}

/* =====================================
   FIREBASE CONNECTION
===================================== */

function connectFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app);

    const slotsReference = ref(database, "parking/slots");

    setConnection(
      "Connecting to Firebase...",
      "Waiting for a response from Realtime Database."
    );

    onValue(
      slotsReference,
      handleFirebaseData,
      error => {
        setConnection(
          "Firebase connection error",
          `${error.message}. Check your database URL and database rules.`
        );

        console.error("Firebase error:", error);
      }
    );

  } catch (error) {
    setConnection(
      "Firebase initialization failed",
      error.message
    );

    console.error(error);
  }
}

/* =====================================
   PAGE NAVIGATION
===================================== */

function navigate(page) {
  if (!pageInfo[page]) return;

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  document.querySelectorAll(".page").forEach(section => {
    section.classList.remove("active");
  });

  $(`page-${page}`).classList.add("active");

  $("pageTitle").textContent = pageInfo[page][0];
  $("pageDescription").textContent = pageInfo[page][1];
}

$("mainNav").addEventListener("click", event => {
  const button = event.target.closest("[data-page]");

  if (button) {
    navigate(button.dataset.page);
  }
});

/* =====================================
   DOWNLOAD CSV REPORT
===================================== */

$("downloadReport").addEventListener("click", () => {
  if (Object.keys(parkingSlots).length === 0) {
    showToast("No live sensor records to export.");
    return;
  }

  const rows = [
    [
      "Slot ID",
      "Type",
      "Status",
      "Distance (cm)",
      "Last Sensor Update"
    ]
  ];

  for (const id of Object.keys(EXPECTED_SLOTS)) {
    const slot = getSlotStatus(id);

    rows.push([
      slot.id,
      slot.type,
      statusText(slot.status),
      slot.distanceCm ?? "",
      slot.updatedAt
        ? new Date(slot.updatedAt).toISOString()
        : ""
    ]);
  }

  const csv = rows.map(row => {
    return row.map(value => {
      return `"${String(value).replaceAll('"', '""')}"`;
    }).join(",");
  }).join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "smartpark-live-report.csv";
  link.click();

  URL.revokeObjectURL(url);

  showToast("Live report downloaded.");
});

/* =====================================
   START DASHBOARD
===================================== */

// Start with empty data.
// Only Firebase can populate the parking records.

render();
connectFirebase();