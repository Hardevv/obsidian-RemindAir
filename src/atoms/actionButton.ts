import { PLUGIN_NAME } from "src/utils/constants";
import { setIcon } from "obsidian";

export const createActionButton = (icon: string, onClick: () => void, text?: string): HTMLButtonElement => {
  const btn = createEl("button", { cls: `${PLUGIN_NAME}_inline-button-action` });
  btn.addEventListener("pointerdown", onClick);
  btn.addEventListener("click", onClick);
  setIcon(btn, icon);
  if (text) btn.appendChild(createEl("span", { text, cls: `${PLUGIN_NAME}_inline-button-text` }));
  return btn;
};
