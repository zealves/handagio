import { describe, expect, it } from 'vitest';
import { cameraConstraints, CAMERA_FPS } from './camera';

describe('camera', () => {
  it('pede 640×360 por defeito e 480×270 com a resolução baixa, a 30 fps', () => {
    expect(cameraConstraints()).toEqual({
      width: { ideal: 640 },
      height: { ideal: 360 },
      frameRate: { ideal: CAMERA_FPS },
    });
    expect(cameraConstraints(true)).toMatchObject({
      width: { ideal: 480 },
      height: { ideal: 270 },
    });
    expect(CAMERA_FPS).toBe(30);
  });
});
