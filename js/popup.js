document.addEventListener('DOMContentLoaded', () => {
  let dailyRewards = document.getElementById('dailyRewards');
  let saveTuts = document.getElementById('saveTuts');
  let hideReports = document.getElementById('hideReports');
  const resetBtn = document.getElementById('resetBtn');
  const accTutsBtn = document.getElementById('accTutsBtn');
  

  updateWindow = (data) =>{
      dailyRewards.checked = data.dailyReward;
      saveTuts.checked = data.saveTuts; 
      hideReports.checked = data.hideReports;
  };

    updateConfig = (data) =>{
      chrome.runtime.sendMessage({ from: "popup", query: "getConfig" }, (response) => {
        if(data == "dailyRewards")
          response.dailyReward = !response.dailyReward;
        if(data == "saveTuts")
          response.saveTuts = !response.saveTuts;
        if(data == "hideReports"){
          response.hideReports = !response.hideReports;
          chrome.runtime.sendMessage({ from: "popup", query: "changeReports", config: response}, (response) => {
          })
        }

        chrome.runtime.sendMessage({ from: "popup", query: "setConfig", config: response}, (response) => {
        })

      });
  };

  dailyRewards.addEventListener('change', () => {
    updateConfig("dailyRewards");
  });

  saveTuts.addEventListener('change', () => {
    updateConfig("saveTuts");
  });

  hideReports.addEventListener('change', () => {
    updateConfig("hideReports");
  });

  resetBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ from: "popup", query: "resetConfig" }, (response) => {
      updateWindow(response);
    });
  });

  accTutsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ from: "popup", query: "accTuts" }, (response) => {
    });
  });

  
  // Zapytanie o ustawienia z localstorage przy starcie
  chrome.runtime.sendMessage({ from: "popup", query: "getConfig" }, (response) => {
    updateWindow(response);
  });


});


  /*
  // Oczekiwanie na widadomość z background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[POPUP] Otrzymano wiadomość z background:", msg);
  });
  */