import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreviewCanvas } from "./PreviewCanvas";

describe("PreviewCanvas", () => {
  it("shows a message instead of a blank image without WebGL2", () => {
    render(
      <PreviewCanvas frame={{ kind: "empty" }} images={() => undefined} params={() => ({})} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Die Vorschau benötigt WebGL2. Import und Storyboard funktionieren weiterhin.",
    );
    expect(screen.queryByRole("img", { name: "Vorschaubild" })).toBeNull();
  });
});
