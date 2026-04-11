import { createAssetCard, createSceneCard } from "./card.js";
import { createLibraryTabs } from "./tabs.js";

const LIBRARY_STATE = Symbol("nextframe.library.mount");

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesQuery(query, fields) {
  if (!query) {
    return true;
  }

  return fields.some((field) => String(field || "").toLowerCase().includes(query));
}

function filterAssets(assets, kind, query) {
  return assets.filter((asset) => {
    const kindMatches = kind === "audio"
      ? asset.kind === "audio"
      : asset.kind === "video" || asset.kind === "image";

    return kindMatches && matchesQuery(query, [asset.name, asset.label, asset.id, asset.path, asset.kind]);
  });
}

function getFavoriteSceneIds(store) {
  if (typeof store?.state !== "object" || store.state == null) {
    return [];
  }

  return Array.isArray(store.state.favorites)
    ? [...new Set(store.state.favorites.map((sceneId) => String(sceneId)).filter(Boolean))]
    : [];
}

function partitionScenes(scenes, favoriteSceneIds) {
  const favoriteIds = new Set(favoriteSceneIds);
  const favorites = [];
  const rest = [];

  scenes.forEach((scene) => {
    if (favoriteIds.has(String(scene?.id ?? ""))) {
      favorites.push(scene);
      return;
    }

    rest.push(scene);
  });

  return { favorites, rest };
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state library-empty-state";
  empty.innerHTML = `
    <div class="empty-glyph" aria-hidden="true"></div>
    <strong>${message}</strong>
  `;
  return empty;
}

function createSectionHeader(title) {
  const header = document.createElement("div");
  header.textContent = title;
  header.style.fontSize = "11px";
  header.style.fontWeight = "700";
  header.style.letterSpacing = "0.08em";
  header.style.textTransform = "uppercase";
  header.style.color = "rgba(203, 213, 225, 0.72)";
  return header;
}

function createSection(title, items, renderItem) {
  const section = document.createElement("section");
  section.style.display = "grid";
  section.style.gap = "10px";

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";
  body.style.gridTemplateColumns = "1fr";

  items.forEach((item) => {
    body.appendChild(renderItem(item));
  });

  section.append(createSectionHeader(title), body);
  return section;
}

export function mountLibrary(container, { store, scenes = [] } = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new TypeError("mountLibrary(container, options) requires a container element");
  }

  if (container[LIBRARY_STATE]) {
    container[LIBRARY_STATE].destroy();
  }

  let activeTab = "scenes";

  const header = document.createElement("div");
  header.className = "panel-header";
  header.innerHTML = `
    <div class="panel-title">
      <strong>Asset Library</strong>
      <span>Scenes, media, and audio sources</span>
    </div>
    <div class="chip-row">
      <div class="mini-chip" data-role="count">0 Items</div>
    </div>
  `;

  const controls = document.createElement("div");
  controls.className = "library-controls";

  const search = document.createElement("label");
  search.className = "search-field";

  const dot = document.createElement("span");
  dot.className = "search-dot";
  dot.setAttribute("aria-hidden", "true");

  const input = document.createElement("input");
  input.className = "search-input";
  input.type = "search";
  input.placeholder = "Search scenes or assets";
  input.autocomplete = "off";
  input.value = store?.state?.searchQuery || "";

  search.append(dot, input);

  const tabsHost = document.createElement("div");
  tabsHost.className = "filter-row";

  const grid = document.createElement("div");
  grid.className = "asset-grid";

  controls.append(search, tabsHost);
  container.replaceChildren(header, controls, grid);

  const count = header.querySelector('[data-role="count"]');
  let lastAssetsRef = store?.state?.assets;
  let lastSearchQuery = store?.state?.searchQuery;
  let lastFavoritesKey = getFavoriteSceneIds(store).join("\u0000");

  function render() {
    const query = normalizeQuery(store?.state?.searchQuery);
    const assets = Array.isArray(store?.state?.assets) ? store.state.assets : [];
    let items = [];
    let isImportEmpty = false;
    let favoriteScenes = [];
    let otherScenes = [];

    tabsHost.replaceChildren(createLibraryTabs(activeTab, (nextTab) => {
      activeTab = nextTab;
      render();
    }));

    if (activeTab === "scenes") {
      const matchingScenes = scenes.filter((scene) => matchesQuery(query, [
        scene.name,
        scene.id,
        scene.category,
        scene.duration_hint,
      ]));
      const partitionedScenes = partitionScenes(matchingScenes, getFavoriteSceneIds(store));
      favoriteScenes = partitionedScenes.favorites;
      otherScenes = partitionedScenes.rest;
      items = [...favoriteScenes, ...otherScenes];
    } else if (activeTab === "media") {
      items = filterAssets(assets, "media", query);
      isImportEmpty = assets.filter((asset) => asset.kind === "video" || asset.kind === "image").length === 0;
    } else {
      items = filterAssets(assets, "audio", query);
      isImportEmpty = assets.filter((asset) => asset.kind === "audio").length === 0;
    }

    count.textContent = `${items.length} Item${items.length === 1 ? "" : "s"}`;
    grid.replaceChildren();

    if (items.length === 0) {
      grid.appendChild(createEmptyState(
        isImportEmpty
          ? "No media yet — File → Import"
          : "No matching items",
      ));
      return;
    }

    if (activeTab === "scenes") {
      if (favoriteScenes.length > 0) {
        grid.appendChild(createSection("Favorites", favoriteScenes, (scene) => createSceneCard(scene, { store })));
      }

      if (otherScenes.length > 0 || favoriteScenes.length === 0) {
        grid.appendChild(createSection("All Scenes", otherScenes.length > 0 ? otherScenes : items, (scene) => (
          createSceneCard(scene, { store })
        )));
      }

      return;
    }

    items.forEach((item) => {
      grid.appendChild(createAssetCard(item));
    });
  }

  function onSearchInput(event) {
    const currentState = store?.state;
    store?.mutate((state) => {
      state.searchQuery = event.target.value;
      state.timeline = currentState?.timeline;
      state.project = currentState?.project;
      state.assets = currentState?.assets || [];
    });
  }

  input.addEventListener("input", onSearchInput);

  const unsubscribe = typeof store?.subscribe === "function"
    ? store.subscribe((nextState) => {
      const nextFavoritesKey = getFavoriteSceneIds({ state: nextState }).join("\u0000");
      if (
        nextState.assets !== lastAssetsRef
        || nextState.searchQuery !== lastSearchQuery
        || nextFavoritesKey !== lastFavoritesKey
      ) {
        if (input.value !== nextState.searchQuery) {
          input.value = nextState.searchQuery;
        }
        render();
        lastAssetsRef = nextState.assets;
        lastSearchQuery = nextState.searchQuery;
        lastFavoritesKey = nextFavoritesKey;
      }
    })
    : () => {};

  render();

  const api = {
    destroy() {
      unsubscribe();
      input.removeEventListener("input", onSearchInput);
      delete container[LIBRARY_STATE];
      container.replaceChildren();
    },
  };

  container[LIBRARY_STATE] = api;
  return api;
}
