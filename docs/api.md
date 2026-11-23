# API reference

See [Examples](examples.md) for complete usage examples and [Troubleshooting](troubleshooting.md) for common setup issues.

| Prop                                                      | Default         | Purpose                                                                          |
| --------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| `items`, `renderItem`                                     | Required        | Data and the function that renders each slide.                                   |
| `keyExtractor`                                            | Item index      | Optional identity function for lists that change.                                |
| `slidesPerView`                                           | `1`             | Positive number or `"auto"` for content-sized slides.                            |
| `gap`                                                     | `16`            | Nonnegative gap in CSS pixels.                                                   |
| `align`                                                   | `"start"`       | Logical `"start"`, `"center"`, or `"end"` alignment.                             |
| `slidesToScroll`                                          | `1`             | Positive integer or `"page"`. See loop modes for edge behavior.                   |
| `breakpoints`                                             | None            | Container minimum widths mapped to layout overrides.                             |
| `loop`                                                    | `false`         | `false` for finite navigation, `true` for endpoint wrapping, or `"continuous"` for seamless looping. |
| `startIndex`                                              | `0`             | Initial logical index. Later changes do not control selection.                   |
| `autoplay`                                                | `false`         | `false` or `{ interval?: number }`. Interval defaults to 5000 milliseconds.      |
| `pauseOnHover`                                            | `true`          | Temporarily suspend autoplay while hovered. Set to `false` to continue rotation. |
| `navigation`                                              | `true`          | Show default previous and next buttons.                                          |
| `pagination`                                              | `false`         | Show native numbered slide buttons.                                              |
| `controls`                                                | Default buttons | Individual button renderers.                                                     |
| `renderControls`                                          | None            | Replace the whole controls row with `(api, state) => ReactNode`.                 |
| `apiRef`                                                  | None            | Optional ref for external commands. Cleared on unmount.                          |
| `aria-label`                                              | `"Slides"`      | Accessible carousel name. Supply a specific name for each instance.              |
| `aria-labelledby`                                         | None            | ID of a visible heading. Takes precedence over `aria-label`.                     |
| `role`                                                    | `"region"`      | `"region"` or `"group"`.                                                         |
| `dir`                                                     | Inherited       | `"ltr"` or `"rtl"`. Direction is measured from the viewport.                     |
| `labels`                                                  | English         | Override previous, next, play, pause, pagination, slide, and goTo labels.        |
| `className`, `style`                                      | None            | Root customization.                                                              |
| `viewportClassName`, `slideClassName`, `controlClassName` | None            | Stable styling slots.                                                            |

## Rendering items

`renderItem(item, index)` receives an item and its zero-based index and returns a React node.
`keyExtractor(item, index)` receives the same arguments and returns a unique string or number.

## Loop modes

| Value | Navigation behavior |
| --- | --- |
| `false` | Stop at the first and last slides. |
| `true` | Wrap buttons, keyboard commands, methods, and autoplay between the ends. Touch and wheel scrolling stop at physical edges. |
| `"continuous"` | Continue forward or backward through the last-to-first boundary with controls, autoplay, touch, and wheel scrolling. |

All modes disable navigation when fewer than two items exist or all items fit in the viewport.
Continuous mode keeps indices and pagination based on the original items. `goTo()` takes the nearest route to the requested slide.
The native scrollbar is hidden in continuous mode; buttons, keyboard navigation, touch, and wheel scrolling remain available.
Numeric steps wrap around the item list; `"page"` advances by the slides needed to fill the viewport.
Autoplay still pauses on manual navigation and focus entry, and respects reduced motion.

