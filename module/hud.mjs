const HUD_ID = "explorers-hud";

function hud() {
  let element = document.getElementById(HUD_ID);
  if (!element) {
    element = document.createElement("div");
    element.id = HUD_ID;
    (document.getElementById("ui-top") ?? document.body).append(element);
  }
  return element;
}

// Each part of the system owns one pill, kept in a fixed order.
export function setHudItem(id, html, { order = 0, onClick = null, onContextMenu = null, tooltip = "" } = {}) {
  document.getElementById(id)?.remove();
  if (!html) return null;
  const element = document.createElement("div");
  element.id = id;
  element.className = "explorers-pill";
  element.style.order = order;
  element.innerHTML = html;
  if (tooltip) element.dataset.tooltip = tooltip;
  if (onClick || onContextMenu) element.classList.add("clickable");
  if (onClick) element.addEventListener("click", onClick);
  if (onContextMenu) element.addEventListener("contextmenu", event => {
    event.preventDefault();
    onContextMenu(event);
  });
  hud().append(element);
  return element;
}
