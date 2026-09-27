const SW_TOOL_CHANNEL = "SW_TOOL_BRIDGE_V1";
const BRIDGE_TIMEOUT = 5000;

const hostname = window.location.hostname.toLowerCase();
const isGameServerHost =
  hostname.endsWith(".shinobiworld.pl") &&
  hostname !== "www.shinobiworld.pl";

const PAGE_SCRIPTS = isGameServerHost
  ? [
      "js/contentScripts/menageCSS.js",
      "js/contentScripts/menageStorage.js",
      "js/contentScripts/main.js"
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

function elementText(element) {
  return [
    element.textContent,
    element.value,
    element.getAttribute?.("title"),
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("data-original-title")
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisible(element) {
  if (!element) return false;

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return element.getClientRects().length > 0;
}

function findInteractiveByText(pattern, root = document) {
  const elements = root.querySelectorAll(
    "button, a, input[type='button'], input[type='submit'], [role='button']"
  );

  return [...elements].find((element) =>
    isVisible(element) && pattern.test(elementText(element))
  ) || null;
}

function setInputValue(input, value) {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findLoginForm() {
  const passwords = [...document.querySelectorAll("input[type='password']")]
    .filter(isVisible);

  for (const password of passwords) {
    const form = password.closest("form") || document;
    const loginInputs = [...form.querySelectorAll(
      "input[type='text'], input[type='email'], input:not([type])"
    )].filter((input) => isVisible(input) && input !== password);

    if (loginInputs.length === 0) continue;

    const preferred = loginInputs.find((input) =>
      /login|user|email|cg/i.test(
        [
          input.name,
          input.id,
          input.placeholder,
          input.getAttribute("aria-label")
        ].filter(Boolean).join(" ")
      )
    );

    return {
      form,
      login: preferred || loginInputs[0],
      password
    };
  }

  return null;
}

function findServerSelect() {
  const selects = [...document.querySelectorAll("select")].filter(isVisible);

  const scored = selects.map((select) => {
    const parentText = elementText(select.parentElement || select);
    const options = [...select.options];
    const hasServerOne = options.some((option) => {
      const text = (option.textContent || "").trim();
      const value = String(option.value || "").trim();

      return (
        value === "1" ||
        /^s?1$/i.test(value) ||
        /(^|\D)1(\D|$)/.test(text) ||
        /server\s*1|serwer\s*1|s1/i.test(text)
      );
    });

    let score = 0;
    if (/server|serwer/i.test(parentText)) score += 5;
    if (hasServerOne) score += 3;
    if (options.length > 1) score += 1;

    return { select, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].select : null;
}

function selectServerOne(select) {
  const options = [...select.options];
  const option = options.find((item) => {
    const text = (item.textContent || "").trim();
    const value = String(item.value || "").trim();

    return (
      value === "1" ||
      /^s?1$/i.test(value) ||
      /server\s*1|serwer\s*1|s1/i.test(text)
    );
  }) || options.find((item) =>
    /(^|\D)1(\D|$)/.test((item.textContent || "").trim())
  );

  if (!option) {
    throw new Error("Nie znaleziono serwera 1 na liście.");
  }

  select.value = option.value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function patchPendingAccountSwitch(patch) {
  const data = await runtimeRequest({
    source: "contentScript",
    command: "account.pending.patch",
    patch
  });

  return data.pending;
}

async function continueAccountSwitch() {
  const data = await runtimeRequest({
    source: "contentScript",
    command: "account.pending.get"
  });

  let pending = data.pending;
  if (!pending) return { active: false };

  // 1. Najpierw wyloguj bieżące konto, ale tylko raz.
  if (!pending.hasLoggedOut) {
    const logout = findInteractiveByText(/\bwyloguj\b|\blog\s*out\b|\blogout\b/i);

    pending = await patchPendingAccountSwitch({
      hasLoggedOut: true
    });

    if (logout) {
      console.info("[SW Tool][AUTH] Wylogowanie bieżącego konta.");
      logout.click();
      return { active: true, step: "logout" };
    }
  }

  // 2. Jeśli widzimy formularz logowania, zaloguj profil.
  const loginForm = findLoginForm();

  if (loginForm) {
    if ((pending.loginAttempts || 0) >= 2) {
      await runtimeRequest({
        source: "contentScript",
        command: "account.switch.cancel"
      });

      throw new Error("Logowanie nie powiodło się po dwóch próbach.");
    }

    setInputValue(loginForm.login, pending.account.login);
    setInputValue(loginForm.password, pending.account.password);

    const submit =
      findInteractiveByText(
        /\bzaloguj\b|\blog\s*in\b|\blogin\b|\bsign\s*in\b/i,
        loginForm.form
      ) ||
      loginForm.form.querySelector("button[type='submit'], input[type='submit']");

    if (!submit && loginForm.form instanceof HTMLFormElement) {
      await patchPendingAccountSwitch({
        loginAttempts: (pending.loginAttempts || 0) + 1
      });

      console.info("[SW Tool][AUTH] Wysłanie formularza logowania.");
      loginForm.form.requestSubmit();
      return { active: true, step: "login" };
    }

    if (!submit) {
      throw new Error("Nie znaleziono przycisku logowania.");
    }

    await patchPendingAccountSwitch({
      loginAttempts: (pending.loginAttempts || 0) + 1
    });

    console.info("[SW Tool][AUTH] Logowanie wybranego profilu.");
    submit.click();
    return { active: true, step: "login" };
  }

  // 3. Po zalogowaniu wybierz serwer 1 i kliknij Graj.
  if (!pending.serverSelected) {
    const serverSelect = findServerSelect();
    const playButton = findInteractiveByText(
      /\bgraj\b|\bplay\b/i
    );

    if (serverSelect && playButton) {
      selectServerOne(serverSelect);

      await patchPendingAccountSwitch({
        serverSelected: true
      });

      console.info("[SW Tool][AUTH] Wejście na serwer 1.");
      playButton.click();
      return { active: true, step: "server" };
    }
  }

  // 4. Po wejściu na serwer uznaj przełączenie za zakończone.
  const gameLoaded =
    /^s1\./i.test(hostname) &&
    Boolean(
      document.getElementById("game_win") ||
      document.getElementById("page_game_map") ||
      document.getElementById("char_list_con")
    );

  if (gameLoaded) {
    await runtimeRequest({
      source: "contentScript",
      command: "account.switch.complete"
    });

    console.info("[SW Tool][AUTH] Przełączanie konta zakończone.");
    return { active: false, step: "complete" };
  }

  console.info("[SW Tool][AUTH] Oczekiwanie na kolejny etap przełączania.");
  return { active: true, step: "waiting" };
}

const pageReady = injectPageScripts();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.source !== "background") {
    return false;
  }

  (async () => {
    if (msg.command === "auth.continue") {
      const data = await continueAccountSwitch();
      return { ok: true, data };
    }

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

    await continueAccountSwitch();
  } catch (error) {
    console.error("[SW Tool][CONTENT] Inicjalizacja nie powiodła się.", error);
  }
})();
