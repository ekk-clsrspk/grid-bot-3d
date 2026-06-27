const SPRITE_PATH = "./assets/lucide-sprite.svg";

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function spriteIcon(name, options = {}) {
  const {
    className = "",
    label = "",
    hidden = !label,
  } = options;

  const classes = ["lucide-icon"];
  if (className) classes.push(className);

  const ariaAttributes = hidden
    ? 'aria-hidden="true"'
    : `role="img" aria-label="${escapeAttribute(label)}"`;

  return `<svg class="${classes.join(" ")}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${ariaAttributes} focusable="false"><use href="${SPRITE_PATH}#${escapeAttribute(name)}"></use></svg>`;
}

export function setSpriteIcon(element, name, options = {}) {
  element.innerHTML = spriteIcon(name, options);
  return element.firstElementChild;
}
