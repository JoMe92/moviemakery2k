import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AboutDialog } from "../shell/AppDialogs";
import { mockLayout } from "../test/mockLayout";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

function Harness({ height }: { height?: "auto" | "full" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Sammlung</Button>
      <Sheet
        open={open}
        title="Meine Bilder"
        height={height}
        onClose={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>Hinzufügen</Button>}
      >
        <Button>Bild A</Button>
      </Sheet>
    </>
  );
}

async function openSheet() {
  const user = userEvent.setup();
  const view = render(<Harness />);
  const opener = screen.getByRole("button", { name: "Sammlung" });
  await user.click(opener);
  const sheet = screen.getByRole("dialog", { name: "Meine Bilder" });
  return { user, opener, sheet, view };
}

function grip(sheet: HTMLElement): HTMLElement {
  const el = sheet.querySelector<HTMLElement>(".grip");
  if (!el) throw new Error("grip missing");
  return el;
}

function swipe(el: HTMLElement, dy: number, duration = 300) {
  const now = vi.spyOn(performance, "now").mockReturnValue(1000);
  fireEvent.pointerDown(el, { pointerId: 1, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientY: 100 + dy / 2 });
  now.mockReturnValue(1000 + duration);
  fireEvent.pointerUp(el, { pointerId: 1, clientY: 100 + dy });
  now.mockRestore();
}

describe("Sheet (design.md D5)", () => {
  it("opens modally from the bottom and focuses the content", async () => {
    const { sheet } = await openSheet();
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toHaveClass("sheet");
    expect(screen.getByRole("button", { name: "Bild A" })).toHaveFocus();
  });

  it("closes via the close button and returns the focus", async () => {
    const { user, opener } = await openSheet();
    await user.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("closes with Escape and returns the focus", async () => {
    const { user, opener } = await openSheet();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("closes on a tap on the backdrop", async () => {
    const { user, sheet, opener } = await openSheet();
    const backdrop = sheet.querySelector<HTMLElement>(".backdrop");
    expect(backdrop).not.toBeNull();
    if (backdrop) await user.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("closes when swiped down at the grip by more than 80 px", async () => {
    const { sheet, opener } = await openSheet();
    swipe(grip(sheet), 81);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("stays open after a short, slow swipe and snaps back", async () => {
    const { sheet } = await openSheet();
    swipe(grip(sheet), 60, 400);
    expect(screen.getByRole("dialog", { name: "Meine Bilder" })).toBeInTheDocument();
    expect(sheet.querySelector<HTMLElement>(".panel")?.style.transform).toBe("");
  });

  it("closes after a short but fast swipe", async () => {
    const { sheet } = await openSheet();
    swipe(grip(sheet), 40, 50);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Tab focus inside the sheet", async () => {
    const { user } = await openSheet();
    const close = screen.getByRole("button", { name: "Schließen" });
    const add = screen.getByRole("button", { name: "Hinzufügen" });
    await user.tab();
    expect(add).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(add).toHaveFocus();
  });

  it("appears without animation for prefers-reduced-motion", async () => {
    mockLayout("compact", { reducedMotion: true });
    const { sheet } = await openSheet();
    expect(sheet).toHaveAttribute("data-motion", "reduce");
  });

  it("animates by default", async () => {
    mockLayout("compact");
    const { sheet } = await openSheet();
    expect(sheet).toHaveAttribute("data-motion", "full");
  });

  it("supports a full-height variant", async () => {
    const user = userEvent.setup();
    render(<Harness height="full" />);
    await user.click(screen.getByRole("button", { name: "Sammlung" }));
    expect(screen.getByRole("dialog").querySelector(".panel")).toHaveClass("full");
  });
});

describe("Dialog as a sheet", () => {
  it("shows Help → About as a bottom sheet in the compact layout", () => {
    mockLayout("compact");
    render(<AboutDialog open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Info über moviemakerY2K" });
    expect(dialog).toHaveClass("sheet");
    expect(dialog).toHaveTextContent("Version 0.1.0");
    expect(screen.getByRole("button", { name: "Dialog schließen" })).toBeInTheDocument();
  });

  it("stays a centered window dialog in the wide layout", () => {
    render(<AboutDialog open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Info über moviemakerY2K" });
    expect(dialog).toHaveClass("dialog");
    expect(dialog).not.toHaveClass("sheet");
  });
});
