import "@testing-library/jest-dom";
import React, { createRef, StrictMode, useEffect, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
const { renderToString } =
  require("react-dom/server.node") as typeof import("react-dom/server");
import { Carousel, type CarouselApi } from "../src";

const items = ["a", "b", "c", "d"];
let viewportWidth: number;
let widths: number[];
let resizeCallbacks: (() => void)[];
let disconnect: jest.Mock;
let reduced = false;
let mediaChange: () => void;
const rect = (left: number, width: number) => ({
  left,
  right: left + width,
  width,
  height: 100,
  top: 0,
  bottom: 100,
  x: left,
  y: 0,
  toJSON() { },
});
const finish = () => {
  const viewport = document.querySelector(".rc-viewport")!;
  fireEvent.scroll(viewport);
  fireEvent(viewport, new Event("scrollend"));
};

beforeEach(() => {
  viewportWidth = 400.5;
  widths = [180.25, 230.75, 155.5, 250.25];
  resizeCallbacks = [];
  disconnect = jest.fn();
  reduced = false;
  window.matchMedia = jest.fn().mockImplementation(() => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, fn: () => void) => {
      mediaChange = fn;
    },
    removeEventListener: jest.fn(),
  }));
  global.ResizeObserver = jest
    .fn()
    .mockImplementation((callback: () => void) => {
      resizeCallbacks.push(callback);
      return { observe: jest.fn(), disconnect, unobserve: jest.fn() };
    });
  jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("rc-viewport")) return rect(0, viewportWidth);
      if (this.classList.contains("rc-slide")) {
        const index = Array.from(this.parentElement!.children).indexOf(this);
        const start = widths
          .slice(0, index)
          .reduce((sum, width) => sum + width + 16, 0);
        return rect(
          start - this.parentElement!.scrollLeft,
          widths[index] ?? 180,
        );
      }
      return rect(0, 0);
    });
  HTMLElement.prototype.scrollTo = jest.fn(function (
    this: HTMLElement,
    options: ScrollToOptions,
  ) {
    this.scrollLeft = options.left ?? 0;
  }) as typeof HTMLElement.prototype.scrollTo;
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("mounts each interactive item once and does not autoplay by default", () => {
  jest.useFakeTimers();
  render(
    <Carousel
      items={items}
      renderItem={(item) => <input id={item} aria-label={item} />}
    />,
  );
  expect(document.querySelectorAll("input")).toHaveLength(4);
  expect(document.querySelectorAll("#a")).toHaveLength(1);
  expect(screen.getByRole("region", { name: "Slides" })).toHaveAttribute(
    "aria-roledescription",
    "carousel",
  );
  expect(jest.getTimerCount()).toBe(0);
  expect(document.querySelectorAll(".rc-slide")[3]).toHaveProperty(
    "inert",
    true,
  );
});

it("navigates measured fractional slide targets and handles rapid commands", () => {
  const api = createRef<CarouselApi>();
  const changed = jest.fn();
  const settled = jest.fn();
  render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      onSelectionChange={changed}
      onSettled={settled}
    />,
  );
  expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
  act(() => {
    api.current!.next();
    api.current!.next();
    api.current!.previous();
  });
  expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({
    left: 196.25,
    behavior: "smooth",
  });
  finish();
  expect(api.current!.getState().selectedIndex).toBe(1);
  expect(changed).toHaveBeenLastCalledWith(1);
  expect(settled).toHaveBeenLastCalledWith(
    expect.objectContaining({
      selectedIndex: 1,
      isScrolling: false,
      visibleIndices: [1, 2],
    }),
  );
  act(() => api.current!.goTo(999));
  finish();
  expect(api.current!.getState().selectedIndex).toBe(3);
  expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
});

it("wraps endpoints without duplicating stateful children", () => {
  const api = createRef<CarouselApi>();
  render(
    <Carousel
      items={items}
      renderItem={(item) => <input aria-label={item} defaultValue={item} />}
      apiRef={api}
      loop
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "a" }), {
    target: { value: "edited" },
  });
  act(() => api.current!.previous());
  finish();
  expect(api.current!.getState().selectedIndex).toBe(3);
  act(() => api.current!.next());
  finish();
  expect(api.current!.getState().selectedIndex).toBe(0);
  expect(screen.getByRole("textbox", { name: "a" })).toHaveValue("edited");
  expect(document.querySelectorAll("input")).toHaveLength(4);
});

