import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  plugin: null,
  registerPlugin: vi.fn(),
  navigate: vi.fn(),
  pathname: "/dashboard",
  unified: {},
  user: { uid: "u1", emailVerified: true },
  locked: false,
  mobileLayout: true,
  native: { subscribe: null, update: vi.fn() },
}));

vi.mock("@capacitor/core", () => ({ registerPlugin: (...args) => mocks.registerPlugin(...args) }));

// Like Capacitor's plugin proxy, it answers every property, `then` included,
// which rejects as an unimplemented native method.
const asCapacitorProxy = (target) => new Proxy(target, {
  get: (object, prop) => (prop in object ? object[prop] : () => Promise.reject({ code: "UNIMPLEMENTED" })),
});

const fakePlugin = ({ available = true, profileNavigation = true, getStateError = null } = {}) => {
  const listeners = {};
  const removed = [];
  return asCapacitorProxy({
    listeners,
    removed,
    addListener: vi.fn(async (event, handler) => {
      listeners[event] = handler;
      return { remove: () => removed.push(event) };
    }),
    getState: vi.fn(async () => {
      if (getStateError) throw getStateError;
      return { available, profileNavigation };
    }),
    update: vi.fn(async () => undefined),
  });
};

const loadModule = async () => {
  vi.resetModules();
  return import("../src/platform/nativeNavigation.js");
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plugin = fakePlugin();
  mocks.registerPlugin.mockImplementation(() => mocks.plugin);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("native navigation bridge", () => {
  it("does nothing outside the iOS app", async () => {
    vi.stubEnv("MODE", "production");
    const { subscribeNativeNavigation, updateNativeNavigation } = await loadModule();
    const onAvailability = vi.fn();
    const unsubscribe = subscribeNativeNavigation({ onAvailability, onSelect: vi.fn(), onAdd: vi.fn() });
    await updateNativeNavigation({ visible: true });
    unsubscribe();
    expect(mocks.registerPlugin).not.toHaveBeenCalled();
    expect(onAvailability).not.toHaveBeenCalled();
  });

  it("reports availability, forwards tab and add events, and stops listening", async () => {
    vi.stubEnv("MODE", "mobile");
    const { subscribeNativeNavigation, updateNativeNavigation } = await loadModule();
    const handlers = { onAvailability: vi.fn(), onSelect: vi.fn(), onAdd: vi.fn(), onProfile: vi.fn() };
    const unsubscribe = subscribeNativeNavigation(handlers);
    await waitFor(() => expect(handlers.onAvailability).toHaveBeenCalledWith(true, true));
    expect(mocks.registerPlugin).toHaveBeenCalledWith("NativeNavigation");

    mocks.plugin.listeners.tabSelected({ path: "/analytics" });
    mocks.plugin.listeners.addRequested({});
    mocks.plugin.listeners.profileRequested({});
    mocks.plugin.listeners.stateChanged({ available: false });
    expect(handlers.onSelect).toHaveBeenCalledWith("/analytics");
    expect(handlers.onAdd).toHaveBeenCalledTimes(1);
    expect(handlers.onProfile).toHaveBeenCalledTimes(1);
    expect(handlers.onAvailability).toHaveBeenLastCalledWith(false, false);

    await updateNativeNavigation({ visible: true, path: "/dashboard" });
    expect(mocks.plugin.update).toHaveBeenCalledWith({ visible: true, path: "/dashboard" });

    unsubscribe();
    expect(mocks.plugin.removed.sort()).toEqual(["addRequested", "profileRequested", "stateChanged", "tabSelected"]);
  });

  it("keeps the web navigation with an app build that has no plugin", async () => {
    vi.stubEnv("MODE", "mobile");
    mocks.plugin = fakePlugin({ getStateError: new Error("not implemented") });
    const { subscribeNativeNavigation, updateNativeNavigation } = await loadModule();
    const onAvailability = vi.fn();
    subscribeNativeNavigation({ onAvailability, onSelect: vi.fn(), onAdd: vi.fn() });
    await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(false));
    mocks.plugin.update.mockRejectedValueOnce(new Error("not implemented"));
    await expect(updateNativeNavigation({ visible: true })).resolves.toBeUndefined();
  });
});

