import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tile } from "./Tile";

describe("Tile", () => {
  it("ist fokussierbar und zeigt die Auswahl über aria-pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Tile caption="Strand.jpg" onClick={onClick} />);
    const tile = screen.getByRole("button", { name: "Strand.jpg" });
    expect(tile).toHaveAttribute("aria-pressed", "false");

    await user.tab();
    expect(tile).toHaveFocus();
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Tile caption="Strand.jpg" selected onClick={onClick} />);
    expect(tile).toHaveAttribute("aria-pressed", "true");
  });
});
