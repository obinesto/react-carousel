import * as React from "react";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";

import type {
  CarouselApi,
  CarouselLabels,
  CarouselLayout,
  CarouselPlayback,
  CarouselProps,
  CarouselState,
} from "../types/carousel";

const defaultLabels: CarouselLabels = {
  previous: "Previous slide",
  next: "Next slide",
  play: "Start slide rotation",
  pause: "Stop slide rotation",
  pagination: "Choose a slide",
  slide: (index, count) => `${index + 1} of ${count}`,
  goTo: (index, count) => `Go to slide ${index + 1} of ${count}`,
};
function clampIndex(index: number, count: number) {
  return Math.max(
    0,
    Math.min(count - 1, Number.isFinite(index) ? Math.trunc(index) : 0),
  );
}
function positive(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/** One mounted instance per item. Loop navigation wraps without cloning content. */
export function Carousel<T>(props: CarouselProps<T>): React.ReactElement {
  const { items, renderItem, keyExtractor, loop = false, pauseOnHover = true } = props;
  const labels = { ...defaultLabels, ...props.labels };
  const id = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const playbackPointerAction = useRef<boolean | null>(null);
  const keys = items.map((item, index) => keyExtractor?.(item, index) ?? index);
  const keySignature = JSON.stringify(keys);
  const [containerWidth, setContainerWidth] = useState(0);
  const [requested, setRequested] = useState(Boolean(props.autoplay));
  const [environment, setEnvironment] = useState({
    ready: false,
    reduced: false,
    hovered: false,
    hidden: false,
  });
  let layout: CarouselLayout = {
    slidesPerView: props.slidesPerView ?? 1,
    gap: props.gap ?? 16,
    align: props.align ?? "start",
    slidesToScroll: props.slidesToScroll ?? 1,
  };
  for (const width of Object.keys(props.breakpoints ?? {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)) {
    if (containerWidth >= width)
      layout = { ...layout, ...props.breakpoints?.[width] };
  }
  const perView =
    layout.slidesPerView === "auto"
      ? "auto"
      : positive(layout.slidesPerView, 1);
  const gap = Math.max(0, Number.isFinite(layout.gap) ? layout.gap! : 16);
  const step =
    layout.slidesToScroll === "page"
      ? "page"
      : Math.max(1, Math.trunc(positive(layout.slidesToScroll, 1)));
  const [view, setView] = useState({
    selectedIndex: clampIndex(props.startIndex ?? 0, items.length),
    visibleIndices: items.length
      ? [clampIndex(props.startIndex ?? 0, items.length)]
      : [],
    canPrevious: false,
    canNext: false,
    isScrolling: false,
  });
  const engine = useRef({
    index: view.selectedIndex,
    key: keys[view.selectedIndex],
    targets: [] as number[],
    starts: [] as number[],
    widths: [] as number[],
    width: 0,
    max: 0,
    rtl: false,
    pending: false,
    dragging: false,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    lastPosition: 0,
  });
  const enabled = Boolean(props.autoplay);
  const playbackFor = (current: typeof view): CarouselPlayback => {
    if (!enabled) return "disabled";
    if (!requested || environment.reduced) return "paused";
    if (
      !environment.ready ||
      (pauseOnHover && environment.hovered) ||
      environment.hidden ||
      !(current.canNext || current.canPrevious) ||
      current.isScrolling
    )
      return "suspended";
    return "playing";
  };
  const playback = playbackFor(view);
  const state: CarouselState = { ...view, slideCount: items.length, playback };
  const latest = useRef({
    state,
    measure: () => { },
    settle: () => { },
    scroll: () => { },
    advance: () => { },
    release: () => { },
    commands: null as CarouselApi | null,
  });
  latest.current.state = state;
  const position = () =>
    (viewportRef.current?.scrollLeft ?? 0) * (engine.current.rtl ? -1 : 1);
  const snapshot = (scrolling = engine.current.pending) => {
    const e = engine.current;
    const pos = position();
    const visibleIndices = e.starts.flatMap((start, index) =>
      start + e.widths[index] > pos + 0.5 && start < pos + e.width - 0.5
        ? [index]
        : [],
    );
    const available = items.length > 1 && e.max > 1;
    const target = e.targets[e.index] ?? 0;
    return {
      selectedIndex: e.index,
      visibleIndices,
      canPrevious: available && (loop || target > 0.5),
      canNext: available && (loop || target < e.max - 0.5),
      isScrolling: scrolling,
    };
  };
  const publish = (scrolling = engine.current.pending) => {
    const next = snapshot(scrolling);
    setView((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  };
  const scrollTo = (left: number, smooth: boolean) => {
    viewportRef.current?.scrollTo({
      left: left * (engine.current.rtl ? -1 : 1),
      behavior: smooth ? "smooth" : "instant",
    });
  };
  const pause = () => setRequested(false);
  const play = () => {
    if (!enabled || environment.reduced) return;
    const e = engine.current;
    if (!loop && e.max > 1 && (e.targets[e.index] ?? 0) >= e.max - 0.5)
      goTo(0, false);
    setRequested(true);
  };
  const settle = () => {
    const e = engine.current;
    if (e.dragging) return;
    clearTimeout(e.timer);
    const wasPending = e.pending;
    e.pending = false;
    const pos = position();
    // Several logical slides can share the same physical edge target.
    if (Math.abs((e.targets[e.index] ?? 0) - pos) > 1) {
      e.index = e.targets.reduce(
        (best, target, index) =>
          Math.abs(target - pos) < Math.abs(e.targets[best] - pos)
            ? index
            : best,
        0,
      );
      e.key = keys[e.index];
    }
    publish(false);
    if (wasPending) {
      const settled = snapshot(false);
      props.onSettled?.({
        ...latest.current.state,
        ...settled,
        playback: playbackFor(settled),
      });
    }
  };
  const scheduleSettle = () => {
    const e = engine.current;
    clearTimeout(e.timer);
    e.lastPosition = position();
    e.timer = setTimeout(() => {
      if (e.dragging || Math.abs(position() - e.lastPosition) > 0.5)
        scheduleSettle();
      else latest.current.settle();
    }, 200);
  };
  const goTo = (index: number, manual = true) => {
    if (manual) pause();
    if (!items.length || !Number.isFinite(index)) return;
    const e = engine.current;
    e.index = clampIndex(index, items.length);
    e.key = keys[e.index];
    const target = e.targets[e.index] ?? 0;
    if (!manual && !loop && e.max > 1 && target >= e.max - 0.5) pause();
    e.pending = Math.abs(target - position()) > 0.5;
    scrollTo(target, !environment.reduced);
    publish();
    if (e.pending) scheduleSettle();
  };
  const move = (direction: number, manual = true) => {
    const e = engine.current;
    if (manual) pause();
    if (e.max <= 1 || items.length < 2) return;
    const current = e.targets[e.index] ?? 0;
    let index = e.index;
    if (step === "page") {
      if (direction > 0) {
        index = e.starts.findIndex(
          (start, i) =>
            i > e.index && start + e.widths[i] > current + e.width + 0.5,
        );
        if (index < 0) index = items.length - 1;
      } else {
        index = e.index - 1;
        while (index > 0 && e.targets[index] > current - e.width + 0.5) index--;
      }
    } else index += direction * step;
    if (loop && direction > 0 && current >= e.max - 0.5) index = 0;
    else if (loop && direction < 0 && current <= 0.5) index = items.length - 1;
    goTo(index, manual);
  };
  const commands: CarouselApi = {
    next: () => move(1),
    previous: () => move(-1),
    goTo: (index) => goTo(index),
    play,
    pause,
    getState: () => latest.current.state,
  };
  latest.current.commands = commands;
  const api = useRef<CarouselApi>({
    next: () => latest.current.commands!.next(),
    previous: () => latest.current.commands!.previous(),
    goTo: (index) => latest.current.commands!.goTo(index),
    play: () => latest.current.commands!.play(),
    pause: () => latest.current.commands!.pause(),
    getState: () => latest.current.state,
  }).current;
  useImperativeHandle(props.apiRef, () => api, [api]);
  const measure = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const e = engine.current;
    const bounds = viewport.getBoundingClientRect();
    const computed = getComputedStyle(viewport);
    const width = parseFloat(computed.width) || bounds.width;
    const scale = bounds.width / width;
    setContainerWidth((previous) => (previous === width ? previous : width));
    if (bounds.width <= 0) return;
    e.rtl = computed.direction === "rtl";
    const pos = position();
    const slides = Array.from(viewport.children) as HTMLElement[];
    e.width = width;
    e.starts = slides.map((slide) => {
      const rect = slide.getBoundingClientRect();
      return (
        (e.rtl ? bounds.right - rect.right : rect.left - bounds.left) / scale +
        pos
      );
    });
    e.widths = slides.map(
      (slide) => slide.getBoundingClientRect().width / scale,
    );
    const extent = slides.length
      ? e.starts[slides.length - 1] + e.widths[slides.length - 1]
      : 0;
    e.max = Math.max(0, extent - e.width);
    e.targets = e.starts.map((start, index) =>
      Math.max(
        0,
        Math.min(
          e.max,
          start -
          (layout.align === "center"
            ? (e.width - e.widths[index]) / 2
            : layout.align === "end"
              ? e.width - e.widths[index]
              : 0),
        ),
      ),
    );
    const retained = keys.indexOf(e.key);
    e.index = retained >= 0 ? retained : clampIndex(e.index, items.length);
    e.key = keys[e.index];
    e.pending = false;
    clearTimeout(e.timer);
    scrollTo(e.targets[e.index] ?? 0, false);
    publish(false);
  };
  latest.current.advance = () => move(1, false);
  latest.current.release = () => {
    engine.current.dragging = false;
    if (engine.current.pending) scheduleSettle();
  };
  latest.current.measure = measure;
  latest.current.settle = settle;
  latest.current.scroll = () => {
    engine.current.pending = true;
    publish(true);
    scheduleSettle();
  };
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updateEnvironment = () => {
      setEnvironment((previous) => ({
        ...previous,
        ready: true,
        reduced: media?.matches ?? false,
        hidden: document.hidden,
      }));
      if (media?.matches) setRequested(false);
    };
    updateEnvironment();
    media?.addEventListener("change", updateEnvironment);
    document.addEventListener("visibilitychange", updateEnvironment);
    return () => {
      media?.removeEventListener("change", updateEnvironment);
      document.removeEventListener("visibilitychange", updateEnvironment);
    };
  }, []);
  useEffect(() => {
    const viewport = viewportRef.current!;
    const resize = () => latest.current.measure();
    const scroll = () => latest.current.scroll();
    const end = () => latest.current.settle();
    const release = () => latest.current.release();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(viewport);
    Array.from(viewport.children).forEach((slide) => observer?.observe(slide));
    const mutation = new MutationObserver(resize);
    mutation.observe(viewport, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "dir"],
    });
    mutation.observe(viewport.parentElement!, {
      attributes: true,
      attributeFilter: ["class", "style", "dir"],
    });
    viewport.addEventListener("scroll", scroll, { passive: true });
    viewport.addEventListener("scrollend", end);
    viewport.addEventListener("load", resize, true);
    window.addEventListener("resize", resize);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    resize();
    return () => {
      observer?.disconnect();
      mutation.disconnect();
      clearTimeout(engine.current.timer);
      viewport.removeEventListener("scroll", scroll);
      viewport.removeEventListener("scrollend", end);
      viewport.removeEventListener("load", resize, true);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [keySignature]);
  useEffect(() => {
    latest.current.measure();
  }, [perView, gap, layout.align, step, props.dir, loop]);
  useEffect(() => {
    props.onStateChange?.(state);
  }, [view, playback, items.length]);
  useEffect(() => {
    props.onSelectionChange?.(view.selectedIndex);
  }, [view.selectedIndex]);
  useEffect(() => {
    props.onPlaybackChange?.(playback);
  }, [playback]);
  const interval = positive(
    props.autoplay ? props.autoplay.interval : undefined,
    5000,
  );
  useEffect(() => {
    if (playback !== "playing") return;
    const timer = setTimeout(() => {
      if (!loop && !latest.current.state.canNext) pause();
      else latest.current.advance();
    }, interval);
    return () => clearTimeout(timer);
  }, [playback, interval, view.selectedIndex, view.isScrolling, loop]);
  const control = (
    slot: "previous" | "next" | "playback",
    text: string,
    onClick: () => void,
    disabled = false,
  ) => {
    const renderer = props.controls?.[slot];
    if (renderer === false) return null;
    const buttonProps: ButtonHTMLAttributes<HTMLButtonElement> = {
      type: "button",
      "aria-label": text,
      "aria-controls": id,
      className: `rc-control rc-${slot} ${props.controlClassName ?? ""}`,
      onPointerDown:
        slot === "playback"
          ? () => {
            playbackPointerAction.current = requested;
          }
          : undefined,
      onClick:
        slot === "playback"
          ? (event) => {
            const stop =
              event.detail > 0 && playbackPointerAction.current !== null
                ? playbackPointerAction.current
                : requested;
            playbackPointerAction.current = null;
            if (stop) pause();
            else play();
          }
          : onClick,
      disabled,
      children: text,
    };
    return renderer ? renderer(buttonProps) : <button {...buttonProps} />;
  };
  const variables = {
    "--rc-gap": `${gap}px`,
    "--rc-slide-size":
      perView === "auto"
        ? "auto"
        : `calc((100% - ${Math.max(0, perView - 1)} * var(--rc-gap)) / ${perView})`,
  } as CSSProperties;
  return (
    <div
      className={`rc-root ${props.className ?? ""}`}
      style={{ ...variables, ...props.style }}
      role={props.role ?? "region"}
      aria-roledescription="carousel"
      aria-label={props["aria-label"] ?? "Slides"}
      aria-labelledby={props["aria-labelledby"]}
      dir={props.dir}
      onFocusCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          pause();
      }}
      onMouseEnter={() =>
        setEnvironment((previous) => ({ ...previous, hovered: true }))
      }
      onMouseLeave={() =>
        setEnvironment((previous) => ({ ...previous, hovered: false }))
      }
    >
      <div className="rc-controls">
        {props.renderControls ? (
          props.renderControls(api, state)
        ) : (
          <>
            {enabled &&
              control(
                "playback",
                requested && !environment.reduced ? labels.pause : labels.play,
                requested ? pause : play,
                environment.reduced,
              )}
            {props.navigation !== false && (
              <>
                {control(
                  "previous",
                  labels.previous,
                  api.previous,
                  !view.canPrevious,
                )}
                {control("next", labels.next, api.next, !view.canNext)}
              </>
            )}
          </>
        )}
      </div>
      <div
        id={id}
        ref={viewportRef}
        className={`rc-viewport ${props.viewportClassName ?? ""}`}
        role="group"
        tabIndex={0}
        aria-label={props["aria-label"] ?? "Slides"}
        onPointerDown={() => {
          engine.current.dragging = true;
          pause();
        }}
        onPointerUp={() => {
          engine.current.dragging = false;
          if (engine.current.pending) scheduleSettle();
        }}
        onPointerCancel={() => {
          engine.current.dragging = false;
          if (engine.current.pending) scheduleSettle();
        }}
        onWheel={pause}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            move(
              (event.key === "ArrowRight" ? 1 : -1) *
              (engine.current.rtl ? -1 : 1),
            );
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            goTo(event.key === "Home" ? 0 : items.length - 1);
          }
        }}
      >
        {items.map((item, index) => (
          <div
            key={keys[index]}
            className={`rc-slide ${props.slideClassName ?? ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={labels.slide(index, items.length)}
            onBlurCapture={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                event.currentTarget.inert =
                  !view.visibleIndices.includes(index);
              }
            }}
            ref={(node) => {
              if (node)
                node.inert =
                  !view.visibleIndices.includes(index) &&
                  !node.contains(document.activeElement);
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
      {props.pagination && (
        <div
          className="rc-pagination"
          role="group"
          aria-label={labels.pagination}
        >
          {items.map((_, index) => (
            <button
              key={keys[index]}
              type="button"
              className="rc-page"
              aria-label={labels.goTo(index, items.length)}
              aria-controls={id}
              aria-current={view.selectedIndex === index ? "true" : undefined}
              onClick={() => goTo(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}
      <span
        className="rc-status"
        aria-live={
          enabled && requested && !environment.reduced ? "off" : "polite"
        }
        aria-atomic="true"
      >
        {items.length ? labels.slide(view.selectedIndex, items.length) : ""}
      </span>
    </div>
  );
}
