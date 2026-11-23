#pragma once
// esp_camera.h para el modo compatible: la cámara está simulada. esp_camera_fb_get() entrega un cuadro
// pequeño marcado; cuando el ESP32 lo envía con Content-Type image/jpeg, el panel Navegador muestra la
// imagen de prueba de la cámara con la resolución configurada.
#include <Arduino.h>
#include "sensor.h"
typedef enum { CAMERA_GRAB_WHEN_EMPTY, CAMERA_GRAB_LATEST } camera_grab_mode_t;
typedef enum { CAMERA_FB_IN_PSRAM, CAMERA_FB_IN_DRAM } camera_fb_location_t;
typedef enum { LEDC_TIMER_0, LEDC_TIMER_1, LEDC_TIMER_2, LEDC_TIMER_3 } ledc_timer_t;
typedef enum { LEDC_CHANNEL_0, LEDC_CHANNEL_1, LEDC_CHANNEL_2, LEDC_CHANNEL_3, LEDC_CHANNEL_4, LEDC_CHANNEL_5, LEDC_CHANNEL_6, LEDC_CHANNEL_7 } ledc_channel_t;
typedef struct {
  int pin_pwdn, pin_reset, pin_xclk;
  union { int pin_sccb_sda; int pin_sscb_sda; };
  union { int pin_sccb_scl; int pin_sscb_scl; };
  int pin_d7, pin_d6, pin_d5, pin_d4, pin_d3, pin_d2, pin_d1, pin_d0, pin_vsync, pin_href, pin_pclk;
  long xclk_freq_hz; ledc_timer_t ledc_timer; ledc_channel_t ledc_channel;
  pixformat_t pixel_format; framesize_t frame_size; int jpeg_quality; size_t fb_count;
  camera_fb_location_t fb_location; camera_grab_mode_t grab_mode; int sccb_i2c_port;
} camera_config_t;
struct timeval_cam { long tv_sec; long tv_usec; };
typedef struct { uint8_t *buf; size_t len; size_t width; size_t height; pixformat_t format; struct timeval_cam timestamp; } camera_fb_t;
#define ESP_ERR_CAMERA_NOT_DETECTED 0x20001
esp_err_t esp_camera_init(const camera_config_t *config);
esp_err_t esp_camera_deinit(void);
camera_fb_t *esp_camera_fb_get(void);
void esp_camera_fb_return(camera_fb_t *fb);
sensor_t *esp_camera_sensor_get(void);
bool frame2jpg(camera_fb_t *fb, uint8_t quality, uint8_t **out, size_t *out_len);
