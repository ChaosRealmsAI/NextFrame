const STYLE_ID = "nextframe-command-palette-style";

function fuzzyMatch(value, query) {
  const normalizedValue = String(value ?? "").toLowerCase();
  const normalizedQuery = String(query ?? "").trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return true;
  }

  let queryIndex = 0;
  for (const char of normalizedValue) {
    if (char === normalizedQuery[queryIndex]) {
      queryIndex += 1;
      if (queryIndex >= normalizedQuery.length) {
        return true;
      }
    }
  }

  return false;
}

function matchesCommand(command, query) {
  return fuzzyMatch(command.label, query)
    || fuzzyMatch(command.id, query)
    || fuzzyMatch(command.shortcut, query);
}

function isCommandPaletteShortcut(event) {
  return !event.altKey
    && (event.metaKey || event.ctrlKey)
    && String(event.key).toLowerCase() === "k";
}

function normalizeCommands(commands) {
  if (!commands) {
    return [];
  }

  const entries = commands instanceof Map
    ? [...commands.entries()].map(([id, value]) => ({ id, ...value }))
    : Array.isArray(commands)
      ? commands
      : Object.entries(commands).map(([id, value]) => ({ id, ...value }));

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object" || typeof entry.run !== "function") {
        return null;
      }

      const id = String(entry.id ?? "").trim();
      const label = String(entry.label ?? "").trim();
      if (!id || !label) {
        return null;
      }

      return {
        id,
        label,
        shortcut: typeof entry.shortcut === "string" && entry.shortcut.trim().length > 0
          ? entry.shortcut.trim()
          : "",
        run: entry.run,
      };
    })
    .filter(Boolean);
}

