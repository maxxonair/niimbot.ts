<h1 align="center">
niimbot.ts
</h1>
<p align="center">
Niimbot D110 printer client in typescript
</p>

### In Short

This repository contains a client for the Niimbot D110 label printer written in typescript. It is meant to be added to web development projects to allow printing directly from the browser using Web-Bluetooth. The interface uses methods from this [niimprint python client](https://github.com/AndBondStyle/niimprint).

### Compatability 

This is currently used embedded in a svelte project and has been tested with the D110 printer. The interface most likely works with other Niimbot printers, but that remains to be tested.

#### Web-Bluetooth

:warning: As this naturally relies on Web-Bluetooth,  note that it will only run with the following browsers:

| Platform                     | Supported?                  |
| ---------------------------- | --------------------------- |
| **Chrome (desktop)**         | ✅ Yes                       |
| **Chrome on Android**        | ✅ Yes                       |
| **Edge (Chromium)**          | ⚠️ Partial                  |
| **Firefox**                  | ❌ No                        |
| **Safari (Mac/iOS)**         | ❌ No                        |
| **Any browser in an iframe** | ❌ No (unless special flags) |
| **On http:// URLs**          | ❌ No                        |
| **On localhost**             | ✅ Yes                       |

##### Enable Web-Bluetooth

For the printer connection Web-Bluetooth needs to be enabled in Chrome: