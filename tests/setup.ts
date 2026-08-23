const applyInfo = (el: HTMLElement, o?: DomElementInfo | string): void => {
  if (!o) return;
  if (typeof o === "string") {
    el.className = o;
    return;
  }
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
  if (o.text !== undefined) el.textContent = typeof o.text === "string" ? o.text : o.text.textContent;
  if (o.attr) {
    for (const [key, value] of Object.entries(o.attr)) {
      if (value === null || value === false) continue;
      el.setAttribute(key, String(value));
    }
  }
  if (o.title) el.title = o.title;
  if (o.value !== undefined) (el as HTMLInputElement).value = o.value;
  if (o.type) (el as HTMLInputElement).type = o.type;
  if (o.placeholder) (el as HTMLInputElement).placeholder = o.placeholder;
  if (o.href) (el as HTMLAnchorElement).href = o.href;
  if (o.parent) o.parent.appendChild(el);
};

globalThis.createEl = ((tag: keyof HTMLElementTagNameMap, o?: DomElementInfo | string, cb?: (el: HTMLElement) => void) => {
  const el = document.createElement(tag);
  applyInfo(el, o);
  cb?.(el);
  return el;
}) as typeof createEl;

globalThis.createDiv = ((o?: DomElementInfo | string, cb?: (el: HTMLDivElement) => void) => {
  const el = document.createElement("div");
  applyInfo(el, o);
  cb?.(el);
  return el;
}) as typeof createDiv;

globalThis.createSpan = ((o?: DomElementInfo | string, cb?: (el: HTMLSpanElement) => void) => {
  const el = document.createElement("span");
  applyInfo(el, o);
  cb?.(el);
  return el;
}) as typeof createSpan;
