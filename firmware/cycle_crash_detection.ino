#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// Include external network secrets (This file is hidden via .gitignore)
#include "secrets.h" 

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_MPU6050 mpu;

// LED Pins
#define RED_LED 14
#define GREEN_LED 26
#define YELLOW_LED 27
#define BUZZER_PIN 25

// Thresholds
#define JERK_THRESHOLD 0.4
#define TILT_THRESHOLD 0.6
#define TILT_TIME 1000

bool isCrashed = false;
bool alertSent = false;
unsigned long tipTimer = 0;

float prevForce = 1.0;

WiFiClientSecure net;
PubSubClient client(net);

void setup() {
  Serial.begin(115200);

  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  Wire.begin(21, 22);
  delay(500);

  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();

  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Cycle Guard");
  display.display();

  if (!mpu.begin(0x68)) {
    Serial.println("MPU6050 not found");
  }

  delay(2000);

  // WiFi connect
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");

  // Certificates
  net.setCACert(root_ca);
  net.setCertificate(client_cert);
  net.setPrivateKey(private_key);

  // AWS connect
  client.setServer(mqtt_server, 8883);

  while (!client.connect("ESP32Client")) {
    Serial.print(".");
    delay(1000);
  }

  Serial.println("\nConnected to AWS");
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float rawAccel = sqrt(
    sq(a.acceleration.x) +
    sq(a.acceleration.y) +
    sq(a.acceleration.z));

  float forceInG = rawAccel / 9.81;
  float verticalGravity = abs(a.acceleration.z) / 9.81;

  float delta = abs(forceInG - prevForce);
  prevForce = forceInG;

  Serial.print("G: ");
  Serial.print(forceInG, 2);
  Serial.print(" | Delta: ");
  Serial.print(delta, 2);
  Serial.print(" | Z: ");
  Serial.println(verticalGravity, 2);

  if (!isCrashed) {
    digitalWrite(GREEN_LED, HIGH);
    digitalWrite(RED_LED, LOW);

    if (verticalGravity < TILT_THRESHOLD) {
      if (tipTimer == 0) tipTimer = millis();
    } else {
      tipTimer = 0;
    }

    bool tiltCrash = (tipTimer != 0 && millis() - tipTimer > TILT_TIME);

    // Crash detection logic
    if ((delta > JERK_THRESHOLD && verticalGravity < TILT_THRESHOLD) || tiltCrash) {
      isCrashed = true;

      if (!alertSent) {
        client.publish("crash/alert", "Crash detected!");
        Serial.println("🚨 Alert sent to AWS!");
        alertSent = true;
      }
    }

    // Display SAFE UI
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("STATUS: SAFE");

    display.print("G: ");
    display.print(forceInG, 2);

    display.print("\nD: ");
    display.print(delta, 2);

    display.print("\nZ: ");
    display.print(verticalGravity, 2);

    display.display();

    delay(150);
  } else {
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(RED_LED, HIGH);

    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(10, 20);
    display.println("CRASH!");
    display.display();

    tone(BUZZER_PIN, 2000);
    delay(300);
    noTone(BUZZER_PIN);
    delay(200);
  }
}
