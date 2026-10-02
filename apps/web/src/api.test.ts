import { describe, expect, it } from "vitest";
import { describeHealth } from "./api";

describe("describeHealth", () => {
  it("meldet ein nicht erreichbares Backend", () => {
    expect(describeHealth(null)).toBe("Backend nicht erreichbar");
  });

  it("zeigt die FFmpeg-Version", () => {
    expect(describeHealth({ status: "ok", ffmpeg: "7.1" })).toBe("Backend bereit · FFmpeg 7.1");
  });

  it("warnt, wenn FFmpeg fehlt", () => {
    expect(describeHealth({ status: "ok", ffmpeg: null })).toBe("Backend bereit · FFmpeg fehlt");
  });
});
