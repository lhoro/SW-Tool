const DEFAULT_CONFIG = Object.freeze({
  dailyReward: true,
  saveTuts: true,
  hideReports: false
});

const ACCOUNT_LIMIT = 5;
const GAME_URL = /^https:\/\/([^.]+\.)?shinobiworld\.pl\//i;

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
  return {
    config: normalizeConfig(stored.config),
    persisted: Boolean(stored.config && typeof stored.config === "object")
  };
}

async function setStoredConfig(config) {
  const normalized = normalizeConfig(config);
  await chrome.storage.local.set({ config: normalized });
  return normalized;
}

async function getStoredAccounts() {
  const stored = await chrome.storage.local.get("accounts");
  return normalizeAccounts(stored.accounts);
}

async function authPost(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("https://shinobiworld.pl/main_page_ajax", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("Żądanie autoryzacji HTTP " + response.status + ".");
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Serwer zwrócił nieprawidłową odpowiedź JSON.");
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Serwer zwrócił nieprawidłową odpowiedź autoryzacji.");
    }

    const errorCode = Number(data.e || 0);
    if (Number.isFinite(errorCode) && errorCode > 0) {
      throw new Error("Kod błędu serwera: " + errorCode + ".");
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Przekroczono czas oczekiwania na serwer.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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

async function switchAccountViaApi(account, tabId) {
  console.info("[SW Tool][AUTH] Wylogowanie konta przez API.");

  const logout = await authPost({ c: 5 });

  if (!Object.prototype.hasOwnProperty.call(logout, "e")) {
    throw new Error("Serwer nie potwierdził wylogowania.");
  }

  console.info("[SW Tool][AUTH] Logowanie wybranego profilu przez API.");

  const login = await authPost({
    c: 4,
    f: {
      login: account.login,
      pass: account.password,
      memory: false,
      nick: account.login
    }
  });

  if (login.n === true) {
    throw new Error("Konto wymaga dodatkowego kroku aktywacji.");
  }

  const pid = Number(login.pid || 0);
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error("Serwer nie zwrócił prawidłowego PID.");
  }

  console.info("[SW Tool][AUTH] Wybór serwera 1 przez API.");

  const server = await authPost({
    c: 8,
    s: 1,
    f: false
  });

  const confirmation = server.d;
  if (
    confirmation === null ||
    confirmation === undefined ||
    confirmation === false ||
    confirmation === 0 ||
    confirmation === ""
  ) {
    throw new Error("Serwer nie potwierdził wyboru serwera 1.");
  }

  const authUrl = String(server.url || "").trim();

  if (!isTrustedAuthUrl(authUrl)) {
    throw new Error("Serwer nie zwrócił poprawnego adresu wejścia.");
  }

  const parsed = new URL(authUrl);
  if (parsed.hostname !== "s1.shinobiworld.pl") {
    throw new Error("Serwer zwrócił adres inny niż S1.");
  }

  console.info("[SW Tool][AUTH] Przejście na S1. Oczekiwanie na listę postaci.");

  await chrome.tabs.update(tabId, { url: authUrl });

  return {
    started: true,
    server: 1,
    pid
  };
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
    case "debug.portalMap.clear": {
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

      const tab = await getActiveGameTab();

      const result = await switchAccountViaApi(account, tab.id);

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
  if (!msg || !["popup", "contentScript"].includes(msg.source)) {
    return false;
  }

  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error("[SW Tool][BG]", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});
