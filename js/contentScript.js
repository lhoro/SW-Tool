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
    console.info(
      "[SW Tool][AUTH] Opcje serwera:",
      options.map((item) => ({
        text: (item.textContent || "").trim(),
        value: String(item.value || "")
      }))
    );

    throw new Error("Nie znaleziono serwera 1 na liście.");
  }

  select.value = option.value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));

  console.info("[SW Tool][AUTH] Wybrano serwer:", {
    text: (option.textContent || "").trim(),
    value: String(option.value || "")
  });
}

function submitServerSelection(select) {
  const form = select.closest("form");

  if (form instanceof HTMLFormElement) {
    console.info("[SW Tool][AUTH] Wysyłanie formularza wyboru serwera.");
    form.requestSubmit();
    return true;
  }

  const container = select.parentElement || document;
  const submit = container.querySelector(
    "input[type='submit'], input[type='image'], button[type='submit'], button"
  );

  if (submit && isVisible(submit)) {
    console.info("[SW Tool][AUTH] Kliknięcie kontrolki wejścia na serwer.");
    submit.click();
    return true;
  }

  const fallback = document.querySelector(
    "input[type='submit'], input[type='image'], button[type='submit']"
  );

  if (fallback && isVisible(fallback)) {
    console.info("[SW Tool][AUTH] Kliknięcie fallback submit dla serwera.");
    fallback.click();
    return true;
  }

  return false;
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
  if (!pending) {
    return { active: false, step: "idle" };
  }

  const phase = pending.phase || "logout";

  if (phase === "logout") {
    const loginForm = findLoginForm();

    if (loginForm) {
      await patchPendingAccountSwitch({ phase: "waitLogin" });
      return { active: true, step: "waitLogin" };
    }

    const logout = findInteractiveByText(
      /\bwyloguj\b|\blog\s*out\b|\blogout\b/i
    );

    if (!logout) {
      console.info("[SW Tool][AUTH] Czekam na kontrolkę wylogowania.");
      return { active: true, step: "waiting" };
    }

    await patchPendingAccountSwitch({ phase: "waitLogin" });

    console.info("[SW Tool][AUTH] Wylogowanie bieżącego konta.");
    logout.click();

    return { active: true, step: "waitLogin" };
  }

  if (phase === "waitLogin") {
    const loginForm = findLoginForm();

    if (!loginForm) {
      console.info("[SW Tool][AUTH] Czekam na formularz logowania.");
      return { active: true, step: "waiting" };
    }

    setInputValue(loginForm.login, pending.account.login);
    setInputValue(loginForm.password, pending.account.password);

    const submit =
      findInteractiveByText(
        /\bzaloguj\b|\blog\s*in\b|\blogin\b|\bsign\s*in\b/i,
        loginForm.form
      ) ||
      loginForm.form.querySelector(
        "button[type='submit'], input[type='submit'], input[type='image']"
      );

    await patchPendingAccountSwitch({ phase: "waitServer" });

    if (submit) {
      console.info("[SW Tool][AUTH] Logowanie wybranego profilu.");
      submit.click();
      return { active: true, step: "waitServer" };
    }

    if (loginForm.form instanceof HTMLFormElement) {
      console.info("[SW Tool][AUTH] Wysłanie formularza logowania.");
      loginForm.form.requestSubmit();
      return { active: true, step: "waitServer" };
    }

    throw new Error("Nie znaleziono sposobu wysłania formularza logowania.");
  }

  if (phase === "waitServer") {
    const serverSelect = findServerSelect();

    if (!serverSelect) {
      console.info("[SW Tool][AUTH] Czekam na wybór serwera.");
      return { active: true, step: "waiting" };
    }

    selectServerOne(serverSelect);

    await patchPendingAccountSwitch({ phase: "waitCharacterList" });

    const submitted = submitServerSelection(serverSelect);

    if (!submitted) {
      throw new Error(
        "Znaleziono wybór serwera, ale nie udało się wysłać formularza."
      );
    }

    console.info("[SW Tool][AUTH] Wejście na serwer 1.");
    return { active: true, step: "waitCharacterList" };
  }

  if (phase === "waitCharacterList") {
    const characterRows = document.querySelectorAll(
      "li[data-option='select_char'], [data-option='select_char']"
    );

    if (characterRows.length > 0) {
      await runtimeRequest({
        source: "contentScript",
        command: "account.switch.complete"
      });

      console.info(
        "[SW Tool][AUTH] Przełączanie zakończone. Lista postaci gotowa:",
        characterRows.length
      );

      return {
        active: false,
        step: "complete",
        characters: characterRows.length
      };
    }

    console.info("[SW Tool][AUTH] Czekam na listę postaci na S1.");
    return { active: true, step: "waiting" };
  }

  throw new Error("Nieznany etap przełączania konta: " + String(phase));
}

let authLoopRunning = false;

async function runAccountSwitchLoop() {
  if (authLoopRunning) return;
  authLoopRunning = true;

  const startedAt = Date.now();
  const timeoutMs = 45000;

  try {
    while (Date.now() - startedAt < timeoutMs) {
      const state = await continueAccountSwitch();

      if (!state?.active) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    console.warn(
      "[SW Tool][AUTH] Proces nadal oczekuje po 45 s. " +
      "Stan zostaje zapisany i będzie wznowiony po kolejnej nawigacji."
    );
  } finally {
    authLoopRunning = false;
  }
}

const pageReady = injectPageScripts();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.source !== "background") {
    return false;
  }

  (async () => {
    if (msg.command === "auth.continue") {
      runAccountSwitchLoop().catch((error) => {
        console.error("[SW Tool][AUTH] Proces przełączania nie powiódł się.", error);
      });

      return {
        ok: true,
        data: { started: true }
      };
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

    await runAccountSwitchLoop();
  } catch (error) {
    console.error("[SW Tool][CONTENT] Inicjalizacja nie powiodła się.", error);
  }
})();
