(function () {
  const data = window.GUITAR_GRAPH_DATA;

  if (!data) {
    throw new Error("Missing graph data");
  }

  const canvas = document.querySelector("#mapCanvas");
  const ctx = canvas.getContext("2d");
  const appShell = document.querySelector(".app-shell");
  const homeButton = document.querySelector("#homeButton");
  const starterPanel = document.querySelector("#starterPanel");
  const starterCards = document.querySelector("#starterCards");
  const routeList = document.querySelector("#routeList");
  const detailPanel = document.querySelector("#detailPanel");
  const detailType = document.querySelector("#detailType");
  const detailTitle = document.querySelector("#detailTitle");
  const detailSummary = document.querySelector("#detailSummary");
  const detailMeta = document.querySelector("#detailMeta");
  const routeControls = document.querySelector("#routeControls");
  const routeTitle = document.querySelector("#routeTitle");
  const routeStep = document.querySelector("#routeStep");
  const routePrev = document.querySelector("#routePrev");
  const routeNext = document.querySelector("#routeNext");
  const connectionList = document.querySelector("#connectionList");
  const sourceList = document.querySelector("#sourceList");
  const sourcesSection = document.querySelector("#sourcesSection");
  const closePanel = document.querySelector("#closePanel");
  const searchInput = document.querySelector("#searchInput");
  const searchResults = document.querySelector("#searchResults");
  const randomButton = document.querySelector("#randomButton");
  const nodeCount = document.querySelector("#nodeCount");
  const edgeCount = document.querySelector("#edgeCount");
  const modeButtons = Array.from(document.querySelectorAll("[data-mode-choice]"));

  const nodes = data.nodes;
  const edges = data.edges;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const TYPE_COLORS = {
    artist: "#d6b85d",
    band: "#bd7049",
    genre: "#5caaa2",
    guitar: "#7fa6d9",
    maker: "#a78b68",
    release: "#b35f76",
    technique: "#8cae72",
  };

  const TYPE_LABELS = {
    artist: "Artist",
    band: "Band",
    genre: "Genre",
    guitar: "Guitar",
    maker: "Maker",
    release: "Release",
    technique: "Technique",
  };

  const MODE_TYPES = {
    artists: new Set(["artist", "band", "genre", "release", "technique", "guitar"]),
    guitars: new Set(["guitar", "maker", "artist", "genre", "technique", "band"]),
  };

  const START_TYPES = {
    artists: new Set(["artist", "band", "genre"]),
    guitars: new Set(["guitar", "maker", "artist"]),
  };

  const STRUCTURED_POSITIONS = {
    "blues": [-1080, 80],
    "electric-blues": [-860, 80],
    "rock-and-roll": [-650, -35],
    "rock": [-340, 10],
    "psychedelic-rock": [-250, -390],
    "progressive-rock": [160, -380],
    "hard-rock": [330, 20],
    "heavy-metal": [740, 200],
    "punk": [330, 560],
    "grunge": [640, 790],
    "folk": [-760, 760],
    "country": [-1030, 660],
    "norwegian-vise": [-360, 920],
    "funk": [40, 360],
    "jazz-fusion": [-40, 540],
    "bb-king": [-980, -70],
    "lead-belly": [-1230, 260],
    "chuck-berry": [-770, -210],
    "elvis-presley": [-560, -220],
    "jimi-hendrix": [-360, -560],
    "stevie-ray-vaughan": [-820, -330],
    "eric-clapton": [-320, -220],
    "david-gilmour": [250, -650],
    "mark-knopfler": [-260, 250],
    "eddie-van-halen": [560, -300],
    "frank-zappa": [60, 690],
    "johnny-marr": [350, 420],
    "randy-rhoads": [930, -30],
    "tony-iommi": [830, 330],
    "jimmy-page": [360, -150],
    "george-harrison": [-120, -720],
    "bob-dylan": [-760, 950],
    "johnny-cash": [-1160, 870],
    "willie-nelson": [-930, 1000],
    "chet-atkins": [-1160, 500],
    "john-mayer": [-640, -470],
    "oystein-sunde": [-160, 1040],
    "james-hetfield": [930, 520],
    "prince": [180, 290],
    "the-beatles": [-60, -560],
    "pink-floyd": [390, -530],
    "led-zeppelin": [500, -130],
    "black-sabbath": [950, 170],
    "van-halen": [720, -230],
    "dire-straits": [-110, 190],
    "the-smiths": [500, 500],
    "ozzy-osbourne": [1080, -60],
    "metallica": [1080, 520],
    "gitarkameratene": [90, 920],
    "cream": [-130, -180],
    "the-yardbirds": [-500, -170],
    "fender": [1100, -560],
    "gibson": [1460, -120],
    "martin": [1240, 730],
    "rickenbacker": [860, -780],
    "gretsch": [820, 370],
    "esp": [1510, 560],
    "fender-stratocaster": [1080, -370],
    "fender-telecaster": [990, 110],
    "fender-jaguar": [1160, 830],
    "fender-jazzmaster": [1150, 650],
    "gibson-les-paul": [1320, -190],
    "gibson-sg": [1400, 230],
    "gibson-es-355-lucille": [1320, -430],
    "gibson-flying-v": [1560, 100],
    "martin-d28": [1060, 880],
    "gibson-j45": [1360, 900],
    "trigger": [930, 1060],
    "rickenbacker-360-12": [710, -720],
    "gretsch-6120": [700, 500],
    "frankenstrat": [940, -330],
    "ibanez-jem": [1600, -430],
    "esp-explorer-style": [1370, 620],
    "hohner-mad-cat": [900, 270],
    "banjo": [340, 1040],
    "national-resonator": [760, 1040],
    "are-you-experienced": [-430, -760],
    "texas-flood": [-980, -360],
    "live-at-the-regal": [-1210, -170],
    "dark-side-of-the-moon": [520, -720],
    "brothers-in-arms": [-120, 380],
    "van-halen-i": [760, -410],
    "sgt-pepper": [100, -800],
    "led-zeppelin-iv": [650, -30],
    "paranoid": [1090, 70],
    "master-of-reality": [1090, 260],
    "highway-61-revisited": [-580, 1080],
    "at-folsom-prison": [-1300, 1010],
    "kjekt-a-ha": [-70, 1200],
    "fingerpicking": [-540, 610],
    "slide-guitar": [-1240, 20],
    "whammy-bar": [650, -470],
    "distortion": [600, 150],
    "twelve-string-sound": [610, -820],
  };

  const MAP_ZONES = [
    { id: "roots", mode: "artists", label: "ROOTS / BLUES", x: -1320, y: -260, w: 660, h: 620, color: "#5caaa2" },
    { id: "rock", mode: "artists", label: "ROCK CIRCUIT", x: -610, y: -330, w: 700, h: 470, color: "#b79a47" },
    { id: "psychedelic", mode: "artists", label: "PSYCHEDELIA / PROG", x: -520, y: -900, w: 1120, h: 500, color: "#6f91b8" },
    { id: "heavy", mode: "artists", label: "HARD ROCK / METAL", x: 270, y: -470, w: 930, h: 900, color: "#b0653d" },
    { id: "folk", mode: "artists", label: "FOLK / COUNTRY / VISE", x: -1340, y: 430, w: 1740, h: 840, color: "#83a66b" },
    { id: "workshop", mode: "all", label: "GUITAR WORKSHOP", x: 630, y: -900, w: 1100, h: 2200, color: "#7fa6d9" },
  ];

  const PRIMARY_LINKS = [
    ["blues", "electric-blues"],
    ["electric-blues", "rock-and-roll"],
    ["rock-and-roll", "rock"],
    ["rock", "psychedelic-rock"],
    ["rock", "progressive-rock"],
    ["rock", "hard-rock"],
    ["hard-rock", "heavy-metal"],
    ["rock", "punk"],
    ["punk", "grunge"],
    ["folk", "country"],
    ["folk", "norwegian-vise"],
    ["bb-king", "electric-blues"],
    ["chuck-berry", "rock-and-roll"],
    ["jimi-hendrix", "psychedelic-rock"],
    ["pink-floyd", "progressive-rock"],
    ["led-zeppelin", "hard-rock"],
    ["black-sabbath", "heavy-metal"],
    ["metallica", "heavy-metal"],
    ["oystein-sunde", "norwegian-vise"],
    ["fender", "fender-stratocaster"],
    ["fender", "fender-telecaster"],
    ["gibson", "gibson-les-paul"],
    ["gibson", "gibson-sg"],
    ["martin", "martin-d28"],
  ];

  const ROUTES = [
    {
      id: "blues-to-rock",
      name: "Blues to rock",
      color: "#5caaa2",
      nodes: ["blues", "electric-blues", "bb-king", "chuck-berry", "rock-and-roll", "rock", "jimi-hendrix", "led-zeppelin", "heavy-metal"],
    },
    {
      id: "strat-trail",
      name: "Stratocaster trail",
      color: "#7fa6d9",
      nodes: ["fender", "fender-stratocaster", "jimi-hendrix", "stevie-ray-vaughan", "david-gilmour", "mark-knopfler", "john-mayer"],
    },
    {
      id: "norwegian-corner",
      name: "Norwegian acoustic corner",
      color: "#83a66b",
      nodes: ["folk", "norwegian-vise", "oystein-sunde", "gitarkameratene", "banjo", "kjekt-a-ha"],
    },
    {
      id: "heavy-route",
      name: "Heavy route",
      color: "#b0653d",
      nodes: ["hard-rock", "led-zeppelin", "black-sabbath", "tony-iommi", "heavy-metal", "metallica", "james-hetfield", "esp-explorer-style"],
    },
    {
      id: "fingerstyle-country",
      name: "Fingerpicking country",
      color: "#d6b85d",
      nodes: ["country", "chet-atkins", "gretsch-6120", "fingerpicking", "willie-nelson", "trigger", "bob-dylan", "martin-d28"],
    },
  ];

  const primaryEdgeKeys = new Set(PRIMARY_LINKS.map(([from, to]) => edgeKey(from, to)));
  const routeById = new Map(ROUTES.map((route) => [route.id, route]));

  let mode = "artists";
  let width = 0;
  let height = 0;
  let dpr = 1;
  let selectedId = null;
  let hoveredId = null;
  let activeRoute = null;
  let activeRouteIndex = 0;
  let visibleNodes = [];
  let visibleEdges = [];
  let camera = { x: 0, y: 0, zoom: 0.35 };
  let cameraAnimation = null;
  let pointer = null;
  let hasDragged = false;
  let drawScheduled = false;

  applyStructuredLayout();

  function edgeKey(from, to) {
    return from < to ? `${from}|${to}` : `${to}|${from}`;
  }

  function applyStructuredLayout() {
    nodes.forEach((node) => {
      const position = STRUCTURED_POSITIONS[node.id];
      if (!position) return;
      node.x = position[0];
      node.y = position[1];
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function visibleInMode(node) {
    return MODE_TYPES[mode].has(node.type);
  }

  function updateVisibleGraph() {
    visibleNodes = nodes.filter(visibleInMode);
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    visibleEdges = edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
    nodeCount.textContent = `${visibleNodes.length} nodes`;
    edgeCount.textContent = `${visibleEdges.length} links`;
  }

  function nodeColor(node) {
    return TYPE_COLORS[node.type] || "#cabbb1";
  }

  function typeLabel(node) {
    return TYPE_LABELS[node.type] || node.type;
  }

  function worldToScreen(x, y) {
    return {
      x: (x - camera.x) * camera.zoom + width / 2,
      y: (y - camera.y) * camera.zoom + height / 2,
    };
  }

  function screenToWorld(x, y) {
    return {
      x: (x - width / 2) / camera.zoom + camera.x,
      y: (y - height / 2) / camera.zoom + camera.y,
    };
  }

  function scheduleDraw() {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(draw);
  }

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitVisibleGraph(false);
    scheduleDraw();
  }

  function mapBounds() {
    const zoneBounds = MAP_ZONES
      .filter((zone) => zone.mode === "all" || zone.mode === mode)
      .reduce(
        (box, zone) => ({
          minX: Math.min(box.minX, zone.x),
          minY: Math.min(box.minY, zone.y),
          maxX: Math.max(box.maxX, zone.x + zone.w),
          maxY: Math.max(box.maxY, zone.y + zone.h),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );

    return visibleNodes.reduce(
      (box, node) => ({
        minX: Math.min(box.minX, node.x),
        minY: Math.min(box.minY, node.y),
        maxX: Math.max(box.maxX, node.x),
        maxY: Math.max(box.maxY, node.y),
      }),
      zoneBounds,
    );
  }

  function fitVisibleGraph(animated = true) {
    if (!visibleNodes.length || !width || !height) return;

    const bounds = mapBounds();
    const paddingX = width < 800 ? 260 : 520;
    const paddingY = height < 700 ? 220 : 420;
    const zoomX = width / Math.max(1, bounds.maxX - bounds.minX + paddingX);
    const zoomY = height / Math.max(1, bounds.maxY - bounds.minY + paddingY);
    const zoom = clamp(Math.min(zoomX, zoomY), 0.18, 0.54);
    const desiredCenterX = starterPanel.hidden ? width / 2 : width * 0.62;
    const target = {
      x: (bounds.minX + bounds.maxX) / 2 - (desiredCenterX - width / 2) / zoom,
      y: (bounds.minY + bounds.maxY) / 2,
      zoom,
    };

    if (animated) {
      animateCamera(target);
    } else {
      camera = target;
    }
  }

  function animateCamera(target) {
    cameraAnimation = {
      start: { ...camera },
      target,
      startedAt: performance.now(),
      duration: 620,
    };
    scheduleDraw();
  }

  function focusNode(id, options = {}) {
    const node = nodeById.get(id);
    if (!node) return;

    selectedId = id;
    hoveredId = id;
    detailPanel.hidden = false;

    if (options.hideStarter !== false) {
      starterPanel.hidden = true;
    }

    if (options.routeId) {
      activeRoute = routeById.get(options.routeId) || null;
      activeRouteIndex = options.routeIndex || 0;
    } else if (activeRoute && activeRoute.nodes.includes(id)) {
      activeRouteIndex = activeRoute.nodes.indexOf(id);
    } else {
      activeRoute = null;
      activeRouteIndex = 0;
    }

    const targetZoom = clamp(options.zoom || (width < 800 ? 0.9 : 0.78), 0.38, 1.1);
    const desiredX = width > 980 ? width * 0.42 : width * 0.5;
    const desiredY = width > 900 ? height * 0.48 : height * 0.42;

    animateCamera({
      x: node.x - (desiredX - width / 2) / targetZoom,
      y: node.y - (desiredY - height / 2) / targetZoom,
      zoom: targetZoom,
    });

    renderDetails(node);
    renderRouteList();
    searchInput.value = "";
    hideSearchResults();
    scheduleDraw();
  }

  function connectedEdges(id) {
    return edges
      .filter((edge) => edge.from === id || edge.to === id)
      .map((edge) => ({
        edge,
        other: nodeById.get(edge.from === id ? edge.to : edge.from),
      }))
      .filter((entry) => entry.other)
      .sort((a, b) => (b.edge.strength || 0.5) - (a.edge.strength || 0.5));
  }

  function renderDetails(node) {
    detailType.textContent = typeLabel(node);
    detailTitle.textContent = node.label;
    detailSummary.textContent = node.summary || "";

    detailMeta.replaceChildren();
    (node.meta || []).forEach((item) => {
      const pill = document.createElement("span");
      pill.className = "meta-pill";
      pill.textContent = item;
      detailMeta.append(pill);
    });

    renderRouteControls();
    renderConnections(node);
    renderSources(node);
  }

  function renderConnections(node) {
    connectionList.replaceChildren();
    connectedEdges(node.id).slice(0, 10).forEach(({ edge, other }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "connection-chip";
      chip.addEventListener("click", () => focusNode(other.id));

      const dot = document.createElement("span");
      dot.className = "chip-dot";
      dot.style.background = nodeColor(other);

      const copy = document.createElement("span");
      copy.className = "chip-copy";

      const title = document.createElement("span");
      title.className = "chip-title";
      title.textContent = other.label;

      const label = document.createElement("span");
      label.className = "chip-label";
      label.textContent = edge.label;

      copy.append(title, label);
      chip.append(dot, copy);
      connectionList.append(chip);
    });
  }

  function renderSources(node) {
    sourceList.replaceChildren();
    const sources = node.sources || [];
    sourcesSection.hidden = !sources.length;
    sources.forEach((source) => {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source.label;
      sourceList.append(link);
    });
  }

  function renderRouteControls() {
    if (!activeRoute) {
      routeControls.hidden = true;
      return;
    }

    routeControls.hidden = false;
    routeTitle.textContent = activeRoute.name;
    routeStep.textContent = `${activeRouteIndex + 1} / ${activeRoute.nodes.length}`;
    routePrev.disabled = activeRouteIndex === 0;
    routeNext.disabled = activeRouteIndex === activeRoute.nodes.length - 1;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function renderStarterCards() {
    starterCards.replaceChildren();

    const pool = visibleNodes.filter(
      (node) => node.starter && START_TYPES[mode].has(node.type),
    );

    shuffle(pool)
      .slice(0, 6)
      .forEach((node) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "starter-card";
        card.addEventListener("click", () => focusNode(node.id));

        const rail = document.createElement("span");
        rail.className = "starter-rail";
        rail.style.background = nodeColor(node);

        const content = document.createElement("span");
        content.className = "starter-content";

        const title = document.createElement("span");
        title.className = "starter-title";
        title.textContent = node.label;

        const kind = document.createElement("span");
        kind.className = "starter-type";
        kind.textContent = typeLabel(node);

        content.append(title, kind);
        card.append(rail, content);
        starterCards.append(card);
      });
  }

  function renderRouteList() {
    routeList.replaceChildren();

    ROUTES.forEach((route) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "route-card";
      card.classList.toggle("active", activeRoute && activeRoute.id === route.id);
      card.addEventListener("click", () => startRoute(route.id));

      const rail = document.createElement("span");
      rail.className = "route-rail";
      rail.style.background = route.color;

      const name = document.createElement("span");
      name.className = "route-name";
      name.textContent = route.name;

      const count = document.createElement("span");
      count.className = "route-count";
      count.textContent = `${route.nodes.length}`;

      card.append(rail, name, count);
      routeList.append(card);
    });
  }

  function startRoute(routeId) {
    const route = routeById.get(routeId);
    if (!route) return;
    activeRoute = route;
    activeRouteIndex = 0;
    focusNode(route.nodes[0], { routeId, routeIndex: 0 });
  }

  function stepRoute(delta) {
    if (!activeRoute) return;
    activeRouteIndex = clamp(activeRouteIndex + delta, 0, activeRoute.nodes.length - 1);
    focusNode(activeRoute.nodes[activeRouteIndex], {
      routeId: activeRoute.id,
      routeIndex: activeRouteIndex,
    });
  }

  function resetMap() {
    selectedId = null;
    hoveredId = null;
    activeRoute = null;
    activeRouteIndex = 0;
    detailPanel.hidden = true;
    starterPanel.hidden = false;
    starterPanel.scrollTop = 0;
    renderRouteList();
    fitVisibleGraph(true);
    hideSearchResults();
    scheduleDraw();
  }

  function setMode(nextMode) {
    if (!MODE_TYPES[nextMode]) return;

    mode = nextMode;
    selectedId = null;
    hoveredId = null;
    activeRoute = null;
    activeRouteIndex = 0;
    appShell.dataset.mode = mode;
    detailPanel.hidden = true;
    starterPanel.hidden = false;
    starterPanel.scrollTop = 0;

    modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.modeChoice === mode);
    });

    updateVisibleGraph();
    renderStarterCards();
    renderRouteList();
    fitVisibleGraph(true);
    hideSearchResults();
    scheduleDraw();
  }

  function draw() {
    drawScheduled = false;

    if (cameraAnimation) {
      const progress = clamp(
        (performance.now() - cameraAnimation.startedAt) / cameraAnimation.duration,
        0,
        1,
      );
      const eased = easeOutCubic(progress);
      camera = {
        x: mix(cameraAnimation.start.x, cameraAnimation.target.x, eased),
        y: mix(cameraAnimation.start.y, cameraAnimation.target.y, eased),
        zoom: mix(cameraAnimation.start.zoom, cameraAnimation.target.zoom, eased),
      };
      if (progress >= 1) {
        cameraAnimation = null;
      }
    }

    ctx.clearRect(0, 0, width, height);
    drawZones();
    drawGrid();
    drawEdges();
    drawNodes();

    if (cameraAnimation) {
      scheduleDraw();
    }
  }

  function drawZones() {
    ctx.save();
    MAP_ZONES
      .filter((zone) => zone.mode === "all" || zone.mode === mode)
      .forEach((zone) => {
        const topLeft = worldToScreen(zone.x, zone.y);
        const bottomRight = worldToScreen(zone.x + zone.w, zone.y + zone.h);
        const zoneWidth = bottomRight.x - topLeft.x;
        const zoneHeight = bottomRight.y - topLeft.y;

        if (bottomRight.x < -80 || topLeft.x > width + 80 || bottomRight.y < -80 || topLeft.y > height + 80) {
          return;
        }

        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(13, 13, 11, 0.1)";
        ctx.strokeStyle = hexToRgba(zone.color, 0.16);
        ctx.lineWidth = 1;
        ctx.fillRect(topLeft.x, topLeft.y, zoneWidth, zoneHeight);
        ctx.strokeRect(topLeft.x, topLeft.y, zoneWidth, zoneHeight);

        drawCorner(topLeft.x, topLeft.y, 28, zone.color);
        drawCorner(bottomRight.x, topLeft.y, -28, zone.color);
        drawCorner(topLeft.x, bottomRight.y, 28, zone.color, true);
        drawCorner(bottomRight.x, bottomRight.y, -28, zone.color, true);

        if (camera.zoom > 0.22) {
          ctx.font = `800 ${clamp(18 * camera.zoom, 11, 18)}px Segoe UI, system-ui, sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillStyle = hexToRgba(zone.color, 0.48);
          ctx.fillText(zone.label, topLeft.x + 14, topLeft.y + 12);
        }
      });
    ctx.restore();
  }

  function drawCorner(x, y, length, color, upward = false) {
    const yDirection = upward ? -1 : 1;
    ctx.save();
    ctx.strokeStyle = hexToRgba(color, 0.32);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + yDirection * 22);
    ctx.lineTo(x, y);
    ctx.lineTo(x + length, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawGrid() {
    const worldTopLeft = screenToWorld(0, 0);
    const worldBottomRight = screenToWorld(width, height);
    const step = 160;
    const startX = Math.floor(worldTopLeft.x / step) * step;
    const endX = Math.ceil(worldBottomRight.x / step) * step;
    const startY = Math.floor(worldTopLeft.y / step) * step;
    const endY = Math.ceil(worldBottomRight.y / step) * step;

    ctx.save();
    ctx.strokeStyle = "rgba(202, 187, 177, 0.035)";
    ctx.lineWidth = 1;

    for (let x = startX; x <= endX; x += step) {
      const p1 = worldToScreen(x, worldTopLeft.y);
      const p2 = worldToScreen(x, worldBottomRight.y);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += step) {
      const p1 = worldToScreen(worldTopLeft.x, y);
      const p2 = worldToScreen(worldBottomRight.x, y);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawEdges() {
    const routeIds = new Set(activeRoute ? activeRoute.nodes : []);

    ctx.save();
    visibleEdges.forEach((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) return;

      const isSelectedEdge = selectedId && (edge.from === selectedId || edge.to === selectedId);
      const isHoveredEdge = hoveredId && (edge.from === hoveredId || edge.to === hoveredId);
      const isRouteEdge = routeIds.has(edge.from) && routeIds.has(edge.to);
      const isPrimary = primaryEdgeKeys.has(edgeKey(edge.from, edge.to));

      if (!isSelectedEdge && !isHoveredEdge && !isRouteEdge && !isPrimary) return;

      const p1 = worldToScreen(from.x, from.y);
      const p2 = worldToScreen(to.x, to.y);
      const color = isSelectedEdge || isRouteEdge ? nodeColor(from) : "rgba(202, 187, 177, 1)";
      const alpha = isSelectedEdge ? 0.78 : isHoveredEdge ? 0.54 : isRouteEdge ? 0.5 : 0.2;
      const widthBoost = isSelectedEdge ? 1.7 : isRouteEdge ? 0.8 : 0;

      drawTrace(p1, p2, color, alpha, 1 + widthBoost);

      if ((isSelectedEdge || isRouteEdge) && camera.zoom > 0.5) {
        drawEdgeLabel(edge.label, p1, p2);
      }
    });
    ctx.restore();
  }

  function drawTrace(p1, p2, color, alpha, lineWidth) {
    const midX = p1.x + (p2.x - p1.x) * 0.56;
    const colorValue = color.startsWith("#") ? hexToRgba(color, alpha) : color.replace("1)", `${alpha})`);

    ctx.save();
    ctx.strokeStyle = colorValue;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(midX, p1.y);
    ctx.lineTo(midX, p2.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    if (lineWidth > 1.5) {
      ctx.fillStyle = colorValue;
      ctx.beginPath();
      ctx.arc(midX, p1.y, 2.2, 0, Math.PI * 2);
      ctx.arc(midX, p2.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEdgeLabel(label, p1, p2) {
    const x = p1.x + (p2.x - p1.x) * 0.56;
    const y = (p1.y + p2.y) / 2;
    const text = label.length > 26 ? `${label.slice(0, 25)}...` : label;

    ctx.save();
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const metrics = ctx.measureText(text);
    ctx.fillStyle = "rgba(13, 13, 11, 0.84)";
    ctx.fillRect(x - metrics.width / 2 - 6, y - 9, metrics.width + 12, 18);
    ctx.fillStyle = "rgba(230, 217, 204, 0.8)";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawNodes() {
    const selectedConnections = new Set();
    if (selectedId) {
      connectedEdges(selectedId).forEach(({ other }) => selectedConnections.add(other.id));
    }

    const routeIds = new Set(activeRoute ? activeRoute.nodes : []);

    visibleNodes.forEach((node) => {
      const p = worldToScreen(node.x, node.y);
      const radius = clamp(node.size * camera.zoom * 0.55, 4.2, 16);
      const selected = node.id === selectedId;
      const hovered = node.id === hoveredId;
      const connected = selectedConnections.has(node.id);
      const inRoute = routeIds.has(node.id);
      const color = nodeColor(node);
      const dimmed = selectedId && !selected && !connected && !inRoute;

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.26 : 1;

      if (selected || hovered || connected || inRoute) {
        const glow = selected ? 34 : hovered ? 24 : inRoute ? 18 : 14;
        const gradient = ctx.createRadialGradient(p.x, p.y, radius, p.x, p.y, radius + glow);
        gradient.addColorStop(0, hexToRgba(color, selected ? 0.56 : 0.36));
        gradient.addColorStop(1, hexToRgba(color, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + glow, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(13, 13, 11, 0.94)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = selected || inRoute ? color : "rgba(202, 187, 177, 0.32)";
      ctx.lineWidth = selected ? 2.4 : inRoute ? 1.7 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (shouldShowLabel(node, selected, hovered, connected, inRoute)) {
        drawNodeLabel(node, p, radius, dimmed, selected || inRoute);
      }

      ctx.restore();
    });
  }

  function shouldShowLabel(node, selected, hovered, connected, inRoute) {
    if (selected || hovered || connected || inRoute) return true;
    if (node.type === "genre") return true;
    if (node.type === "band" && node.size >= 22) return true;
    if (node.type === "maker") return true;
    if (node.size >= 24) return true;
    if (camera.zoom > 0.58 && node.type !== "release") return true;
    if (camera.zoom > 0.78) return true;
    return false;
  }

  function drawNodeLabel(node, p, radius, dimmed, emphasized) {
    const label = node.label;
    const fontSize = emphasized
      ? clamp(12 + camera.zoom * 7, 12, 17)
      : clamp(10 + camera.zoom * 5, 10, 14);

    ctx.save();
    ctx.font = `800 ${fontSize}px Segoe UI, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxWidth = emphasized ? 190 : 150;
    const lines = wrapLabel(label, maxWidth, ctx);
    const lineHeight = fontSize + 2;
    const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const boxWidth = Math.min(maxWidth, textWidth + 18);
    const boxHeight = lines.length * lineHeight + 10;
    const x = p.x;
    const y = p.y + radius + 16 + boxHeight / 2;

    ctx.fillStyle = dimmed ? "rgba(13, 13, 11, 0.28)" : "rgba(13, 13, 11, 0.72)";
    ctx.strokeStyle = emphasized ? hexToRgba(nodeColor(node), 0.34) : "rgba(202, 187, 177, 0.1)";
    ctx.lineWidth = 1;
    ctx.fillRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);

    ctx.fillStyle = dimmed ? "rgba(230, 217, 204, 0.36)" : "rgba(230, 217, 204, 0.9)";
    lines.forEach((line, index) => {
      const lineY = y - ((lines.length - 1) * lineHeight) / 2 + index * lineHeight;
      ctx.fillText(line, x, lineY);
    });
    ctx.restore();
  }

  function wrapLabel(label, maxWidth, context) {
    const words = label.split(" ");
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });

    if (line) lines.push(line);
    return lines.slice(0, 2);
  }

  function nodeAtScreenPoint(x, y) {
    let best = null;
    let bestDistance = Infinity;

    visibleNodes.forEach((node) => {
      const p = worldToScreen(node.x, node.y);
      const radius = clamp(node.size * camera.zoom * 0.55, 4.2, 16) + 11;
      const distance = Math.hypot(p.x - x, p.y - y);
      if (distance < radius && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    });

    return best;
  }

  function handlePointerDown(event) {
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    };
    hasDragged = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  }

  function handlePointerMove(event) {
    const node = nodeAtScreenPoint(event.clientX, event.clientY);
    const nextHoveredId = node ? node.id : null;
    if (nextHoveredId !== hoveredId) {
      hoveredId = nextHoveredId;
      canvas.style.cursor = node ? "pointer" : "grab";
      scheduleDraw();
    }

    if (!pointer || pointer.id !== event.pointerId) return;

    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) {
      hasDragged = true;
    }

    camera.x -= dx / camera.zoom;
    camera.y -= dy / camera.zoom;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    cameraAnimation = null;
    scheduleDraw();
  }

  function handlePointerUp(event) {
    if (!pointer || pointer.id !== event.pointerId) return;

    canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove("dragging");

    if (!hasDragged) {
      const node = nodeAtScreenPoint(event.clientX, event.clientY);
      if (node) {
        focusNode(node.id);
      }
    }

    pointer = null;
    scheduleDraw();
  }

  function handleWheel(event) {
    event.preventDefault();
    const before = screenToWorld(event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.001);
    camera.zoom = clamp(camera.zoom * factor, 0.17, 1.25);
    const after = screenToWorld(event.clientX, event.clientY);
    camera.x += before.x - after.x;
    camera.y += before.y - after.y;
    cameraAnimation = null;
    scheduleDraw();
  }

  function hideSearchResults() {
    searchResults.hidden = true;
    searchResults.replaceChildren();
  }

  function showSearchResults(matches) {
    searchResults.replaceChildren();
    if (!matches.length) {
      hideSearchResults();
      return;
    }

    matches.forEach((node) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.addEventListener("click", () => focusNode(node.id));

      const dot = document.createElement("span");
      dot.className = "result-dot";
      dot.style.background = nodeColor(node);

      const label = document.createElement("span");
      label.textContent = node.label;

      const type = document.createElement("span");
      type.className = "result-type";
      type.textContent = typeLabel(node);

      button.append(dot, label, type);
      searchResults.append(button);
    });

    searchResults.hidden = false;
  }

  function handleSearch() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      hideSearchResults();
      return;
    }

    const matches = visibleNodes
      .filter((node) => {
        const haystack = [node.label, typeLabel(node), ...(node.meta || [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const aStarts = a.label.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.label.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.label.localeCompare(b.label);
      })
      .slice(0, 8);

    showSearchResults(matches);
  }

  function randomStarter() {
    const pool = visibleNodes.filter(
      (node) => node.starter && START_TYPES[mode].has(node.type),
    );
    const node = pool[Math.floor(Math.random() * pool.length)];
    if (node) focusNode(node.id);
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const value = Number.parseInt(clean.length === 3
      ? clean.split("").map((character) => character + character).join("")
      : clean, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function bindEvents() {
    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    homeButton.addEventListener("click", (event) => {
      event.preventDefault();
      resetMap();
    });

    closePanel.addEventListener("click", () => {
      selectedId = null;
      activeRoute = null;
      activeRouteIndex = 0;
      detailPanel.hidden = true;
      renderRouteList();
      scheduleDraw();
    });

    routePrev.addEventListener("click", () => stepRoute(-1));
    routeNext.addEventListener("click", () => stepRoute(1));
    randomButton.addEventListener("click", randomStarter);
    searchInput.addEventListener("input", handleSearch);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        searchInput.value = "";
        hideSearchResults();
      }
    });

    document.addEventListener("click", (event) => {
      if (!searchResults.contains(event.target) && event.target !== searchInput) {
        hideSearchResults();
      }
    });

    modeButtons.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.modeChoice));
    });
  }

  function validateGraph() {
    const missing = edges.flatMap((edge) => {
      const problems = [];
      if (!nodeById.has(edge.from)) problems.push(edge.from);
      if (!nodeById.has(edge.to)) problems.push(edge.to);
      return problems;
    });

    if (missing.length) {
      console.warn("Graph edges reference missing nodes:", missing);
    }
  }

  validateGraph();
  bindEvents();
  updateVisibleGraph();
  renderStarterCards();
  renderRouteList();
  resizeCanvas();
  scheduleDraw();
})();
