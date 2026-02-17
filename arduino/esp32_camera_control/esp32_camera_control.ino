   // ESP32-CAM control + camera stream sketch
// - Provides endpoints used by your web app:
//   GET  /status        -> {"online":true}
//   GET  /telemetry     -> {"turbidity": <value>} (analog)
//   GET  /cam/frame     -> single JPEG image
//   GET  /stream        -> MJPEG stream
//   GET  /move?dir=...&speed=... -> control motors
//   GET  /servo?angle=... -> set servo
//   POST /update        -> accepts update payload (returns OK or fallback)

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>

// ----------------- WiFi -----------------
const char* ssid = "SHAILENDRA";
const char* password = "alladi@77";

// ----------------- Pins (from your code) -----------------
#define IN1 18
#define IN2 19
#define IN3 21
#define IN4 22
#define ENA 25
#define ENB 26

#define SERVO_PIN 23
#define TURBIDITY_PIN 34

Servo servo; 
WebServer server(80);

// PWM channels for ENA/ENB
const int CH_A = 0;
const int CH_B = 1;
const int PWM_FREQ = 5000;
const int PWM_RES = 8; // 0-255

int motorSpeed = 150; // default (0-255)

// ----------------- Camera config (AI-Thinker default) -----------------
// If you have a different camera board, change the pin mapping accordingly.
#define CAMERA_MODEL_AI_THINKER

#if defined(CAMERA_MODEL_AI_THINKER)
  #define PWDN_GPIO_NUM     32
  #define RESET_GPIO_NUM    -1
  #define XCLK_GPIO_NUM     0
  #define SIOD_GPIO_NUM     26
  #define SIOC_GPIO_NUM     27
  #define Y9_GPIO_NUM       35
  #define Y8_GPIO_NUM       34
  #define Y7_GPIO_NUM       39
  #define Y6_GPIO_NUM       36
  #define Y5_GPIO_NUM       21
  #define Y4_GPIO_NUM       19
  #define Y3_GPIO_NUM       18
  #define Y2_GPIO_NUM       5
  #define VSYNC_GPIO_NUM    25
  #define HREF_GPIO_NUM     23
  #define PCLK_GPIO_NUM     22
#endif

// ----------------- Helpers -----------------
void addCORS() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void mStop() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  ledcWrite(CH_A, 0);
  ledcWrite(CH_B, 0);
}

void mFwd(int speed) {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
  ledcWrite(CH_A, speed);
  ledcWrite(CH_B, speed);
}

void mLeft(int speed) {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
  ledcWrite(CH_A, speed);
  ledcWrite(CH_B, speed);
}

void mRight(int speed) {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);
  ledcWrite(CH_A, speed);
  ledcWrite(CH_B, speed);
}

void mBack(int speed) {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);
  ledcWrite(CH_A, speed);
  ledcWrite(CH_B, speed);
}

// ----------------- HTTP handlers -----------------
void handleStatus() {
  addCORS();
  server.send(200, "application/json", "{\"online\":true}");
}

void handleTelemetry() {
  addCORS();
  int turb = analogRead(TURBIDITY_PIN);
  String body = String("{\"turbidity\":") + turb + String("}");
  server.send(200, "application/json", body);
}

void handleMove() {
  addCORS();
  if (!server.hasArg("dir")) {
    server.send(400, "application/json", "{\"error\":\"missing dir\"}");
    return;
  }
  String dir = server.arg("dir");
  int speed = motorSpeed;
  if (server.hasArg("speed")) {
    speed = server.arg("speed").toInt();
    speed = constrain(speed, 0, 255);
  }
  if (dir == "forward") mFwd(speed);
  else if (dir == "left") mLeft(speed);
  else if (dir == "right") mRight(speed);
  else if (dir == "backward") mBack(speed);
  else if (dir == "stop") mStop();
  else {
    server.send(400, "application/json", "{\"error\":\"unknown dir\"}");
    return;
  }
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleServo() {
  addCORS();
  if (!server.hasArg("angle")) {
    server.send(400, "application/json", "{\"error\":\"missing angle\"}");
    return;
  }
  int angle = server.arg("angle").toInt();
  angle = constrain(angle, 0, 180);
  servo.write(angle);
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleUpdate() {
  addCORS();
  // Accept POST body (but do nothing here). Reply OK so web client doesn't fail.
  if (server.method() == HTTP_OPTIONS) {
    server.send(204, "text/plain", "");
    return;
  }
  String body = server.hasArg("plain") ? server.arg("plain") : String("{}");
  server.send(200, "application/json", "{\"ok\":true,\"received\":true}");
}

// Single JPEG frame
void handleCamFrame() {
  addCORS();
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "text/plain", "Camera capture failed");
    return;
  }
  server.sendHeader("Content-Type", "image/jpeg");
  server.sendHeader("Content-Length", String(fb->len));
  WiFiClient client = server.client();
  client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

// MJPEG stream
void handleStream() {
  addCORS();
  String boundary = "--frame";
  server.sendHeader("Cache-Control", "no-cache");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Connection", "close");
  server.sendHeader("Content-Type", "multipart/x-mixed-replace;boundary=" + boundary);
  WiFiClient client = server.client();

  while (true) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) break;
    client.printf("%s\r\n", boundary.c_str());
    client.printf("Content-Type: image/jpeg\r\n");
    client.printf("Content-Length: %u\r\n\r\n", fb->len);
    client.write(fb->buf, fb->len);
    client.printf("\r\n");
    esp_camera_fb_return(fb);
    // small delay to yield
    delay(50);
    if (!client.connected()) break;
  }
}

// ----------------- Setup -----------------
void setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_UXGA;
  config.jpeg_quality = 10;
  config.fb_count = 2;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);

  // pins
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  // PWM setup
  ledcSetup(CH_A, PWM_FREQ, PWM_RES);
  ledcAttachPin(ENA, CH_A);
  ledcSetup(CH_B, PWM_FREQ, PWM_RES);
  ledcAttachPin(ENB, CH_B);

  pinMode(TURBIDITY_PIN, INPUT);

  servo.attach(SERVO_PIN);
  servo.write(0);

  mStop();

  // camera
  setupCamera();

  // WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print('.');
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Connected — IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi failed to connect");
  }

  // routes
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/telemetry", HTTP_GET, handleTelemetry);
  server.on("/move", HTTP_GET, handleMove);
  server.on("/servo", HTTP_GET, handleServo);
  server.on("/update", HTTP_POST, handleUpdate);
  server.on("/update", HTTP_OPTIONS, handleUpdate);
  server.on("/cam/frame", HTTP_GET, handleCamFrame);
  server.on("/stream", HTTP_GET, handleStream);

  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();
}