describe("app layout with the native tab bar", () => {
  const renderLayout = async ({ mode = "mobile" } = {}) => {
    vi.stubEnv("MODE", mode);
    vi.resetModules();
    vi.doMock("../src/platform/nativeNavigation.js", () => ({
      subscribeNativeNavigation: (handlers) => { mocks.native.subscribe = handlers; return () => {}; },
      updateNativeNavigation: (...args) => mocks.native.update(...args),
    }));
    vi.doMock("../src/router/RouterProvider", () => ({
      useLocation: () => ({ pathname: mocks.pathname, search: "" }),
      useNavigate: () => mocks.navigate,
    }));
    vi.doMock("../src/context/AuthProvider", () => ({ useAuth: () => ({ currentUser: mocks.user }) }));
    vi.doMock("../src/context/UnifiedTransactionProvider", () => ({ useUnifiedTransactions: () => mocks.unified }));
    vi.doMock("../src/context/PlanningProvider.jsx", () => ({ usePlanning: () => ({ error: "", retry: vi.fn() }) }));
    vi.doMock("../src/context/PrivacyProvider.jsx", () => ({ usePrivacy: () => ({ locked: mocks.locked, toggleHideAmounts: vi.fn() }) }));
    vi.doMock("../src/hooks/useOnlineStatus.js", () => ({ useOnlineStatus: () => true }));
    vi.doMock("react-responsive", () => ({ useMediaQuery: () => mocks.mobileLayout }));
    vi.doMock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));
    vi.doMock("../src/components/Layout/BottomNavigation", () => ({
      default: () => <nav data-testid="web-tab-bar" />,
      BOTTOM_NAV_HEIGHT_PX: 76,
    }));
    vi.doMock("../src/components/Transaction/TransactionModal", () => ({ default: () => <div data-testid="add-modal" /> }));
    vi.doMock("../src/components/Layout/DemoImportPrompt", () => ({ default: () => null }));
    vi.doMock("../src/components/Layout/Sidebar", () => ({ default: () => <aside data-testid="web-sidebar" /> }));
    const { default: AppLayout } = await import("../src/components/Layout/AppLayout.jsx");
    const view = render(<AppLayout><p>page</p></AppLayout>);
    // The bridge is loaded lazily, only in the iOS build.
    if (mode === "mobile") await waitFor(() => expect(mocks.native.subscribe).not.toBeNull());
    return view;
  };

  it("never loads the bridge in the web build", async () => {
    await renderLayout({ mode: "production" });
    expect(screen.getByTestId("web-tab-bar")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.native.subscribe).toBeNull();
  });

  beforeEach(() => {
    mocks.pathname = "/dashboard";
    mocks.user = { uid: "u1", emailVerified: true };
    mocks.locked = false;
    mocks.mobileLayout = true;
    mocks.unified = { isDemo: false, canAddMoreTransactions: true, pendingOfflineCount: 0, transactions: [], maxTransactions: Infinity };
    mocks.native.subscribe = null;
  });

  it("keeps the web tab bar until iOS reports a vertical bar", async () => {
    const { container } = await renderLayout();
    expect(screen.getByTestId("web-tab-bar")).toBeInTheDocument();
    expect(container.querySelector("main")).toHaveClass("app-content-safe-mobile");
    // The layout is sent even before the native bar exists.
    expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ layout: "phone", visible: true }));

    act(() => mocks.native.subscribe.onAvailability(true, true));
    expect(screen.queryByTestId("web-tab-bar")).toBeNull();
    expect(container.querySelector('[data-native-profile-navigation="true"]')).toBeInTheDocument();
    expect(container.querySelector("main")).toHaveClass("app-content-safe-bottom");
    expect(mocks.native.update).toHaveBeenLastCalledWith({
      visible: true,
      layout: "phone",
      path: "/dashboard",
      badge: null,
      addEnabled: true,
      profileMode: "account",
      labels: { dashboard: "navbar.dashboard", transactions: "navbar.transactions", analytics: "navbar.analytics", profile: "navbar.profileAndSettings", add: "navbar.add" },
    });
  });

  it("keeps the header shortcut when an older native bar lacks profile support", async () => {
    const { container } = await renderLayout();
    act(() => mocks.native.subscribe.onAvailability(true, false));
    expect(screen.queryByTestId("web-tab-bar")).toBeNull();
    expect(container.querySelector('[data-native-profile-navigation="true"]')).toBeNull();
  });

  it("navigates from native tabs and opens the new-transaction form", async () => {
    await renderLayout();
    act(() => mocks.native.subscribe.onAvailability(true));
    act(() => mocks.native.subscribe.onSelect("/transactions"));
    act(() => mocks.native.subscribe.onSelect("/javascript:alert(1)"));
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/transactions");

    act(() => mocks.native.subscribe.onProfile());
    expect(mocks.navigate).toHaveBeenLastCalledWith("/profile");

    act(() => mocks.native.subscribe.onAdd());
    expect(await screen.findByTestId("add-modal")).toBeInTheDocument();
    // The native bar steps aside while the form is open.
    await waitFor(() => expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false })));
  });

  it("hides the native bar while any dialog is open", async () => {
    await renderLayout();
    // Same module instance as the layout loaded after `vi.resetModules()`.
    const { trackOpenDialog } = await import("../src/components/ui/dialogStack.js");
    act(() => mocks.native.subscribe.onAvailability(true));
    expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));
    let release;
    act(() => { release = trackOpenDialog(); });
    expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
    act(() => release());
    expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));
  });

  it("shows the demo counter and disables adding at the demo limit", async () => {
    mocks.user = null;
    mocks.unified = {
      ...mocks.unified,
      isDemo: true,
      canAddMoreTransactions: false,
      maxTransactions: 10,
      transactions: [{ id: "a" }, { id: "b", isSample: true }],
    };
    await renderLayout();
    act(() => mocks.native.subscribe.onAvailability(true));
    expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ badge: "1/10", addEnabled: false, profileMode: "register", labels: expect.objectContaining({ profile: "navbar.register" }) }));
    act(() => mocks.native.subscribe.onProfile());
    expect(mocks.navigate).toHaveBeenLastCalledWith("/register");
    act(() => mocks.native.subscribe.onAdd());
    expect(screen.queryByTestId("add-modal")).toBeNull();
  });

  it("opens email confirmation from the profile action for a pending trial", async () => {
    mocks.user = { pending: true, email: "test@example.com" };
    mocks.unified = { ...mocks.unified, isDemo: true };
    await renderLayout();
    expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ profileMode: "verifyEmail", labels: expect.objectContaining({ profile: "demo.confirmEmail" }) }));
    act(() => mocks.native.subscribe.onProfile());
    expect(mocks.navigate).toHaveBeenCalledWith("/verify-email");
  });

  it("keeps only the web sidebar in the wide layout", async () => {
    mocks.mobileLayout = false;
    const { container } = await renderLayout();
    act(() => mocks.native.subscribe.onAvailability(true));
    expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ layout: "sidebar", visible: false }));
    expect(screen.queryByTestId("web-tab-bar")).toBeNull();
    expect(await screen.findByTestId("web-sidebar")).toBeInTheDocument();
    expect(container.querySelector("main")).not.toHaveClass("app-content-safe-bottom");
  });

  it("hides the native bar on public pages", async () => {
    mocks.pathname = "/login";
    await renderLayout();
    act(() => mocks.native.subscribe.onAvailability(true));
    expect(mocks.native.update).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false, path: "/login" }));
  });
});
