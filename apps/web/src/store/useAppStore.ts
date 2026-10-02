import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { AppState, AppStore } from "./appStore";

export const AppStoreContext = createContext<AppStore | null>(null);

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error("AppStoreContext fehlt");
  return useStore(store, selector);
}

export function useAppStoreApi(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error("AppStoreContext fehlt");
  return store;
}
