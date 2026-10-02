import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreviewCanvas, WEBGL2_MISSING_MESSAGE } from "./PreviewCanvas";

describe("PreviewCanvas", () => {
  it("zeigt ohne WebGL2 eine Meldung statt eines leeren Bildes", () => {
    render(
      <PreviewCanvas frame={{ kind: "empty" }} images={() => undefined} params={() => ({})} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(WEBGL2_MISSING_MESSAGE);
    expect(screen.queryByRole("img", { name: "Vorschaubild" })).toBeNull();
  });
});
