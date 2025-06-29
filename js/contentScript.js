var nullthrows = (v) => {
  if (v == null) throw new Error("it's a null");
  return v;
}

function injectCode(src) {
  const script = document.createElement('script');
  script.src = src;
  script.onload = function() {
      this.remove();
  };

  nullthrows(document.head || document.documentElement).appendChild(script);
}

injectCode(chrome.runtime.getURL('./js/contentScripts/menageCSS.js'));
injectCode(chrome.runtime.getURL('./js/contentScripts/menageStorage.js'));
injectCode(chrome.runtime.getURL('./js/contentScripts/main.js'));
injectCode(chrome.runtime.getURL('./js/oldBot.js'));



// Komunikacja background -> contentscript -> inject
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // console.log("[CONTENT] Otrzymano od background:", msg);
    if (msg.query === "getConfig") {
      window.postMessage({ direction: "inject", action: "getConfig" }, "*");
      const handler = (event) => {
        if (event.source === window && event.data.direction === "content") {
          // console.log("[CONTENT] Otrzymano z injected:", event.data.payload);
          window.removeEventListener("message", handler);
          sendResponse(event.data.payload);
        }
      };
      window.addEventListener("message", handler);
      return true;
    }

    if (msg.query === "setConfig") {
      window.postMessage({ direction: "inject", action: "setConfig", config : msg.config }, "*");
      const handler = (event) => {
        if (event.source === window && event.data.direction === "content") {
          window.removeEventListener("message", handler);
          sendResponse(event.data.payload);
        }
      };
      window.addEventListener("message", handler);
      return true;
    }

    if (msg.query === "resetConfig") {
      window.postMessage({ direction: "inject", action: "resetConfig" }, "*");
      const handler = (event) => {
        if (event.source === window && event.data.direction === "content") {
          window.removeEventListener("message", handler);
          sendResponse(event.data.payload);
        }
      };
      window.addEventListener("message", handler);
      return true;
    }

    if (msg.query === "accTuts") {
      window.postMessage({ direction: "inject", action: "accTuts" }, "*");
      const handler = (event) => {
        if (event.source === window && event.data.direction === "content") {
          window.removeEventListener("message", handler);
          sendResponse(event.data.payload);
        }
      };
      window.addEventListener("message", handler);
      return true;
    }
  
    if (msg.query === "changeReports") {
      window.postMessage({ direction: "inject", action: "changeReports" }, "*");
      const handler = (event) => {
        if (event.source === window && event.data.direction === "content") {
          window.removeEventListener("message", handler);
          sendResponse(event.data.payload);
        }
      };
      window.addEventListener("message", handler);
      return true;
    }
    

  /*
    if (msg.type === "forwardToInjected") {
      window.postMessage({ direction: "to-injected", action: "getData" }, "*");

      const handler = (event) => {
        if (event.source === window && event.data.direction === "to-content") {
          console.log("[CONTENT] Otrzymano z injected:", event.data.payload);
          window.removeEventListener("message", handler);
          sendResponse(event.data.payload);
        }
      };
      window.addEventListener("message", handler);
      return true;
    }
  */

});

/*
// Odbierz z injected → przekaż do background
window.addEventListener("message", (event) => {
  if (event.source !== window || event.data.direction !== "game-to-extension") return;

  console.log("[CONTENT] Gra wysłała dane:", event.data.payload);

  chrome.runtime.sendMessage({
    from: "contentScript",
    type: "notifyPopup",
    payload: event.data.payload
  });
});
*/