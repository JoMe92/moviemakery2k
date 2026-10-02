import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskGroup } from "./TaskGroup";
import { TaskLink } from "./TaskLink";

describe("TaskGroup", () => {
  it("collapses and expands on click", async () => {
    const user = userEvent.setup();
    render(
      <TaskGroup title="1. Aufnehmen">
        <TaskLink>Bilder importieren</TaskLink>
      </TaskGroup>,
    );
    const header = screen.getByRole("button", { name: "1. Aufnehmen" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Bilder importieren" })).toBeVisible();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Bilder importieren" })).toBeNull();

    await user.keyboard("{Enter}");
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("reports the new state only via onToggle in controlled mode", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <TaskGroup title="2. Film bearbeiten" expanded={false} onToggle={onToggle}>
        <TaskLink>Sammlungen anzeigen</TaskLink>
      </TaskGroup>,
    );
    const header = screen.getByRole("button", { name: "2. Film bearbeiten" });
    await user.click(header);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(header).toHaveAttribute("aria-expanded", "false");
  });
});

describe("TaskLink", () => {
  it("triggers no action when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ul>
        <TaskLink disabled onClick={onClick}>
          Videoeffekte anzeigen
        </TaskLink>
      </ul>,
    );
    const link = screen.getByRole("button", { name: "Videoeffekte anzeigen" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    await user.click(link);
    link.focus();
    await user.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when enabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ul>
        <TaskLink onClick={onClick}>Videoübergänge anzeigen</TaskLink>
      </ul>,
    );
    const link = screen.getByRole("button", { name: "Videoübergänge anzeigen" });
    expect(link).not.toHaveAttribute("aria-disabled");
    await user.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
