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

async function getPendingAccountSwitch() {
  const stored = await chrome.storage.session.get("pendingAccountSwitch");
  return stored.pendingAccountSwitch || null;
}

async function setPendingAccountSwitch(pending) {
  await chrome.storage.session.set({ pendingAccountSwitch: pending });
}

async function clearPendingAccountSwitch() {
  await chrome.storage.session.remove("pendingAccountSwitch");
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

      await setPendingAccountSwitch({
        tabId: tab.id,
        slot,
        account: {
          login: account.login,
          password: account.password
        },
        hasLoggedOut: false,
        loginAttempts: 0,
        serverSelected: false,
        startedAt: Date.now()
      });

      const response = await chrome.tabs.sendMessage(tab.id, {
        source: "background",
        command: "auth.continue"
      });

      if (!response || response.ok !== true) {
        throw new Error(
          response?.error || "Nie udało się rozpocząć przełączania konta."
        );
      }

      return { ok: true, data: { started: true, slot } };
    }

    case "account.pending.get": {
      const pending = await getPendingAccountSwitch();
      const tabId = sender.tab?.id;

      if (!pending || !tabId || pending.tabId !== tabId) {
        return { ok: true, data: { pending: null } };
      }

      return { ok: true, data: { pending } };
    }

    case "account.pending.patch": {
      const pending = await getPendingAccountSwitch();
      const tabId = sender.tab?.id;

      if (!pending || !tabId || pending.tabId !== tabId) {
        return { ok: true, data: { pending: null } };
      }

      const patch = msg.patch && typeof msg.patch === "object"
        ? msg.patch
        : {};

      const next = {
        ...pending,
        hasLoggedOut: typeof patch.hasLoggedOut === "boolean"
          ? patch.hasLoggedOut
          : pending.hasLoggedOut,
        loginAttempts: Number.isInteger(patch.loginAttempts)
          ? patch.loginAttempts
          : pending.loginAttempts,
        serverSelected: typeof patch.serverSelected === "boolean"
          ? patch.serverSelected
          : pending.serverSelected
      };

      await setPendingAccountSwitch(next);
      return { ok: true, data: { pending: next } };
    }

    case "account.switch.complete": {
      const pending = await getPendingAccountSwitch();
      const tabId = sender.tab?.id;

      if (pending && tabId && pending.tabId === tabId) {
        await clearPendingAccountSwitch();
      }

      return { ok: true, data: { completed: true } };
    }

    case "account.switch.cancel": {
      const pending = await getPendingAccountSwitch();
      const tabId = sender.tab?.id;

      if (pending && tabId && pending.tabId === tabId) {
        await clearPendingAccountSwitch();
      }

      return { ok: true, data: { cancelled: true } };
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
