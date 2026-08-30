import { vi } from "vitest"

export const setIcon = vi.fn()

export const Platform = { isMobile: false, isDesktop: true }

export const editorLivePreviewField = {}

export class MarkdownView {}
export class Plugin {}
export class Editor {}
export class PluginSettingTab {}

export class Toggle {
  value: boolean | undefined
  onChangeCb: ((value: boolean) => unknown) | undefined

  setValue(value: boolean) {
    this.value = value
    return this
  }

  onChange(cb: (value: boolean) => unknown) {
    this.onChangeCb = cb
    return this
  }
}

export class Dropdown {
  options: [string, string][] = []
  value = ""
  onChangeCb: ((value: string) => unknown) | undefined

  addOption(value: string, label: string) {
    this.options.push([value, label])
    return this
  }

  setValue(value: string) {
    this.value = value
    return this
  }

  onChange(cb: (value: string) => unknown) {
    this.onChangeCb = cb
    return this
  }
}

export class TextComponent {
  inputEl = document.createElement("input")
  value = ""
  placeholder = ""
  onChangeCb: ((value: string) => unknown) | undefined

  setPlaceholder(value: string) {
    this.placeholder = value
    this.inputEl.placeholder = value
    return this
  }

  setValue(value: string) {
    this.value = value
    this.inputEl.value = value
    return this
  }

  onChange(cb: (value: string) => unknown) {
    this.onChangeCb = cb
    return this
  }
}

export class ButtonComponent {
  text = ""
  cta = false
  disabled = false

  setButtonText(text: string) {
    this.text = text
    return this
  }

  setCta() {
    this.cta = true
    return this
  }

  setDisabled(disabled: boolean) {
    this.disabled = disabled
    return this
  }
}

export class Setting {
  static instances: Setting[] = []

  name = ""
  desc = ""
  heading = false
  toggles: Toggle[] = []
  dropdowns: Dropdown[] = []
  texts: TextComponent[] = []
  buttons: ButtonComponent[] = []

  constructor(public containerEl: HTMLElement) {
    Setting.instances.push(this)
  }

  setName(name: string) {
    this.name = name
    return this
  }

  setDesc(desc: string) {
    this.desc = desc
    return this
  }

  setHeading() {
    this.heading = true
    return this
  }

  addToggle(cb: (toggle: Toggle) => unknown) {
    const toggle = new Toggle()
    this.toggles.push(toggle)
    cb(toggle)
    return this
  }

  addDropdown(cb: (dropdown: Dropdown) => unknown) {
    const dropdown = new Dropdown()
    this.dropdowns.push(dropdown)
    cb(dropdown)
    return this
  }

  addText(cb: (text: TextComponent) => unknown) {
    const text = new TextComponent()
    this.texts.push(text)
    cb(text)
    return this
  }

  addButton(cb: (button: ButtonComponent) => unknown) {
    const button = new ButtonComponent()
    this.buttons.push(button)
    cb(button)
    return this
  }
}

export class Modal {
  containerEl: HTMLElement
  modalEl: HTMLElement
  titleEl: HTMLElement
  contentEl: HTMLElement

  constructor(public app: unknown) {
    this.containerEl = document.createElement("div")
    this.modalEl = document.createElement("div")
    this.titleEl = document.createElement("div")
    this.contentEl = document.createElement("div")
    this.modalEl.append(this.titleEl, this.contentEl)
    this.containerEl.appendChild(this.modalEl)
  }

  open() {
    this.onOpen()
  }

  close() {
    this.onClose()
  }

  onOpen() {}

  onClose() {}
}
