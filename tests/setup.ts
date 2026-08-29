const applyInfo = (el: HTMLElement, o?: DomElementInfo | string): void => {
  if (!o) return
  if (typeof o === "string") {
    el.className = o
    return
  }
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls
  if (o.text !== undefined) el.textContent = typeof o.text === "string" ? o.text : o.text.textContent
  if (o.attr) {
    for (const [key, value] of Object.entries(o.attr)) {
      if (value === null || value === false) continue
      el.setAttribute(key, String(value))
    }
  }
  if (o.title) el.title = o.title
  if (o.value !== undefined) (el as HTMLInputElement).value = o.value
  if (o.type) (el as HTMLInputElement).type = o.type
  if (o.placeholder) (el as HTMLInputElement).placeholder = o.placeholder
  if (o.href) (el as HTMLAnchorElement).href = o.href
  if (o.parent) o.parent.appendChild(el)
}

globalThis.createEl = ((tag: keyof HTMLElementTagNameMap, o?: DomElementInfo | string, cb?: (el: HTMLElement) => void) => {
  const el = document.createElement(tag)
  applyInfo(el, o)
  cb?.(el)
  return el
}) as typeof createEl

globalThis.createDiv = ((o?: DomElementInfo | string, cb?: (el: HTMLDivElement) => void) => {
  const el = document.createElement("div")
  applyInfo(el, o)
  cb?.(el)
  return el
}) as typeof createDiv

globalThis.createSpan = ((o?: DomElementInfo | string, cb?: (el: HTMLSpanElement) => void) => {
  const el = document.createElement("span")
  applyInfo(el, o)
  cb?.(el)
  return el
}) as typeof createSpan

const createChild = <K extends keyof HTMLElementTagNameMap>(
  parent: Node,
  tag: K,
  o?: DomElementInfo | string,
  cb?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  applyInfo(el, o)
  cb?.(el)
  parent.appendChild(el)
  return el
}

Node.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  o?: DomElementInfo | string,
  cb?: (el: HTMLElementTagNameMap[K]) => void,
) {
  return createChild(this, tag, o, cb)
} as Node["createEl"]

Node.prototype.createDiv = function (o?: DomElementInfo | string, cb?: (el: HTMLDivElement) => void) {
  return createChild(this, "div", o, cb)
} as Node["createDiv"]

Node.prototype.createSpan = function (o?: DomElementInfo | string, cb?: (el: HTMLSpanElement) => void) {
  return createChild(this, "span", o, cb)
} as Node["createSpan"]

Node.prototype.empty = function () {
  this.replaceChildren()
} as Node["empty"]

Element.prototype.getText = function () {
  return this.textContent ?? ""
}

Element.prototype.setText = function (val) {
  this.textContent = typeof val === "string" ? val : val.textContent
}

Element.prototype.addClass = function (...classes) {
  this.classList.add(...classes)
}

Element.prototype.addClasses = function (classes) {
  this.classList.add(...classes)
}

Element.prototype.removeClass = function (...classes) {
  this.classList.remove(...classes)
}

Element.prototype.removeClasses = function (classes) {
  this.classList.remove(...classes)
}

Element.prototype.toggleClass = function (classes, value) {
  for (const cls of Array.isArray(classes) ? classes : [classes]) this.classList.toggle(cls, value)
}

Element.prototype.hasClass = function (cls) {
  return this.classList.contains(cls)
}

Element.prototype.setAttr = function (qualifiedName, value) {
  if (value === null || value === false) this.removeAttribute(qualifiedName)
  else this.setAttribute(qualifiedName, String(value))
}

Element.prototype.setAttrs = function (obj) {
  for (const [key, value] of Object.entries(obj)) this.setAttr(key, value)
}

Element.prototype.getAttr = function (qualifiedName) {
  return this.getAttribute(qualifiedName)
}
