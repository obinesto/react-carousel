import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
  Ref,
} from "react";

export interface CarouselLayout {
  slidesPerView?: number | "auto";
  gap?: number;
  align?: "start" | "center" | "end";
  slidesToScroll?: number | "page";
}
export type CarouselPlayback = "disabled" | "paused" | "suspended" | "playing";

export interface CarouselState {
  selectedIndex: number;
  visibleIndices: number[];
  slideCount: number;
  canPrevious: boolean;
  canNext: boolean;
  isScrolling: boolean;
  playback: CarouselPlayback;
}

export interface CarouselApi {
  next(): void;
  previous(): void;
  goTo(index: number): void;
  play(): void;
  pause(): void;
  getState(): CarouselState;
}

export interface CarouselLabels {
  previous: string;
  next: string;
  play: string;
  pause: string;
  pagination: string;
  slide: (index: number, count: number) => string;
  goTo: (index: number, count: number) => string;
}
type ControlRenderer = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => ReactNode;

export interface CarouselProps<T> extends CarouselLayout {
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor?: (item: T, index: number) => string | number;
  /** Minimum carousel container widths, in CSS pixels. */
  breakpoints?: Record<number, CarouselLayout>;
  loop?: boolean;
  startIndex?: number;
  autoplay?: false | { interval?: number; };
  pauseOnHover?: boolean;
  navigation?: boolean;
  pagination?: boolean;
  controls?: {
    previous?: ControlRenderer | false;
    next?: ControlRenderer | false;
    playback?: ControlRenderer;
  };
  /** Replaces the controls row. Return null for external controls. */
  renderControls?: (api: CarouselApi, state: CarouselState) => ReactNode;
  apiRef?: Ref<CarouselApi>;
  labels?: Partial<CarouselLabels>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  role?: "region" | "group";
  dir?: "ltr" | "rtl";
  className?: string;
  style?: CSSProperties;
  viewportClassName?: string;
  slideClassName?: string;
  controlClassName?: string;
  onSelectionChange?: (index: number) => void;
  onPlaybackChange?: (playback: CarouselPlayback) => void;
  onStateChange?: (state: CarouselState) => void;
  onSettled?: (state: CarouselState) => void;
}
