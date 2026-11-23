# Troubleshooting

## Styles are missing

Import `@obinesto/react-carousel/carousel/carousel.css` once in your application.
It includes the layout and default control appearance.

If you import only `@obinesto/react-carousel/core.css`, add your own appearance rules.
Most default button appearance variables require the default stylesheet.
See the [custom appearance example](styling.md#custom-appearance) for a complete setup.

## Navigation buttons are disabled

Check that there are at least two items and that the content is wider than the carousel.
Reduce `slidesPerView` if all items fit at once.
With `slidesPerView="auto"`, give the item content a width when needed.

In finite mode, previous is disabled at the beginning and next is disabled at the end.
Set `loop` to wrap navigation between the ends. It does not enable navigation when all items already fit.

## Autoplay is not advancing

Enable autoplay with `autoplay={{ interval: 5000 }}`. There must be content available to scroll.

- Focus entering the carousel, manual navigation, and touch or wheel input pause autoplay. Use the playback button to restart.
- Hover temporarily suspends autoplay when `pauseOnHover` is `true`. Move the pointer away or set `pauseOnHover={false}`.
- A hidden browser tab suspends autoplay. Return to the tab to resume it.
- Reduced motion keeps autoplay paused and disables the default start button while the preference is active.
- Finite autoplay stops at the end. Starting it again returns to the first slide.

When using `apiRef`, call `apiRef.current?.play()` to restart after a pause.
`play()` requires autoplay to be enabled and does not override reduced motion.
See [external playback controls](examples.md#external-playback-controls) for a button that retains these behaviors.

## Responsive settings do not change

Breakpoints use the carousel's container width, not the browser window width.
Check the width available to the carousel, especially inside a narrow column.
Set `breakpoints` keys to minimum widths in CSS pixels.

See [responsive cards](examples.md#responsive-cards) for an example.

## Custom controls do not respond

Spread the supplied button props when using `controls`. They include the click action and disabled state.
With `renderControls`, call the API methods from event handlers and use the supplied state for button availability.
With `apiRef`, use optional chaining because the ref is initially `null`.

See [custom navigation](examples.md#custom-navigation) and [external navigation](examples.md#external-navigation).