Use continuous mode for images, text, and other static content. Slides repeated across a boundary are non-interactive visual copies.
Use `loop={true}` or `loop={false}` for forms, interactive widgets, canvas, live audio or video, and embedded applications.
For consistent appearance in continuous mode, style slide content with classes rather than element IDs or child-position selectors.
See the [continuous loop example](examples.md#continuous-looping).

## Labels

Pass a partial `CarouselLabels` object through `labels`. Omitted fields keep their English defaults.

| Field        | Accepted value                             | Default                              |
| ------------ | ------------------------------------------ | ------------------------------------ |
| `previous`   | String                                     | `"Previous slide"`                   |
| `next`       | String                                     | `"Next slide"`                       |
| `play`       | String                                     | `"Start slide rotation"`             |
| `pause`      | String                                     | `"Stop slide rotation"`              |
| `pagination` | String                                     | `"Choose a slide"`                   |
| `slide`      | `(index: number, count: number) => string` | `"1 of 3"`, for example.             |
| `goTo`       | `(index: number, count: number) => string` | `"Go to slide 1 of 3"`, for example. |

The label callbacks receive a zero-based index and the total item count.
Add one to the index when displaying slide numbers.
`slide` names each slide and the selection announcement. `goTo` names each pagination button.
See [custom labels](examples.md#custom-labels) for a complete example.

## Button renderers

`controls` accepts these properties:

```ts
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonRenderer = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => ReactNode;

type Controls = {
  previous?: ButtonRenderer | false;
  next?: ButtonRenderer | false;
  playback?: ButtonRenderer;
};
```

Omit a property to keep its default button. Set `previous` or `next` to `false` to hide that button.
The playback renderer is used only when `autoplay` is enabled.

Spread the supplied props onto a native `button`.
They include `type`, `onClick`, `disabled`, `children`, and accessible labels and relationships.
Keep the playback button's supplied pointer handler when customizing it.
Its supplied `children` and `aria-label` change between the start and stop actions.

See [custom navigation](examples.md#custom-navigation) and [external playback controls](examples.md#external-playback-controls).

## Complete controls row

Use `renderControls` to replace the navigation and playback row:

```ts
import type { ReactNode } from "react";
import type { CarouselApi, CarouselState } from "@obinesto/react-carousel";

type RenderControls = (api: CarouselApi, state: CarouselState) => ReactNode;
```

Call commands from event handlers, such as `onClick` or `onChange`.
Use `state.canPrevious` and `state.canNext` to set button availability.
The separate `pagination` prop still controls the numbered pagination buttons.
Return `null` to omit the row, or a React portal to place it elsewhere.

If autoplay is enabled, include a playback control.
To retain the supplied playback-button behavior, customize `controls.playback` instead.
See [custom controls and slide selection](examples.md#custom-controls-and-slide-selection) for a complete row with `goTo()`.

## Methods

`apiRef` is optional. Built-in controls work without it, and `renderControls` receives the API directly.
For commands elsewhere in your application, pass a React ref through `apiRef` and call `apiRef.current`.
See [external navigation](examples.md#external-navigation) for a complete example.

| Method        | Use                                                                                 |
| ------------- | ----------------------------------------------------------------------------------- |
| `next()`      | Advance by `slidesToScroll`.                                                        |
| `previous()`  | Move backward by `slidesToScroll`.                                                  |
| `goTo(index)` | Select a slide by its zero-based index.                                             |
| `play()`      | Start enabled autoplay. At the end of a finite carousel, return to the first slide. |
| `pause()`     | Pause autoplay until the user starts it again.                                      |
| `getState()`  | Read the current selection, navigation availability, and playback state.            |

`goTo()` clamps indices outside the item range to the nearest available end. Manual navigation pauses autoplay.

## State

Use `onStateChange` to update custom controls and counters.

| Field                    | Use                                              |
| ------------------------ | ------------------------------------------------ |
| `selectedIndex`          | Zero-based selected slide index.                 |
| `visibleIndices`         | Indices of the slides currently visible.         |
| `slideCount`             | Number of items.                                 |
| `canPrevious`, `canNext` | Enable or disable your navigation buttons.       |
| `isScrolling`            | Whether scrolling is in progress.                |
| `playback`               | `disabled`, `paused`, `suspended`, or `playing`. |

`paused` requires an explicit restart. `suspended` resumes when a temporary condition, such as hover, ends.
Selection and playback are managed by the carousel. Use the methods to change them.

## Events

| Callback            | Argument       | When called                          |
| ------------------- | -------------- | ------------------------------------ |
| `onSelectionChange` | Selected index | On mount and when selection changes. |
| `onPlaybackChange`  | Playback state | On mount and when playback changes.  |
| `onStateChange`     | State object   | On mount and when state changes.     |
| `onSettled`         | State object   | After scrolling stops.               |

Use `onSelectionChange` to react to selection. Use `onSettled` when you need to wait for scrolling to finish.

## Updating items

`keyExtractor` is optional. Without it, item identity follows array positions.
For lists that change, a stable item ID can preserve selection and input state through insertion, removal, or reordering.
For example, items with an `id` field can use `keyExtractor={(item) => item.id}`.
The selected item stays selected when its key remains in the array.
If it is removed, selection stays at the same index or moves to the last available item.

## Interactive content

Use unique element IDs across carousels. Manage audio and video playback in your slide components.
Navigation leaves keyboard focus in place. Offscreen controls become available when their slide is visible.

When the viewport has focus, arrow keys navigate visually. Home and End select the first and last slides.
Inputs and other controls inside slides retain their usual keyboard behavior.

For older browsers, provide polyfills for `ResizeObserver` and `inert` when those features are unavailable.
