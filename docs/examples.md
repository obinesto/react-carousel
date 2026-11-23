# Examples

Use these examples with the default stylesheet. See the [API reference](api.md) for all options.

## Basic image carousel

Import the default stylesheet once.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

const images = [
  { src: "/images/coast.jpg", alt: "Waves along a rocky coast" },
  { src: "/images/forest.jpg", alt: "A path through a green forest" },
  { src: "/images/hills.jpg", alt: "Sunlight across rolling hills" },
];

export function Gallery() {
  return (
    <Carousel
      aria-label="Landscape photographs"
      items={images}
      keyExtractor={(image) => image.src}
      renderItem={(image) => (
        <img
          src={image.src}
          alt={image.alt}
          width={1200}
          height={800}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      )}
      pagination
    />
  );
}
```

Replace the image paths with URLs from your application and supply a description for each image.

## Responsive cards

Breakpoints use the carousel viewport's **container width**, in CSS pixels. They do not use the browser window width.
Settings merge from the smallest matching breakpoint to the largest.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

const cards = [
  "Design",
  "Engineering",
  "Research",
  "Writing",
  "Operations",
  "Support",
];

export function CardGallery() {
  return (
    <Carousel
      aria-label="Departments"
      items={cards}
      slidesPerView={1}
      gap={16}
      slidesToScroll="page"
      breakpoints={{
        480: { slidesPerView: 2 },
        900: { slidesPerView: 3, gap: 24 },
      }}
      renderItem={(title) => <div>{title}</div>}
    />
  );
}
```

Numeric `slidesPerView` divides the available width after subtracting gaps. Fractional values show part of the next slide.
`slidesToScroll="page"` advances to the next item that does not fit fully in the current viewport.
Backward page navigation chooses a target about one viewport before the current target.

## Variable widths

Use `slidesPerView="auto"`. Set each item's content width through CSS or an inline style.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

const cards = [
  { id: "short", width: 180, title: "Short card" },
  { id: "wide", width: 320, title: "Wide card" },
  { id: "medium", width: 240, title: "Medium card" },
  { id: "last", width: 280, title: "Last card" },
];

export function VariableGallery() {
  return (
    <Carousel
      aria-label="Card sizes"
      items={cards}
      keyExtractor={(card) => card.id}
      slidesPerView="auto"
      gap={12}
      align="center"
      loop
      renderItem={(card) => (
        <article style={{ width: card.width }}>
          {card.title}
        </article>
      )}
    />
  );
}
```

Center and end alignment stop at the scrollable boundaries.
`gap` configures spacing between slides. Padding and borders can be placed on the root or an outer wrapper.
Individual slide-wrapper transforms are not supported. Uniform scaling or CSS zoom on an ancestor is supported.

## Autoplay and playback controls

Autoplay is off by default. Enabling it adds a native playback button before the slides and navigation controls.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

export function Announcements() {
  return (
    <Carousel
      aria-label="Announcements"
      items={[
        "Registration is open",
        "Meet our new team",
        "Read the latest report",
      ]}
      renderItem={(text) => <p style={{ padding: 24 }}>{text}</p>}
      loop
      autoplay={{ interval: 5000 }}
      labels={{ play: "Start announcements", pause: "Stop announcements" }}
    />
  );
}
```

- Focus entering the carousel, manual navigation, and touch or wheel input pause autoplay. Use the playback button or `play()` to restart.
- Hover suspends autoplay when `pauseOnHover` is `true`, its default. Set `pauseOnHover={false}` to continue while hovered.
- A hidden browser tab suspends autoplay regardless of the hover setting.
- Reduced motion disables autoplay and animated navigation.
- Each rotation waits for scrolling to finish, then waits the full interval.
- Finite autoplay stops at the end. Starting it again returns to the first slide.

Keep a playback button available when you replace the default controls.
Set `autoplay={false}` to disable autoplay.

## Custom navigation

Replace either button independently. Spread the supplied props onto a native button.
This preserves its label, disabled state, type, focus behavior, and action.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

