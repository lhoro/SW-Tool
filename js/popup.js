const DEFAULT_CONFIG = Object.freeze({
  dailyReward: true,
  saveTuts: true,
  hideReports: false
});

const ACCOUNT_LIMIT = 5;

document.addEventListener("DOMContentLoaded", async () => {
  const dailyRewards = document.getElementById("dailyRewards");
  const saveTuts = document.getElementById("saveTuts");
  const hideReports = document.getElementById("hideReports");
  const resetBtn = document.getElementById("resetBtn");
  const accTutsBtn = document.getElementById("accTutsBtn");
  const accountsList = document.getElementById("accountsList");
  const saveAccountsBtn = document.getElementById("saveAccountsBtn");
  const accountStatus = document.getElementById("accountStatus");

  let saveQueue = Promise.resolve();

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

  const normalizeAccounts = (accounts) => {
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
  };

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
          reject(new Error(
            response?.error || "Brak odpowiedzi rozszerzenia."
          ));
          return;
        }

        resolve(response.data || {});
      });
    });
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

  function setAccountStatus(message, type = "") {
    accountStatus.textContent = message || "";
    accountStatus.className = "status" + (type ? " " + type : "");
  }

  function renderAccounts(accounts) {
    accountsList.textContent = "";

    normalizeAccounts(accounts).forEach((account, index) => {
      const card = document.createElement("div");
      card.className = "account-card";
      card.dataset.index = String(index);

      const title = document.createElement("div");
      title.className = "account-title";
      title.textContent = "Profil " + (index + 1);

      const fields = document.createElement("div");
      fields.className = "account-fields";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "account-name";
      nameInput.placeholder = "Nazwa profilu";
      nameInput.value = account.name;
      nameInput.autocomplete = "off";

      const loginInput = document.createElement("input");
      loginInput.type = "text";
      loginInput.className = "account-login";
      loginInput.placeholder = "Login CG";
      loginInput.value = account.login;
      loginInput.autocomplete = "off";
      loginInput.spellcheck = false;

      const passwordInput = document.createElement("input");
      passwordInput.type = "password";
      passwordInput.className = "account-password";
      passwordInput.placeholder = "Hasło";
      passwordInput.value = account.password;
      passwordInput.autocomplete = "off";

      fields.append(nameInput, loginInput, passwordInput);

      const actions = document.createElement("div");
      actions.className = "account-actions";

      const switchButton = document.createElement("button");
      switchButton.type = "button";
      switchButton.className = "btn account-switch";
      switchButton.textContent = "Przełącz";
      switchButton.addEventListener("click", async () => {
        try {
          setAccountStatus("Zapisywanie profili...");
          const accountsToSave = readAccountsFromWindow();
          await chrome.storage.local.set({ accounts: accountsToSave });

          setAccountStatus("Rozpoczynam przełączanie...");
          switchButton.disabled = true;

          await sendCommand("account.switch", { slot: index });

          setAccountStatus(
            "Przełączanie uruchomione. Popup może się zamknąć podczas zmiany strony.",
            "success"
          );
        } catch (error) {
          console.error("[SW Tool][POPUP] Przełączenie konta nie powiodło się.", error);
          setAccountStatus(error.message, "error");
        } finally {
          switchButton.disabled = false;
        }
      });

      actions.appendChild(switchButton);
      card.append(title, fields, actions);
      accountsList.appendChild(card);
    });
  }

  function readAccountsFromWindow() {
    return [...accountsList.querySelectorAll(".account-card")].map((card, index) => ({
      name: card.querySelector(".account-name").value.trim() || "Konto " + (index + 1),
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
      await sendCommand("action.run", {
        action: "accountTournaments"
      });
    } catch (error) {
      console.error("[SW Tool][POPUP] Akcja zapisu na turnieje nie powiodła się.", error);
    }
  });

  saveAccountsBtn.addEventListener("click", async () => {
    try {
      const accounts = readAccountsFromWindow();
      await chrome.storage.local.set({ accounts });
      setAccountStatus("Profile zapisane.", "success");
    } catch (error) {
      console.error("[SW Tool][POPUP] Nie udało się zapisać profili.", error);
      setAccountStatus(error.message, "error");
    }
  });

  try {
    // Czytamy storage bezpośrednio z popupu zanim pokażemy UI.
    // Dzięki temu checkboxy nie renderują się najpierw w stanie domyślnym.
    const stored = await chrome.storage.local.get(["config", "accounts"]);
    const config = normalizeConfig(stored.config);
    const accounts = normalizeAccounts(stored.accounts);

    updateWindow(config);
    renderAccounts(accounts);

    if (!stored.config) {
      await chrome.storage.local.set({ config });
    }

    if (!stored.accounts) {
      await chrome.storage.local.set({ accounts });
    }
  } catch (error) {
    console.error("[SW Tool][POPUP] Inicjalizacja popupu nie powiodła się.", error);
    updateWindow(DEFAULT_CONFIG);
    renderAccounts([]);
    setAccountStatus("Nie udało się odczytać danych rozszerzenia.", "error");
  } finally {
    document.body.classList.remove("booting");
  }
});
