const SW_TOOL_CHANNEL = "SW_TOOL_BRIDGE_V1";
const BRIDGE_TIMEOUT = 5000;

const PAGE_SCRIPTS = [
  "js/contentScripts/menageCSS.js",
  "js/contentScripts/menageStorage.js",
  "js/contentScripts/main.js"
];

// oldBot.js zostaje w repo jako referencja starej implementacji.
// Nie uruchamiamy go automatycznie na dev, żeby nie dublował eventów i automatyzacji.

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
  for (const path of PAGE_SCRIPTS) {
    await injectScript(path);
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

      resolve(response);
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
      const data = await bridgeRequest("config.apply", { config: msg.config });
      return { ok: true, data };
    }

    if (msg.command === "action.run") {
      const data = await bridgeRequest("action.run", {
        action: msg.action,
        payload: msg.payload || {}
      });
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

    if (!response || !response.ok) {
      throw new Error(response && response.error
        ? response.error
        : "Nie udało się pobrać konfiguracji.");
    }

    let config = response.data.config;

    if (!response.data.persisted) {
      const legacyConfig = readLegacyConfig();

      if (legacyConfig) {
        const migration = await runtimeRequest({
          source: "contentScript",
          command: "config.set",
          config: legacyConfig
        });

        if (migration && migration.ok) {
          config = migration.data.config;
          console.info("[SW Tool] Przeniesiono konfigurację z localStorage do chrome.storage.local.");
        }
      }
    }

    await bridgeRequest("config.apply", { config });
    console.info("[SW Tool] Bridge gotowy.");
  } catch (error) {
    console.error("[SW Tool][CONTENT] Inicjalizacja nie powiodła się.", error);
  }
})();
