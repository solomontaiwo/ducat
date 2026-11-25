import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hapticTap: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
vi.mock("../src/platform/haptics.js", () => ({
  hapticTap: mocks.hapticTap,
}));

import PullToRefresh from "../src/components/ui/PullToRefresh.jsx";

const setScrollY = (value) => {
  Object.defineProperty(window, "scrollY", { value, configurable: true });
};

beforeEach(() => {
  vi.clearAllMocks();
  setScrollY(0);
});

afterEach(() => {
  cleanup();
  setScrollY(0);
});

describe("PullToRefresh", () => {
  it("triggers haptic feedback and calls onRefresh when pulled past threshold at top of page", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Content</div>
      </PullToRefresh>
    );
    const wrapper = container.firstChild;

    fireEvent.touchStart(wrapper, { touches: [{ clientY: 100, clientX: 50 }] });
    fireEvent.touchMove(wrapper, { touches: [{ clientY: 260, clientX: 52 }] });
    expect(mocks.hapticTap).toHaveBeenCalledTimes(1);
    expect(screen.getByText("common.releaseToRefresh")).toBeInTheDocument();

    fireEvent.touchEnd(wrapper);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("ignores short pulls, horizontal swipes and pulls while scrolled down", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Content</div>
      </PullToRefresh>
    );
    const wrapper = container.firstChild;

    // Short pull
    fireEvent.touchStart(wrapper, { touches: [{ clientY: 100, clientX: 50 }] });
    fireEvent.touchMove(wrapper, { touches: [{ clientY: 140, clientX: 50 }] });
    fireEvent.touchEnd(wrapper);
    expect(onRefresh).not.toHaveBeenCalled();

    // Horizontal swipe
    fireEvent.touchStart(wrapper, { touches: [{ clientY: 100, clientX: 50 }] });
    fireEvent.touchMove(wrapper, { touches: [{ clientY: 140, clientX: 250 }] });
    fireEvent.touchEnd(wrapper);
    expect(onRefresh).not.toHaveBeenCalled();

    // Scrolled down
    setScrollY(120);
    fireEvent.touchStart(wrapper, { touches: [{ clientY: 100, clientX: 50 }] });
    fireEvent.touchMove(wrapper, { touches: [{ clientY: 300, clientX: 50 }] });
    fireEvent.touchEnd(wrapper);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
