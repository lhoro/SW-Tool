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
  const state = { config: { ...DEFAULTS }, accounts: [], ui: {}, lastLog: "", uiLogs: [], game: null, loading: false };
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
    state.uiLogs.push({
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
  const boolOption = (key, text) =>
    '<label class="option"><span>' + text + '</span><input type="checkbox" data-config="' + key + '"></label>';

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
        '<button class="tab" data-tab="konto">Konto</button>',
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
          '<div class="quick">',
            '<button class="action" data-account-action="accountArenaPvp"><strong>⚔</strong>Arena</button>',
            '<button class="action" data-account-action="accountSoulAbyss"><strong>◈</strong>Otchłań</button>',
            '<button class="action" data-account-action="accountRonin"><strong>✦</strong>Ronin</button>',
            '<button class="action" data-account-action="accountTrainings"><strong>⚡</strong>Treningi</button>',
            '<button class="action" data-account-action="accountMissions"><strong>▤</strong>Misje</button>',
            '<button class="action" data-account-action="accountAll"><strong>★</strong>ALL</button>',
            '<button class="action" data-account-action="accountTournaments"><strong>♛</strong>Turnieje</button>',
          '</div>',
          '<div class="card">',
            boolOption("preferTraining","Po ALL preferuj trening (zamiast misji)"),
          '</div>',
        '</div>',
        '<div class="page" data-page="pve" hidden>',
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
          '<div class="section">Quest Kille</div>',
          '<div class="card">',
            '<button class="secondary" data-command="quest">▶ Uruchom Quest Kille</button>',
          '</div>',
        '</div>',
        '<div class="page" data-page="pvp" hidden>',
          '<div class="section">Walka PVP</div>',
          '<div class="card feature">',
            '<div class="card-title">⚔ Arena PvP</div>',
            '<div class="muted">Wykonaj dostępne walki arenowe na bieżącej postaci.</div>',
            '<button class="primary" data-quick="arena">▶ Arena PvP · ta postać</button>',
            '<button class="secondary" data-account-action="accountArenaPvp">Arena PvP · całe konto</button>',
          '</div>',
        '</div>',
        '<div class="page" data-page="konto" hidden>',
          '<div class="section">Zapisane konta (maks. 5)</div>',
          '<div class="card"><div class="muted">Login i hasło są zapisane lokalnie przez rozszerzenie. Zmień je tutaj, bez popupu.</div>',
          '<div id="account-editor"></div>',
          '<button class="primary" id="save-accounts">Zapisz profile kont</button></div>',
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
          '<button class="secondary" id="reset-config">Przywróć domyślne ustawienia</button>',
          '<button class="secondary" id="reset-position">Reset pozycji dashboardu</button></div>',
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

  function renderAccounts() {
    const slots = $("#accounts-short");
    slots.textContent = "";
    const editor = $("#account-editor");
    editor.textContent = "";
    for (let i = 0; i < 5; i++) {
      const account = state.accounts[i] || { name: "Konto " + (i + 1), login:"", password:"" };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "account-slot";
      btn.dataset.switchAccount = String(i);
      btn.textContent = account.login || "ACC " + (i + 1);
      btn.title = account.login || "Pusty profil " + (i + 1);
      btn.disabled = !account.login || !account.password;
      slots.appendChild(btn);
      const row = document.createElement("div");
      row.className = "account-edit";
      const label = document.createElement("div");
      label.className = "account-label";
      label.textContent = "Konto " + (i + 1);
      const fields = document.createElement("div");
      fields.className = "field";
      const login = document.createElement("input");
      login.type = "text"; login.autocomplete = "off"; login.spellcheck = false;
      login.placeholder = "Login"; login.value = account.login;
      login.dataset.accountLogin = String(i);
      const password = document.createElement("input");
      password.type = "password"; password.autocomplete = "off";
      password.placeholder = "Hasło"; password.value = account.password;
      password.dataset.accountPassword = String(i);
      fields.append(login, password);
      row.append(label, fields);
      editor.appendChild(row);
    }
  }

  function syncConfig() {
    $("[data-config]").forEach(input => {
      input.checked = state.config[input.dataset.config] === true;
    });
    $("[data-config-toggle]").forEach(button => {
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
      s.roninRunning || s.expRunning || s.respawnRunning);
    const taskStatus = $("#task-status");
    taskStatus.textContent = busy ? String(s.automationLabel || "Pracuje") : "Gotowy";
    taskStatus.classList.toggle("state-ready", !busy);
    taskStatus.classList.toggle("state-running", busy);
    taskStatus.title = busy ? String(s.latestLog || taskStatus.textContent) : "Brak aktywnej automatyzacji";
    $("#exp-button").textContent = s.expRunning ? "■ Zatrzymaj expiarkę" : "▶ Start expiarki";
    $("#resp-button").textContent = s.respawnRunning ? "■ Zatrzymaj respiarkę" : "▶ Start respiarki";
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
      const btn = event.target.closest("button");
      if (!btn) return;
      if (btn.dataset.tab) return setTab(btn.dataset.tab);
      if (btn.dataset.jump) return setTab(btn.dataset.jump);
      if (btn.id === "minimize") return minimize(!state.ui.minimized);
      if (btn.id === "close") return setHidden(true);
      if (btn.id === "launcher") return setHidden(false);
      if (btn.id === "restore-position" || btn.id === "reset-position") return resetPosition();
      if (btn.dataset.configToggle) {
        const key = btn.dataset.configToggle;
        await changeConfig(key, state.config[key] !== true);
        return;
      }
      if (btn.id === "save-accounts") {
        const accounts = [];
        for (let i = 0; i < 5; i++) {
          accounts.push({
            name: "Konto " + (i + 1),
            login: $('[data-account-login="' + i + '"]').value.trim(),
            password: $('[data-account-password="' + i + '"]').value
          });
        }
        try {
          await chrome.storage.local.set({ accounts });
          state.accounts = accounts;
          renderAccounts();
          notice("Zapisano pięć profili kont.");
        } catch (error) { notice(error.message, true); }
        return;
      }
      if (btn.dataset.switchAccount !== undefined) {
        const slot = Number(btn.dataset.switchAccount);
        try {
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
        notice(result && result.started ? "Uruchomiono operację." : "Polecenie wykonane.");
        refreshGame();
      } catch (error) { notice(error.message, true); }
    });
    shadow.addEventListener("change", async event => {
      const input = event.target;
      if (input.dataset.config) await changeConfig(input.dataset.config, input.checked);
      if (input.id === "resp-limit")
        input.value = String(Math.max(0, Math.floor(Number(input.value) || 0)));
    });
    // Zapobiega skrótom gry podczas pisania w polach panelu.
    shadow.addEventListener("keydown", e => {
      if (e.target instanceof HTMLInputElement) e.stopPropagation();
    });
    configureDrag();
  }

  async function init() {
    await new Promise(resolve => {
      if (document.body) resolve();
      else document.addEventListener("DOMContentLoaded", resolve, { once:true });
    });
    const stored = await chrome.storage.local.get(["config", "accounts", "swDashboardUI", "swAccountSwitchStatus"]);
    Object.keys(DEFAULTS).forEach(key => {
      state.config[key] = typeof stored.config?.[key] === "boolean" ? stored.config[key] : DEFAULTS[key];
    });
    state.accounts = Array.from({ length:5 }, (_,i) => ({
      name:"Konto "+(i+1),
      login: typeof stored.accounts?.[i]?.login === "string" ? stored.accounts[i].login : "",
      password: typeof stored.accounts?.[i]?.password === "string" ? stored.accounts[i].password : ""
    }));
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
