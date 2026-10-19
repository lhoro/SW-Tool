/* SW Tool EXT - dashboard uruchamiany na stronie gry (isolated content script). */
(() => {
  "use strict";
  if (window.top !== window || !/\.shinobiworld\.pl$/i.test(location.hostname) ||
      location.hostname === "www.shinobiworld.pl" ||
      document.getElementById("sw-tool-dashboard-host")) return;

  const CHANNEL = "SW_TOOL_BRIDGE_V1";
  const HOST_ID = "sw-tool-dashboard-host";
  const DEFAULTS = {
    dailyReward: true, saveTuts: true, hideReports: false, mapClickMovement: true,
    acceleratedH: false, improvedX: false, killRespawnedMobs: false,
    expKillChampions: false, expKillElites: false, expKillBosses: false,
    debugLogs: false, preferTraining: true
  };
  const state = { config: { ...DEFAULTS }, accounts: [], accountCharacters: [], activeAccount: null,
    preferencesSignature: "", ui: {}, lastLog: "", uiLogs: [], game: null, loading: false };
  let shadow, host, panel, timer, polling = false;
  let configQueue = Promise.resolve();

  function requestPage(action, payload = {}, timeoutMs = 11000) {
    const requestId = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random());
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); window.removeEventListener("message", receive); };
      const receive = (event) => {
        const d = event.data;
        if (event.source !== window || event.origin !== location.origin || !d ||
            d.channel !== CHANNEL || d.direction !== "page-to-extension" || d.requestId !== requestId) return;
        cleanup();
        d.ok ? resolve(d.payload || {}) : reject(new Error(d.error || "Błąd komunikacji z grą."));
      };
      const timeout = setTimeout(() => { cleanup(); reject(new Error("Nie otrzymano odpowiedzi: " + action)); }, timeoutMs);
      window.addEventListener("message", receive);
      window.postMessage({
        channel: CHANNEL, direction: "extension-to-page", requestId, action, payload
      }, location.origin);
    });
  }

  function sendBackground(command, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ source: "dashboard", command, ...payload }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response || response.ok !== true) return reject(new Error(response?.error || "Błąd rozszerzenia."));
        resolve(response.data || {});
      });
    });
  }

  // Krótkie komunikaty nie pojawiają się nad grą: wszystko trafia do Debug.
  function notice(message, error = false) {
    const value = String(message || "").trim();
    if (!value) return;
    if (state.uiLogs.length && state.uiLogs[state.uiLogs.length - 1].message === value &&
        Date.now() - (state.uiLogs[state.uiLogs.length - 1].timestamp || 0) < 30000) return;
    state.uiLogs.push({
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString("pl-PL", { hour12: false }),
      message: value,
      type: error ? "error" : ""
    });
    if (state.uiLogs.length > 100) state.uiLogs.shift();
    renderLogs(state.game);
  }

  function renderLogs(gameState) {
    if (!shadow) return;
    const logBox = $("#log-box");
    if (!logBox) return;
    const gameLogs = Array.isArray(gameState?.logs) ? gameState.logs : [];
    const logs = [...gameLogs, ...state.uiLogs];
    const signature = JSON.stringify(logs);
    if (signature === state.lastLog) return;
    state.lastLog = signature;
    logBox.textContent = "";
    for (const entry of logs) {
      const line = document.createElement("div");
      line.className = "log-line " + (entry.type === "error" ? "error" : entry.type === "success" ? "success" : "");
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = String(entry.time || "") + " ";
      line.append(time, document.createTextNode(String(entry.message || "")));
      logBox.appendChild(line);
    }
    if (!logs.length) logBox.textContent = "Brak zdarzeń.";
    $("#log-count").textContent = String(Number(gameState?.logCount || gameLogs.length) + state.uiLogs.length);
    logBox.scrollTop = logBox.scrollHeight;
  }

  const $ = (selector) => shadow.querySelector(selector);
  const $$ = (selector) => [...shadow.querySelectorAll(selector)];
  const escapeText = (str) => String(str || "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const OPTION_HINTS = Object.freeze({
    dailyReward: "Automatyczne odbieranie dostępnych dziennych nagród na postaciach.",
    saveTuts: "Automatyczny zapis na dostępne turnieje, gdy postać spełnia wymagania.",
    hideReports: "Ukrywanie raportów wyświetlanych przez klienta gry.",
    mapClickMovement: "Umożliwia przemieszczanie po mapie przez klikanie pól.",
    acceleratedH: "Włącza przyspieszoną obsługę akcji powiązanych ze skrótem H.",
    improvedX: "Włącza ulepszoną obsługę skrótu klawiszowego X.",
    debugLogs: "Włącza szczegółowe komunikaty w konsoli przeglądarki. Logi bota pozostają w zakładce Debug."
  });
  const boolOption = (key, text) => {
    const hint = escapeText(OPTION_HINTS[key] || text);
    return '<label class="option" title="' + hint + '">' +
      '<span class="option-copy">' + escapeText(text) +
      '<span class="option-help" role="note" tabindex="0" title="' + hint +
      '" aria-label="' + hint + '">ⓘ</span></span>' +
      '<input type="checkbox" data-config="' + key + '" title="' + hint + '"></label>';
  };

  const html = [
    '<button type="button" id="launcher" hidden>⚔ SW TOOL</button>',
    '<section id="panel" aria-label="SW Tool - panel na grze">',
      '<div class="top">',
        '<div class="head" id="drag-handle">',
          '<div class="logo"><img id="logo-icon" alt="SW Tool"></div>',
          '<div class="title">SW TOOL</div>',
          '<span class="automation-state state-ready" id="task-status" title="Brak aktywnej automatyzacji">Gotowy</span>',
          '<div class="head-actions">',
            '<button type="button" class="icon" id="restore-position" title="Przywróć pozycję">⌖</button>',
            '<button type="button" class="icon" id="minimize" title="Zwiń panel">−</button>',
            '<button type="button" class="icon" id="close" title="Schowaj do przycisku SW">×</button>',
          '</div>',
        '</div>',
        '<div class="accounts-short" id="accounts-short"></div>',
      '</div>',
      '<nav class="tabs" aria-label="Zakładki dashboardu">',
        '<button class="tab active" data-tab="pulpit">Pulpit</button>',
        '<button class="tab" data-tab="pve">PVE</button>',
        '<button class="tab" data-tab="pvp">PVP</button>',
        '<button class="tab" data-tab="konto">Konta</button>',
        '<button class="tab" data-tab="ustawienia">Ustawienia</button>',
        '<button class="tab" data-tab="debug">Debug</button>',
      '</nav>',
      '<div class="scroller">',
        '<div class="page" data-page="pulpit">',
          '<div class="section">Szybkie akcje postaci</div>',
          '<div class="quick">',
            '<button class="action" data-quick="arena"><strong>⚔</strong>Arena</button>',
            '<button class="action" data-quick="abyss"><strong>◈</strong>Otchłań</button>',
            '<button class="action" data-quick="ronin"><strong>✦</strong>Ronin</button>',
            '<button class="action" data-quick="training"><strong>⚡</strong>Trening</button>',
            '<button class="action" data-quick="mission"><strong>▤</strong>Misja</button>',
            '<button class="action" data-quick="all"><strong>★</strong>ALL</button>',
          '</div>',
          '<div class="section">Szybkie akcje całego konta</div>',
          '<div class="quick account-quick">',
            '<button class="action" data-account-action="accountArenaPvp"><strong>⚔</strong>Arena</button>',
            '<button class="action" data-account-action="accountSoulAbyss"><strong>◈</strong>Otchłań</button>',
            '<button class="action" data-account-action="accountRonin"><strong>✦</strong>Ronin</button>',
            '<button class="action" data-account-action="accountTrainings"><strong>⚡</strong>Treningi</button>',
            '<button class="action" data-account-action="accountMissions"><strong>▤</strong>Misje</button>',
            '<button class="action" data-account-action="accountTournaments"><strong>♛</strong>Turnieje</button>',
            '<button class="action" data-account-action="accountAll"><strong>★</strong>ALL</button>',
          '</div>',
          '<div class="section">Auto Quest — eksperymentalny</div>',
          '<div class="card auto-quest-card">',
            '<div class="muted">Stań na polu questa. Bot analizuje etapy i wykonuje rozpoznane akcje. Nieznane lub niejednoznaczne kroki zatrzymują automat.</div>',
            '<button type="button" class="primary" id="auto-quest-button" data-command="autoQuest" aria-pressed="false">▶ Start Auto Quest</button>',
            '<div class="muted auto-quest-feedback" id="auto-quest-status" aria-live="polite">Gotowy do analizy questa na bieżącym polu.</div>',
          '</div>',
        '</div>',
        '<div class="page" data-page="pve" hidden>',
          '<div class="section">Questy</div>',
          '<div class="quick quest-actions">',
            '<button class="action" data-command="quest" type="button" title="Automatycznie wykonaj etap zabijania przeciwników w aktywnym queście"><strong>◎</strong>Quest Kille</button>',
            '<button class="action" id="pickup-button" type="button" data-command="pickup" title="Zbieraj przedmioty do aktywnego questa i wróć na pole startowe"><strong>▤</strong>Pickup Quest</button>',
          '</div>',
          '<div class="section">Expiarka</div>',
          '<div class="card feature">',
            '<div class="quick options-grid">',
              '<button class="action toggle-action" type="button" data-config-toggle="expKillChampions" aria-pressed="false">Championy</button>',
              '<button class="action toggle-action" type="button" data-config-toggle="expKillElites" aria-pressed="false">Elity</button>',
              '<button class="action toggle-action" type="button" data-config-toggle="expKillBosses" aria-pressed="false">Bossowie</button>',
            '</div>',
            '<button class="primary" data-command="exp" id="exp-button">▶ Start expiarki</button>',
          '</div>',
          '<div class="section">Respiarka</div>',
          '<div class="card">',
            '<div class="quick resp-options">',
              '<button class="action toggle-action" type="button" data-config-toggle="killRespawnedMobs" aria-pressed="false">Zabijaj zrespione moby</button>',
              '<label class="action limit-action" for="resp-limit"><span>Limit PA</span><input type="number" min="0" step="1" id="resp-limit" value="0" title="0 = bez limitu"></label>',
            '</div>',
            '<button class="secondary" data-command="respawn" id="resp-button">▶ Start respiarki</button>',
          '</div>',
        '</div>',
        '<div class="page" data-page="pvp" hidden></div>',
        '<div class="page" data-page="konto" hidden>',
          '<div class="section">Profile kont i ustawienia postaci</div>',
          '<div class="muted">Odświeżenie postaci innego konta przełączy na nie grę. Ustawienia każdej postaci są zapisywane lokalnie.</div>',
          '<div id="account-editor"></div>',
          '<button class="primary" id="save-accounts">Zapisz konta</button>',
        '</div>',
        '<div class="page" data-page="ustawienia" hidden>',
          '<div class="section">Ustawienia gry i automatyzacji</div>',
          '<div class="card">',
          boolOption("dailyReward","Dzienne nagrody"),
          boolOption("saveTuts","Zapis na turnieje"),
          boolOption("hideReports","Ukrywaj raporty"),
          boolOption("mapClickMovement","Chodzenie kliknięciem po mapie"),
          boolOption("acceleratedH","Przyspieszone H"),
          boolOption("improvedX","Ulepszony X"),
          '<button class="secondary" id="reset-config" title="Przywraca domyślne ustawienia gry i automatyzacji w rozszerzeniu.">Przywróć domyślne ustawienia</button></div>',
        '</div>',
        '<div class="page" data-page="debug" hidden>',
          '<div class="section">Konsola</div>',
          '<div class="card">',
          boolOption("debugLogs","Szczegółowe logi w konsoli"),
          '</div>',
          '<div class="section">Bieżący log automatyzacji</div>',
          '<div class="card"><div class="row"><div class="card-title">Ostatnie zdarzenia</div><span class="chip" id="log-count">0</span></div>',
          '<div class="log" id="log-box" style="margin-top:10px"><div class="muted">Łączenie z grą...</div></div>',
          '</div>',
          '<div class="section">Narzędzia diagnostyczne</div>',
          '<div class="card"><div class="card-title">Logger socketów TX/RX</div>',
          '<div class="muted" id="socket-status">Stan: nieznany</div>',
          '<button class="secondary" id="socket-toggle">Start loggera</button>',
          '<button class="secondary" id="socket-export">Eksportuj log JSON</button></div>',
          '<div class="card"><div class="card-title">Mapa portali</div>',
          '<div class="muted" id="portal-status">Rejestr portali świata.</div>',
          '<button class="secondary" id="portal-export">Eksportuj portale JSON</button>',
          '<button class="secondary" id="portal-clear">Wyczyść rejestr portali</button></div>',
        '</div>',
      '</div>',
    '</section>'
  ].join("");

  function setTab(name) {
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    $$("[data-page]").forEach(el => { el.hidden = el.dataset.page !== name; });
    state.ui.tab = name;
    persistUI();
    if (name === "debug") refreshDiagnostics();
  }
  function persistUI() {
    chrome.storage.local.set({ swDashboardUI: state.ui }).catch(() => {});
  }
  function setHidden(hidden) {
    state.ui.hidden = Boolean(hidden);
    panel.hidden = hidden;
    $("#launcher").hidden = !hidden;
    persistUI();
  }
  function minimize(value) {
    panel.classList.toggle("compact", Boolean(value));
    state.ui.minimized = Boolean(value);
    const button = $("#minimize");
    button.textContent = value ? "+" : "−";
    button.title = value ? "Rozwiń panel" : "Zwiń panel";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(!value));
    if (state.ui.position) positionPanel(state.ui.position);
    persistUI();
  }
  function resetPosition() {
    panel.style.removeProperty("top");
    panel.style.removeProperty("left");
    panel.style.right = "12px";
    panel.style.bottom = "12px";
    delete state.ui.position;
    persistUI();
  }
  function positionPanel(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    const maxX = Math.max(0, innerWidth - panel.offsetWidth);
    const maxY = Math.max(0, innerHeight - panel.offsetHeight);
    panel.style.left = Math.max(0, Math.min(maxX, position.x)) + "px";
    panel.style.top = Math.max(0, Math.min(maxY, position.y)) + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }
  function configureDrag() {
    const grip = $("#drag-handle");
    let pointer = null;
    grip.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      pointer = { id: event.pointerId, ox: event.clientX - rect.left, oy: event.clientY - rect.top };
      grip.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    grip.addEventListener("pointermove", event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      positionPanel({ x: event.clientX - pointer.ox, y: event.clientY - pointer.oy });
    });
    const finish = () => {
      if (!pointer) return;
      pointer = null;
      const rect = panel.getBoundingClientRect();
      state.ui.position = { x: Math.round(rect.left), y: Math.round(rect.top) };
      persistUI();
    };
    grip.addEventListener("pointerup", finish);
    grip.addEventListener("pointercancel", finish);
    window.addEventListener("resize", () => {
      if (state.ui.position) positionPanel(state.ui.position);
    });
  }


  const TRAINING_SKILLS = [
    [0, "Automatycznie (najwyższa)"],
    [8, "Taijutsu"], [9, "Kenjutsu"], [10, "Shurikenjutsu"], [11, "Ninjutsu"],
    [1, "Katon (ogień)"], [2, "Suiton (woda)"], [3, "Doton (ziemia)"],
    [4, "Fuuton (wiatr)"], [5, "Raiton (błyskawice)"], [6, "Genjutsu"],
    [7, "Kinjutsu"], [13, "Senjutsu"], [12, "Fuinjutsu"]
  ];
  const DEFAULT_CHARACTER_MODE = "default";
  const DEFAULT_TRAINING_UNTIL = -1; // Maksymalny czas treningu
  const trainingUntilValid = value => Number.isInteger(Number(value)) &&
    Number(value) >= 0 && Number(value) <= 23;
  const trainingUntilOptions = [
    [-1, "Maksymalny"],
    ...Array.from({ length: 24 }, (_, hour) => [
      hour, String(hour).padStart(2, "0") + ":00" +
        (hour === 0 ? " (następnego dnia)" : "")
    ])
  ];
  const skillValid = (value) => TRAINING_SKILLS.some(([id]) => id === Number(value));
  const createAccountCharacters = (login) => ({ login: String(login || "").trim(), characters: [] });

  function normalizeAccountCharacters(value, login) {
    const normalizedLogin = String(login || "").trim();
    if (!value || value.login !== normalizedLogin || !Array.isArray(value.characters)) {
      return createAccountCharacters(normalizedLogin);
    }
    const used = new Set();
    return {
      login: normalizedLogin,
      characters: value.characters.slice(0, 100).map(char => {
        const id = Number(char?.id);
        if (!Number.isSafeInteger(id) || id <= 0 || used.has(id)) return null;
        used.add(id);
        return {
          id,
          name: String(char?.name || ""),
          level: Math.max(0, Math.floor(Number(char?.level || 0))),
          afterAll: ["training", "mission"].includes(char?.afterAll) ? char.afterAll : DEFAULT_CHARACTER_MODE,
          trainingSkill: skillValid(char?.trainingSkill) ? Number(char.trainingSkill) : 0,
          trainingUntilHour: trainingUntilValid(char?.trainingUntilHour)
            ? Number(char.trainingUntilHour) : DEFAULT_TRAINING_UNTIL,
          skip: id === 51052 || char?.skip === true
        };
      }).filter(Boolean)
    };
  }

  function getActiveProfileIndex() {
    const marker = state.activeAccount;
    const index = Number(marker?.slot);
    if (!Number.isInteger(index) || index < 0 || index >= 5) return -1;
    return state.accounts[index]?.login &&
      state.accounts[index].login === marker.login ? index : -1;
  }

  function renderAccounts() {
    const slots = $("#accounts-short");
    slots.textContent = "";
    const editor = $("#account-editor");
    const expanded = new Set($$("details[data-account-section][open]")
      .map(el => Number(el.dataset.accountSection)));
    const hasPrevious = Boolean(editor.querySelector("details[data-account-section]"));
    const activeIndex = getActiveProfileIndex();
    const cards = [];
    for (let i = 0; i < 5; i++) {
      const account = state.accounts[i] || { name: "Konto " + (i + 1), login:"", password:"" };
      const cached = state.accountCharacters[i] || createAccountCharacters(account.login);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "account-slot";
      btn.dataset.switchAccount = String(i);
      btn.textContent = account.login || "ACC " + (i + 1);
      btn.title = account.login || "Pusty profil " + (i + 1);
      btn.disabled = !account.login || !account.password;
      btn.classList.toggle("current-account", i === activeIndex);
      slots.appendChild(btn);

      const characters = cached.characters || [];
      const characterCards = characters.map(char => {
        const key = i + ":" + char.id;
        const afterOptions = [
          ["default", "Domyślnie (Trening)"],
          ["training", "Trening"],
          ["mission", "Misja"]
        ].map(([value,label]) => '<option value="' + value + '"' +
          (char.afterAll === value ? " selected" : "") + '>' + label + '</option>').join("");
        const skillOptions = TRAINING_SKILLS.map(([id,label]) => '<option value="' + id + '"' +
          (char.trainingSkill === id ? " selected" : "") + '>' + label + '</option>').join("");
        const trainingUntilOptionsHtml = trainingUntilOptions.map(([hour, label]) =>
          '<option value="' + hour + '"' +
          (char.trainingUntilHour === hour ? " selected" : "") + '>' +
          label + '</option>').join("");
        const excluded = char.id === 51052 || char.skip === true;
        return '<div class="character-card' + (excluded ? ' character-skipped' : '') + '">' +
          '<div class="character-heading"><strong>' + escapeText(char.name || "#" + char.id) + '</strong>' +
          '<span>Lv. ' + char.level + ' · ID ' + char.id + '</span></div>' +
          '<label class="character-skip" title="Bot nie wybierze tej postaci przez skróty ani podczas automatyzacji całego konta">' +
          '<input type="checkbox" data-character-skip="' + key + '"' +
          (excluded ? ' checked' : '') + (char.id === 51052 ? ' disabled' : '') + '>' +
          '<span>' + (char.id === 51052 ? 'Do usunięcia — blokada stała' :
            'Pomiń postać (do usunięcia)') + '</span></label>' +
          '<label class="character-field">Po zakończeniu ALL' +
          '<select data-character-mode="' + key + '">' + afterOptions + '</select></label>' +
          '<label class="character-field">Trenuj' +
          '<select data-character-skill="' + key + '">' + skillOptions + '</select></label>' +
          '<label class="character-field" title="Trening zakończy się przed wybraną godziną. Maksymalny = najdłuższy dostępny.">' +
          'Preferuj trening do godziny' +
          '<select data-character-training-until="' + key + '">' +
          trainingUntilOptionsHtml + '</select></label>' +
          '</div>';
      }).join("");
      const expandedNow = hasPrevious ? expanded.has(i) : i === (activeIndex >= 0 ? activeIndex : 0);
      cards.push(
        '<details class="account-section" data-account-section="' + i + '"' + (expandedNow ? ' open' : '') + '>' +
        '<summary><span><strong>Konto ' + (i + 1) + '</strong> · ' +
        escapeText(account.login || "Nie skonfigurowano") +
        '</span><small>' + (i === activeIndex ? 'Aktywne · ' : '') +
        characters.length + ' postaci</small></summary>' +
        '<div class="account-content">' +
          '<div class="field">' +
            '<input type="text" autocomplete="off" placeholder="Login" data-account-login="' + i +
            '" value="' + escapeText(account.login) + '">' +
            '<input type="password" autocomplete="off" placeholder="Hasło" data-account-password="' + i +
            '" value="' + escapeText(account.password) + '">' +
          '</div>' +
          '<button class="secondary" data-refresh-slot="' + i + '" type="button">↻ Aktualizuj listę postaci</button>' +
          '<div class="muted">' + (characters.length ? "Lista z ostatniego odświeżenia." :
            "Brak listy. Aktualizacja zaloguje wybrane konto i pobierze postacie.") + '</div>' +
          '<div class="character-list">' + (characterCards ||
            '<div class="muted">Najpierw zaktualizuj listę postaci.</div>') + '</div>' +
        '</div></details>'
      );
    }
    editor.innerHTML = cards.join("");
  }

  async function saveAccountProfilesFromEditor() {
    const accounts = Array.from({ length:5 }, (_,i) => ({
      name: "Konto " + (i + 1),
      login: $('[data-account-login="' + i + '"]').value.trim(),
      password: $('[data-account-password="' + i + '"]').value
    }));
    const accountCharacters = accounts.map((account,i) =>
      normalizeAccountCharacters(state.accountCharacters[i], account.login));
    await chrome.storage.local.set({ accounts, swAccountCharacters: accountCharacters });
    state.accounts = accounts;
    state.accountCharacters = accountCharacters;
    renderAccounts();
  }

  async function ensureAccountSwitchAllowed() {
    const game = await requestPage("dashboard.state", {}, 9000);
    if (game.accountRunning || game.quickRunning || game.roninRunning ||
        game.questRunning || game.pickupRunning || game.autoQuestRunning ||
        game.expRunning || game.respawnRunning) {
      throw new Error("Zatrzymaj aktywną automatyzację przed zmianą konta.");
    }
  }

  async function saveCharacterSelection(input) {
    const raw = input.dataset.characterMode || input.dataset.characterSkill ||
      input.dataset.characterTrainingUntil || input.dataset.characterSkip;
    const match = /^([0-4]):([1-9]\d*)$/.exec(raw || "");
    if (!match) return;
    const slot = Number(match[1]);
    const id = Number(match[2]);
    const character = state.accountCharacters[slot]?.characters.find(char => char.id === id);
    if (!character) return;
    if (input.dataset.characterSkip) {
      character.skip = id === 51052 || input.checked === true;
    } else if (input.dataset.characterMode) {
      character.afterAll = ["training", "mission"].includes(input.value) ? input.value : "default";
    } else if (input.dataset.characterTrainingUntil) {
      character.trainingUntilHour = trainingUntilValid(input.value)
        ? Number(input.value) : DEFAULT_TRAINING_UNTIL;
    } else {
      character.trainingSkill = skillValid(input.value) ? Number(input.value) : 0;
    }
    // Najpierw aktualizujemy blokadę w działającym bocie.
    await applyCurrentCharacterPreferences();
    await chrome.storage.local.set({ swAccountCharacters: state.accountCharacters });
    if (input.dataset.characterSkip) renderAccounts();
    notice("Zapisano preferencje: " + (character.name || "#" + id));
  }

  async function applyCurrentCharacterPreferences() {
    const slot = getActiveProfileIndex();
    const characters = slot >= 0 ? state.accountCharacters[slot]?.characters || [] : [];
    const preferences = Object.fromEntries(characters.map(char => [
      String(char.id),
      { afterAll: char.afterAll, trainingSkill: char.trainingSkill,
        trainingUntilHour: char.trainingUntilHour,
        skip: char.id === 51052 || char.skip === true }
    ]));
    // Globalna lista pomijanych postaci obejmuje wszystkie zapisane konta.
    const allSkipped = state.accountCharacters.flatMap(profile =>
      (profile?.characters || []).filter(char => char.skip === true)
        .map(char => Number(char.id)));
    const skipIds = [...new Set([51052, ...allSkipped])];
    const signature = JSON.stringify([slot, preferences, skipIds]);
    if (signature === state.preferencesSignature) return;
    await requestPage("dashboard.preferences", { characters: preferences, skipIds });
    state.preferencesSignature = signature;
  }

  async function syncAccountCharacterList(gameState, force = false) {
    const slot = getActiveProfileIndex();
    if (slot < 0 || !gameState?.charactersFresh || !Array.isArray(gameState.characterList)) return false;
    const list = gameState.characterList;
    if (!list.length) return false;
    const account = state.accounts[slot];
    const profile = normalizeAccountCharacters(state.accountCharacters[slot], account.login);
    const previous = new Map(profile.characters.map(char => [char.id, char]));
    // Jeżeli postacie nie pokrywają się z zapisanym kontem, nie nadpisujemy
    // jego preferencji. Mogło dojść do ręcznej zmiany konta poza rozszerzeniem.
    if (previous.size > 0 && !list.some(char => previous.has(Number(char.id)))) {
      state.activeAccount = null;
      state.preferencesSignature = "";
      await chrome.storage.local.remove("swActiveAccountSlot");
      notice("Lista postaci nie pasuje do profilu. Użyj przycisku aktualizacji konta.", true);
      return false;
    }
    const next = list.map(raw => {
      const id = Number(raw.id);
      if (!Number.isSafeInteger(id) || id <= 0) return null;
      const old = previous.get(id);
      return {
        id,
        name: String(raw.name || ""),
        level: Math.max(0, Math.floor(Number(raw.level || 0))),
        afterAll: old?.afterAll || "default",
        trainingSkill: skillValid(old?.trainingSkill) ? Number(old.trainingSkill) : 0,
        trainingUntilHour: trainingUntilValid(old?.trainingUntilHour)
          ? Number(old.trainingUntilHour) : DEFAULT_TRAINING_UNTIL,
        skip: id === 51052 || old?.skip === true
      };
    }).filter(Boolean);
    if (!next.length) return false;
    if (JSON.stringify(profile.characters) !== JSON.stringify(next)) {
      state.accountCharacters[slot] = { login: account.login, characters: next };
      await chrome.storage.local.set({ swAccountCharacters: state.accountCharacters });
      renderAccounts();
      notice("Zaktualizowano listę postaci konta " + (slot + 1) + ".");
    } else if (force) {
      notice("Lista postaci konta " + (slot + 1) + " jest aktualna.");
    }
    return true;
  }

  function syncConfig() {
    $$("[data-config]").forEach(input => {
      input.checked = state.config[input.dataset.config] === true;
    });
    $$("[data-config-toggle]").forEach(button => {
      const on = state.config[button.dataset.configToggle] === true;
      button.classList.toggle("toggle-on", on);
      button.classList.toggle("toggle-off", !on);
      button.setAttribute("aria-pressed", String(on));
      button.title = on ? "Włączone — kliknij, by wyłączyć" : "Wyłączone — kliknij, by włączyć";
    });
  }
  function changeConfig(key, value) {
    state.config = { ...state.config, [key]: value };
    syncConfig();
    const snapshot = { ...state.config };
    configQueue = configQueue.catch(() => {}).then(async () => {
      await sendBackground("config.set", { config: snapshot });
      await requestPage("config.apply", { config: snapshot });
      notice("Zapisano ustawienie: " + key + ".");
    }).catch(async (error) => {
      try {
        const latest = await chrome.storage.local.get("config");
        state.config = { ...DEFAULTS, ...(latest.config || {}) };
        syncConfig();
      } catch (_) {}
      notice(error.message, true);
    });
    return configQueue;
  }

  function renderGame(s) {
    state.game = s;
    const active = Number(s.characterId || 0) > 0;
    const busy = Boolean(s.accountRunning || s.quickRunning || s.questRunning ||
      s.roninRunning || s.expRunning || s.respawnRunning || s.pickupRunning ||
      s.autoQuestRunning);
    const taskStatus = $("#task-status");
    taskStatus.textContent = busy ? String(s.automationLabel || "Pracuje") : "Gotowy";
    taskStatus.classList.toggle("state-ready", !busy);
    taskStatus.classList.toggle("state-running", busy);
    taskStatus.title = busy ? String(s.latestLog || taskStatus.textContent) : "Brak aktywnej automatyzacji";
    $("#exp-button").textContent = s.expRunning ? "■ Zatrzymaj expiarkę" : "▶ Start expiarki";
    $("#resp-button").textContent = s.respawnRunning ? "■ Zatrzymaj respiarkę" : "▶ Start respiarki";
    $("#pickup-button").innerHTML = s.pickupRunning ?
      "<strong>■</strong>Stop Pickup" : "<strong>▤</strong>Pickup Quest";
    $("#pickup-button").disabled = !active || s.autoQuestRunning || (busy && !s.pickupRunning);
    const autoQuestButton = $("#auto-quest-button");
    autoQuestButton.textContent = s.autoQuestRunning ? "■ Stop Auto Quest" : "▶ Start Auto Quest";
    autoQuestButton.classList.toggle("auto-quest-stop", Boolean(s.autoQuestRunning));
    autoQuestButton.disabled = !s.autoQuestRunning && (!active || busy);
    autoQuestButton.setAttribute("aria-pressed", s.autoQuestRunning ? "true" : "false");
    $("#auto-quest-status").textContent = s.autoQuestStatus ||
      "Gotowy do analizy questa na bieżącym polu.";
    $$("[data-quick],[data-account-action]").forEach(btn => {
      btn.disabled = !active || busy;
    });
    $$('[data-command="quest"]').forEach(btn => {
      btn.disabled = !active || busy;
    });
    $("#exp-button").disabled = !active || (busy && !s.expRunning) || s.respawnRunning;
    $("#resp-button").disabled = !active || (busy && !s.respawnRunning) || s.expRunning;
    renderLogs(s);
  }

  async function refreshGame() {
    if (polling || document.hidden) return;
    polling = true;
    try {
      const result = await requestPage("dashboard.state", {}, 9000);
      await syncAccountCharacterList(result);
      await applyCurrentCharacterPreferences();
      renderGame(result);
      if (state.loading) {
        state.loading = false;
        notice("Połączono z grą. Panel gotowy.");
      }
    } catch (error) {
      if (state.loading) notice("Oczekiwanie na klienta gry...", true);
    } finally { polling = false; }
  }

  async function refreshDiagnostics() {
    try {
      const result = await requestPage("socketCapture.state");
      $("#socket-status").textContent = (result.active ? "Logger aktywny" : "Logger wyłączony") +
        " · zdarzenia: " + Number(result.entries || 0);
      $("#socket-toggle").textContent = result.active ? "■ Stop loggera" : "▶ Start loggera";
      $("#socket-toggle").dataset.active = result.active ? "1" : "0";
    } catch (error) {
      $("#socket-status").textContent = error.message;
    }
  }

  function downloadJSON(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type:"application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bind() {
    shadow.addEventListener("click", async event => {
      // Kliknięcie ikony pomocy ma pokazywać tooltip, a nie zmieniać checkbox.
      if (event.target.closest(".option-help")) {
        event.preventDefault();
        return;
      }
      const btn = event.target.closest("button");
      if (!btn) return;
      if (btn.dataset.tab) return setTab(btn.dataset.tab);
      if (btn.dataset.jump) return setTab(btn.dataset.jump);
      if (btn.id === "minimize") return minimize(!state.ui.minimized);
      if (btn.id === "close") return setHidden(true);
      if (btn.id === "launcher") return setHidden(false);
      if (btn.id === "restore-position") return resetPosition();
      if (btn.dataset.configToggle) {
        const key = btn.dataset.configToggle;
        await changeConfig(key, state.config[key] !== true);
        return;
      }
      if (btn.id === "save-accounts") {
        try {
          await saveAccountProfilesFromEditor();
          await applyCurrentCharacterPreferences();
          notice("Zapisano profile kont.");
        } catch (error) { notice(error.message, true); }
        return;
      }
      if (btn.dataset.refreshSlot !== undefined) {
        const slot = Number(btn.dataset.refreshSlot);
        try {
          await saveAccountProfilesFromEditor();
          const account = state.accounts[slot];
          if (!account?.login || !account?.password) {
            throw new Error("Najpierw wypełnij login i hasło konta.");
          }
          notice("Pobieranie listy postaci konta " + (slot + 1) + "...");
          if (getActiveProfileIndex() !== slot) {
            await ensureAccountSwitchAllowed();
            await sendBackground("account.switch", { slot });
            // Nowe wejście do gry automatycznie zapisze listę postaci.
          } else {
            await requestPage("dashboard.characters.refresh", {}, 19000);
            const current = await requestPage("dashboard.state", {}, 9000);
            if (!await syncAccountCharacterList(current, true)) {
              throw new Error("Serwer nie potwierdził listy postaci.");
            }
            await applyCurrentCharacterPreferences();
          }
        } catch (error) { notice(error.message, true); }
        return;
      }
      if (btn.dataset.switchAccount !== undefined) {
        const slot = Number(btn.dataset.switchAccount);
        try {
          await saveAccountProfilesFromEditor();
          await ensureAccountSwitchAllowed();
          notice("Przełączanie konta...");
          btn.disabled = true;
          await sendBackground("account.switch", { slot });
          notice("Przełączenie konta uruchomione.");
        } catch (error) { notice(error.message, true); btn.disabled = false; }
        return;
      }
      if (btn.id === "reset-config") {
        if (!window.confirm("Przywrócić domyślne ustawienia SW Tool?")) return;
        try {
          const result = await sendBackground("config.set", { config: DEFAULTS });
          state.config = result.config || { ...DEFAULTS };
          await requestPage("config.apply", { config: state.config });
          syncConfig();
          notice("Przywrócono ustawienia domyślne.");
        } catch (error) { notice(error.message, true); }
        return;
      }
      try {
        let result;
        if (btn.dataset.quick) result = await requestPage("dashboard.command", { kind:"quick", action:btn.dataset.quick });
        else if (btn.dataset.command) result = await requestPage("dashboard.command", {
          kind:"pve", action:btn.dataset.command, respawnLimit:Number($("#resp-limit").value || 0)
        });
        else if (btn.dataset.accountAction) result = await requestPage("dashboard.command", {
          kind:"account", action:btn.dataset.accountAction
        });
        else if (btn.id === "socket-toggle") {
          result = await requestPage($("#socket-toggle").dataset.active === "1" ? "socketCapture.stop" : "socketCapture.start");
          await refreshDiagnostics();
        } else if (btn.id === "socket-export") {
          result = await requestPage("socketCapture.export");
          downloadJSON("sw-tool-socket-" + new Date().toISOString().replace(/[:.]/g,"-") + ".json", result.entries || []);
          notice("Wyeksportowano log socketów.");
          return;
        } else if (btn.id === "portal-export") {
          result = await requestPage("portalMap.get");
          downloadJSON("sw-tool-portals-" + new Date().toISOString().replace(/[:.]/g,"-") + ".json", result.portalMap || {});
          notice("Wyeksportowano mapę portali.");
          return;
        } else if (btn.id === "portal-clear") {
          if (!window.confirm("Na pewno usunąć zapisaną mapę portali?")) return;
          await requestPage("portalMap.clear");
          notice("Wyczyszczono mapę portali.");
          return;
        } else return;
        if (btn.dataset.command === "autoQuest") {
          notice(result?.stopping ? "Zatrzymuję Auto Quest..." : "Uruchomiono Auto Quest.");
        } else {
          notice(result && result.started ? "Uruchomiono operację." : "Polecenie wykonane.");
        }
        refreshGame();
      } catch (error) { notice(error.message, true); }
    });
    shadow.addEventListener("change", async event => {
      const input = event.target;
      if (input.dataset.characterMode || input.dataset.characterSkill ||
          input.dataset.characterTrainingUntil || input.dataset.characterSkip) {
        try { await saveCharacterSelection(input); }
        catch (error) { notice("Nie udało się zapisać preferencji: " + error.message, true); }
        return;
      }
      if (input.dataset.config) await changeConfig(input.dataset.config, input.checked);
      if (input.id === "resp-limit")
        input.value = String(Math.max(0, Math.floor(Number(input.value) || 0)));
    });
    // Zapobiega skrótom gry podczas pisania w polach panelu.
    shadow.addEventListener("keydown", e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement ||
          e.target instanceof HTMLTextAreaElement) e.stopPropagation();
    });
    configureDrag();
  }

  async function init() {
    await new Promise(resolve => {
      if (document.body) resolve();
      else document.addEventListener("DOMContentLoaded", resolve, { once:true });
    });
    const stored = await chrome.storage.local.get(["config", "accounts", "swDashboardUI",
      "swAccountSwitchStatus", "swAccountCharacters", "swActiveAccountSlot"]);
    Object.keys(DEFAULTS).forEach(key => {
      state.config[key] = typeof stored.config?.[key] === "boolean" ? stored.config[key] : DEFAULTS[key];
    });
    state.accounts = Array.from({ length:5 }, (_,i) => ({
      name:"Konto "+(i+1),
      login: typeof stored.accounts?.[i]?.login === "string" ? stored.accounts[i].login : "",
      password: typeof stored.accounts?.[i]?.password === "string" ? stored.accounts[i].password : ""
    }));
    state.accountCharacters = state.accounts.map((account,i) =>
      normalizeAccountCharacters(stored.swAccountCharacters?.[i], account.login));
    state.activeAccount = stored.swActiveAccountSlot || null;
    state.ui = stored.swDashboardUI || {};
    // Migracja zapisanej zakładki z poprzedniej wersji dashboardu.
    if (state.ui.tab === "automaty") state.ui.tab = "pve";
    // Stary przełącznik szerokiego widoku nie jest już używany.
    delete state.ui.dense;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483100;pointer-events:none;";
    shadow = host.attachShadow({ mode:"open" });
    const style = document.createElement("style");
    const response = await fetch(chrome.runtime.getURL("css/dashboard.css"));
    if (!response.ok) throw new Error("Brak stylów dashboardu.");
    style.textContent = await response.text();
    shadow.appendChild(style);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    while (wrapper.firstChild) shadow.appendChild(wrapper.firstChild);
    document.body.appendChild(host);
    panel = $("#panel");
    $("#logo-icon").src = chrome.runtime.getURL("images/icon_48x48.png");
    setTab(["pulpit","pve","pvp","konto","ustawienia","debug"].includes(state.ui.tab) ? state.ui.tab : "pulpit");
    renderAccounts();
    syncConfig();
    bind();
    if (state.ui.position) positionPanel(state.ui.position);
    minimize(state.ui.minimized === true);
    setHidden(state.ui.hidden === true);
    state.loading = true;
    await refreshGame();
    const switchStatus = stored.swAccountSwitchStatus;
    if (switchStatus && Date.now() - Number(switchStatus.at || 0) < 180000) {
      if (switchStatus.state === "failed") {
        notice(String(switchStatus.error || "Przełączanie konta nie powiodło się."), true);
      } else if (switchStatus.state === "started") {
        notice("Wykonano logowanie i rozpoczęto przejście na S1.");
      }
    }
    if (switchStatus) {
      chrome.storage.local.remove("swAccountSwitchStatus").catch(() => {});
    }
    timer = setInterval(refreshGame, 1800);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.config?.newValue) {
        Object.keys(DEFAULTS).forEach(key => {
          const v = changes.config.newValue[key];
          if (typeof v === "boolean") state.config[key] = v;
        });
        syncConfig();
      }
    });
  }
  init().catch(error => {
    console.error("[SW Tool][DASHBOARD] Inicjalizacja:", error);
    if (host) host.remove();
  });
})();
