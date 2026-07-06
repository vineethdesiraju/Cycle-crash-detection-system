# CycleGuard — Intelligent IoT Vehicle Safety Platform

> An end-to-end embedded safety framework designed to detect bicycle impacts in real time, manage localized hazards, and handle edge-to-cloud telemetry ingestion.

---

##  System Architecture Overview

The platform is decoupled into isolated, production-grade directory nodes:

* **`/firmware`**: High-performance concurrent C++ firmware deploying real-time jerk vector calculation and temporal orientation decay filters on an ESP32 edge node.
* **`/dashboard`**: A sleek, glassmorphic data visualization engine running Three.js for 3D physics rendering and browser-native Web Serial API handlers.
* **Root Landing Page**: A responsive, vector-video-backed product marketing site serving as the deployment entry point.

---

##  Algorithmic Crash Logic

To eliminate false positives from aggressive riding, potholes, or minor bumps, the edge firmware processes accelerometer data along two concurrent validation pathways:

### 1. Spatial Jerk Tracking ($\Delta G$)
The system samples the 3-axis MPU6050 accelerometer at $100\text{Hz}$ over an $I^2C$ protocol bus. It continuously computes the net magnitude vector ($G$) and triggers a critical event flag if the rate of change between processing loops ($\Delta G$) breaches a sharp **$0.4\text{G}$** baseline:

$$G = \frac{\sqrt{a_x^2 + a_y^2 + a_z^2}}{9.81}$$

$$\Delta G = |G_t - G_{t-1}|$$

### 2. Static Angular Decay (Orientation Windowing)
If a severe lean angle or slide causes the vertical gravitational distribution vector ($Z$-axis) to drop below **$0.6\text{G}$**, a millisecond debounce counter initiates. If the bike is not righted to safety within a strict **$1000\text{ms}$** buffer window, an emergency state is determined.

---

##  Web Serial Pipeline Architecture

When switched into Hardware Track mode, the telemetry dashboard acts as a direct local node, reading the ESP32 data stream natively over a standard USB serial line:

1. **Velocity Match:** Port configuration is set to a standard `115200` baud pipeline.
2. **Watchdog Silence Intercept:** If an active hardware telemetry stream abruptly freezes for more than **$700\text{ms}$** following a crash condition, the front-end watchdog assumes the edge node has entered its defensive hardware buzzer loops, instantly forcing an SOS overlay screen mask.

---

##  Local Project Setup

### 1. Flash the Hardware Edge Node
1. Navigate to `/firmware/` and open `cycle_crash_detection.ino` using the Arduino IDE or VS Code + PlatformIO.
2. Create a copy of `secrets.example.h` and rename it to `secrets.h`.
3. Provide your Wi-Fi credentials, AWS IoT Core endpoints, and TLS private key certificates.
4. Compile and upload directly to your ESP32 target module.

### 2. Run the Web Application Locally
To bypass standard cross-origin browser sandbox restrictions (`CORS`) when fetching dynamic script dependencies, spin up a lightweight local development instance from the project root:

```bash
# Using Python 3
python -m http.server 8000

# Using NodeJS
npx serve .
