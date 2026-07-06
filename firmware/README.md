# Cycle Guard - Firmware Core

This directory contains the core ESP32 embedded firmware written in C++ (Arduino framework) to detect bicycle impacts and transmit high-priority telemetry data over MQTT.

##  Hardware Peripheral Mapping
The firmware manages the following pin configurations on the ESP32 node:

| Component | ESP32 Pin | Protocol / Mode | Function |
| :--- | :--- | :--- | :--- |
| **MPU6050 IMU** | GPIO 21 (SDA), GPIO 22 (SCL) | I2C | Spatial orientation & acceleration data |
| **SSD1306 OLED** | Shared I2C (0x3C address) | I2C | Real-time local UI status display |
| **Buzzer** | GPIO 25 | Output (PWM / Tone) | Local acoustic alarm indicator |
| **Red LED** | GPIO 14 | Digital Output | Hazard state indicator |
| **Green LED** | GPIO 26 | Digital Output | Nominal state indicator |
| **Yellow LED** | GPIO 27 | Digital Output | System state indicator |

##  Mathematical Fallback & Anomaly Logic

The edge node utilizes twin concurrent logic tracks to prevent false positives while capturing rapid orientation transitions:

1. **Jerk/Impact Vector Delta:** The firmware monitors continuous structural impact forces by calculating the total acceleration vector magnitude $G$ and checking its difference against the previous frame ($\Delta G$):
   $$G = \frac{\sqrt{a_x^2 + a_y^2 + a_z^2}}{9.81}$$
   $$\Delta G = |G_t - G_{t-1}|$$
   An impact is registered if $\Delta G > 0.4\text{G}$ in tandem with anomalous spatial displacement.

2. **Timed Static Tilt Decay:**
   If the cycle rests at an extreme tilt angle where the normalized vertical gravity vector falls below the threshold ($Z_{\text{gravity}} < 0.6\text{G}$), an active millisecond decay timer activates. If the orientation fails to correct itself within $1000\text{ms}$, a crash state is inferred.

##  Security & Ingestion Implementation
* **Network Security:** Secure TLS 1.2 handshakes are managed directly on-chip via `WiFiClientSecure`.
* **Transport Layer:** Telemetry alerts are wrapped into thin JSON frames and dispatched to AWS IoT Core over port `8883` using the `PubSubClient` MQTT interface.
