import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAppStore } from "../store/appStore";
import { mockApi } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";
import { LOCALE_STORAGE_KEY } from "./locale";
import { useT } from "./useT";

function Probe() {
  const { t, formatTime, formatNumber, locale } = useT();
  return (
    <p>
      {locale}|{t("common.cancel")}|{formatTime(12.5)}|{formatNumber(2.5, 2)}
    </p>
  );
}

describe("locale in the store", () => {
  it("tests start in German", () => {
    expect(createAppStore(mockApi()).getState().locale).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("switches without reload, persists and updates <html lang>", () => {
    const store = createAppStore(mockApi());
    render(
      <AppStoreContext.Provider value={store}>
        <Probe />
      </AppStoreContext.Provider>,
    );
    expect(screen.getByText("de|Abbrechen|0:00:12,50|2,50")).toBeInTheDocument();
    act(() => store.getState().setLocale("en"));
    expect(screen.getByText("en|Cancel|0:00:12.50|2.50")).toBeInTheDocument();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("an explicit locale option overrides detection", () => {
    expect(createAppStore(mockApi(), { locale: "en" }).getState().locale).toBe("en");
  });
});
