// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { attachSpaceMouse, spaceMouseAxis } from "@/lib/spaceMouse";

class Stream {
  static current: Stream;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() { Stream.current = this; }
  send(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
let frame: FrameRequestCallback;
let focused = true;
let controls: OrbitControls;
let time = 1000;
const values = { yaw: 0, pitch: 0, roll: 0, pan: 0, panVertical: 0, zoom: 0 };

beforeEach(() => {
  focused = true;
  time = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("EventSource", Stream);
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frame = fn; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  window.history.replaceState({}, "", "http://localhost:3000/");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  controls = {
    object: camera, target: new THREE.Vector3(), enabled: true,
    minDistance: 1, maxDistance: 6000, minZoom: 0.1, maxZoom: 100,
    update: vi.fn(), dispose: vi.fn(),
  } as unknown as OrbitControls;
  attachSpaceMouse(controls);
});
afterEach(() => { controls.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function tick(ms = 16) { time += ms; frame(time); }

describe("SpaceMouse camera input", () => {
  it("retains speed control above the old 350 cap", () => {
    expect(spaceMouseAxis(0)).toBe(0);
    expect(spaceMouseAxis(35)).toBe(0);
    expect(spaceMouseAxis(450)).toBeGreaterThan(spaceMouseAxis(350));
    expect(spaceMouseAxis(500)).toBe(1);
    expect(spaceMouseAxis(-500)).toBe(-1);
    expect(spaceMouseAxis(Number.NaN)).toBe(0);
  });
  it("keeps orbiting on successive frames while held, then stops on stale input", () => {
    Stream.current.send({ ...values, yaw: 400 });
    tick(); const first = controls.object.position.x;
    tick(); expect(Math.abs(controls.object.position.x)).toBeGreaterThan(Math.abs(first));
    const held = controls.object.position.clone();
    tick(200); expect(controls.object.position.equals(held)).toBe(true);
  });
  it("pans camera and target together without rotating or changing distance", () => {
    const offset = controls.object.position.clone().sub(controls.target);
    Stream.current.send({ ...values, pan: 300, panVertical: 200 });
    tick();
    expect(controls.target.length()).toBeGreaterThan(0);
    expect(controls.object.position.clone().sub(controls.target).distanceTo(offset)).toBeLessThan(1e-10);
  });
  it("does not move an unfocused editor", () => {
    focused = false;
    Stream.current.send({ ...values, yaw: 500, pan: 500 });
    tick(); expect(controls.object.position.toArray()).toEqual([0, 0, 100]);
  });
  it("fires buttons once per press and never replays them after reconnecting", () => {
    const home = vi.fn(), focus = vi.fn();
    window.addEventListener("layerling:spacemouse-home", home);
    window.addEventListener("layerling:spacemouse-focus", focus);
    Stream.current.send({ ...values, homePresses: 5, focusPresses: 8 });
    expect(home).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
    Stream.current.send({ ...values, homePresses: 6, focusPresses: 9 });
    Stream.current.send({ ...values, homePresses: 6, focusPresses: 9 });
    expect(home).toHaveBeenCalledTimes(1); expect(focus).toHaveBeenCalledTimes(1);
    Stream.current.onerror?.();
    Stream.current.send({ ...values, homePresses: 8, focusPresses: 12 });
    expect(home).toHaveBeenCalledTimes(1); expect(focus).toHaveBeenCalledTimes(1);
    window.removeEventListener("layerling:spacemouse-home", home);
    window.removeEventListener("layerling:spacemouse-focus", focus);
  });
});
