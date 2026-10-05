import { describe, expect, it, vi } from "vitest";
import { translator } from "../i18n/t";
import { buildTaskGroups, type TaskContext } from "./tasks";

function context(patch: Partial<TaskContext> = {}): TaskContext {
  return {
    collection: "media",
    hasSlides: false,
    requestImport: vi.fn(),
    setCollection: vi.fn(),
    openExportWizard: vi.fn(),
    openTitleWizard: vi.fn(),
    ...patch,
  };
}

const entry = (groups: ReturnType<typeof buildTaskGroups>, id: string) =>
  groups.flatMap((g) => g.entries).find((e) => e.id === id);

describe("buildTaskGroups (design.md D4)", () => {
  it("lists the three task groups with the desktop entries", () => {
    const groups = buildTaskGroups(context(), translator("de"));
    expect(groups.map((g) => g.title)).toEqual([
      "1. Aufnehmen",
      "2. Film bearbeiten",
      "3. Film fertig stellen",
    ]);
    expect(groups.map((g) => g.entries.map((e) => e.label))).toEqual([
      ["Video importieren", "Bilder importieren", "Audio oder Musik importieren"],
      [
        "Sammlungen anzeigen",
        "Videoeffekte anzeigen",
        "Videoübergänge anzeigen",
        "Titel oder Nachspann erstellen",
      ],
      ["Auf dem Computer speichern", "Im Web veröffentlichen"],
    ]);
  });

  it("enables saving only with slides", () => {
    expect(entry(buildTaskGroups(context(), translator("de")), "saveToComputer")?.disabled).toBe(
      true,
    );
    const ctx = context({ hasSlides: true });
    const save = entry(buildTaskGroups(ctx, translator("de")), "saveToComputer");
    expect(save?.disabled).toBe(false);
    save?.run?.();
    expect(ctx.openExportWizard).toHaveBeenCalledOnce();
  });

  it("runs the same store actions as the task pane", () => {
    const ctx = context({ collection: "music" });
    const groups = buildTaskGroups(ctx, translator("en"));
    entry(groups, "importPictures")?.run?.();
    entry(groups, "importAudio")?.run?.();
    entry(groups, "showCollections")?.run?.();
    entry(groups, "showTransitions")?.run?.();
    expect(ctx.requestImport).toHaveBeenNthCalledWith(1, "pictures");
    expect(ctx.requestImport).toHaveBeenNthCalledWith(2, "audio");
    expect(ctx.setCollection).toHaveBeenNthCalledWith(1, "music");
    expect(ctx.setCollection).toHaveBeenNthCalledWith(2, "transitions");
    expect(entry(groups, "importPictures")?.label).toBe("Import pictures");
  });
});