function createCommandButton(command, index, isSelected, execute) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "command-palette-item";
  button.dataset.index = String(index);
  button.dataset.selected = isSelected ? "true" : "false";

  const label = document.createElement("span");
  label.className = "command-palette-item-label";
  label.textContent = command.label;

  const shortcut = document.createElement("span");
  shortcut.className = "command-palette-item-shortcut";
  shortcut.textContent = command.shortcut;

  button.append(label, shortcut);
  button.addEventListener("mouseenter", () => execute({ type: "select", index }));
  button.addEventListener("click", () => execute({ type: "run", index }));

  return button;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .command-palette-backdrop {
      position: fixed;
      inset: 0;
      z-index: 160;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(3, 6, 14, 0.68);
      backdrop-filter: blur(10px);
    }

    .command-palette-modal {
      width: min(640px, calc(100vw - 32px));
      height: min(400px, calc(100vh - 48px));
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 22px;
      background:
        radial-gradient(circle at top right, rgba(99, 102, 241, 0.16), transparent 32%),
        linear-gradient(180deg, rgba(18, 18, 28, 0.98), rgba(10, 10, 18, 0.98));
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.48);
      overflow: hidden;
    }

    .command-palette-search {
      width: 100%;
      height: 56px;
      padding: 0 20px;
      border: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      outline: none;
      background: rgba(255, 255, 255, 0.03);
      color: #f4f6ff;
      font: inherit;
      font-size: 16px;
      letter-spacing: 0.01em;
    }

    .command-palette-search::placeholder {
      color: rgba(230, 230, 240, 0.46);
    }

    .command-palette-list {
      flex: 1;
      overflow: auto;
      padding: 10px;
    }

    .command-palette-item {
      width: 100%;
      min-height: 46px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 14px;
      border: 1px solid transparent;
      border-radius: 14px;
      background: transparent;
      color: #edf2ff;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .command-palette-item:hover,
    .command-palette-item[data-selected="true"] {
      border-color: rgba(99, 102, 241, 0.34);
      background: rgba(99, 102, 241, 0.16);
    }

    .command-palette-item-label {
      flex: 1;
      min-width: 0;
    }

    .command-palette-item-shortcut {
      flex: 0 0 auto;
      color: rgba(230, 230, 240, 0.58);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .command-palette-empty {
      height: 100%;
      display: grid;
      place-items: center;
      padding: 24px;
      color: rgba(230, 230, 240, 0.6);
      text-align: center;
    }
  `;
  document.head.append(style);
}

export function mountCommandPalette({ store, bridge, commands } = {}) {
  if (!(document.body instanceof HTMLElement)) {
    throw new TypeError("mountCommandPalette() requires document.body");
  }

  installStyles();
  window.__commandPalette?.destroy?.();

  const normalizedCommands = normalizeCommands(commands);
  const backdrop = document.createElement("div");
  backdrop.className = "command-palette-backdrop";
  backdrop.hidden = true;

  const modal = document.createElement("div");
  modal.className = "command-palette-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Command palette");

  const input = document.createElement("input");
  input.className = "command-palette-search";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Type a command...";

  const list = document.createElement("div");
  list.className = "command-palette-list";

  modal.append(input, list);
  backdrop.append(modal);
  document.body.append(backdrop);

  let open = false;
  let query = "";
  let selectedIndex = 0;
  let filteredCommands = [...normalizedCommands];
  let lastFocusedElement = null;

  function syncSelection() {
    if (filteredCommands.length === 0) {
      selectedIndex = -1;
      return;
    }

    selectedIndex = Math.max(0, Math.min(selectedIndex, filteredCommands.length - 1));
  }

  function render() {
    filteredCommands = normalizedCommands.filter((command) => matchesCommand(command, query));
    syncSelection();

    if (input.value !== query) {
      input.value = query;
    }

    if (filteredCommands.length === 0) {
      const empty = document.createElement("div");
      empty.className = "command-palette-empty";
      empty.textContent = "No commands match your query.";
      list.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    filteredCommands.forEach((command, index) => {
      fragment.append(createCommandButton(command, index, index === selectedIndex, handleCommandEvent));
    });
    list.replaceChildren(fragment);

    const selectedElement = list.querySelector(`[data-index="${selectedIndex}"]`);
    selectedElement?.scrollIntoView({ block: "nearest" });
  }

  function executeCommand(index = selectedIndex) {
    const command = filteredCommands[index];
    if (!command) {
      return;
    }

    closePalette();
    Promise.resolve()
      .then(() => command.run())
      .catch((error) => {
        console.error("[NextFrame] Command palette command failed:", error);
      });
  }

  function openPalette() {
    lastFocusedElement = document.activeElement;
    open = true;
    query = "";
    selectedIndex = 0;
    backdrop.hidden = false;
    render();
    input.focus();
    input.select();
  }

  function closePalette() {
    if (!open) {
      return;
    }

    open = false;
    query = "";
    selectedIndex = 0;
    backdrop.hidden = true;

    if (typeof lastFocusedElement?.focus === "function") {
      lastFocusedElement.focus();
    }
  }

  function togglePalette() {
    if (open) {
      closePalette();
    } else {
      openPalette();
    }
  }

  function moveSelection(delta) {
    if (filteredCommands.length === 0) {
      return;
    }

    selectedIndex = (selectedIndex + delta + filteredCommands.length) % filteredCommands.length;
    render();
  }

  function handleCommandEvent(event) {
    if (event.type === "select") {
      selectedIndex = event.index;
      render();
      return;
    }

    if (event.type === "run") {
      executeCommand(event.index);
    }
  }

  function onBackdropPointerDown(event) {
    if (event.target === backdrop) {
      closePalette();
    }
  }

  function onInput(event) {
    query = event.target.value;
    selectedIndex = 0;
    render();
  }

  function onWindowKeyDown(event) {
    if (isCommandPaletteShortcut(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      togglePalette();
      return;
    }

    if (!open) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePalette();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopImmediatePropagation();
      moveSelection(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopImmediatePropagation();
      moveSelection(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      executeCommand();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      event.stopImmediatePropagation();
      moveSelection(event.shiftKey ? -1 : 1);
    }
  }

  backdrop.addEventListener("mousedown", onBackdropPointerDown);
  input.addEventListener("input", onInput);
  window.addEventListener("keydown", onWindowKeyDown, true);

  const api = {
    store,
    bridge,
    get commands() {
      return [...normalizedCommands];
    },
    get filteredCommands() {
      return [...filteredCommands];
    },
    get isOpen() {
      return open;
    },
    get query() {
      return query;
    },
    open: openPalette,
    close: closePalette,
    toggle: togglePalette,
    destroy() {
      backdrop.removeEventListener("mousedown", onBackdropPointerDown);
      input.removeEventListener("input", onInput);
      window.removeEventListener("keydown", onWindowKeyDown, true);
      backdrop.remove();

      if (window.__commandPalette === api) {
        delete window.__commandPalette;
      }
    },
  };

  window.__commandPalette = api;
  return api;
}
