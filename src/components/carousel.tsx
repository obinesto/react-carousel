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
import { createLoopCopy } from "./loopCopy";

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

function cssPixels(value: string) {
  return parseFloat(value) || 0;
}

/** Used layout width, including borders and padding, unaffected by transforms. */
function borderBoxWidth(style: CSSStyleDeclaration) {
  return (
    cssPixels(style.width) +
    (style.boxSizing === "border-box"
      ? 0
      : cssPixels(style.paddingLeft) +
        cssPixels(style.paddingRight) +
        cssPixels(style.borderLeftWidth) +
        cssPixels(style.borderRightWidth))
  );
}

/** One mounted React instance per item in every navigation mode. */
export function Carousel<T>(props: CarouselProps<T>): React.ReactElement {
  const {
    items,
    renderItem,
    keyExtractor,
    loop = false,
    pauseOnHover = true,
  } = props;
  const labels = { ...defaultLabels, ...props.labels };
  const id = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const beforeCopyRef = useRef<HTMLDivElement>(null);
  const afterCopyRef = useRef<HTMLDivElement>(null);
  const continuousRequested = loop === "continuous";
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
    cycle: 0,
    origin: 0,
    continuous: false,
    destination: undefined as number | undefined,
    rebasedPosition: undefined as number | undefined,
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
    measure: () => {},
    settle: (_force = false) => {},
    scroll: () => {},
    advance: () => {},
    release: () => {},
    commands: null as CarouselApi | null,
  });
  latest.current.state = state;
  const position = () =>
    (viewportRef.current?.scrollLeft ?? 0) * (engine.current.rtl ? -1 : 1) -
    engine.current.origin;
  const isOriginalVisible = (index: number) => {
    const e = engine.current;
    if (!e.continuous) return view.visibleIndices.includes(index);
    const pos = position();
    return (
      e.starts[index] + e.widths[index] > pos + 0.5 &&
      e.starts[index] < pos + e.width - 0.5
    );
  };
  const snapshot = (scrolling = engine.current.pending) => {
    const e = engine.current;
    const pos = position();
    const visibleIndices = e.starts.flatMap((start, index) =>
      (e.continuous ? [-e.cycle, 0, e.cycle] : [0]).some(
        (offset) =>
          start + offset + e.widths[index] > pos + 0.5 &&
          start + offset < pos + e.width - 0.5,
      )
        ? [index]
        : [],
    );
    const available = items.length > 1 && e.max > 1;
    const target = e.targets[e.index] ?? 0;
    return {
      selectedIndex: e.index,
      visibleIndices,
      canPrevious: available && (Boolean(loop) || target > 0.5),
      canNext: available && (Boolean(loop) || target < e.max - 0.5),
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
      left: (left + engine.current.origin) * (engine.current.rtl ? -1 : 1),
      behavior: smooth ? "smooth" : "instant",
    });
  };
  const pause = () => setRequested(false);
  const stopForInteraction = () => {
    const e = engine.current;
    if (e.continuous && e.destination !== undefined) {
      e.destination = undefined;
      scrollTo(position(), false);
    }
    pause();
  };
  const rebase = () => {
    const e = engine.current;
    if (!e.continuous) return;
    const start = e.targets[0] ?? 0;
    const pos = position();
    const turns = Math.floor((pos - start + 1) / e.cycle);
    if (turns) {
      const next = pos - turns * e.cycle;
      scrollTo(next, false);
      e.rebasedPosition = position();
    }
  };
  const play = () => {
    if (!enabled || environment.reduced) return;
    const e = engine.current;
    if (!loop && e.max > 1 && (e.targets[e.index] ?? 0) >= e.max - 0.5)
      goTo(0, false);
    setRequested(true);
  };
  const settle = (force = false) => {
    const e = engine.current;
    if (e.dragging) return;
    // A scrollend from an interrupted command or an instant rebase can arrive
    // after the next smooth command has started.
    if (
      e.continuous &&
      !force &&
      e.destination !== undefined &&
      Math.abs(e.destination - position()) > 1
    ) {
      scheduleSettle();
      return;
    }
    clearTimeout(e.timer);
    const wasPending = e.pending;
    const destination = e.destination;
    const intendedIndex = e.index;
    e.pending = false;
    e.destination = undefined;
    const pos = position();
    const distance = (target: number) => {
      const delta = Math.abs(target - pos);
      if (!e.continuous) return delta;
      const remainder = delta % e.cycle;
      return Math.min(remainder, e.cycle - remainder);
    };
    // Several logical slides can share the same physical edge target.
    if (Math.abs((e.targets[e.index] ?? 0) - pos) > 1) {
      e.index = e.targets.reduce(
        (best, target, index) =>
          distance(target) < distance(e.targets[best]) ? index : best,
        0,
      );
      e.key = keys[e.index];
    }
    if (
      e.continuous &&
      destination !== undefined &&
      e.index === intendedIndex &&
      Math.abs(destination - e.targets[e.index]) > e.cycle / 2
    ) {
      // Return a completed copy navigation to its exact original target instead
      // of accumulating the browser's fractional scroll rounding across copies.
      scrollTo(e.targets[e.index], false);
      e.rebasedPosition = position();
    } else rebase();
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
      else latest.current.settle(true);
    }, 200);
  };
  const goTo = (index: number, manual = true, direction = 0) => {
    if (manual) pause();
    if (!items.length || !Number.isFinite(index)) return;
    const e = engine.current;
    e.index = clampIndex(index, items.length);
    e.key = keys[e.index];
    let target = e.targets[e.index] ?? 0;
    if (e.continuous) {
      let reference = e.destination ?? position();
      const candidates = [-e.cycle, 0, e.cycle]
        .map((offset) => target + offset)
        .filter((value) => value >= -e.origin && value <= e.max - e.origin);
      let directional = candidates.filter(
        (value) => !direction || (value - reference) * direction > 0.5,
      );
      if (!directional.length) {
        rebase();
        reference = position();
        directional = candidates.filter(
          (value) => !direction || (value - reference) * direction > 0.5,
        );
      }
      if (directional.length) {
        target = directional.reduce((best, value) =>
          Math.abs(value - reference) < Math.abs(best - reference)
            ? value
            : best,
        );
      }
    }
    if (!manual && !loop && e.max > 1 && target >= e.max - 0.5) pause();
    e.pending = Math.abs(target - position()) > 0.5;
    e.destination = e.pending ? target : undefined;
    scrollTo(target, !environment.reduced);
    if (!e.pending) rebase();
    publish();
    if (e.pending) scheduleSettle();
  };
  const move = (direction: number, manual = true) => {
    const e = engine.current;
    if (manual) pause();
    if (e.max <= 1 || items.length < 2) return;
    const current = e.targets[e.index] ?? 0;
    let index = e.index;
    if (e.continuous) {
      if (step === "page") {
        let distance = 0;
        let count = 0;
        let cursor = e.index;
        while (count < items.length && distance < e.width - 0.5) {
          if (direction < 0)
            cursor = (cursor - 1 + items.length) % items.length;
          distance += e.widths[cursor] + gap;
          count++;
          if (direction > 0) cursor = (cursor + 1) % items.length;
        }
        index += direction * Math.max(1, count);
      } else index += direction * step;
      goTo(
        ((index % items.length) + items.length) % items.length,
        manual,
        direction,
      );
      return;
    }
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
    const computed = getComputedStyle(viewport);
    const paddingStart = cssPixels(
      computed.direction === "rtl"
        ? computed.paddingRight
        : computed.paddingLeft,
    );
    const paddingEnd = cssPixels(
      computed.direction === "rtl"
        ? computed.paddingLeft
        : computed.paddingRight,
    );
    const width =
      borderBoxWidth(computed) -
      cssPixels(computed.borderLeftWidth) -
      cssPixels(computed.borderRightWidth);
    const contentWidth = width - paddingStart - paddingEnd;
    setContainerWidth((previous) =>
      previous === contentWidth ? previous : contentWidth,
    );
    if (contentWidth <= 0 || !viewport.getClientRects().length) return;
    e.rtl = computed.direction === "rtl";
    const slides = Array.from(viewport.children).filter((child) =>
      child.classList.contains("rc-slide"),
    ) as HTMLElement[];
    e.width = width;
    // The structural stylesheet lays out one non-wrapping flex row in DOM order.
    // Accumulate used CSS lengths rather than transformed bounds or integer offsets.
    const slideStyles = slides.map((slide) => getComputedStyle(slide));
    e.widths = slideStyles.map(borderBoxWidth);
    const measuredGap = cssPixels(computed.columnGap);
    let extent = paddingStart;
    e.starts = slides.map((_, index) => {
      const style = slideStyles[index];
      const start =
        extent + cssPixels(e.rtl ? style.marginRight : style.marginLeft);
      extent =
        start +
        e.widths[index] +
        cssPixels(e.rtl ? style.marginLeft : style.marginRight) +
        (index < slides.length - 1 ? measuredGap : 0);
      return start;
    });
    e.max = Math.max(0, extent + paddingEnd - e.width);
    e.continuous = continuousRequested && items.length > 1 && e.max > 1;
    e.cycle = e.continuous ? extent - paddingStart + measuredGap : 0;
    e.origin = e.cycle;
    if (e.continuous) e.max = extent + 2 * e.cycle + paddingEnd - e.width;
    e.targets = e.starts.map((start, index) => {
      const aligned =
        start -
        paddingStart -
        (layout.align === "center"
          ? (contentWidth - e.widths[index]) / 2
          : layout.align === "end"
            ? contentWidth - e.widths[index]
            : 0);
      return e.continuous ? aligned : Math.max(0, Math.min(e.max, aligned));
    });
    const retained = keys.indexOf(e.key);
    e.index = retained >= 0 ? retained : clampIndex(e.index, items.length);
    e.key = keys[e.index];
    e.pending = false;
    e.destination = undefined;
    e.rebasedPosition = undefined;
    clearTimeout(e.timer);
    for (const [copy, name] of [
      [beforeCopyRef.current, "before"],
      [afterCopyRef.current, "after"],
    ] as const) {
      copy?.replaceChildren(
        ...(e.continuous
          ? slides.map((slide, index) =>
              createLoopCopy(slide, `${id}-${name}-${index}`),
            )
          : []),
      );
    }
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
    const e = engine.current;
    if (e.rebasedPosition !== undefined) {
      const rebasedPosition = e.rebasedPosition;
      e.rebasedPosition = undefined;
      if (Math.abs(position() - rebasedPosition) <= 1) return;
    }
    if (engine.current.destination === undefined) rebase();
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
    Array.from(viewport.children)
      .filter((child) => child.classList.contains("rc-slide"))
      .forEach((slide) => observer?.observe(slide));
    const mutation = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(
              record.target instanceof Element
                ? record.target
                : record.target.parentElement
            )?.closest(".rc-loop-copy"),
        )
      )
        resize();
    });
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
    const load = (event: Event) => {
      if (!(event.target as Element).closest(".rc-loop-copy")) resize();
    };
    const input = () => {
      if (engine.current.continuous) resize();
    };
    viewport.addEventListener("load", load, true);
    viewport.addEventListener("input", input);
    viewport.addEventListener("change", input);
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
      viewport.removeEventListener("load", load, true);
      viewport.removeEventListener("input", input);
      viewport.removeEventListener("change", input);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [keySignature, continuousRequested]);
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
          stopForInteraction();
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
        data-loop={continuousRequested ? "continuous" : undefined}
        role="group"
        tabIndex={0}
        aria-label={props["aria-label"] ?? "Slides"}
        onPointerDown={() => {
          engine.current.dragging = true;
          stopForInteraction();
        }}
        onPointerUp={() => {
          engine.current.dragging = false;
          if (engine.current.pending) scheduleSettle();
        }}
        onPointerCancel={() => {
          engine.current.dragging = false;
          if (engine.current.pending) scheduleSettle();
        }}
        onWheel={stopForInteraction}
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
        {continuousRequested && (
          <div
            ref={beforeCopyRef}
            className="rc-loop-copy"
            aria-hidden="true"
            inert
          />
        )}
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
                event.currentTarget.inert = !isOriginalVisible(index);
              }
            }}
            ref={(node) => {
              if (node)
                node.inert =
                  !isOriginalVisible(index) &&
                  !node.contains(document.activeElement);
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
        {continuousRequested && (
          <div
            ref={afterCopyRef}
            className="rc-loop-copy"
            aria-hidden="true"
            inert
          />
        )}
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
