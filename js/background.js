const DEFAULT_CONFIG = Object.freeze({
  dailyReward: true,
  saveTuts: true,
  hideReports: false,
  mapClickMovement: true,
  acceleratedH: false,
  improvedX: false,
  killRespawnedMobs: false,
  expKillChampions: false,
  expKillElites: false,
  expKillBosses: false,
  debugLogs: false,
  preferTraining: true
});

const ACCOUNT_LIMIT = 5;
const GAME_URL = /^https:\/\/([^.]+\.)?shinobiworld\.pl\//i;

let debugLogsEnabled = false;

function toolConsole(level, ...args) {
  if (!debugLogsEnabled) {
    return;
  }

  const method = globalThis.console?.[level];
  if (typeof method === "function") {
    method.apply(globalThis.console, args);
  }
}

chrome.storage.local.get("config")
  .then((stored) => {
    debugLogsEnabled = normalizeConfig(stored?.config).debugLogs === true;
  })
  .catch(() => {});

function normalizeConfig(config) {
  const source = config && typeof config === "object" ? config : {};
  const normalized = {};

  Object.keys(DEFAULT_CONFIG).forEach((key) => {
    normalized[key] = typeof source[key] === "boolean"
      ? source[key]
      : DEFAULT_CONFIG[key];
  });

  return normalized;
}

function normalizeAccounts(accounts) {
  return Array.from({ length: ACCOUNT_LIMIT }, (_, index) => {
    const source = Array.isArray(accounts) ? accounts[index] : null;

    return {
      name: typeof source?.name === "string" && source.name.trim()
        ? source.name.trim()
        : "Konto " + (index + 1),
      login: typeof source?.login === "string" ? source.login : "",
      password: typeof source?.password === "string" ? source.password : ""
    };
  });
}

async function getStoredConfig() {
  const stored = await chrome.storage.local.get("config");
  const config = normalizeConfig(stored.config);
  debugLogsEnabled = config.debugLogs === true;

  return {
    config,
    persisted: Boolean(stored.config && typeof stored.config === "object")
  };
}

async function setStoredConfig(config) {
  const normalized = normalizeConfig(config);
  debugLogsEnabled = normalized.debugLogs === true;
  await chrome.storage.local.set({ config: normalized });
  return normalized;
}

async function getStoredAccounts() {
  const stored = await chrome.storage.local.get("accounts");
  return normalizeAccounts(stored.accounts);
}

function isTrustedAuthUrl(value) {
  try {
    const url = new URL(String(value || ""));

    return (
      url.protocol === "https:" &&
      (
        url.hostname === "shinobiworld.pl" ||
        url.hostname.endsWith(".shinobiworld.pl")
      )
    );
  } catch {
    return false;
  }
}

// W Chrome żądania z service workera mogą pracować w innym kontekście
// cookies niż sesja otwarta w grze. Przełączanie kont wykonujemy więc
// z pierwszoplanowej strony logowania, w izolowanym świecie rozszerzenia.
let accountSwitchInProgress = false;

function navigateTabToAuthPage(tabId, url, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const expectedOrigin = new URL(url).origin;
    let finished = false;
    let timeoutId;

    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timeoutId);
    };
    const settle = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const matchesOrigin = (tab) => {
      try { return new URL(tab?.url || "").origin === expectedOrigin; }
      catch { return false; }
    };
    const onUpdated = (id, change, tab) => {
      if (id === tabId && change.status === "complete" && matchesOrigin(tab)) {
        settle();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    timeoutId = setTimeout(() => {
      settle(new Error("Strona logowania nie załadowała się w wymaganym czasie."));
    }, timeoutMs);

    chrome.tabs.update(tabId, { url }).then(() =>
      chrome.tabs.get(tabId).then((tab) => {
        if (tab.status === "complete" && matchesOrigin(tab)) settle();
      }, settle)
    ).catch(settle);
  });
}

// Funkcja wykonywana przez chrome.scripting w ISOLATED world na
// https://shinobiworld.pl. Credentials pozostają poza kontekstem strony.
async function authenticateOnShinobiWorld(account) {
  if (location.origin !== "https://shinobiworld.pl") {
    return { ok: false, error: "Niewłaściwa strona logowania." };
  }

  const post = async (payload, stage) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/main_page_ajax", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Nieprawidłowy JSON.");
      }
      const e = Number(data.e || 0);
      if (Number.isFinite(e) && e > 0) {
        throw new Error("Kod odpowiedzi serwera: " + e);
      }
      return data;
    } catch (err) {
      const message = err?.name === "AbortError"
        ? "Przekroczono czas odpowiedzi serwera."
        : err instanceof Error ? err.message : String(err);
      throw new Error(stage + ": " + message);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    await post({ c: 5 }, "Wylogowanie");
    const login = await post({
      c: 4,
      f: {
        login: account.login,
        pass: account.password,
        memory: false,
        nick: account.login
      }
    }, "Logowanie");

    if (login.n === true) throw new Error("Logowanie: konto wymaga aktywacji.");
    const pid = Number(login.pid || 0);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new Error("Logowanie: brak prawidłowego PID.");
    }

    const server = await post({ c: 8, s: 1, f: false }, "Wybór serwera S1");
    if (!server.d) throw new Error("Wybór serwera: brak potwierdzenia.");
    return { ok: true, pid, url: String(server.url || "") };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

