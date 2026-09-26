// Runs inside a browser, with no fixture-specific selectors for measurements.
export function inspect() {
  const rgba = value => {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return null;
    const parts = match[1].split(/[, /]+/).map(Number);
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };
  const luminance = rgb => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (fg, bg) => {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const descriptor = el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${String(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 5).join(".")}`;
  const texts = [], unresolved = [], overflow = [];
  const candidates = [...document.querySelectorAll("main *, header *, nav *")];
  // Large-data cases measure total DOM/record counts, but bound color sampling.
  for (const el of candidates.slice(0, 4000)) {
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || style.visibility === "hidden" || el.closest('[inert],[aria-hidden="true"]')) continue;
    if (rect.right > innerWidth + 1 || rect.left < -1) {
      overflow.push({ element: descriptor(el), text: (el.textContent ?? "").slice(0, 100), left: rect.left, right: rect.right, width: rect.width });
    }
    const ownText = [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("").trim();
    if (!ownText) continue;
    const ancestors = [];
    for (let parent = el; parent; parent = parent.parentElement) ancestors.unshift(parent);
    const complex = ancestors.some(parent => {
      const css = getComputedStyle(parent);
      return css.backgroundImage !== "none" || css.filter !== "none" || css.backdropFilter !== "none" || css.mixBlendMode !== "normal";
    });
    const fg = rgba(el.tagName.toLowerCase() === "text" || el.tagName.toLowerCase() === "tspan" ? style.fill : style.color);
    if (!fg || complex) {
      unresolved.push({ element: descriptor(el), text: ownText.slice(0, 100), reason: complex ? "image/filter/backdrop/blend requires pixel review" : "unsupported color" });
      continue;
    }
    // Render a background pixel and a full-coverage foreground pixel through the
    // same opacity groups. Antialiased edge pixels are not WCAG color samples.
    const composite = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [...front.slice(0, 3).map((v, i) => (v * front[3] + back[i] * back[3] * (1 - front[3])) / alpha), alpha];
    };
    function paint(text) {
      let pixel = [0, 0, 0, 0];
      for (let parent = el; parent; parent = parent.parentElement) {
        pixel = composite(pixel, rgba(getComputedStyle(parent).backgroundColor) ?? [0, 0, 0, 0]);
        if (parent === el && text) pixel = composite(fg, pixel);
        pixel[3] *= Number(getComputedStyle(parent).opacity);
      }
      return composite(pixel, [255, 255, 255, 1]).slice(0, 3);
    }
    const effectiveFg = paint(true), effectiveBg = paint(false);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.6667 && Number(style.fontWeight) >= 700);
    texts.push({ element: descriptor(el), text: ownText.slice(0, 100), foreground: effectiveFg, background: effectiveBg,
      ratio: ratio(effectiveFg, effectiveBg), threshold: large ? 3 : 4.5,
      fontSize: style.fontSize, fontFamily: style.fontFamily,
      disabled: Boolean(el.closest(":disabled,[aria-disabled='true']")),
    });
  }
  return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    documentWidth: document.documentElement.scrollWidth, overflow, texts, unresolved,
    loadedRecords: document.querySelectorAll("main > section > ol > li").length,
    elements: document.querySelectorAll("*").length,
    sampledElements: Math.min(4000, candidates.length),
    fontsLoaded: document.fonts.status,
  };
}
