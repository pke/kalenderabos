const form = document.querySelector("#calendar-form");
const countryInput = document.querySelector("#country");
const countryOptions = document.querySelector("#country-options");
const languageOptions = document.querySelector("#language-options");
const languageField = document.querySelector("#language-field");
const siteHeader = document.querySelector(".site-header");
const detailView = document.querySelector("#detail-view");
const feedSection = document.querySelector("#feed-section");
const feedHeading = document.querySelector("#feed-heading");
const feedCount = document.querySelector("#feed-count");
const feedTools = document.querySelector("#feed-tools");
const feedFilter = document.querySelector("#feed-filter");
const feedIndex = document.querySelector("#feed-index");
const feedEmpty = document.querySelector("#feed-empty");
const feedList = document.querySelector("#feed-list");
const semanticView = document.querySelector("#semantic-view");
const semanticOverview = document.querySelector("#semantic-overview");
const semanticHeading = document.querySelector("#semantic-heading");
const semanticCount = document.querySelector("#semantic-count");
const semanticZoomLabel = document.querySelector("#semantic-zoom-label");
const semanticZoomOut = document.querySelector("#semantic-zoom-out");
const semanticZoomIn = document.querySelector("#semantic-zoom-in");
const status = document.querySelector("#form-status");

const LARGE_FEED_THRESHOLD = 30;
const MAX_SEMANTIC_ZOOM = 3;
const state = {
  countries: [],
  detailHeading: "Verfügbare Ferienkalender",
  renderedCountry: "",
  initialCountryMatchesLocale: false,
};

let semanticZoomLevel = MAX_SEMANTIC_ZOOM;
let touchPinchStartDistance = 0;
let touchPinchHandled = false;
let trackpadPinchDelta = 0;
let trackpadPinchHandled = false;
let trackpadPinchTimer = 0;
let activeViewTransition = null;
let semanticTransitionToken = 0;

const languageDisplayNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["de"], { type: "language" })
  : null;

function setStatus(message, kind = "neutral") {
  status.textContent = message;
  status.dataset.kind = kind;
  status.hidden = !message;
}

function selectedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function selectedLanguage() {
  return selectedValue("language") || "de";
}

function searchable(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de");
}

function sortKey(value) {
  return searchable(value).replace(/^[^a-z0-9]+/, "");
}

function initialLetter(value) {
  const initial = searchable(value).match(/[a-z]/)?.[0]?.toLocaleUpperCase("de") || "#";
  return /^[A-Z]$/.test(initial) ? initial : "#";
}

