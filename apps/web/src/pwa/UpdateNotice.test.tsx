import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "../store/appStore";
import { mockApi } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";
import { updateState } from "./serviceWorker";
import { UpdateNotice } from "./UpdateNotice";

afterEach(() => updateState.set(null));

function renderNotice(locale: "de" | "en") {
  const store = createAppStore(mockApi());
  store.getState().setLocale(locale);
  return render(
    <AppStoreContext.Provider value={store}>
      <UpdateNotice />
    </AppStoreContext.Provider>,
  );
}

describe("UpdateNotice", () => {
  it("is hidden while no new version waits", () => {
    renderNotice("en");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the notice and reloads into the new version (en)", async () => {
    const update = vi.fn(async (_reload?: boolean) => {});
    renderNotice("en");
    act(() => updateState.set(update));
    expect(screen.getByRole("status")).toHaveTextContent("New version available.");
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(update).toHaveBeenCalledWith(true);
  });

  it("is translated into German", () => {
    renderNotice("de");
    act(() => updateState.set(async () => {}));
    expect(screen.getByRole("status")).toHaveTextContent("Neue Version verfügbar.");
    expect(screen.getByRole("button", { name: "Neu laden" })).toBeInTheDocument();
  });
});
