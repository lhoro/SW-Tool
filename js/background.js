chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // console.log("[BG] Otrzymano wiadomość od "+ msg.from , msg);
  if(msg.from ==="popup"){
    if (msg.query === "getConfig") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { from: "background", query: "getConfig" }, (response) => {
          sendResponse(response); 
          // console.log("[BG] Wysłano odpowiedź do "+ msg.from , response);
        });
      });
      return true;
    }

    if (msg.query === "setConfig") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { from: "background", query: "setConfig", config: msg.config }, (response) => {
          sendResponse(response); 
        });
      });
      return true;
    }

    if (msg.query === "resetConfig") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { from: "background", query: "resetConfig" }, (response) => {
          sendResponse(response); 
        });
      });
      return true;
    }

    if (msg.query === "accTuts") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { from: "background", query: "accTuts" }, (response) => {
          sendResponse(response); 
        });
      });
      return true;
    }

    if (msg.query === "changeReports") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { from: "background", query: "changeReports" }, (response) => {
          sendResponse(response); 
        });
      });
      return true;
    }
  }

  

  /*
  if(msg.from === "contentScript"){
    if (msg.query === "notifyPopup") {
      chrome.runtime.sendMessage({ from: "background", query: "notify", payload: msg.payload });
    }
  }
  */
});