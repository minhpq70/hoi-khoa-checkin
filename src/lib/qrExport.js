import QRCode from 'qrcode'

// QR chứa mã phòng (D01 / T01) — không phải URL, không phải UUID.
// Ảnh QR dạng dataURL để hiện preview trên màn / nhúng vào Excel.
export function qrDataUrl(text, opts = {}) {
  return QRCode.toDataURL(text, { width: 240, margin: 1, ...opts })
}
