# Styling

Import the default stylesheet once:

```tsx
import "@obinesto/react-carousel/carousel/carousel.css";
```

For custom appearance, use the [structural stylesheet with your own CSS](#custom-appearance).
The default stylesheet provides appearance rules; `core.css` provides layout for application-defined styles.

## Apply your own classes

| Prop                | Element                          |
| ------------------- | -------------------------------- |
| `className`         | Carousel root.                   |
| `viewportClassName` | Scrollable viewport.             |
| `slideClassName`    | Each slide wrapper.              |
| `controlClassName`  | Navigation and playback buttons. |

Use `style` for inline root styles. Set slide widths through `slidesPerView`, and spacing through `gap`.
For content-sized slides, use `slidesPerView="auto"` and set the width of each item's content.

## Customize the default controls

With the default stylesheet, add `className="my-gallery"` to the carousel and set these variables.
When using only `core.css`, write your own appearance rules as shown below. The control-gap variable works with either stylesheet.

```css
.my-gallery {
  --rc-control-size: 44px;
  --rc-control-gap: 8px;
  --rc-control-spacing: 8px;
  --rc-control-radius: 6px;
  --rc-control-background: white;
  --rc-control-color: #172033;
  --rc-control-border: #64748b;
  --rc-focus-color: #2563eb;
}
```

Use `.rc-page[aria-current="true"]` to style the selected pagination button.
Use `.rc-control:disabled` to style unavailable navigation.
Keep keyboard focus indicators visible and `.rc-status` visually hidden.

## Custom appearance

Import only `core.css`, then add an application stylesheet. This example supplies card, button, pagination, and focus styles.

```tsx
import { Carousel } from "@obinesto/react-carousel";
import "@obinesto/react-carousel/core.css";
import "./gallery.css";

const courses = ["Drawing", "Photography", "Typography"];

export function CourseGallery() {
  return (
    <Carousel
      aria-label="Courses"
      items={courses}
      className="custom-gallery"
      controlClassName="custom-gallery__control"
      renderItem={(title) => (
        <article className="custom-gallery__card">
          <h2>{title}</h2>
        </article>
      )}
      pagination
    />
  );
}
```

The following `gallery.css` uses illustrative colors and dimensions. These values can be changed to match your application:

```css
.custom-gallery .rc-controls,
.custom-gallery .rc-pagination {
  padding-block: 8px;
}

.custom-gallery__card {
  padding: 24px;
  border-radius: 8px;
  background: #eef2f6;
  color: #172033;
}

.custom-gallery__control,
.custom-gallery .rc-page {
  min-width: 44px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid #64748b;
  border-radius: 6px;
  background: white;
  color: #172033;
  font: inherit;
  cursor: pointer;
}

.custom-gallery__control:disabled {
  opacity: 0.5;
  cursor: default;
}

.custom-gallery .rc-page[aria-current="true"] {
  background: #172033;
  color: white;
}

.custom-gallery :focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}
```

The structural stylesheet supplies the layout and visually hidden selection status.
To change button content, use the [custom navigation example](examples.md#custom-navigation).
If styles do not appear, see [troubleshooting](troubleshooting.md#styles-are-missing).
