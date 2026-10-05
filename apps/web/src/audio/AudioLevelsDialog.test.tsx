/**
 * Clip → "Audio-Pegel…" (add-narration-and-audio-levels design.md D4): one
 * slider for the whole movie between the sound of the video clips and music
 * plus narration.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AudioLevelsDialog } from "./AudioLevelsDialog";

function open(balance = 50, onConfirm = vi.fn(() => true)) {
  const onClose = vi.fn();
  render(<AudioLevelsDialog open balance={balance} onConfirm={onConfirm} onClose={onClose} />);
  return { slider: screen.getByRole("slider", { name: "Pegel" }), onConfirm, onClose };
}

describe("AudioLevelsDialog", () => {
  it("shows the project's level between the two sides", () => {
    const { slider } = open(50);
    expect(slider).toHaveValue("50");
    expect(screen.getByText("Ton von Videoclips")).toBeInTheDocument();
    expect(screen.getByText("Musik und Erzählung")).toBeInTheDocument();
    expect(slider).toHaveAttribute("aria-valuetext", "100 % Clip-Ton, 100 % Musik und Erzählung");
  });

  it.each([
    [0, "0 % Clip-Ton, 100 % Musik und Erzählung"],
    [50, "100 % Clip-Ton, 100 % Musik und Erzählung"],
    [100, "100 % Clip-Ton, 0 % Musik und Erzählung"],
  ])("says what level %s does to the two sides", (balance, text) => {
    const { slider } = open(balance);
    expect(slider).toHaveAttribute("aria-valuetext", text);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("applies the moved slider on OK", async () => {
    const user = userEvent.setup();
    const { slider, onConfirm, onClose } = open(50);
    fireEvent.change(slider, { target: { value: "80" } });
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(80);
    expect(onClose).toHaveBeenCalled();
  });

  it("changes nothing on Cancel", async () => {
    const user = userEvent.setup();
    const { slider, onConfirm, onClose } = open(50);
    fireEvent.change(slider, { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the store refuses the value", async () => {
    const user = userEvent.setup();
    const { onClose } = open(
      50,
      vi.fn(() => false),
    );
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
