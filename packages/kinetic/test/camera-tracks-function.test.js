/**
 * camera() and cameraAt() take the camera's numbers: a tracks object, or what
 * a moves() camera returns when it is called, CAM(t). Given the moves()
 * function itself, they throw KN-100 and say to call it: read as tracks, the
 * function would give a camera at rest and a picture that never moves.
 */
import { describe, it, expect } from 'vitest';
import { load, expectKN, BUILD, CORE_TIER } from './helpers.js';

describe(`camera(t, tracks) given a moves() function (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('cameraAt() and camera() refuse the function and say to call it; called, it is the camera', async () => {
    const { wf } = await load();
    const { moves, camera, cameraAt } = wf.kinetic;
    const CAM = moves([{ to: { x: -260, y: 120, z: 350 } }, { t: 1, d: 1, to: { x: 0, y: 0, z: 60 } }]);
    expectKN(() => cameraAt(0.5, CAM), 'KN-100', 'cameraAt(t, tracks)', /CAM\(t\)|call/);
    expectKN(() => camera(0.5, CAM), 'KN-100', 'camera(t, tracks)', /CAM\(t\)|call/);
    expect(cameraAt(0.5, CAM(0.5)).x).toBe(-260);
    expect(cameraAt(0.5).x).toBe(0);
    expect(cameraAt(0.5, null).x).toBe(0);
  });
});
