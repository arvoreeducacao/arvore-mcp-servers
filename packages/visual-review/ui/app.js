(function () {
  let state = {
    routes: [],
    activeRoute: null,
    mode: "side",
    baseUrl: "",
    token: "",
    figmaByRoute: {},
    figmaWidth: 1440,
    figmaHeight: 900,
    diffPercentage: null,
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  async function init() {
    const res = await fetch("/vr/api/session");
    const session = await res.json();
    state.routes = session.routes || [];
    state.baseUrl = session.baseUrl || "http://localhost:3000";
    renderRoutes();
    setupModeTabs();
    setupControls();
    window.addEventListener("resize", scalePanels);
  }

  function renderRoutes() {
    const list = $("#routesList");
    const empty = $("#emptyRoutes");

    if (state.routes.length === 0) {
      list.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }

    empty.classList.add("hidden");
    list.innerHTML = state.routes
      .map(
        (r) => `
      <button class="route-card text-left w-full px-3 py-2.5 rounded-lg border border-white/[0.06] bg-surface-2 transition-all relative group" data-route="${r.route}">
        <div class="text-xs font-medium text-zinc-200 truncate pr-5">${r.route}</div>
        <div class="text-[10px] text-zinc-600 mt-0.5">${r.files.length} file(s) changed</div>
        ${r.files[0] === "(manual)" ? `<span class="remove-route absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity" data-remove="${r.route}">&times;</span>` : ""}
      </button>
    `
      )
      .join("");

    list.querySelectorAll(".route-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".remove-route")) return;
        selectRoute(card.dataset.route);
      });
    });

    list.querySelectorAll(".remove-route").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const route = btn.dataset.remove;
        state.routes = state.routes.filter((r) => r.route !== route);
        if (state.activeRoute === route) state.activeRoute = null;
        renderRoutes();
        updateView();
      });
    });
  }

  function getFrameUrl(route) {
    if (route.startsWith("http")) return route;
    return `${state.baseUrl}${route}`;
  }

  function resizeFrames() {
    const fw = state.figmaWidth;
    const fh = state.figmaHeight;

    const sidePageContainer = $("#sidePageContainer");
    const sideFrame = $("#sidePageFrame");
    if (sideFrame && sidePageContainer) {
      const containerW = sidePageContainer.clientWidth;
      const zoomLevel = containerW / fw;
      sideFrame.style.width = fw + "px";
      sideFrame.style.height = fh + "px";
      sideFrame.style.zoom = zoomLevel;
    }

    const overlayWrapper = $("#overlayWrapper");
    const overlayFrame = $("#overlayPageFrame");
    if (overlayWrapper && overlayFrame) {
      const container = overlayWrapper.parentElement;
      const containerH = container.clientHeight - 16;
      const zoomLevel = Math.min(containerH / fh, container.clientWidth / fw, 1);
      overlayWrapper.style.width = (fw * zoomLevel) + "px";
      overlayWrapper.style.height = (fh * zoomLevel) + "px";
      overlayFrame.style.width = fw + "px";
      overlayFrame.style.height = fh + "px";
      overlayFrame.style.zoom = zoomLevel;
    }
  }

  function scalePanels() {
    resizeFrames();
  }

  async function selectRoute(route) {
    state.activeRoute = route;

    $$(".route-card").forEach((c) => c.classList.remove("active"));
    const activeCard = document.querySelector(`[data-route="${route}"]`);
    if (activeCard) activeCard.classList.add("active");

    if (!state.routeParams) state.routeParams = {};

    $("#emptyState").classList.add("hidden");

    if (!hasUnresolvedParams(route)) {
      loadIframes();
    }

    updateView();
  }

  function resolveRoute(route) {
    let resolved = route;
    const segments = route.match(/\[[^\]]+\]/g);
    if (segments && state.routeParams) {
      segments.forEach((seg) => {
        const key = seg.slice(1, -1);
        const value = state.routeParams[key];
        if (value) resolved = resolved.replace(seg, value);
      });
    }
    return resolved;
  }

  function hasUnresolvedParams(route) {
    const resolved = resolveRoute(route);
    return /\[[^\]]+\]/.test(resolved);
  }

  function loadIframes() {
    const resolved = resolveRoute(state.activeRoute);
    const url = getFrameUrl(resolved);
    const sideFrame = $("#sidePageFrame");
    if (sideFrame) sideFrame.src = url;
    const overlayFrame = $("#overlayPageFrame");
    if (overlayFrame) overlayFrame.src = url;
  }

  function renderRouteParams() {
    const container = $("#routeParamsSection");
    if (!container) return;
    const route = state.activeRoute;
    if (!route) { container.classList.add("hidden"); return; }

    const segments = route.match(/\[[^\]]+\]/g);
    if (!segments) { container.classList.add("hidden"); return; }

    container.classList.remove("hidden");

    container.innerHTML = `
      <div class="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Route Params</div>
      ${segments.map((seg) => {
        const key = seg.slice(1, -1);
        return `<div class="mb-2">
          <label class="text-[10px] text-zinc-500 uppercase tracking-wider">${key}</label>
          <input type="text" class="route-param-input w-full px-3 py-2 text-xs bg-surface-2 border border-white/[0.06] rounded-lg text-zinc-50 placeholder-zinc-600 outline-none focus:border-arvore/40 transition-colors mt-1" data-param="${key}" placeholder="Enter ${key}..." value="${state.routeParams[key] || ""}" />
        </div>`;
      }).join("")}
    `;

    container.querySelectorAll(".route-param-input").forEach((input) => {
      input.addEventListener("change", (e) => {
        state.routeParams[e.target.dataset.param] = e.target.value.trim();
        if (!hasUnresolvedParams(state.activeRoute)) {
          loadIframes();
          updateView();
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          state.routeParams[e.target.dataset.param] = e.target.value.trim();
          if (!hasUnresolvedParams(state.activeRoute)) {
            loadIframes();
            updateView();
          }
        }
      });
    });
  }

  async function loadFigma() {
    const url = $("#figmaUrlInput").value.trim() || $("#inlineFigmaInput")?.value.trim();
    if (!url) return toast("Paste a Figma URL first", true);
    if (!state.activeRoute) return toast("Select a route first", true);

    showLoading("Loading Figma frame...");

    try {
      const res = await fetch("/vr/api/figma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaUrl: url }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      state.figmaByRoute[state.activeRoute] = {
        image: data.image,
        width: data.width,
        height: data.height,
        url: url,
      };
      state.figmaWidth = data.width;
      state.figmaHeight = data.height;
      resizeFrames();
      toast(`Figma loaded: ${data.name} (${data.width}x${data.height})`);

      updateView();
      $("#generatePromptBtn").disabled = false;
    } catch (err) {
      toast("Error: " + err.message, true);
    }

    hideLoading();
  }

  function getActiveFigma() {
    return state.figmaByRoute[state.activeRoute] || null;
  }

  function updateView() {
    $("#emptyState").classList.add("hidden");
    $("#sideBySideView").classList.add("hidden");
    $("#overlayView").classList.add("hidden");
    $("#controlsSection").classList.add("hidden");
    $("#paramsOverlay").classList.add("hidden");

    if (!state.activeRoute) {
      $("#emptyState").classList.remove("hidden");
      renderRouteParams();
      return;
    }

    renderRouteParams();

    if (hasUnresolvedParams(state.activeRoute)) {
      showParamsOverlay();
      return;
    }

    const figma = getActiveFigma();
    if (figma) {
      state.figmaWidth = figma.width;
      state.figmaHeight = figma.height;
    }

    if (state.mode === "side") {
      $("#sideBySideView").classList.remove("hidden");
      const figmaImg = $("#sideFigmaImg");
      const figmaEmpty = $("#sideFigmaEmpty");
      if (figma) {
        figmaImg.src = figma.image;
        figmaImg.classList.remove("hidden");
        if (figmaEmpty) figmaEmpty.classList.add("hidden");
      } else {
        figmaImg.classList.add("hidden");
        if (figmaEmpty) figmaEmpty.classList.remove("hidden");
      }
    } else if (state.mode === "overlay") {
      $("#overlayView").classList.remove("hidden");
      if (figma) {
        $("#overlayFigmaImg").src = figma.image;
        $("#overlayFigmaImg").style.display = "block";
        $("#controlsSection").classList.remove("hidden");
      }
    }

    setTimeout(scalePanels, 50);
  }

  function showParamsOverlay() {
    const overlay = $("#paramsOverlay");
    overlay.classList.remove("hidden");
    const route = state.activeRoute;
    const segments = route.match(/\[[^\]]+\]/g) || [];

    overlay.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full gap-4">
        <svg class="text-zinc-600" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h3a2 2 0 0 0 2-2V4"/><path d="M20 7h-3a2 2 0 0 1-2-2V4"/><path d="M4 17h3a2 2 0 0 1 2 2v1"/><path d="M20 17h-3a2 2 0 0 0-2 2v1"/></svg>
        <p class="text-sm text-zinc-400">Fill in the route parameters to load the page</p>
        <div class="w-64 flex flex-col gap-2">
          ${segments.map((seg) => {
            const key = seg.slice(1, -1);
            return `<div>
              <label class="text-[10px] text-zinc-500 uppercase tracking-wider">${key}</label>
              <input type="text" class="params-overlay-input w-full px-3 py-2.5 text-sm bg-surface-2 border border-white/[0.06] rounded-lg text-zinc-50 placeholder-zinc-600 outline-none focus:border-arvore/40 transition-colors mt-1" data-param="${key}" placeholder="Enter ${key}..." value="${(state.routeParams && state.routeParams[key]) || ""}" />
            </div>`;
          }).join("")}
          <button id="paramsGoBtn" class="w-full mt-2 py-2.5 rounded-lg text-xs font-medium bg-arvore/[0.12] text-arvore border border-arvore/20 hover:bg-arvore/20 transition-all">Load Page</button>
        </div>
      </div>
    `;

    overlay.querySelectorAll(".params-overlay-input").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") $("#paramsGoBtn").click();
      });
    });

    $("#paramsGoBtn").addEventListener("click", () => {
      overlay.querySelectorAll(".params-overlay-input").forEach((input) => {
        state.routeParams[input.dataset.param] = input.value.trim();
      });
      if (!hasUnresolvedParams(state.activeRoute)) {
        loadIframes();
        updateView();
      } else {
        toast("Fill all parameters", true);
      }
    });
  }

  function setupModeTabs() {
    $$(".mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".mode-tab").forEach((t) => {
          t.classList.remove("text-zinc-50", "bg-surface-3", "shadow-sm");
          t.classList.add("text-zinc-500");
        });
        tab.classList.add("text-zinc-50", "bg-surface-3", "shadow-sm");
        tab.classList.remove("text-zinc-500");

        state.mode = tab.dataset.mode;
        updateView();

        if (state.activeRoute) {
          const url = getFrameUrl(state.activeRoute);
          if (state.mode === "side") {
            const f = $("#sidePageFrame");
            if (f) f.src = url;
          } else if (state.mode === "overlay") {
            const f = $("#overlayPageFrame");
            if (f) f.src = url;
          }
        }
      });
    });
  }

  function setupControls() {
    $("#loadFigmaBtn").addEventListener("click", loadFigma);

    $("#inlineFigmaBtn").addEventListener("click", () => {
      $("#figmaUrlInput").value = $("#inlineFigmaInput").value.trim();
      loadFigma();
    });

    $("#inlineFigmaInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { $("#figmaUrlInput").value = e.target.value.trim(); loadFigma(); }
    });

    let tokenDebounce = null;
    $("#tokenInput").addEventListener("input", (e) => {
      clearTimeout(tokenDebounce);
      tokenDebounce = setTimeout(async () => {
        state.token = e.target.value.trim();
        document.cookie = `access_token=; path=/; max-age=0`;
        document.cookie = `access_token=${state.token}; path=/; max-age=86400`;
        await fetch("/vr/api/set-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: state.token }),
        });
        if (state.activeRoute) {
          const sideFrame = $("#sidePageFrame");
          if (sideFrame) sideFrame.src = "about:blank";
          const overlayFrame = $("#overlayPageFrame");
          if (overlayFrame) overlayFrame.src = "about:blank";
          setTimeout(() => selectRoute(state.activeRoute), 200);
        }
      }, 500);
    });

    $("#addRouteBtn").addEventListener("click", () => {
      const route = $("#customRouteInput").value.trim();
      if (!route) return;
      if (!state.routes.find((r) => r.route === route)) {
        state.routes.push({ route, url: state.baseUrl + route, files: ["(manual)"] });
        renderRoutes();
      }
      selectRoute(route);
      $("#customRouteInput").value = "";
    });

    $("#customRouteInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("#addRouteBtn").click();
    });

    $("#opSlider").addEventListener("input", (e) => {
      const val = e.target.value;
      $("#opVal").textContent = val + "%";
      e.target.style.setProperty("--fill", val + "%");
      const figmaOverlay = $("#overlayFigmaImg");
      if (figmaOverlay) figmaOverlay.style.opacity = val / 100;
    });

    $("#generatePromptBtn").addEventListener("click", async () => {
      const figma = getActiveFigma();
      const res = await fetch("/vr/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: resolveRoute(state.activeRoute),
          figmaUrl: figma?.url || "",
          figmaWidth: state.figmaWidth,
          figmaHeight: state.figmaHeight,
        }),
      });
      const data = await res.json();
      await navigator.clipboard.writeText(data.prompt);
      toast("Fix prompt copied to clipboard!");
    });

    $("#figmaUrlInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadFigma();
    });
  }

  function showLoading(text) {
    $("#loadingText").textContent = text;
    $("#loadingOverlay").classList.remove("hidden");
    $("#statusBadge").textContent = text;
  }

  function hideLoading() {
    $("#loadingOverlay").classList.add("hidden");
    $("#statusBadge").textContent = "Ready";
  }

  function toast(msg, isError) {
    const el = $("#toast");
    el.textContent = msg;
    el.style.background = isError ? "rgba(239,68,68,0.9)" : "rgba(69,208,193,0.9)";
    el.style.opacity = "1";
    el.style.transform = "translate(-50%, 0)";
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translate(-50%, 8px)";
    }, 3000);
  }

  init();
})();
