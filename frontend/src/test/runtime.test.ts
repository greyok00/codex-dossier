import { beforeEach, describe, expect, it, vi } from "vitest";

describe("default app services", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reuses the singleton service object and caches the first location lookup", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 33.4484,
          longitude: -112.074,
          accuracy: 1,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
    });

    Object.defineProperty(globalThis.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition,
      },
    });

    const { createDefaultAppServices } = await import("../lib/runtime");
    const first = createDefaultAppServices();
    const second = createDefaultAppServices();

    expect(first).toBe(second);

    const firstResult = await first.getCurrentPosition();
    const secondResult = await second.getCurrentPosition();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual({
      lat: 33.4484,
      lng: -112.074,
      address: null,
    });
    expect(secondResult).toEqual(firstResult);
  });
});
