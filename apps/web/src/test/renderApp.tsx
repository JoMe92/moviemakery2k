import { render } from "@testing-library/react";
import { App } from "../App";
import type { AppApi } from "../lib/apiClient";
import { createAppStore } from "../store/appStore";
import { mockApi } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";

/** Renders the app with a store over a mocked API and starts loading. */
export function renderApp(api: AppApi = mockApi()) {
  const store = createAppStore(api);
  const view = render(
    <AppStoreContext.Provider value={store}>
      <App />
    </AppStoreContext.Provider>,
  );
  const ready = store.getState().init();
  return { ...view, store, api, ready };
}
