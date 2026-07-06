// js/hardware.js — CycleGuard Web Serial Handler
// Thresholds mirror Arduino sketch exactly

const HW_JERK_THRESHOLD = 0.4;   // delta > 0.4 = sudden jerk
const HW_TILT_THRESHOLD = 0.6;   // Z < 0.6 = bike tilting
const HW_TILT_TIME      = 1000;  // 1 second sustained tilt = crash
const HW_SILENCE_MS     = 700;   // no serial data for 700ms = Arduino in crash loop

// ── State ─────────────────────────────────────────────────────────────
let hwPort      = null;
let hwReader    = null;
let hwRunning   = false;
let hwCrashed   = false;
let hwTipStart  = null;
let hwLastData  = null;
let hwSilenceId = null;
let hwConnectTime = 0;
let hwStreamStarted = false; // True once real telemetry is received

let hwLastG     = 0;
let hwLastZ     = 1;

// ── Callbacks ─────────────────────────────────────────────────────────
let hwOnTelemetry = null;
let hwOnCrash     = null;
let hwOnStatus    = null;
let hwOnLine      = null;

function initHardware(telFn, crashFn, statusFn, lineFn) {
  hwOnTelemetry = telFn;
  hwOnCrash     = crashFn;
  hwOnStatus    = statusFn;
  hwOnLine      = lineFn;
}

// ── Connect ───────────────────────────────────────────────────────────
async function hwConnect() {
  if (!('serial' in navigator)) {
    alert('Web Serial API not supported.\nUse Google Chrome or Microsoft Edge.');
    return false;
  }

  // Step 1: Open port picker
  try {
    hwPort = await navigator.serial.requestPort();
  } catch (err) {
    // User cancelled the picker — not an error
    console.log('Port picker cancelled:', err.message);
    hwPort = null;
    return false;
  }

  // Step 2: Open the port at 115200 baud
  try {
    await hwPort.open({ baudRate: 115200 });
  } catch (err) {
    const msg = err.message || String(err);
    console.error('Failed to open port:', msg);
    // Show user-friendly error
    if (msg.toLowerCase().includes('already open') || msg.toLowerCase().includes('access denied') || msg.toLowerCase().includes('in use')) {
      alert('❌ COM port is already in use!\n\nClose the Arduino IDE Serial Monitor, then try again.');
    } else {
      alert('❌ Could not open COM port:\n' + msg);
    }
    hwPort = null;
    if (hwOnStatus) hwOnStatus('disconnected');
    return false;
  }

  // Port is open — success
  hwCrashed  = false;
  hwTipStart = null;
  hwLastData = Date.now();
  hwConnectTime = Date.now();
  hwStreamStarted = false;
  hwRunning  = true;

  if (hwOnStatus) hwOnStatus('connected');

  // Start reading in background
  hwReadLoop();
  hwStartSilenceWatcher();
  return true;
}

// ── Read Loop — uses simple getReader() (most compatible) ─────────────
async function hwReadLoop() {
  const textDecoder = new TextDecoder();
  let buf = '';

  // Signal actively reading
  if (hwOnStatus) hwOnStatus('reading');

  try {
    // Lock the readable stream with a reader
    hwReader = hwPort.readable.getReader();

    while (hwRunning) {
      let result;
      try {
        result = await hwReader.read();
      } catch (readErr) {
        // Read failed (port disconnected, etc.)
        console.error('Serial read error:', readErr.message);
        break;
      }

      if (result.done) break;

      // Decode the Uint8Array chunk to string
      buf += textDecoder.decode(result.value, { stream: true });

      // Process complete lines
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) hwParseLine(line);
      }
    }
  } catch (err) {
    console.error('hwReadLoop error:', err);
  } finally {
    // Always release the reader lock
    try {
      if (hwReader) {
        hwReader.releaseLock();
        hwReader = null;
      }
    } catch (_) {}

    // If still supposed to be running, the port dropped unexpectedly
    if (hwRunning) {
      hwRunning = false;
      if (hwOnStatus) hwOnStatus('disconnected');
    }
  }
}

