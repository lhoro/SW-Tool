const SW_TOOL_CHANNEL = "SW_TOOL_BRIDGE_V1";
const BRIDGE_TIMEOUT = 5000;

const hostname = window.location.hostname.toLowerCase();
const isGameServerHost =
  hostname.endsWith(".shinobiworld.pl") &&
  hostname !== "www.shinobiworld.pl";

const PAGE_SCRIPTS = isGameServerHost
  ? [
      { path: "js/contentScripts/menageCSS.js" },
      { path: "js/contentScripts/menageStorage.js" },
      { path: "js/contentScripts/mapSolver.js", optional: true },
      { path: "js/contentScripts/main.js" }
    ]
  : [];

// oldBot.js zostaje w repo jako referencja starej implementacji.
// Nie uruchamiamy go automatycznie na dev.

function injectScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(path);
    script.async = false;

    script.onload = () => {
      script.remove();
      resolve();
    };

    script.onerror = () => {
      script.remove();
      reject(new Error("Nie udało się wstrzyknąć: " + path));
    };

    (document.head || document.documentElement).appendChild(script);
  });
}

async function injectPageScripts() {
  for (const entry of PAGE_SCRIPTS) {
    try {
      await injectScript(entry.path);
    } catch (error) {
      if (!entry.optional) {
        throw error;
      }

      console.warn(
        "[SW Tool][CONTENT] Opcjonalny moduł nie został wstrzyknięty:",
        entry.path,
        error
      );
    }
  }
}

function createRequestId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function bridgeRequest(action, payload) {
  const requestId = createRequestId();

  return new Promise((resolve, reject) => {
    let timeoutId;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timeoutId);
    };

    const onMessage = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const data = event.data;
      if (
        !data ||
        data.channel !== SW_TOOL_CHANNEL ||
        data.direction !== "page-to-extension" ||
        data.requestId !== requestId
      ) {
        return;
      }

      cleanup();

      if (data.ok) {
        resolve(data.payload || {});
      } else {
        reject(new Error(data.error || "Błąd komunikacji ze stroną."));
      }
    };

    window.addEventListener("message", onMessage);

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout bridge dla akcji: " + action));
    }, BRIDGE_TIMEOUT);

    window.postMessage({
      channel: SW_TOOL_CHANNEL,
      direction: "extension-to-page",
      requestId,
      action,
      payload: payload || {}
    }, window.location.origin);
  });
}

function runtimeRequest(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response || response.ok !== true) {
        reject(new Error(response?.error || "Brak odpowiedzi rozszerzenia."));
        return;
      }

      resolve(response.data || {});
    });
  });
}

function readLegacyConfig() {
  try {
    const raw = localStorage.getItem("config");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("[SW Tool][CONTENT] Nie udało się odczytać starej konfiguracji.", error);
    return null;
  }
}

const pageReady = injectPageScripts();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.source !== "background") {
    return false;
  }

  (async () => {
    await pageReady;

    if (msg.command === "config.apply") {
      if (!isGameServerHost) {
        return {
          ok: true,
          data: { skipped: true, reason: "not-game-server" }
        };
      }

      const data = await bridgeRequest("config.apply", { config: msg.config });
      return { ok: true, data };
    }

    if (msg.command === "action.run") {
      if (!isGameServerHost) {
        throw new Error("Ta akcja wymaga otwartej strony serwera gry.");
      }

      const data = await bridgeRequest("action.run", {
        action: msg.action,
        payload: msg.payload || {}
      });

      return { ok: true, data };
    }

    if (msg.command === "debug.portalMap.get") {
      if (!isGameServerHost) {
        throw new Error("Eksport portali wymaga otwartej strony serwera gry.");
      }

      const data = await bridgeRequest("portalMap.get");
      return { ok: true, data };
    }

    if (msg.command === "debug.portalMap.clear") {
      if (!isGameServerHost) {
        throw new Error("Czyszczenie portali wymaga otwartej strony serwera gry.");
      }

      const data = await bridgeRequest("portalMap.clear");
      return { ok: true, data };
    }

    throw new Error("Nieznane polecenie background: " + String(msg.command));
  })()
    .then(sendResponse)
    .catch((error) => {
      console.error("[SW Tool][CONTENT]", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

(async () => {
  try {
    await pageReady;

    const response = await runtimeRequest({
      source: "contentScript",
      command: "config.get"
    });

    let config = response.config;

    if (!response.persisted) {
      const legacyConfig = readLegacyConfig();

      if (legacyConfig) {
        const migration = await runtimeRequest({
          source: "contentScript",
          command: "config.set",
          config: legacyConfig
        });

        config = migration.config;
        console.info(
          "[SW Tool] Przeniesiono konfigurację z localStorage do chrome.storage.local."
        );
      }
    }

    if (isGameServerHost) {
      await bridgeRequest("config.apply", { config });
      console.info("[SW Tool] Bridge gotowy.");
    }

  } catch (error) {
    console.error("[SW Tool][CONTENT] Inicjalizacja nie powiodła się.", error);
  }
})();
