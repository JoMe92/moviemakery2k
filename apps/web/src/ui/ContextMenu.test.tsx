import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
  it("is keyboard-operable and closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const first = vi.fn();
    const second = vi.fn();
    render(
      <ContextMenu
        label="Aktionen"
        x={10}
        y={10}
        onClose={onClose}
        items={[
          { label: "Eins", onSelect: first },
          { label: "Aus", onSelect: vi.fn(), disabled: true },
          { label: "Zwei", onSelect: second },
        ]}
      />,
    );
    const items = screen.getAllByRole("menuitem");
    expect(screen.getByRole("menu", { name: "Aktionen" })).toBeInTheDocument();
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[2]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{End}{Enter}");
    expect(second).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    await user.click(items[1] as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on a click outside", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <button type="button">daneben</button>
        <ContextMenu label="M" x={0} y={0} onClose={onClose} items={[]} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "daneben" }));
    expect(onClose).toHaveBeenCalled();
  });
});
