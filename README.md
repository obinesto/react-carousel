# React Carousel

A React carousel with slide-aware navigation, responsive layouts, and customizable controls.
Requires React 18 or later.

## Install

```sh
npm install @obinesto/react-carousel
```

## Quick start

Import the default stylesheet once. No CSS framework is required.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/carousel/carousel.css";

const topics = ["Design", "Engineering", "Research"];

export function TopicGallery() {
  return (
    <Carousel
      aria-label="Featured topics"
      items={topics}
      renderItem={(title) => <div>{title}</div>}
      pagination
    />
  );
}
```

The default layout shows one slide with a 16-pixel gap. Navigation is finite, and autoplay is off.

## Configuration

- Use `slidesPerView`, `gap`, and `align` to configure the layout.
- Use `breakpoints` for responsive settings based on the carousel's container width.
- Use `slidesPerView="auto"` for content-sized slides and `slidesToScroll="page"` for group navigation.
- Set `loop` to wrap navigation between the ends. Native gestures stop at physical edges.
- Set `autoplay={{ interval: 5000 }}` to enable rotation with a playback control and reduced-motion handling.
- `pauseOnHover` defaults to `true`. Set it to `false` to keep autoplay advancing while hovered.
- `controls` customizes built-in buttons. The optional `apiRef` exposes commands for external controls.

`keyExtractor` is optional. It can identify items by a stable ID when the list changes.
Give each carousel an accessible name through `aria-label` or `aria-labelledby`.

## Styling

The default stylesheet includes structure, control sizing, and focus indicators.
For custom appearance, import `@obinesto/react-carousel/core.css` instead and style the documented slots.

## Documentation

- [Examples](https://github.com/obinesto/react-carousel/blob/main/docs/examples.md): images, responsive cards, variable widths, autoplay, and navigation.
- [API reference](https://github.com/obinesto/react-carousel/blob/main/docs/api.md): props, methods, events, and interaction behavior.
- [Styling](https://github.com/obinesto/react-carousel/blob/main/docs/styling.md): CSS imports, classes, and variables.

## License

MIT
