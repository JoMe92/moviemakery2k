import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Info</Button>
      <Dialog
        open={open}
        title="Info über moviemakerY2K"
        onClose={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>OK</Button>}
      >
        <p>Kein Microsoft-Produkt.</p>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("opens modally, closes with Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Info" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Info über moviemakerY2K" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Info" }));
    const ok = screen.getByRole("button", { name: "OK" });
    const close = screen.getByRole("button", { name: "Schließen" });

    expect(ok).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(ok).toHaveFocus();
  });

  it("closes via the close button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Info" }));
    await user.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
