/** A visual snapshot, without React effects, event handlers, or active media. */
export function createLoopCopy(slide: HTMLElement, prefix: string) {
  const copy = slide.cloneNode(true) as HTMLElement;
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  const elements = [copy, ...Array.from(copy.querySelectorAll("*"))];
  const ids = new Map<string, string>();
  for (const element of elements) {
    if (element.id) {
      const replacement = `${prefix}-${ids.size}`;
      ids.set(element.id, replacement);
      element.id = replacement;
    }
    element.removeAttribute("name");
    element.removeAttribute("autofocus");
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("on"))
        element.removeAttribute(attribute.name);
    }
  }
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      let value = attribute.value;
      if (
        [
          "for",
          "list",
          "form",
          "headers",
          "aria-labelledby",
          "aria-describedby",
          "aria-controls",
          "aria-owns",
        ].includes(attribute.name)
      ) {
        value = value
          .split(/\s+/)
          .map((id) => ids.get(id) ?? id)
          .join(" ");
      }
      if (
        ["href", "xlink:href"].includes(attribute.name) &&
        value.startsWith("#")
      ) {
        value = `#${ids.get(value.slice(1)) ?? value.slice(1)}`;
      }
      value = value.replace(
        /url\(["']?#([^)'"\s]+)["']?\)/g,
        (match, id: string) => (ids.has(id) ? `url(#${ids.get(id)})` : match),
      );
      if (value !== attribute.value)
        element.setAttribute(attribute.name, value);
    }
  }
  // Cloned embeds must not load another application or play another media instance.
  copy
    .querySelectorAll("script, style, link, iframe, object, embed")
    .forEach((node) => node.remove());
  copy.querySelectorAll("audio, video").forEach((media) => {
    media.removeAttribute("autoplay");
    media.removeAttribute("src");
    media.querySelectorAll("source, track").forEach((node) => node.remove());
  });
  const originals = slide.querySelectorAll("select");
  copy.querySelectorAll("select").forEach((select, index) => {
    select.selectedIndex = originals[index].selectedIndex;
  });
  return copy;
}
