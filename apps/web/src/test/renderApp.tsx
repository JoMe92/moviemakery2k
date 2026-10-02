import { render } from "@testing-library/react";
import { App } from "../App";
import type { Api } from "../lib/apiClient";
import { createAppStore } from "../store/appStore";
import { mockApi } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";

/** Rendert die App mit einem Store über eine gemockte API und startet das Laden. */
export function renderApp(api: Api = mockApi()) {
  const store = createAppStore(api);
  const view = render(
    <AppStoreContext.Provider value={store}>
      <App />
    </AppStoreContext.Provider>,
  );
  const ready = store.getState().init();
  return { ...view, store, api, ready };
}
