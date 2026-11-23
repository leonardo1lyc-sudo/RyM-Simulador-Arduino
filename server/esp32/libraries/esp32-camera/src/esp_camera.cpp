#include "esp_camera.h"
#include <string.h>
#include <stdio.h>
static const uint16_t SIZES[][2] = { {96,96},{160,120},{176,144},{240,176},{240,240},{320,240},{400,296},{480,320},{640,480},{800,600},{1024,768},{1280,720},{1280,1024},{1600,1200} };
static sensor_t cam; static camera_fb_t fb; static uint8_t frame[40]; static bool ready, taken; static uint16_t count;
static int okInt(sensor_t *, int) { return 0; }
static int setFs(sensor_t *s, framesize_t f) { if (f < FRAMESIZE_INVALID) s->status.framesize = f; return 0; }
static int setPf(sensor_t *s, pixformat_t p) { s->pixformat = p; return 0; }
static int setVflip(sensor_t *s, int v) { s->status.vflip = v; return 0; }
static int setHmirror(sensor_t *s, int v) { s->status.hmirror = v; return 0; }
static int setGc(sensor_t *, gainceiling_t) { return 0; }
esp_err_t esp_camera_init(const camera_config_t *c) {
  memset(&cam, 0, sizeof cam);
  cam.id.PID = OV2640_PID; cam.slv_addr = 0x30; cam.pixformat = c->pixel_format;
  cam.status.framesize = c->frame_size < FRAMESIZE_INVALID ? c->frame_size : FRAMESIZE_QVGA; cam.status.quality = c->jpeg_quality;
  cam.set_pixformat = setPf; cam.set_framesize = setFs; cam.set_vflip = setVflip; cam.set_hmirror = setHmirror; cam.set_gainceiling = setGc;
  cam_set_fn *f = &cam.set_contrast; for (cam_set_fn *e = &cam.set_lenc; f <= e; f++) if (!*f) *f = okInt;
  esp32_ram_buf = frame; ready = true; return ESP_OK;
}
esp_err_t esp_camera_deinit(void) { ready = false; return ESP_OK; }
camera_fb_t *esp_camera_fb_get(void) {
  if (!ready || taken) return NULL;
  const uint16_t *wh = SIZES[cam.status.framesize];
  // cuadro marcado: FF D8 … FF D9 con la resolución y el número de foto, lo interpreta el panel Navegador
  int n = snprintf((char *)frame + 2, sizeof frame - 4, "BANCOCAM:%u:%u:%u:%u", wh[0], wh[1], ++count, (cam.status.vflip ? 1 : 0) | (cam.status.hmirror ? 2 : 0));
  frame[0] = 0xFF; frame[1] = 0xD8; frame[n + 2] = 0xFF; frame[n + 3] = 0xD9;
  fb.buf = frame; fb.len = n + 4; fb.width = wh[0]; fb.height = wh[1]; fb.format = PIXFORMAT_JPEG;
  fb.timestamp.tv_sec = millis() / 1000; fb.timestamp.tv_usec = (millis() % 1000) * 1000L;
  taken = true; return &fb;
}
void esp_camera_fb_return(camera_fb_t *) { taken = false; }
sensor_t *esp_camera_sensor_get(void) { return ready ? &cam : NULL; }
bool frame2jpg(camera_fb_t *f, uint8_t, uint8_t **out, size_t *len) { *out = f->buf; *len = f->len; return true; }
