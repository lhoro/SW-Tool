const DEFAULT_CONFIG = Object.freeze({
  dailyReward: true,
  saveTuts: true,
  hideReports: false
});

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

async function handleMessage(msg) {
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
        throw new Error(response && response.error
          ? response.error
          : "Brak poprawnej odpowiedzi strony.");
      }

      return { ok: true, data: response.data || {} };
    }

    default:
      throw new Error("Nieznane polecenie: " + String(msg.command));
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !["popup", "contentScript"].includes(msg.source)) {
    return false;
  }

  handleMessage(msg)
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
