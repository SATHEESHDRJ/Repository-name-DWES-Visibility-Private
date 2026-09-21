export const SCENE_SCALE = 0.001;

export const DOOR_OPEN_ANGLE_RAD = Math.PI / 2;
export const DOOR_ANIM_MS = 300;

export interface PanelMm { height: number; width: number; depth: number; }

export function mmToWorld(xMm: number, yMm: number, zMm: number, panel: PanelMm) {
  return {
    x: (xMm - panel.width / 2) * SCENE_SCALE,
    y: (yMm - panel.height / 2) * SCENE_SCALE,
    z: (zMm - panel.depth / 2) * SCENE_SCALE,
  };
}

export function doorHingePosition(panel: PanelMm): [number, number, number] {
  return [
    (-panel.width / 2) * SCENE_SCALE,
    0,
    (-panel.depth / 2) * SCENE_SCALE,
  ];
}

export function cameraFitPosition(panel: PanelMm): [number, number, number] {
  const diagMm = Math.sqrt(panel.width ** 2 + panel.height ** 2 + panel.depth ** 2);
  const dist = diagMm * SCENE_SCALE * 1.5;
  return [0, 0, dist];
}

export function cameraFrontPosition(panel: PanelMm): [number, number, number] {
  return [0, 0, (panel.depth / 2 + panel.height) * SCENE_SCALE];
}

export function cameraRearPosition(panel: PanelMm): [number, number, number] {
  return [0, 0, -(panel.depth / 2 + panel.height) * SCENE_SCALE];
}

export function doorRotationY(open: boolean): number {
  return open ? -DOOR_OPEN_ANGLE_RAD : 0;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
