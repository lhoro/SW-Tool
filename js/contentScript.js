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


injectCode(chrome.runtime.getURL('js/contentScripts/charactersManager.js'));
injectCode(chrome.runtime.getURL('js/contentScripts/main.js'));
