import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** Normalized velocity for the measured +/-500 device range, with a center deadzone. */
export function spaceMouseAxis(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) <= 35) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - 35) / 465);
}

/** Local SpaceMouse camera navigation. No pointer events or system input injection. */
export function attachSpaceMouse(controls: OrbitControls): void {
  if (!["127.0.0.1", "localhost"].includes(location.hostname)) return;
  const stream = new EventSource("http://127.0.0.1:3001/events");
  let yaw = 0, pitch = 0, pan = 0, zoom = 0, roll = 0, panVertical = 0, received = 0, previous = performance.now(), frame = 0;
  // This receiver reports up to 500; preserve speed control through full travel.
  let homePresses: number | undefined;
  let focusPresses: number | undefined;
  const axis = spaceMouseAxis;
  stream.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (Number.isSafeInteger(data.homePresses)) {
        const pressed = homePresses !== undefined && data.homePresses > homePresses;
        homePresses = data.homePresses;
        if (pressed && document.hasFocus() && !document.hidden && controls.enabled) {
          window.dispatchEvent(new CustomEvent("layerling:spacemouse-home"));
        }
      }
      if (Number.isSafeInteger(data.focusPresses)) {
        const pressed = focusPresses !== undefined && data.focusPresses > focusPresses;
        focusPresses = data.focusPresses;
        if (pressed && document.hasFocus() && !document.hidden && controls.enabled) {
          window.dispatchEvent(new CustomEvent("layerling:spacemouse-focus"));
        }
      }
      if (!Number.isFinite(data.yaw) || !Number.isFinite(data.pitch)) return;
      yaw = axis(data.yaw); pitch = axis(data.pitch);
      pan = axis(Number.isFinite(data.pan) ? data.pan : 0);
      zoom = -axis(Number.isFinite(data.zoom) ? data.zoom : 0);
      roll = axis(Number.isFinite(data.roll) ? data.roll : 0);
      panVertical = axis(Number.isFinite(data.panVertical) ? data.panVertical : 0);
      received = performance.now();
    } catch { yaw = pitch = pan = zoom = roll = panVertical = 0; }
  };
  stream.onerror = () => { homePresses = focusPresses = undefined; yaw = pitch = pan = zoom = roll = panVertical = 0; };
  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const right = new THREE.Vector3();
  const screenUp = new THREE.Vector3();
  const viewDirection = new THREE.Vector3();
  const toYUp = new THREE.Quaternion();
  const fromYUp = new THREE.Quaternion();
  const animate = (now: number) => {
    frame = requestAnimationFrame(animate);
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (!document.hasFocus() || document.hidden || !controls.enabled || now - received > 180 || (!yaw && !pitch && !pan && !zoom && !roll && !panVertical)) return;
    toYUp.setFromUnitVectors(controls.object.up, new THREE.Vector3(0, 1, 0));
    fromYUp.copy(toYUp).invert();
    offset.copy(controls.object.position).sub(controls.target).applyQuaternion(toYUp);
    spherical.setFromVector3(offset);
    spherical.theta -= yaw * dt * 0.9;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi - pitch * dt * 0.9, 0.02, Math.PI - 0.02);
    // Scale perspective distance exponentially for consistent zoom at any scale.
    if (controls.object instanceof THREE.PerspectiveCamera) {
      spherical.radius = THREE.MathUtils.clamp(
        spherical.radius * Math.exp(-zoom * dt * 1.2),
        controls.minDistance, controls.maxDistance,
      );
    } else if (controls.object instanceof THREE.OrthographicCamera) {
      controls.object.zoom = THREE.MathUtils.clamp(
        controls.object.zoom * Math.exp(zoom * dt * 1.2),
        controls.minZoom, controls.maxZoom,
      );
      controls.object.updateProjectionMatrix();
    }
    // Move the target and camera together along screen-right; never the pointer.
    controls.object.updateMatrixWorld();
    let viewWidth = spherical.radius;
    if (controls.object instanceof THREE.PerspectiveCamera) {
      viewWidth = 2 * spherical.radius * Math.tan(THREE.MathUtils.degToRad(controls.object.fov / 2)) * controls.object.aspect;
    } else if (controls.object instanceof THREE.OrthographicCamera) {
      viewWidth = (controls.object.right - controls.object.left) / controls.object.zoom;
    }
    right.setFromMatrixColumn(controls.object.matrixWorld, 0);
    controls.target.addScaledVector(right, -pan * dt * viewWidth * 0.6);
    let viewHeight = viewWidth;
    if (controls.object instanceof THREE.PerspectiveCamera) {
      viewHeight = viewWidth / controls.object.aspect;
    } else if (controls.object instanceof THREE.OrthographicCamera) {
      viewHeight = (controls.object.top - controls.object.bottom) / controls.object.zoom;
    }
    screenUp.setFromMatrixColumn(controls.object.matrixWorld, 1);
    controls.target.addScaledVector(screenUp, -panVertical * dt * viewHeight * 0.6);
    offset.setFromSpherical(spherical).applyQuaternion(fromYUp);
    controls.object.position.copy(controls.target).add(offset);
    if (roll) {
      viewDirection.copy(controls.target).sub(controls.object.position).normalize();
      controls.object.up.applyAxisAngle(viewDirection, -roll * dt * 0.9).normalize();
    }
    controls.update();
  };
  frame = requestAnimationFrame(animate);
  const dispose = controls.dispose.bind(controls);
  controls.dispose = () => { cancelAnimationFrame(frame); stream.close(); dispose(); };
}
