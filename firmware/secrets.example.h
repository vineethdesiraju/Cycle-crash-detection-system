// secrets.example.h - Template configuration file
#ifndef SECRETS_H
#define SECRETS_H

#include <pgmspace.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "xxxxxxxxxxxxxx-ats.iot.your-region.amazonaws.com";

static const char root_ca[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
PASTE_AMAZON_ROOT_CA_1_HERE
-----END CERTIFICATE-----
)EOF";

static const char client_cert[] PROGMEM = R"KEY(
-----BEGIN CERTIFICATE-----
PASTE_YOUR_AWS_DEVICE_CERTIFICATE_HERE
-----END CERTIFICATE-----
)KEY";

static const char private_key[] PROGMEM = R"KEY(
-----BEGIN RSA PRIVATE KEY-----
PASTE_YOUR_AWS_PRIVATE_KEY_HERE
-----END RSA PRIVATE KEY-----
)KEY";

#endif
