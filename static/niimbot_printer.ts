// niimbot.ts
// This file contains functions interface with the Niimbot D110 label printer 
// and issue label prints via Web-Bluetotth.

  
// -----------------------------
// Constants
// -----------------------------
// Maximum allowable height in pixels for D110 labels
export const NIIMBOT_D110_MAX_HEIGHT_PX = 100;

export const SERVICE_UUID = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
export const CHAR_UUID = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";

// -----------------------------
// NiimbotPacket class
// -----------------------------
  class NiimbotPacket {
    type: number;
    data: Uint8Array;

    constructor(type: number, data: Uint8Array) {
      this.type = type;
      this.data = data;
    }

    toBytes(): Uint8Array {
      let checksum = this.type ^ this.data.length;
      for (const b of this.data) checksum ^= b;

      const out = new Uint8Array(2 + 1 + 1 + this.data.length + 1 + 2); // 0x55 0x55 + type + len + data + checksum + 0xAA 0xAA
      out[0] = 0x55;
      out[1] = 0x55;
      out[2] = this.type;
      out[3] = this.data.length;
      out.set(this.data, 4);
      out[4 + this.data.length] = checksum;
      out[5 + this.data.length] = 0xAA;
      out[6 + this.data.length] = 0xAA;
      return out;
    }
  }

  // -----------------------------
  // Helper functions
  // -----------------------------

  export function resizeCanvasToFit(src: HTMLCanvasElement, maxWidth: number, maxHeight: number) {
    const scale = Math.min(maxWidth / src.width, maxHeight / src.height, 1);
    if (scale === 1) return src; // already fits

    const dst = document.createElement("canvas");
    dst.width = Math.floor(src.width * scale);
    dst.height = Math.floor(src.height * scale);

    const ctx = dst.getContext("2d")!;
    ctx.drawImage(src, 0, 0, dst.width, dst.height);
    return dst;
  }


  export function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  export function padToFullWidth(src: HTMLCanvasElement, fullWidth = NIIMBOT_D110_MAX_HEIGHT_PX) {
    const dst = document.createElement("canvas");
    dst.width = fullWidth;
    dst.height = src.height;

    const ctx = dst.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, dst.width, dst.height);

    const offset = Math.floor((fullWidth - src.width) / 2);
    ctx.drawImage(src, offset, 0);

    return dst;
  }

  export function canvasToMono(canvas: HTMLCanvasElement): { width: number; height: number; pixels: number[][] } {
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;

    const pixels: number[][] = [];
    for (let y = 0; y < h; y++) {
      const row: number[] = [];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = img[i];
        const g = img[i + 1];
        const b = img[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Invert: white=0, black=1
        row.push(lum < 128 ? 1 : 0);
      }
      pixels.push(row);
    }
    return { width: w, height: h, pixels };
  }

  export function generateRowPacket(y: number, row: number[]): NiimbotPacket {
    const width = row.length;
    let bits = "";
    for (let b of row) bits += b.toString();
    const rowBytes = new Uint8Array(Math.ceil(width / 8));
    for (let i = 0; i < rowBytes.length; i++) {
      const byteStr = bits.slice(i * 8, i * 8 + 8).padEnd(8, "0");
      rowBytes[i] = parseInt(byteStr, 2);
    }
    // header: y (2B big-endian), counts 0,0,0 (3B), 1 (height 1 row)
    const header = new Uint8Array(6);
    header[0] = (y >> 8) & 0xff;
    header[1] = y & 0xff;
    header[2] = 0;
    header[3] = 0;
    header[4] = 0;
    header[5] = 1;
    return new NiimbotPacket(0x85, new Uint8Array([...header, ...rowBytes]));
  }

  // -----------------------------
  // Connect to D110
  // -----------------------------
  export async function connectD110() {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "D110" }],
      optionalServices: [SERVICE_UUID],
    });

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const char = await service.getCharacteristic(CHAR_UUID);
    return { server, char };
  }

  // -----------------------------
  // Write NiimbotPacket over BLE
  // -----------------------------
  export async function writePacket(char: BluetoothRemoteGATTCharacteristic, pkt: NiimbotPacket) {
    const bytes = pkt.toBytes();
    const MTU = 160;
    for (let i = 0; i < bytes.length; i += MTU) {
      const chunk = bytes.slice(i, i + MTU);
      await char.writeValue(chunk);
      await sleep(10);
    }
  }

  // -----------------------------
  // Main canvas print function
  // -----------------------------
  export async function printCanvas(canvas: HTMLCanvasElement) {
    
    // 1) Resize to maximum allowable label width/height
    canvas = resizeCanvasToFit(canvas, NIIMBOT_D110_MAX_HEIGHT_PX, NIIMBOT_D110_MAX_HEIGHT_PX);

    // 2) Convert to monochrome pixels
    const { width, height, pixels } = canvasToMono(canvas);

    // 3) Connect
    const { server, char } = await connectD110();
    console.log("Connected…");

    // 4) START_PRINT
    await writePacket(char, new NiimbotPacket(0x01, new Uint8Array([0x01])));

    // 5) START_PAGE_PRINT
    await writePacket(char, new NiimbotPacket(0x03, new Uint8Array([0x01])));

    // 6) SET_DIMENSION (width, height) big-endian
    const dim = new Uint8Array([ (width >> 8) & 0xff, width & 0xff, (height >> 8) & 0xff, height & 0xff ]);
    await writePacket(char, new NiimbotPacket(0x13, dim));

    // 7) Send each row
    for (let y = 0; y < height; y++) {
      const rowPkt = generateRowPacket(y, pixels[y]);
      await writePacket(char, rowPkt);
    }

    // 8) END_PAGE_PRINT
    await writePacket(char, new NiimbotPacket(0xE3, new Uint8Array([0x01])));

    // 9) END_PRINT
    await writePacket(char, new NiimbotPacket(0xF3, new Uint8Array([0x01])));

    console.log("PRINT DONE")
  }