#pragma once
#include <stdint.h>
// Sensor de la cámara simulada (OV2640): los ajustes se aceptan y se guardan, no cambian la imagen.
typedef enum { PIXFORMAT_RGB565, PIXFORMAT_YUV422, PIXFORMAT_YUV420, PIXFORMAT_GRAYSCALE, PIXFORMAT_JPEG, PIXFORMAT_RGB888, PIXFORMAT_RAW, PIXFORMAT_RGB444, PIXFORMAT_RGB555 } pixformat_t;
typedef enum { FRAMESIZE_96X96, FRAMESIZE_QQVGA, FRAMESIZE_QCIF, FRAMESIZE_HQVGA, FRAMESIZE_240X240, FRAMESIZE_QVGA, FRAMESIZE_CIF, FRAMESIZE_HVGA, FRAMESIZE_VGA, FRAMESIZE_SVGA, FRAMESIZE_XGA, FRAMESIZE_HD, FRAMESIZE_SXGA, FRAMESIZE_UXGA, FRAMESIZE_INVALID } framesize_t;
typedef enum { GAINCEILING_2X, GAINCEILING_4X, GAINCEILING_8X, GAINCEILING_16X, GAINCEILING_32X, GAINCEILING_64X, GAINCEILING_128X } gainceiling_t;
#define OV2640_PID 0x26
#define OV3660_PID 0x3660
#define OV5640_PID 0x5640
typedef struct { uint8_t MIDH, MIDL; uint16_t PID; uint8_t VER; } sensor_id_t;
typedef struct { framesize_t framesize; int8_t brightness, contrast, saturation, sharpness; uint8_t quality, special_effect, wb_mode, awb, awb_gain, aec, aec2, agc, bpc, wpc, raw_gma, lenc, hmirror, vflip, dcw, colorbar; int8_t ae_level; uint16_t aec_value; uint8_t agc_gain; } camera_status_t;
typedef struct _sensor sensor_t;
typedef int (*cam_set_fn)(sensor_t *, int);
struct _sensor {
  sensor_id_t id; uint8_t slv_addr; pixformat_t pixformat; camera_status_t status;
  int (*set_pixformat)(sensor_t *, pixformat_t);
  int (*set_framesize)(sensor_t *, framesize_t);
  cam_set_fn set_contrast, set_brightness, set_saturation, set_sharpness, set_denoise, set_quality, set_colorbar, set_whitebal, set_gain_ctrl, set_exposure_ctrl, set_hmirror, set_vflip, set_aec2, set_awb_gain, set_agc_gain, set_aec_value, set_special_effect, set_wb_mode, set_ae_level, set_dcw, set_bpc, set_wpc, set_raw_gma, set_lenc;
  int (*set_gainceiling)(sensor_t *, gainceiling_t);
};