export function CustomGallery() {
  return (
    <Carousel
      aria-label="Featured articles"
      items={["First article", "Second article", "Third article"]}
      renderItem={(title) => <div>{title}</div>}
      controls={{
        previous: (props) => <button {...props}>Previous article</button>,
        next: (props) => <button {...props}>Next article</button>,
      }}
    />
  );
}
```

Set `navigation={false}` to omit both navigation buttons. Use `controls={{ previous: false }}` to omit one.
`controls.playback` replaces the playback button when autoplay is enabled.
`renderControls(api, state)` replaces the whole controls row. Include a playback button when you enable autoplay.
Return a React portal from this callback to place controls elsewhere.

## Custom labels

Set labels to match your content or language. The callbacks receive zero-based indices.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

const articles = ["Getting started", "Choosing a layout", "Adding controls"];

export function ArticleGallery() {
  return (
    <Carousel
      aria-label="Help articles"
      items={articles}
      renderItem={(title) => <div>{title}</div>}
      autoplay={{ interval: 5000 }}
      loop
      pagination
      labels={{
        previous: "Previous article",
        next: "Next article",
        play: "Start article rotation",
        pause: "Stop article rotation",
        pagination: "Choose an article",
        slide: (index, count) => `Article ${index + 1} of ${count}`,
        goTo: (index, count) => `Show article ${index + 1} of ${count}`,
      }}
    />
  );
}
```

## Custom controls and slide selection

Use `renderControls` for your own controls row. This example includes a selector that calls `goTo()`.
Autoplay is off, so the row needs only navigation controls.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

const products = ["Notebook", "Pen", "Folder"];

export function ProductGallery() {
  return (
    <Carousel
      aria-label="Products"
      items={products}
      renderItem={(name) => <div>{name}</div>}
      renderControls={(api, state) => (
        <>
          <button
            type="button"
            disabled={!state.canPrevious}
            onClick={api.previous}
          >
            Previous product
          </button>
          <label>
            Choose a product
            <select
              value={state.selectedIndex}
              onChange={(event) => api.goTo(Number(event.currentTarget.value))}
            >
              {products.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!state.canNext}
            onClick={api.next}
          >
            Next product
          </button>
        </>
      )}
    />
  );
}
```

## External navigation

`apiRef` supplies commands. `onStateChange` supplies state for external controls and counters.
The carousel owns selection and playback. There is no controlled `selectedIndex` or `playing` prop.

```tsx
import { useRef, useState } from "react";
import {
  Carousel,
  type CarouselApi,
  type CarouselState,
} from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

export function ExternalGallery() {
  const api = useRef<CarouselApi>(null);
  const [state, setState] = useState<CarouselState | null>(null);
  return (
    <section aria-label="Product browser">
      <div>
        <button
          type="button"
          disabled={!state?.canPrevious}
          onClick={() => api.current?.previous()}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!state?.canNext}
          onClick={() => api.current?.next()}
        >
          Next
        </button>
        <span>
          {state ? `${state.selectedIndex + 1} / ${state.slideCount}` : ""}
        </span>
      </div>
      <Carousel
        aria-label="Products"
        items={["Notebook", "Pen", "Folder"]}
        renderItem={(name) => <div>{name}</div>}
        apiRef={api}
        onStateChange={setState}
        navigation={false}
      />
    </section>
  );
}
```

External playback controls can call `play()` and `pause()` and read the current playback state.
A supplied playback button can also be placed externally, as shown below.
See [external playback controls](#external-playback-controls) to place the playback button outside the carousel.

## External playback controls

Return a portal from `controls.playback` to place the playback button outside the carousel.
Spreading the supplied props retains the start/stop action, accessible label, and reduced-motion disabled state.
Keep the host before the carousel so keyboard users reach the playback button first.

```tsx
import { useState } from "react";
import { createPortal } from "react-dom";
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

const updates = [
  "Registration is open",
  "Meet our new team",
  "Read the latest report",
];

export function UpdatesGallery() {
  const [playbackHost, setPlaybackHost] = useState<HTMLDivElement | null>(null);

  return (
    <section aria-label="Latest updates">
      <div ref={setPlaybackHost} />
      <Carousel
        aria-label="Announcements"
        items={updates}
        renderItem={(text) => <p>{text}</p>}
        loop
        autoplay={{ interval: 5000 }}
        controls={{
          playback: (props) => (
            playbackHost
              ? createPortal(<button {...props} />, playbackHost)
              : <button {...props} />
          ),
        }}
      />
    </section>
  );
}
```

The inline button is shown until the external host is ready. Previous and next buttons remain inside the carousel.

## Finite navigation

Finite navigation is the default. Controls become disabled at physical boundaries.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

export function Steps() {
  return (
    <Carousel
      aria-label="Setup steps"
      items={["Prepare", "Connect", "Finish"]}
      renderItem={(step) => <div>{step}</div>}
      loop={false}
      startIndex={1}
      pagination
    />
  );
}
```

Set `loop` to wrap next and previous navigation between the ends.
Touch and wheel scrolling stop at the physical edges and do not snap to slides.
Navigation is disabled when the items fit in the viewport or the carousel has fewer than two items.