// ── Silence Watcher ───────────────────────────────────────────────────
// Arduino stops Serial.print when it enters the crash loop.
// If we see silence for >700ms, trigger crash on website.
function hwStartSilenceWatcher() {
  if (hwSilenceId) clearInterval(hwSilenceId);
  hwSilenceId = setInterval(() => {
    if (!hwRunning || hwCrashed) return;
    if (!hwStreamStarted) return; // Wait until telemetry stream actually begins
    if (hwLastData && (Date.now() - hwLastData) > HW_SILENCE_MS) {
      hwFireCrash('Crash Detected — Buzzer active on hardware', hwLastG, hwLastZ);
    }
  }, 200);
}

// ── Parser — exact format: "G: 1.04 | Delta: 0.00 | Z: 1.03" ─────────
function hwParseLine(line) {
  if (hwOnLine) hwOnLine(line);

  const m = line.match(/G:\s*([\d.]+)\s*\|\s*Delta:\s*([\d.]+)\s*\|\s*Z:\s*([\d.]+)/i);
  if (!m) return;

  // Real telemetry received — arm the watchdog!
  hwStreamStarted = true;
  hwLastData = Date.now();

  const forceG = parseFloat(m[1]);
  const delta  = parseFloat(m[2]);
  const z      = parseFloat(m[3]);

  hwLastG = forceG;
  hwLastZ = z;

  if (hwOnTelemetry) hwOnTelemetry(forceG, z);
  if (hwCrashed) return;

  // Mirror Arduino: delta > 0.4 AND Z < 0.6 → instant crash
  if (delta > HW_JERK_THRESHOLD && z < HW_TILT_THRESHOLD) {
    hwFireCrash(
      `Impact + Tilt Crash — ΔG: ${delta.toFixed(2)}, Z: ${z.toFixed(2)}`,
      forceG, z
    );
    return;
  }

  // Mirror Arduino: Z < 0.6 sustained for 1 second → tilt crash
  if (z < HW_TILT_THRESHOLD) {
    if (!hwTipStart) hwTipStart = Date.now();
    else if (Date.now() - hwTipStart >= HW_TILT_TIME) {
      hwFireCrash(
        `Tilt Crash — Bike horizontal (Z=${z.toFixed(2)}) for 1s`,
        forceG, z
      );
    }
  } else {
    hwTipStart = null;
  }
}

// ── Fire Crash ────────────────────────────────────────────────────────
function hwFireCrash(type, g, z) {
  if (hwCrashed) return;
  hwCrashed = true;
  if (hwSilenceId) { clearInterval(hwSilenceId); hwSilenceId = null; }
  if (hwOnStatus) hwOnStatus('crash');
  if (hwOnCrash)  hwOnCrash(type, g, z, new Date());
}

// ── Reset after Acknowledge ───────────────────────────────────────────
function hwResetCrash() {
  hwCrashed  = false;
  hwTipStart = null;
  hwLastData = Date.now();
  hwConnectTime = Date.now();
  hwStreamStarted = false; // Reset so it waits for new telemetry
  hwStartSilenceWatcher();
  if (hwOnStatus) hwOnStatus('reading');
}

// ── Disconnect ────────────────────────────────────────────────────────
async function hwDisconnect() {
  hwRunning = false;
  if (hwSilenceId) { clearInterval(hwSilenceId); hwSilenceId = null; }
  try {
    if (hwReader) {
      hwReader.releaseLock();
      hwReader = null;
    }
  } catch (_) {}
  try {
    if (hwPort) {
      await hwPort.close();
      hwPort = null;
    }
  } catch (_) {}
  hwCrashed  = false;
  hwTipStart = null;
  if (hwOnStatus) hwOnStatus('disconnected');
}
