import { afterEach, describe, expect, it, vi } from "vitest";
import { clone, roundRectPath, uuid, wheelDeltaPixels } from "../src/engine/compat";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("uuid", () => {
  it("uses crypto.randomUUID when available", () => {
    expect(uuid()).toMatch(UUID_V4);
  });

  it("falls back to getRandomValues when randomUUID is missing (insecure contexts, old Safari)", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(7) });
    expect(uuid()).toMatch(UUID_V4);
  });

  it("falls back to Math.random when crypto is missing entirely", () => {
    vi.stubGlobal("crypto", undefined);
    const ids = new Set(Array.from({ length: 50 }, () => uuid()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});

describe("clone", () => {
  it("deep-copies with and without structuredClone", () => {
    const original = { a: [1, 2, { b: "x" }] };
    const native = clone(original);
    expect(native).toEqual(original);
    expect(native.a).not.toBe(original.a);

    vi.stubGlobal("structuredClone", undefined);
    const fallback = clone(original);
    expect(fallback).toEqual(original);
    expect(fallback.a[2]).not.toBe(original.a[2]);
  });
});

describe("roundRectPath", () => {
  const fakeCtx = (withNative: boolean) => {
    const calls: string[] = [];
    const ctx = {
      moveTo: () => calls.push("moveTo"),
      arcTo: () => calls.push("arcTo"),
      closePath: () => calls.push("closePath"),
      ...(withNative ? { roundRect: () => calls.push("roundRect") } : {}),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };

  it("uses the native roundRect when present", () => {
    const { ctx, calls } = fakeCtx(true);
    roundRectPath(ctx, 0, 0, 10, 10, 2);
    expect(calls).toEqual(["roundRect"]);
  });

  it("draws four arcs when roundRect is missing", () => {
    const { ctx, calls } = fakeCtx(false);
    roundRectPath(ctx, 0, 0, 10, 10, 2);
    expect(calls.filter((c) => c === "arcTo")).toHaveLength(4);
    expect(calls).toContain("closePath");
  });
});

describe("wheelDeltaPixels", () => {
  it("passes pixel deltas through", () => {
    expect(wheelDeltaPixels({ deltaX: 3, deltaY: 40, deltaMode: 0 }, 800)).toEqual({ dx: 3, dy: 40 });
  });

  it("converts Firefox-style line deltas to pixels", () => {
    expect(wheelDeltaPixels({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 800)).toEqual({ dx: 0, dy: 48 });
  });

  it("converts page deltas using the viewport height", () => {
    expect(wheelDeltaPixels({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 800)).toEqual({ dx: 0, dy: 800 });
  });
});
