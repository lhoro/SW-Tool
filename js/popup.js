const DEFAULT_CONFIG = Object.freeze({
  dailyReward: true,
  saveTuts: true,
  hideReports: false
});

const ACCOUNT_LIMIT = 5;

document.addEventListener("DOMContentLoaded", async () => {
  const mainView = document.getElementById("mainView");
  const settingsView = document.getElementById("settingsView");
  const settingsBtn = document.getElementById("settingsBtn");
  const backBtn = document.getElementById("backBtn");
  const tabButtons = [...document.querySelectorAll(".tab-btn")];

  const dailyRewards = document.getElementById("dailyRewards");
  const saveTuts = document.getElementById("saveTuts");
  const hideReports = document.getElementById("hideReports");
  const resetBtn = document.getElementById("resetBtn");
  const accTutsBtn = document.getElementById("accTutsBtn");

  const accountQuickSwitch = document.getElementById("accountQuickSwitch");
  const accountsList = document.getElementById("accountsList");
  const saveAccountsBtn = document.getElementById("saveAccountsBtn");
  const accountStatus = document.getElementById("accountStatus");
  const mainStatus = document.getElementById("mainStatus");

  let saveQueue = Promise.resolve();
  let accountsState = [];

  const normalizeConfig = (config) => ({
    dailyReward: typeof config?.dailyReward === "boolean"
      ? config.dailyReward
      : DEFAULT_CONFIG.dailyReward,
    saveTuts: typeof config?.saveTuts === "boolean"
      ? config.saveTuts
      : DEFAULT_CONFIG.saveTuts,
    hideReports: typeof config?.hideReports === "boolean"
      ? config.hideReports
      : DEFAULT_CONFIG.hideReports
  });

  const normalizeAccounts = (accounts) => (
    Array.from({ length: ACCOUNT_LIMIT }, (_, index) => {
      const source = Array.isArray(accounts) ? accounts[index] : null;

      return {
        name: typeof source?.name === "string" && source.name.trim()
          ? source.name.trim()
          : "Konto " + (index + 1),
        login: typeof source?.login === "string" ? source.login : "",
        password: typeof source?.password === "string" ? source.password : ""
      };
    })
  );

  function sendCommand(command, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        source: "popup",
        command,
        ...(payload || {})
      }, (response) => {
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

  function showView(view) {
    mainView.classList.toggle("hidden", view !== "main");
    settingsView.classList.toggle("hidden", view !== "settings");
  }

  function showTab(tabName) {
    tabButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tabName);
    });

    document.getElementById("tab-general").classList.toggle(
      "hidden",
      tabName !== "general"
    );

    document.getElementById("tab-accounts").classList.toggle(
      "hidden",
      tabName !== "accounts"
    );
  }

  function updateWindow(config) {
    const normalized = normalizeConfig(config);
    dailyRewards.checked = normalized.dailyReward;
    saveTuts.checked = normalized.saveTuts;
    hideReports.checked = normalized.hideReports;
  }

  function readWindowConfig() {
    return {
      dailyReward: dailyRewards.checked,
      saveTuts: saveTuts.checked,
      hideReports: hideReports.checked
    };
  }

  function setStatus(element, message, type = "") {
    element.textContent = message || "";
    element.className = "status" + (type ? " " + type : "");
  }

  function renderQuickAccounts(accounts) {
    accountQuickSwitch.textContent = "";

    normalizeAccounts(accounts).forEach((account, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "account-slot-btn";

      const label = account.login.trim() || "PUSTE";
      button.textContent = label;
      button.title = account.login.trim()
        ? account.login.trim()
        : "Pusty profil " + (index + 1);

      button.disabled = !account.login.trim() || !account.password;

      button.addEventListener("click", async () => {
        try {
          setStatus(mainStatus, "Przełączanie na " + account.login + "...");
          button.disabled = true;
          button.classList.add("loading");

          await sendCommand("account.switch", { slot: index });

          setStatus(
            mainStatus,
            "Przełączanie uruchomione.",
            "success"
          );
        } catch (error) {
          console.error("[SW Tool][POPUP] Przełączenie konta nie powiodło się.", error);
          setStatus(mainStatus, error.message, "error");
        } finally {
          button.classList.remove("loading");
          renderQuickAccounts(accountsState);
        }
      });

      accountQuickSwitch.appendChild(button);
    });
  }

  function renderAccountEditor(accounts) {
    accountsList.textContent = "";

    normalizeAccounts(accounts).forEach((account, index) => {
      const card = document.createElement("div");
      card.className = "account-card";
      card.dataset.index = String(index);

      const title = document.createElement("div");
      title.className = "account-title";
      title.textContent = "Konto " + (index + 1);

      const fields = document.createElement("div");
      fields.className = "account-fields";

      const loginInput = document.createElement("input");
      loginInput.type = "text";
      loginInput.className = "account-login";
      loginInput.placeholder = "Login";
      loginInput.value = account.login;
      loginInput.autocomplete = "off";
      loginInput.spellcheck = false;

      const passwordInput = document.createElement("input");
      passwordInput.type = "password";
      passwordInput.className = "account-password";
      passwordInput.placeholder = "Hasło";
      passwordInput.value = account.password;
      passwordInput.autocomplete = "off";

      fields.append(loginInput, passwordInput);
      card.append(title, fields);
      accountsList.appendChild(card);
    });
  }

  function readAccountsFromEditor() {
    return [...accountsList.querySelectorAll(".account-card")].map((card, index) => ({
      name: "Konto " + (index + 1),
      login: card.querySelector(".account-login").value.trim(),
      password: card.querySelector(".account-password").value
    }));
  }

  function saveConfig() {
    const config = readWindowConfig();

    saveQueue = saveQueue
      .catch(() => {})
      .then(async () => {
        await chrome.storage.local.set({ config });
        const data = await sendCommand("config.set", { config });
        updateWindow(data.config);
      })
      .catch((error) => {
        console.error("[SW Tool][POPUP] Nie udało się zapisać konfiguracji.", error);
      });

    return saveQueue;
  }

  settingsBtn.addEventListener("click", () => {
    showView("settings");
  });

  backBtn.addEventListener("click", () => {
    showView("main");
    setStatus(mainStatus, "");
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showTab(button.dataset.tab);
    });
  });

  dailyRewards.addEventListener("change", saveConfig);
  saveTuts.addEventListener("change", saveConfig);
  hideReports.addEventListener("change", saveConfig);

  resetBtn.addEventListener("click", async () => {
    try {
      const data = await sendCommand("config.reset");
      updateWindow(data.config);
    } catch (error) {
      console.error("[SW Tool][POPUP] Reset konfiguracji nie powiódł się.", error);
    }
  });

  accTutsBtn.addEventListener("click", async () => {
    try {
      setStatus(mainStatus, "Uruchamiam zapis na turnieje...");
      await sendCommand("action.run", {
        action: "accountTournaments"
      });
      setStatus(mainStatus, "Akcja uruchomiona.", "success");
    } catch (error) {
      console.error("[SW Tool][POPUP] Akcja zapisu na turnieje nie powiodła się.", error);
      setStatus(mainStatus, error.message, "error");
    }
  });

  saveAccountsBtn.addEventListener("click", async () => {
    try {
      accountsState = normalizeAccounts(readAccountsFromEditor());
      await chrome.storage.local.set({ accounts: accountsState });

      renderQuickAccounts(accountsState);
      renderAccountEditor(accountsState);

      setStatus(accountStatus, "Konta zapisane.", "success");
    } catch (error) {
      console.error("[SW Tool][POPUP] Nie udało się zapisać kont.", error);
      setStatus(accountStatus, error.message, "error");
    }
  });

  try {
    const stored = await chrome.storage.local.get(["config", "accounts"]);
    const config = normalizeConfig(stored.config);
    accountsState = normalizeAccounts(stored.accounts);

    updateWindow(config);
    renderQuickAccounts(accountsState);
    renderAccountEditor(accountsState);

    if (!stored.config) {
      await chrome.storage.local.set({ config });
    }

    if (!stored.accounts) {
      await chrome.storage.local.set({ accounts: accountsState });
    }

    showView("main");
    showTab("general");
  } catch (error) {
    console.error("[SW Tool][POPUP] Inicjalizacja popupu nie powiodła się.", error);

    updateWindow(DEFAULT_CONFIG);
    accountsState = normalizeAccounts([]);
    renderQuickAccounts(accountsState);
    renderAccountEditor(accountsState);
    setStatus(mainStatus, "Nie udało się odczytać danych rozszerzenia.", "error");
  } finally {
    document.body.classList.remove("booting");
  }
});
