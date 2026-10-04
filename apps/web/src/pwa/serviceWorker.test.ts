import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type RegisterOptions,
  type Registrar,
  registerServiceWorker,
  type ServiceWorkerEnv,
  shouldRegister,
  updateState,
} from "./serviceWorker";

const build: ServiceWorkerEnv = { prod: true, secure: true, supported: true };

function fakeRegistrar() {
  const update = vi.fn(async (_reload?: boolean) => {});
  let options: RegisterOptions | undefined;
  const register = vi.fn((opts: RegisterOptions) => {
    options = opts;
    return update;
  });
  return { register, update, options: () => options };
}

afterEach(() => updateState.set(null));

describe("registerServiceWorker", () => {
  it("registers in the build in a secure context", async () => {
    const fake = fakeRegistrar();
    expect(await registerServiceWorker(build, async () => fake.register as Registrar)).toBe(true);
    expect(fake.register).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["insecure context (HTTP in the LAN)", { ...build, secure: false }],
    ["dev server", { ...build, prod: false }],
    ["no service worker support", { ...build, supported: false }],
  ])("does not register: %s", async (_name, env) => {
    const load = vi.fn();
    expect(shouldRegister(env)).toBe(false);
    expect(await registerServiceWorker(env, load)).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("does not register under Vitest with the real environment", async () => {
    const load = vi.fn();
    expect(await registerServiceWorker(undefined, load)).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("marks a waiting version and activates it with a reload", async () => {
    const fake = fakeRegistrar();
    await registerServiceWorker(build, async () => fake.register as Registrar);
    expect(updateState.needRefresh()).toBe(false);
    fake.options()?.onNeedRefresh();
    expect(updateState.needRefresh()).toBe(true);
    await updateState.reload();
    expect(fake.update).toHaveBeenCalledWith(true);
  });
});