it("preserves selection by key on resize, reorder, and removal", () => {
  const api = createRef<CarouselApi>();
  const props = { renderItem: String, keyExtractor: String, apiRef: api };
  const { rerender } = render(<Carousel {...props} items={items} />);
  act(() => api.current!.goTo(2));
  finish();
  viewportWidth = 520.25;
  widths = [160.5, 180.5, 190.25, 240.75];
  act(() => resizeCallbacks.forEach((callback) => callback()));
  expect(api.current!.getState().selectedIndex).toBe(2);
  rerender(<Carousel {...props} items={["c", "a", "b", "d"]} />);
  expect(api.current!.getState().selectedIndex).toBe(0);
  rerender(<Carousel {...props} items={["a", "b", "d"]} />);
  expect(api.current!.getState().selectedIndex).toBe(0);
  act(() => api.current!.goTo(2));
  finish();
  rerender(<Carousel {...props} items={["a"]} />);
  expect(api.current!.getState().selectedIndex).toBe(0);
});

it("does not reset a pending navigation on equivalent array rerenders", () => {
  const api = createRef<CarouselApi>();
  const { rerender } = render(
    <Carousel items={items} renderItem={String} apiRef={api} loop />,
  );
  act(() => api.current!.previous());
  const calls = (HTMLElement.prototype.scrollTo as jest.Mock).mock.calls.length;
  rerender(
    <Carousel items={[...items]} renderItem={String} apiRef={api} loop />,
  );
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(calls);
  finish();
  expect(api.current!.getState().selectedIndex).toBe(3);
});

it("supports page steps and container breakpoints", () => {
  const api = createRef<CarouselApi>();
  render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      slidesToScroll="page"
      breakpoints={{ 400: { slidesPerView: 2, gap: 12 } }}
    />,
  );
  expect(document.querySelector(".rc-root")).toHaveStyle("--rc-gap: 12px");
  act(() => api.current!.next());
  finish();
  expect(api.current!.getState().selectedIndex).toBe(1);
  viewportWidth = 300;
  act(() => resizeCallbacks.forEach((callback) => callback()));
  expect(document.querySelector(".rc-root")).toHaveStyle("--rc-gap: 16px");
});

