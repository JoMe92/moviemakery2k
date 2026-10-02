import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreviewCanvas } from "./PreviewCanvas";

describe("PreviewCanvas", () => {
  it("zeigt ohne WebGL2 eine Meldung statt eines leeren Bildes", () => {
    render(
      <PreviewCanvas frame={{ kind: "empty" }} images={() => undefined} params={() => ({})} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Die Vorschau benötigt WebGL2. Import und Storyboard funktionieren weiterhin.",
    );
    expect(screen.queryByRole("img", { name: "Vorschaubild" })).toBeNull();
  });
});
