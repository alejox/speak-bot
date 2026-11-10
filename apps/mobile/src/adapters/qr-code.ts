import QRCode from "qrcode";

/** Renders `text` as a QR code SVG, returned as a data URL for an <img>. */
export async function createQrCodeImage(text: string): Promise<string> {
  const svg = await QRCode.toString(text, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
