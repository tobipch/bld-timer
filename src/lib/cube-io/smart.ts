/// <reference types="web-bluetooth" />
import { outerMoveFromString } from "../cube/alg";
import type { CubeIO, CubeMoveMsg } from "./types";

/**
 * btcube-web connection (QiYi / MoYu smart cubes over Web Bluetooth).
 * QiYi cubes need their MAC address to derive the encryption key; we cache
 * it per device and otherwise ask the user once.
 */
export async function connectSmartCubeIO(): Promise<CubeIO> {
  const { connectSmartCube } = await import("btcube-web");

  const cube = await connectSmartCube(async (device: BluetoothDevice) => {
    const cacheKey = `bld-timer.mac.${device.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
    const guess = macFromName(device.name ?? "");
    const mac = window.prompt(
      `MAC address for "${device.name ?? "cube"}" (printed on the box / in the vendor app):`,
      guess ?? "",
    );
    if (!mac) throw new Error("MAC address required for this cube");
    localStorage.setItem(cacheKey, mac.trim());
    return mac.trim();
  });

  const moveListeners = new Set<(m: CubeMoveMsg) => void>();
  const batteryListeners = new Set<(pct: number) => void>();

  const movesSub = cube.events.moves.subscribe((ev) => {
    let move;
    try {
      move = outerMoveFromString(ev.move);
    } catch {
      return; // ignore anything that isn't an outer turn
    }
    const msg: CubeMoveMsg = {
      move,
      tLocal: ev.localTimestamp ?? Math.round(performance.now()),
      tCube: ev.cubeTimestamp,
    };
    for (const cb of moveListeners) cb(msg);
  });
  const infoSub = cube.events.info.subscribe((ev) => {
    if (ev.type === "battery") for (const cb of batteryListeners) cb(ev.battery);
  });

  return {
    kind: "smart",
    name: cube.device.name ?? "Smart cube",
    onMove(cb) {
      moveListeners.add(cb);
      return () => moveListeners.delete(cb);
    },
    onBattery(cb) {
      batteryListeners.add(cb);
      return () => batteryListeners.delete(cb);
    },
    disconnect() {
      movesSub.unsubscribe();
      infoSub.unsubscribe();
      try {
        cube.device.gatt?.disconnect();
      } catch {
        // already gone
      }
    },
  };
}

/** Some QiYi cubes encode the MAC in the advertised name (e.g. "QY-QYSC-...-ABCDEF"). */
function macFromName(name: string): string | null {
  const m = /([0-9A-Fa-f]{12})$/.exec(name.replace(/[^0-9A-Fa-f]/g, ""));
  if (!m) return null;
  return m[1].match(/.{2}/g)!.join(":").toUpperCase();
}
