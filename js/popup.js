document.addEventListener("DOMContentLoaded", () => {
  const dailyRewards = document.getElementById("dailyRewards");
  const saveTuts = document.getElementById("saveTuts");
  const hideReports = document.getElementById("hideReports");
  const resetBtn = document.getElementById("resetBtn");
  const accTutsBtn = document.getElementById("accTutsBtn");

  let saveQueue = Promise.resolve();

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
          reject(new Error(response && response.error
            ? response.error
            : "Brak odpowiedzi rozszerzenia."));
          return;
        }

        resolve(response.data || {});
      });
    });
  }

  function updateWindow(config) {
    dailyRewards.checked = Boolean(config.dailyReward);
    saveTuts.checked = Boolean(config.saveTuts);
    hideReports.checked = Boolean(config.hideReports);
  }

  function readWindowConfig() {
    return {
      dailyReward: dailyRewards.checked,
      saveTuts: saveTuts.checked,
      hideReports: hideReports.checked
    };
  }

  function saveConfig() {
    const config = readWindowConfig();

    saveQueue = saveQueue
      .catch(() => {})
      .then(async () => {
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

  (async () => {
    try {
      const data = await sendCommand("config.get");
      updateWindow(data.config);
    } catch (error) {
      console.error("[SW Tool][POPUP] Nie udało się pobrać konfiguracji.", error);
    }
  })();
});
