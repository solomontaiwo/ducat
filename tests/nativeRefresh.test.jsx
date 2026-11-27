import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ plugin: null, registerPlugin: vi.fn() }));

vi.mock("@capacitor/core", () => ({ registerPlugin: (...args) => mocks.registerPlugin(...args) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));
vi.mock("../src/platform/haptics.js", () => ({ hapticTap: vi.fn() }));

// Like Capacitor's plugin proxy, it answers every property, `then` included.
const asCapacitorProxy = (target) => new Proxy(target, {
  get: (object, prop) => (prop in object ? object[prop] : () => Promise.reject({ code: "UNIMPLEMENTED" })),
});

const fakePlugin = ({ available = true } = {}) => {
  const listeners = {};
  return asCapacitorProxy({
    listeners,
    addListener: vi.fn(async (event, handler) => {
      listeners[event] = handler;
      return { remove: vi.fn() };
    }),
    setEnabled: vi.fn(async () => ({ available })),
  });
};

const load = async () => {
  vi.resetModules();
  return import("../src/platform/nativeRefresh.js");
};

const lastEnabled = () => mocks.plugin.setEnabled.mock.calls.at(-1)?.[0]?.enabled;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plugin = fakePlugin();
  mocks.registerPlugin.mockImplementation(() => mocks.plugin);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("native pull to refresh", () => {
  it("does nothing outside the iOS app", async () => {
    vi.stubEnv("MODE", "production");
    const { registerNativeRefresh, isNativeRefreshAvailable } = await load();
    registerNativeRefresh(vi.fn())();
    expect(isNativeRefreshAvailable()).toBe(false);
    expect(mocks.registerPlugin).not.toHaveBeenCalled();
  });

  it("is on only while a page is registered and refreshes the latest one", async () => {
    vi.stubEnv("MODE", "mobile");
    const { registerNativeRefresh } = await load();
    const first = vi.fn();
    let finish;
    const second = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const releaseFirst = registerNativeRefresh(first);
    const releaseSecond = registerNativeRefresh(second);
    await waitFor(() => expect(lastEnabled()).toBe(true));
    expect(mocks.plugin.setEnabled).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.plugin.listeners.refresh).toBeTypeOf("function"));

    mocks.plugin.listeners.refresh({ x: 544, y: 30 });
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith({ x: 544, y: 30 });
    expect(first).not.toHaveBeenCalled();
    // A second pull while the page loads adds nothing.
    mocks.plugin.listeners.refresh({});
    expect(second).toHaveBeenCalledTimes(1);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    mocks.plugin.listeners.refresh({});
    expect(second).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenLastCalledWith(null);

    releaseSecond();
    releaseFirst();
    await waitFor(() => expect(lastEnabled()).toBe(false));
  });

  it("centres the native spinner over the page, beside a side bar", async () => {
    vi.stubEnv("MODE", "mobile");
    const { registerNativeRefresh, updateNativeRefreshOffset } = await load();
    let center = 544.4;
    const release = registerNativeRefresh(vi.fn(), () => center);
    await waitFor(() => expect(mocks.plugin.setEnabled).toHaveBeenLastCalledWith({ enabled: true, centerX: 544 }));
    center = 196;
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(mocks.plugin.setEnabled).toHaveBeenLastCalledWith({ enabled: true, centerX: 196 }));
    center = 300;
    updateNativeRefreshOffset();
    await waitFor(() => expect(mocks.plugin.setEnabled).toHaveBeenLastCalledWith({ enabled: true, centerX: 300 }));
    const calls = mocks.plugin.setEnabled.mock.calls.length;
    // Nothing new to send.
    updateNativeRefreshOffset();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mocks.plugin.setEnabled).toHaveBeenCalledTimes(calls);
    release();
    await waitFor(() => expect(mocks.plugin.setEnabled).toHaveBeenLastCalledWith({ enabled: false }));
  });

  it("keeps working after a refresh fails", async () => {
    vi.stubEnv("MODE", "mobile");
    const { registerNativeRefresh } = await load();
    const refresh = vi.fn(() => Promise.reject(new Error("offline")));
    registerNativeRefresh(refresh);
    await waitFor(() => expect(mocks.plugin.listeners.refresh).toBeTypeOf("function"));
    mocks.plugin.listeners.refresh({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    mocks.plugin.listeners.refresh({});
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("falls back to the web gesture when the plugin cannot help", async () => {
    vi.stubEnv("MODE", "mobile");
    mocks.plugin = fakePlugin({ available: false });
    const { registerNativeRefresh, isNativeRefreshAvailable, subscribeNativeRefreshAvailability } = await load();
    expect(isNativeRefreshAvailable()).toBe(true);
    const changed = vi.fn();
    subscribeNativeRefreshAvailability(changed);
    registerNativeRefresh(vi.fn());
    await waitFor(() => expect(isNativeRefreshAvailable()).toBe(false));
    expect(changed).toHaveBeenCalled();
  });
});

describe("PullToRefresh in the iOS app", () => {
  const renderPage = async ({ active = true, disabled = false } = {}) => {
    vi.stubEnv("MODE", "mobile");
    vi.resetModules();
    const { default: PullToRefresh } = await import("../src/components/ui/PullToRefresh.jsx");
    const { RouteLocationScope, RouterProvider } = await import("../src/router/RouterProvider.jsx");
    const stack = await import("../src/components/ui/dialogStack.js");
    const onRefresh = vi.fn(async () => {});
    const page = (props) => (
      <RouterProvider>
        <RouteLocationScope active={props.active}>
          <PullToRefresh onRefresh={onRefresh} disabled={props.disabled}><p>Page</p></PullToRefresh>
        </RouteLocationScope>
      </RouterProvider>
    );
    const view = render(page({ active, disabled }));
    return { view, page, onRefresh, stack };
  };

  it("hands the gesture to iOS only while the page is on screen and free", async () => {
    const { view, page, onRefresh, stack } = await renderPage();
    await waitFor(() => expect(lastEnabled()).toBe(true));
    await waitFor(() => expect(mocks.plugin.listeners.refresh).toBeTypeOf("function"));
    act(() => mocks.plugin.listeners.refresh({ x: 544, y: 92 }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // The page's spinner takes the native one's place until the refresh settles.
    expect(await screen.findByText("common.refreshing")).toBeInTheDocument();
    const spinner = document.body.querySelector(".ios-spinner").parentElement;
    expect(spinner).toHaveStyle({ left: "544px", top: "92px" });
    expect(spinner).toHaveClass("fixed", "opacity-100");
    await waitFor(() => expect(screen.queryByText("common.refreshing")).toBeNull(), { timeout: 2000 });
    expect(spinner).toHaveClass("opacity-0");

    let release;
    act(() => { release = stack.trackOpenDialog(); });
    await waitFor(() => expect(lastEnabled()).toBe(false));
    act(() => release());
    await waitFor(() => expect(lastEnabled()).toBe(true));

    view.rerender(page({ active: false, disabled: false }));
    await waitFor(() => expect(lastEnabled()).toBe(false));
    view.rerender(page({ active: true, disabled: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastEnabled()).toBe(false);
    view.rerender(page({ active: true, disabled: false }));
    await waitFor(() => expect(lastEnabled()).toBe(true));
  });

  it("does not show the web pull indicator", async () => {
    const { view } = await renderPage();
    const wrapper = view.container.querySelector("p").parentElement;
    fireEvent.touchStart(wrapper, { touches: [{ clientY: 100, clientX: 50 }] });
    fireEvent.touchMove(wrapper, { touches: [{ clientY: 300, clientX: 50 }] });
    expect(screen.queryByText("common.releaseToRefresh")).toBeNull();
  });
});