it.each([{ values: [] }, { values: ["a"] }, { values: ["a", "b"] }])(
  "disables navigation when content does not overflow: %j",
  ({ values }) => {
    viewportWidth = 1000;
    render(<Carousel items={values} renderItem={String} loop autoplay={{}} />);
    expect(
      screen.getByRole("button", { name: "Previous slide" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
  },
);

it("distinguishes hover suspension from focus and manual pause", () => {
  jest.useFakeTimers();
  const api = createRef<CarouselApi>();
  const { unmount } = render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      loop
      autoplay={{ interval: 1000 }}
    />,
  );
  const root = screen.getByRole("region");
  expect(api.current!.getState().playback).toBe("playing");
  fireEvent.mouseEnter(root);
  expect(api.current!.getState().playback).toBe("suspended");
  act(() => jest.advanceTimersByTime(2000));
  expect(api.current!.getState().selectedIndex).toBe(0);
  fireEvent.mouseLeave(root);
  act(() => jest.advanceTimersByTime(1000));
  finish();
  expect(api.current!.getState().selectedIndex).toBe(1);
  fireEvent.focus(document.querySelector(".rc-viewport")!);
  expect(api.current!.getState().playback).toBe("paused");
  fireEvent.blur(document.querySelector(".rc-viewport")!);
  expect(api.current!.getState().playback).toBe("paused");
  act(() => api.current!.play());
  expect(api.current!.getState().playback).toBe("playing");
  fireEvent.wheel(document.querySelector(".rc-viewport")!);
  expect(api.current!.getState().playback).toBe("paused");
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it("continues autoplay on hover when pauseOnHover is false", () => {
  jest.useFakeTimers();
  const api = createRef<CarouselApi>();
  render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      loop
      autoplay={{ interval: 1000 }}
      pauseOnHover={false}
    />,
  );
  act(() => jest.advanceTimersByTime(400));
  fireEvent.mouseEnter(screen.getByRole("region"));
  expect(api.current!.getState().playback).toBe("playing");
  act(() => jest.advanceTimersByTime(600));
  finish();
  expect(api.current!.getState().selectedIndex).toBe(1);
  expect(api.current!.getState().playback).toBe("playing");

  act(() => api.current!.pause());
  fireEvent.mouseLeave(screen.getByRole("region"));
  expect(api.current!.getState().playback).toBe("paused");
  act(() => api.current!.play());
  fireEvent.focus(document.querySelector(".rc-viewport")!);
  expect(api.current!.getState().playback).toBe("paused");
  act(() => api.current!.play());
  reduced = true;
  act(mediaChange);
  expect(api.current!.getState().playback).toBe("paused");
});

it("applies pauseOnHover changes while already hovered and restarts a full interval", () => {
  jest.useFakeTimers();
  const api = createRef<CarouselApi>();
  const props = { items, renderItem: String, apiRef: api, loop: true, autoplay: { interval: 1000 } };
  const { rerender, unmount } = render(<Carousel {...props} />);
  fireEvent.mouseEnter(screen.getByRole("region"));
  expect(api.current!.getState().playback).toBe("suspended");
  rerender(<Carousel {...props} pauseOnHover={false} />);
  expect(api.current!.getState().playback).toBe("playing");
  act(() => jest.advanceTimersByTime(400));
  rerender(<Carousel {...props} pauseOnHover />);
  expect(api.current!.getState().playback).toBe("suspended");
  act(() => jest.advanceTimersByTime(2000));
  expect(api.current!.getState().selectedIndex).toBe(0);
  rerender(<Carousel {...props} pauseOnHover={false} />);
  act(() => jest.advanceTimersByTime(999));
  expect(api.current!.getState().selectedIndex).toBe(0);
  act(() => jest.advanceTimersByTime(1));
  finish();
  expect(api.current!.getState().selectedIndex).toBe(1);
  rerender(<Carousel {...props} pauseOnHover />);
  expect(api.current!.getState().playback).toBe("suspended");
  fireEvent.mouseLeave(screen.getByRole("region"));
  expect(api.current!.getState().playback).toBe("playing");
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it("honors reduced motion and preference changes", () => {
  reduced = true;
  const api = createRef<CarouselApi>();
  render(
    <Carousel items={items} renderItem={String} apiRef={api} autoplay={{}} />,
  );
  expect(api.current!.getState().playback).toBe("paused");
  expect(
    screen.getByRole("button", { name: "Start slide rotation" }),
  ).toBeDisabled();
  act(() => api.current!.next());
  expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({
    left: 196.25,
    behavior: "instant",
  });
  reduced = false;
  act(mediaChange);
  expect(api.current!.getState().playback).toBe("paused");
});

it("supports labels, native custom buttons, pagination, and external controls", () => {
  const api = createRef<CarouselApi>();
  render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      aria-label="Products"
      pagination
      labels={{ next: "Forward" }}
      controls={{
        previous: false,
        next: (buttonProps) => <button {...buttonProps}>Forward</button>,
      }}
    />,
  );
  expect(screen.getByRole("region", { name: "Products" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Previous slide" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Forward" })).toHaveAttribute(
    "type",
    "button",
  );
  fireEvent.click(screen.getByRole("button", { name: "Go to slide 3 of 4" }));
  finish();
  expect(api.current!.getState().selectedIndex).toBe(2);
});

it("cleans up observers and side effects under Strict Mode", () => {
  jest.useFakeTimers();
  const mounted = jest.fn();
  const cleaned = jest.fn();
  function Item() {
    useEffect(() => {
      mounted();
      return cleaned;
    }, []);
    return <span>Item</span>;
  }
  const { unmount } = render(
    <StrictMode>
      <Carousel items={items} renderItem={() => <Item />} autoplay={{}} />
    </StrictMode>,
  );
  unmount();
  expect(cleaned).toHaveBeenCalledTimes(mounted.mock.calls.length);
  expect(disconnect).toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it("renders deterministic server markup without accessing browser geometry", () => {
  const measure = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect");
  measure.mockClear();
  const html = renderToString(
    <Carousel
      items={items}
      renderItem={(item) => <input id={item} />}
      autoplay={{}}
    />,
  );
  expect(html.match(/class="rc-slide/g)).toHaveLength(4);
  expect(measure).not.toHaveBeenCalled();
  expect(html).toContain("Stop slide rotation"); // The playback action is rendered in server markup.
});

it("stops finite autoplay at the end and restarts from the first slide", () => {
  jest.useFakeTimers();
  const api = createRef<CarouselApi>();
  render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      startIndex={2}
      autoplay={{ interval: 1000 }}
    />,
  );
  act(() => jest.advanceTimersByTime(1000));
  finish();
  expect(api.current!.getState()).toEqual(
    expect.objectContaining({ selectedIndex: 3, playback: "paused" }),
  );
  act(() => api.current!.play());
  finish();
  expect(api.current!.getState()).toEqual(
    expect.objectContaining({ selectedIndex: 0, playback: "playing" }),
  );
});

it("uses updated movement settings on the next autoplay tick", () => {
  jest.useFakeTimers();
  const api = createRef<CarouselApi>();
  const { rerender } = render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      loop
      autoplay={{ interval: 1000 }}
    />,
  );
  rerender(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      loop
      slidesToScroll={2}
      autoplay={{ interval: 1000 }}
    />,
  );
  act(() => jest.advanceTimersByTime(1000));
  finish();
  expect(api.current!.getState().selectedIndex).toBe(2);
});

it("suspends in a hidden document without clearing the playback request", () => {
  jest.useFakeTimers();
  const hidden = jest.spyOn(document, "hidden", "get").mockReturnValue(false);
  const api = createRef<CarouselApi>();
  render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      loop
      autoplay={{ interval: 1000 }}
    />,
  );
  hidden.mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(api.current!.getState().playback).toBe("suspended");
  act(() => jest.advanceTimersByTime(5000));
  expect(api.current!.getState().selectedIndex).toBe(0);
  hidden.mockReturnValue(false);
  fireEvent(document, new Event("visibilitychange"));
  expect(api.current!.getState().playback).toBe("playing");
});

it("waits for pointer release outside the viewport before settling", () => {
  jest.useFakeTimers();
  const api = createRef<CarouselApi>();
  render(<Carousel items={items} renderItem={String} apiRef={api} />);
  fireEvent.pointerDown(document.querySelector(".rc-viewport")!);
  act(() => api.current!.next());
  act(() => jest.advanceTimersByTime(600));
  expect(api.current!.getState().isScrolling).toBe(true);
  fireEvent.pointerUp(window);
  act(() => jest.advanceTimersByTime(200));
  expect(api.current!.getState().isScrolling).toBe(false);
});

it("keeps the public API stable and dispatches retained commands to current settings", () => {
  const api = createRef<CarouselApi>();
  const { rerender } = render(
    <Carousel items={items} renderItem={String} apiRef={api} />,
  );
  const original = api.current;
  rerender(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      slidesToScroll={2}
    />,
  );
  expect(api.current).toBe(original);
  act(() => original!.next());
  finish();
  expect(original!.getState().selectedIndex).toBe(2);
});

it("supports a state-setting callback ref for external controls", () => {
  function Consumer() {
    const [api, setApi] = useState<CarouselApi | null>(null);
    return (
      <>
        <Carousel items={items} renderItem={String} apiRef={setApi} />
        <button type="button" onClick={() => api?.next()}>
          External next
        </button>
      </>
    );
  }
  render(<Consumer />);
  fireEvent.click(screen.getByRole("button", { name: "External next" }));
  finish();
  expect(document.querySelector(".rc-status")).toHaveTextContent("2 of 4");
});

it("keeps live announcements off throughout an automatic scroll", () => {
  jest.useFakeTimers();
  const api = createRef<CarouselApi>();
  render(
    <Carousel
      items={items}
      renderItem={String}
      apiRef={api}
      loop
      autoplay={{ interval: 1000 }}
    />,
  );
  act(() => jest.advanceTimersByTime(1000));
  expect(api.current!.getState().isScrolling).toBe(true);
  expect(document.querySelector(".rc-status")).toHaveAttribute(
    "aria-live",
    "off",
  );
  finish();
  act(() => api.current!.pause());
  expect(document.querySelector(".rc-status")).toHaveAttribute(
    "aria-live",
    "polite",
  );
});
