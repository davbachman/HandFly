import { describe, expect, test } from "vitest";
import { createHandLandmarkerOptions, describeHandTrackerFrame } from "./handTrackerConfig";

describe("hand tracker configuration", () => {
  test("uses lenient confidence thresholds so MediaPipe can reacquire a visible hand", () => {
    const options = createHandLandmarkerOptions("GPU");

    expect(options.minHandDetectionConfidence).toBeLessThanOrEqual(0.4);
    expect(options.minHandPresenceConfidence).toBeLessThanOrEqual(0.4);
    expect(options.minTrackingConfidence).toBeLessThanOrEqual(0.4);
  });

  test("keeps GPU and CPU landmarker options structurally equivalent", () => {
    const gpu = createHandLandmarkerOptions("GPU");
    const cpu = createHandLandmarkerOptions("CPU");

    expect(gpu.baseOptions?.delegate).toBe("GPU");
    expect(cpu.baseOptions?.delegate).toBe("CPU");
    expect(cpu).toMatchObject({
      ...gpu,
      baseOptions: {
        ...gpu.baseOptions,
        delegate: "CPU",
      },
    });
  });
});

describe("describeHandTrackerFrame", () => {
  test("distinguishes active camera frames with no landmarks from camera loss", () => {
    expect(
      describeHandTrackerFrame({
        hasVideoFrame: true,
        detectionHiccup: false,
        landmarkCount: 0,
      }),
    ).toBe("Camera active - looking for hand landmarks");
  });

  test("uses the same active-camera message when landmarks disappear", () => {
    expect(
      describeHandTrackerFrame({
        hasVideoFrame: true,
        detectionHiccup: false,
        landmarkCount: 0,
      }),
    ).toBe("Camera active - looking for hand landmarks");
  });
});