async function switchAccountViaApi(account, tabId, slot) {
  if (accountSwitchInProgress) {
    throw new Error("Przełączanie konta już trwa.");
  }
  accountSwitchInProgress = true;
  let originalUrl = "";

  try {
    const savedTab = await chrome.tabs.get(tabId);
    originalUrl = savedTab.url || "";
    // Po rozpoczęciu logowania poprzedni profil nie jest już pewnym
    // źródłem tożsamości, więc nie przypisujemy do niego cudzych postaci.
    await chrome.storage.local.remove("swActiveAccountSlot");
    // Główna domena jest źródłem /main_page_ajax. Zapewnia to
    // wysyłanie i zapisywanie ciasteczek w kontekście właściwej witryny.
    await navigateTabToAuthPage(tabId, "https://shinobiworld.pl/");
    toolConsole("info", "[SW Tool][AUTH] Strona logowania gotowa.");

    const frames = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: authenticateOnShinobiWorld,
      args: [{ login: account.login, password: account.password }]
    });
    const auth = frames?.[0]?.result;
    if (!auth || auth.ok !== true) {
      throw new Error(auth?.error || "Brak wyniku uwierzytelniania.");
    }

    const authUrl = String(auth.url || "").trim();
    if (!isTrustedAuthUrl(authUrl) || new URL(authUrl).hostname !== "s1.shinobiworld.pl") {
      throw new Error("Serwer zwrócił nieprawidłowy adres wejścia na S1.");
    }
    toolConsole("info", "[SW Tool][AUTH] Autoryzacja OK; wejście na S1.");

    await chrome.storage.local.set({
      swActiveAccountSlot: { slot, login: account.login, at: Date.now() },
      swAccountSwitchStatus: { state: "started", at: Date.now() }
    });
    await chrome.tabs.update(tabId, { url: authUrl });
    return { started: true, server: 1, pid: auth.pid };
  } catch (error) {
    // Przy błędzie nie zostawiaj użytkownika bez informacji na pustym ekranie
    // logowania; wróć do gry, gdzie dashboard może pokazać komunikat.
    try {
      const tab = await chrome.tabs.get(tabId);
      if (new URL(tab.url || "").hostname === "shinobiworld.pl" && originalUrl) {
        await chrome.tabs.update(tabId, { url: originalUrl });
      }
    } catch (_) { /* Strona może być już zamknięta. */ }

    const detail = error instanceof Error ? error.message : String(error);
    const failure = "Zmiana konta nie powiodła się: " + detail;
    await chrome.storage.local.set({
      swAccountSwitchStatus: { state: "failed", error: failure, at: Date.now() }
    }).catch(() => {});
    throw new Error(failure);
  } finally {
    accountSwitchInProgress = false;
  }
}

async function getActiveGameTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab || !tab.id || !GAME_URL.test(tab.url || "")) {
    throw new Error("Aktywna karta nie jest kartą ShinobiWorld.");
  }

  return tab;
}

async function sendToActiveGameTab(message, optional) {
  try {
    const tab = await getActiveGameTab();
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    if (optional) {
      return null;
    }
    throw error;
  }
}


async function handleMessage(msg, sender) {
  switch (msg.command) {
    case "config.get": {
      const stored = await getStoredConfig();
      return { ok: true, data: stored };
    }

    case "config.set": {
      const config = await setStoredConfig(msg.config);

      let appliedToPage = false;
      if (msg.source === "popup") {
        const pageResponse = await sendToActiveGameTab({
          source: "background",
          command: "config.apply",
          config
        }, true);

        appliedToPage = Boolean(pageResponse && pageResponse.ok);
      }

      return {
        ok: true,
        data: { config, appliedToPage }
      };
    }

    case "config.reset": {
      const config = await setStoredConfig(DEFAULT_CONFIG);
      const pageResponse = await sendToActiveGameTab({
        source: "background",
        command: "config.apply",
        config
      }, true);

      return {
        ok: true,
        data: {
          config,
          appliedToPage: Boolean(pageResponse && pageResponse.ok)
        }
      };
    }

    case "action.run": {
      const response = await sendToActiveGameTab({
        source: "background",
        command: "action.run",
        action: msg.action,
        payload: msg.payload || {}
      });

      if (!response || response.ok !== true) {
        throw new Error(
          response?.error || "Brak poprawnej odpowiedzi strony."
        );
      }

      return { ok: true, data: response.data || {} };
    }

    case "debug.portalMap.get":
    case "debug.portalMap.clear":
    case "debug.socketCapture.start":
    case "debug.socketCapture.stop":
    case "debug.socketCapture.state":
    case "debug.socketCapture.export": {
      const response = await sendToActiveGameTab({
        source: "background",
        command: msg.command
      });

      if (!response || response.ok !== true) {
        throw new Error(
          response?.error || "Brak poprawnej odpowiedzi strony."
        );
      }

      return { ok: true, data: response.data || {} };
    }

    case "account.switch": {
      const slot = Number(msg.slot);

      if (!Number.isInteger(slot) || slot < 0 || slot >= ACCOUNT_LIMIT) {
        throw new Error("Nieprawidłowy profil konta.");
      }

      const accounts = await getStoredAccounts();
      const account = accounts[slot];

      if (!account.login || !account.password) {
        throw new Error("Uzupełnij login i hasło dla wybranego profilu.");
      }

      // Panel na grze zawsze przełącza własną kartę, nie przypadkową aktywną.
      const tab = msg.source === "dashboard" && sender.tab?.id
        ? sender.tab
        : await getActiveGameTab();
      if (!GAME_URL.test(tab.url || sender.url || "")) {
        throw new Error("Można przełączać tylko kartę ShinobiWorld.");
      }

      const result = await switchAccountViaApi(account, tab.id, slot);

      return {
        ok: true,
        data: {
          ...result,
          slot
        }
      };
    }

    default:
      throw new Error("Nieznane polecenie: " + String(msg.command));
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !["popup", "contentScript", "dashboard"].includes(msg.source)) {
    return false;
  }

  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((error) => {
      toolConsole("error", "[SW Tool][BG]", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});