function sortedByName(items) {
  return [...items].sort((a, b) =>
    sortKey(a.name).localeCompare(sortKey(b.name), "de", {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

function groupedItemsByInitial(items) {
  const groups = new Map();
  for (const item of items) {
    const initial = initialLetter(item.name);
    const group = groups.get(initial) || [];
    group.push(item);
    groups.set(initial, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "de"));
}

function groupPreview(items) {
  const names = items.slice(0, 2).map((item) => item.name);
  const remaining = items.length - names.length;
  return `${names.join(" · ")}${remaining > 0 ? ` + ${remaining}` : ""}`;
}

function languageName(code) {
  try {
    return languageDisplayNames?.of(code) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

function parseCatalog(value) {
  if (value?.v !== 1 || !value.c || typeof value.c !== "object") {
    throw new Error("Der Ferienkalender-Katalog hat ein unbekanntes Format.");
  }

  const countries = Object.entries(value.c).map(([code, entry]) => {
    if (!/^[a-z]{2}$/.test(code) || !entry || typeof entry !== "object") {
      throw new Error("Der Ferienkalender-Katalog enthält ein ungültiges Land.");
    }
    if (typeof entry.n !== "string" || !entry.n || typeof entry.l !== "string") {
      throw new Error(`Der Ferienkalender-Katalog für ${code.toUpperCase()} ist unvollständig.`);
    }
    if (entry.a !== undefined && (typeof entry.a !== "string" || !entry.a)) {
      throw new Error(`Der Ferienkalender-Katalog für ${code.toUpperCase()} enthält einen ungültigen Hinweis.`);
    }

    const languages = entry.l.split(",").filter((language) => /^[a-z]{2}$/.test(language));
    if (!languages.length || languages.length !== new Set(languages).size) {
      throw new Error(`Der Ferienkalender-Katalog für ${code.toUpperCase()} enthält ungültige Sprachen.`);
    }

    let calendars;
    if (entry.r === undefined) {
      calendars = [{
        suffix: "",
        code,
        name: entry.n,
        shortName: code.toUpperCase(),
      }];
    } else {
      if (!entry.r || typeof entry.r !== "object" || Array.isArray(entry.r)) {
        throw new Error(`Der Ferienkalender-Katalog für ${code.toUpperCase()} enthält ungültige Regionen.`);
      }
      calendars = Object.entries(entry.r).map(([suffix, name]) => {
        if (!/^[a-z0-9-]+$/.test(suffix) || typeof name !== "string" || !name) {
          throw new Error(`Der Ferienkalender-Katalog für ${code.toUpperCase()} enthält eine ungültige Region.`);
        }
        return {
          suffix,
          code: `${code}-${suffix}`,
          name,
          shortName: suffix.toUpperCase(),
        };
      });
      if (!calendars.length) {
        throw new Error(`Der Ferienkalender-Katalog für ${code.toUpperCase()} enthält keine Regionen.`);
      }
    }

    return {
      code,
      isoCode: code.toUpperCase(),
      name: entry.n,
      initial: initialLetter(entry.n),
      languages,
      calendars: sortedByName(calendars),
      nationwide: entry.r === undefined,
      advisory: entry.a || "",
    };
  });

  if (!countries.length) throw new Error("Keine Ferienkalender verfügbar.");
  return sortedByName(countries);
}

function selectedCountry() {
  const value = countryInput.value.trim().toLocaleLowerCase("de");
  return state.countries.find((country) =>
    country.code === value || country.name.toLocaleLowerCase("de") === value,
  );
}

function inferredCountryCode() {
  state.initialCountryMatchesLocale = false;
  try {
    const locale = new Intl.Locale(navigator.language);
    const region = (locale.region || locale.maximize().region || "").toLowerCase();
    if (state.countries.some((country) => country.code === region)) {
      state.initialCountryMatchesLocale = true;
      return region;
    }
  } catch {
    // Ignore a missing or malformed browser locale.
  }
  return state.countries.some((country) => country.code === "de") ? "de" : "";
}

function inferredLanguageCode(country) {
  if (!country) return "";
  if (state.initialCountryMatchesLocale) {
    try {
      const code = new Intl.Locale(navigator.language).language.toLowerCase();
      if (country.languages.includes(code)) return code;
    } catch {
      // Ignore a missing or malformed browser locale.
    }
  }
  return country.languages.includes("de") ? "de" : country.languages[0];
}

function populateCountries() {
  const fragment = document.createDocumentFragment();
  for (const country of state.countries) {
    const option = document.createElement("option");
    option.value = country.name;
    option.label = country.isoCode;
    fragment.append(option);
  }
  countryOptions.replaceChildren(fragment);
  countryInput.disabled = false;
  countryInput.placeholder = "Land eingeben";
  const inferred = inferredCountryCode();
  const country = state.countries.find((item) => item.code === inferred);
  countryInput.value = country?.name || "";
}

function populateLanguages() {
  const country = selectedCountry();
  const previous = selectedValue("language");
  const fragment = document.createDocumentFragment();

  for (const [index, code] of (country?.languages || []).entries()) {
    const label = document.createElement("label");
    label.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "language";
    input.id = `language-${country.code}-${code}-${index}`;
    input.value = code;
    input.required = true;
    const text = document.createElement("span");
    text.className = "choice-text";
    text.textContent = languageName(code);
    label.append(input, text);
    fragment.append(label);
  }

  languageOptions.replaceChildren(fragment);
  const inputs = [...languageOptions.querySelectorAll("input[name='language']")];
  const preferred = previous || inferredLanguageCode(country);
  const selected = inputs.find((input) => input.value === preferred) || inputs[0];
  if (selected) selected.checked = true;
  languageField.disabled = inputs.length === 0;
}

function calendarUrl(row) {
  const country = selectedCountry();
  const region = row.dataset.region;
  if (!country || !region) return "";
  return new URL(
    `/feeds/${country.code}/${region}/${selectedLanguage()}.ics`,
    window.location.origin,
  ).toString();
}

function webcalUrl(url) {
  return url.replace(/^https?:/i, "webcal:");
}

function updateFeedLinks() {
  for (const row of feedList.querySelectorAll(".feed-row")) {
    const name = row.querySelector(".feed-identity strong")?.textContent || "Kalender";
    const url = calendarUrl(row);
    const copy = row.querySelector("[data-action='copy']");
    const add = row.querySelector(".feed-add");
    copy.dataset.url = url;
    copy.setAttribute("aria-label", `Link für ${name} kopieren`);
    add.href = webcalUrl(url);
    add.setAttribute("aria-label", `Kalender für ${name} hinzufügen`);
  }
}

function createFeedRow(calendar, country) {
  const row = document.createElement("article");
  row.className = "feed-row";
  row.dataset.code = calendar.code;
  row.dataset.region = calendar.code;
  row.dataset.searchName = searchable(calendar.name);
  row.dataset.initial = initialLetter(calendar.name);

  const identity = document.createElement("div");
  identity.className = "feed-identity";
  const name = document.createElement("strong");
  name.textContent = calendar.name;
  const shortName = document.createElement("span");
  shortName.textContent = country.advisory
    ? `${calendar.shortName} · Empfehlung`
    : calendar.shortName;
  identity.append(name, shortName);

  const actions = document.createElement("div");
  actions.className = "feed-actions";
  const copy = document.createElement("button");
  copy.className = "feed-action feed-copy";
  copy.type = "button";
  copy.dataset.action = "copy";
  copy.textContent = "Link kopieren";
  const add = document.createElement("a");
  add.className = "feed-action feed-add";
  add.textContent = "Kalender hinzufügen";
  actions.append(copy, add);

  row.append(identity, actions);
  return row;
}

function createTile({ label, meta, kind, value, initial = "", selection = "" }) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = `semantic-tile semantic-tile-${kind}`;
  tile.dataset.kind = kind;
  tile.dataset.value = value;
  if (initial) tile.dataset.initial = initial;
  if (selection) tile.setAttribute("aria-current", "true");
  const title = document.createElement("strong");
  title.textContent = label;
  tile.append(title);
  if (meta) {
    const detail = document.createElement("span");
    detail.textContent = meta;
    tile.append(detail);
  }
  if (selection) {
    const selected = document.createElement("span");
    selected.className = "semantic-selection";
    selected.textContent = selection;
    tile.append(selected);
  }
  return tile;
}

function detailHeadings(country) {
  if (country.nationwide) {
    return {
      detail: country.advisory
        ? "Bundesweit empfohlener Ferienkalender"
        : "Landesweiter Ferienkalender",
      semantic: "Kalender nach Anfangsbuchstaben",
    };
  }
  if (country.code === "de") {
    return {
      detail: "Ferienkalender nach Bundesländern",
      semantic: "Bundesländer nach Anfangsbuchstaben",
    };
  }
  return {
    detail: "Regionale Ferienkalender",
    semantic: "Regionen nach Anfangsbuchstaben",
  };
}

function renderFeeds() {
  const country = selectedCountry();
  if (!country) return;
  if (state.renderedCountry === country.code) {
    updateFeedLinks();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const calendar of country.calendars) fragment.append(createFeedRow(calendar, country));
  feedList.replaceChildren(fragment);

  const indexFragment = document.createDocumentFragment();
  if (country.calendars.length >= LARGE_FEED_THRESHOLD) {
    for (const [initial] of groupedItemsByInitial(country.calendars)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.initial = initial;
      button.setAttribute("aria-label", `Zu ${initial} springen`);
      button.textContent = initial;
      indexFragment.append(button);
    }
  }
  feedIndex.replaceChildren(indexFragment);

  state.detailHeading = detailHeadings(country).detail;
  state.renderedCountry = country.code;
  feedFilter.value = "";
  updateFeedLinks();
  applyFeedFilter();
  feedSection.hidden = false;
}

function applyFeedFilter() {
  const rows = [...feedList.querySelectorAll(".feed-row")];
  const showTools = rows.length >= LARGE_FEED_THRESHOLD;
  const term = showTools ? feedFilter.value.trim().toLocaleLowerCase("de") : "";
  const normalizedTerm = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const visibleRows = rows.filter((row) => {
    const visible = !normalizedTerm || row.dataset.searchName.includes(normalizedTerm);
    row.hidden = !visible;
    return visible;
  });
  const visibleInitials = new Set(visibleRows.map((row) => row.dataset.initial));
  const indexButtons = [...feedIndex.querySelectorAll("button[data-initial]")];
  for (const button of indexButtons) {
    button.hidden = !visibleInitials.has(button.dataset.initial);
  }
  const visibleButtons = indexButtons.filter((button) => !button.hidden);

  feedCount.textContent = normalizedTerm
    ? `${visibleRows.length} von ${rows.length} Kalendern`
    : `${rows.length} Kalender`;
  feedEmpty.hidden = visibleRows.length > 0;
  feedTools.hidden = !showTools;
  feedIndex.hidden = visibleButtons.length < 2;
}

function replaceSemanticTiles(tiles) {
  const fragment = document.createDocumentFragment();
  for (const tile of tiles) fragment.append(tile);
  semanticOverview.replaceChildren(fragment);
}

function renderSemanticOverview() {
  const country = selectedCountry();
  let heading = "Ferienkalender";
  let count = "";
  let tiles = [];

  if (semanticZoomLevel === 1 && country) {
    const groups = groupedItemsByInitial(country.calendars);
    tiles = groups.map(([initial, items]) => createTile({
      label: initial,
      meta: groupPreview(items),
      kind: "region-initial",
      value: initial,
    }));
    heading = detailHeadings(country).semantic;
    count = `${groups.length} Buchstaben`;
  } else if (semanticZoomLevel === 2) {
    tiles = state.countries.map((countryItem) => createTile({
      label: countryItem.name,
      meta: countryItem.isoCode,
      kind: "country",
      value: countryItem.code,
      initial: countryItem.initial,
      selection: countryItem.code === country?.code ? "Vorausgewählt" : "",
    }));
    heading = "Länder";
    count = `${state.countries.length} Länder`;
  } else if (semanticZoomLevel === 3) {
    const groups = groupedItemsByInitial(state.countries);
    tiles = groups.map(([initial, items]) => createTile({
      label: initial,
      meta: groupPreview(items),
      kind: "country-initial",
      value: initial,
      selection: items.some((item) => item.code === country?.code)
        ? `${country.name} vorausgewählt`
        : "",
    }));
    heading = "Länder nach Anfangsbuchstaben";
    count = `${groups.length} Buchstaben`;
  }

  replaceSemanticTiles(tiles);
  semanticHeading.textContent = heading;
  semanticCount.textContent = count;
}

function semanticEntryCount(level) {
  const country = selectedCountry();
  if (level === 1 && country) return groupedItemsByInitial(country.calendars).length;
  if (level === 2) return state.countries.length;
  if (level === 3) return groupedItemsByInitial(state.countries).length;
  return Infinity;
}

function meaningfulSemanticLevel(requestedLevel) {
  const requested = Math.max(0, Math.min(MAX_SEMANTIC_ZOOM, requestedLevel));
  const direction = Math.sign(requested - semanticZoomLevel);
  if (!direction) return requested;

  let level = requested;
  while (
    level > 0 &&
    level < MAX_SEMANTIC_ZOOM &&
    semanticEntryCount(level) <= 1
  ) {
    level += direction;
  }
  return Math.max(0, Math.min(MAX_SEMANTIC_ZOOM, level));
}

function applySemanticZoom(level, afterUpdate) {
  semanticZoomLevel = level;
  const labels = ["Detailansicht", "Regionsindex", "Länder", "Länderindex"];
  semanticZoomLabel.textContent = labels[semanticZoomLevel];
  semanticZoomIn.disabled = semanticZoomLevel === 0;
  semanticZoomOut.disabled = semanticZoomLevel === MAX_SEMANTIC_ZOOM;
  detailView.hidden = semanticZoomLevel !== 0;
  semanticView.hidden = semanticZoomLevel === 0;

  if (semanticZoomLevel === 0) {
    renderFeeds();
    feedHeading.textContent = state.detailHeading;
    semanticOverview.replaceChildren();
    applyFeedFilter();
  } else {
    renderSemanticOverview();
  }
  window.scrollTo({ top: 0, behavior: "auto" });
  afterUpdate?.();
}

function setSemanticZoom(level, { afterUpdate } = {}) {
  const nextLevel = meaningfulSemanticLevel(level);
  if (nextLevel > 0 && semanticZoomLevel === 0 && feedFilter.value) {
    feedFilter.value = "";
    applyFeedFilter();
  }
  const previousLevel = semanticZoomLevel;
  const direction = nextLevel > previousLevel ? "out" : "in";
  const update = () => applySemanticZoom(nextLevel, afterUpdate);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (nextLevel === previousLevel || reducedMotion) {
    update();
    return;
  }
  activeViewTransition?.skipTransition?.();
  if (document.startViewTransition) {
    const token = ++semanticTransitionToken;
    document.documentElement.dataset.semanticDirection = direction;
    activeViewTransition = document.startViewTransition(update);
    activeViewTransition.finished.finally(() => {
      if (token !== semanticTransitionToken) return;
      delete document.documentElement.dataset.semanticDirection;
      activeViewTransition = null;
    });
    return;
  }
  update();
  const incomingView = nextLevel === 0 ? detailView : semanticView;
  incomingView.animate(
    direction === "out"
      ? [{ opacity: 0, transform: "scale(0.88)" }, { opacity: 1, transform: "scale(1)" }]
      : [{ opacity: 0, transform: "scale(1.12)" }, { opacity: 1, transform: "scale(1)" }],
    { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

function scrollWithin(container, element) {
  container.scrollTo({
    top: container.scrollTop +
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function scrollPageTo(element) {
  const headerOffset = siteHeader.getBoundingClientRect().height + 12;
  window.scrollTo({
    top: Math.max(0, window.scrollY + element.getBoundingClientRect().top - headerOffset),
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function scrollFeedToInitial(initial) {
  const row = [...feedList.querySelectorAll(".feed-row")]
    .find((item) => !item.hidden && item.dataset.initial === initial);
  if (row) scrollWithin(feedList, row);
}

function touchDistance(touches) {
  if (touches.length !== 2) return 0;
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}

function startTouchPinch(event) {
  if (event.touches.length !== 2) return;
  event.preventDefault();
  touchPinchStartDistance = touchDistance(event.touches);
  touchPinchHandled = false;
}

function moveTouchPinch(event) {
  if (event.touches.length !== 2 || !touchPinchStartDistance) return;
  event.preventDefault();
  if (touchPinchHandled) return;
  const scale = touchDistance(event.touches) / touchPinchStartDistance;
  if (scale < 0.84 && semanticZoomLevel < MAX_SEMANTIC_ZOOM) {
    setSemanticZoom(semanticZoomLevel + 1);
    touchPinchHandled = true;
  } else if (scale > 1.16 && semanticZoomLevel > 0) {
    setSemanticZoom(semanticZoomLevel - 1);
    touchPinchHandled = true;
  }
}

function endTouchPinch(event) {
  if (event.touches.length >= 2) return;
  touchPinchStartDistance = 0;
  touchPinchHandled = false;
}

function moveTrackpadPinch(event) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  window.clearTimeout(trackpadPinchTimer);
  trackpadPinchTimer = window.setTimeout(() => {
    trackpadPinchDelta = 0;
    trackpadPinchHandled = false;
  }, 220);
  if (trackpadPinchHandled) return;
  trackpadPinchDelta += event.deltaY;
  if (Math.abs(trackpadPinchDelta) < 24) return;
  if (trackpadPinchDelta > 0 && semanticZoomLevel < MAX_SEMANTIC_ZOOM) {
    setSemanticZoom(semanticZoomLevel + 1);
    trackpadPinchHandled = true;
  } else if (trackpadPinchDelta < 0 && semanticZoomLevel > 0) {
    setSemanticZoom(semanticZoomLevel - 1);
    trackpadPinchHandled = true;
  }
}

function loadFeeds({ targetZoomLevel = 0 } = {}) {
  const country = selectedCountry();
  semanticZoomOut.disabled = true;
  feedSection.hidden = true;
  feedList.replaceChildren();
  feedIndex.replaceChildren();
  state.renderedCountry = "";
  if (!country) {
    setStatus("Gib ein Land ein und wähle es aus der Vorschlagsliste.");
    return;
  }
  state.detailHeading = detailHeadings(country).detail;
  setStatus(country.advisory);
  setSemanticZoom(targetZoomLevel);
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    if (!copied) throw new Error("copy failed");
  }
}

async function copyFeedLink(button) {
  const original = button.textContent;
  try {
    await writeClipboard(button.dataset.url);
    button.textContent = "Kopiert";
    button.dataset.copied = "true";
    window.setTimeout(() => {
      button.textContent = original;
      delete button.dataset.copied;
    }, 1800);
  } catch {
    setStatus("Der Link konnte nicht kopiert werden.", "error");
  }
}

async function initialize() {
  try {
    const response = await fetch("/catalog.json");
    if (!response.ok) throw new Error("Ferienkalender konnten nicht geladen werden.");
    state.countries = parseCatalog(await response.json());
    populateCountries();
    populateLanguages();
    loadFeeds({ targetZoomLevel: MAX_SEMANTIC_ZOOM });
  } catch (error) {
    applySemanticZoom(0);
    semanticZoomOut.disabled = true;
    setStatus(error.message, "error");
    countryInput.value = "";
    countryInput.placeholder = "Keine Daten verfügbar";
  }
}

countryInput.addEventListener("input", () => {
  if (selectedCountry()) {
    populateLanguages();
    loadFeeds();
  } else {
    feedSection.hidden = true;
    setStatus("Gib ein Land ein und wähle es aus der Vorschlagsliste.");
  }
});
languageOptions.addEventListener("change", updateFeedLinks);
feedList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='copy']");
  if (button) copyFeedLink(button);
});
feedFilter.addEventListener("input", applyFeedFilter);
feedIndex.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-initial]");
  if (button) scrollFeedToInitial(button.dataset.initial);
});
semanticZoomOut.addEventListener("click", () => setSemanticZoom(semanticZoomLevel + 1));
semanticZoomIn.addEventListener("click", () => setSemanticZoom(semanticZoomLevel - 1));
semanticOverview.addEventListener("click", (event) => {
  const tile = event.target.closest("button[data-kind]");
  if (!tile) return;

  if (tile.dataset.kind === "region-initial") {
    const initial = tile.dataset.value;
    setSemanticZoom(0, {
      afterUpdate: () => requestAnimationFrame(() => {
        scrollPageTo(feedSection);
        scrollFeedToInitial(initial);
      }),
    });
    return;
  }

  if (tile.dataset.kind === "country-initial") {
    const countries = state.countries.filter(
      (country) => country.initial === tile.dataset.value,
    );
    if (countries.length === 1) {
      countryInput.value = countries[0].name;
      populateLanguages();
      loadFeeds({ targetZoomLevel: 1 });
      return;
    }
    const initial = tile.dataset.value;
    setSemanticZoom(2, {
      afterUpdate: () => requestAnimationFrame(() => {
        const country = [...semanticOverview.querySelectorAll("[data-kind='country']")]
          .find((item) => item.dataset.initial === initial);
        if (country) scrollPageTo(country);
      }),
    });
    return;
  }

  if (tile.dataset.kind === "country") {
    const country = state.countries.find((item) => item.code === tile.dataset.value);
    if (!country) return;
    countryInput.value = country.name;
    populateLanguages();
    loadFeeds({ targetZoomLevel: 1 });
  }
});
document.addEventListener("touchstart", startTouchPinch, { capture: true, passive: false });
document.addEventListener("touchmove", moveTouchPinch, { capture: true, passive: false });
document.addEventListener("touchend", endTouchPinch, { capture: true });
document.addEventListener("touchcancel", endTouchPinch, { capture: true });
document.addEventListener("wheel", moveTrackpadPinch, { capture: true, passive: false });
form.addEventListener("submit", (event) => event.preventDefault());

initialize();
