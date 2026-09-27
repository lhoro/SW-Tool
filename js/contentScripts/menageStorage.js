// Dane zależne od konkretnej strony/konta gry.
// Konfiguracja rozszerzenia jest przechowywana w chrome.storage.local
// i trafia do tego kontekstu przez bridge contentScript -> page.

const storageSetItem = (item, data) => {
  localStorage.setItem(item, JSON.stringify(data));
};

const storageGetItem = (item, fallback = null) => {
  const raw = localStorage.getItem(item);

  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("[SW Tool][STORAGE] Uszkodzone dane dla klucza:", item, error);
    return fallback;
  }
};

const storageCheck = () => {
  const chars = storageGetItem("chars", []);

  if (!Array.isArray(chars)) {
    storageSetItem("chars", []);
  }
};

const storageReset = () => {
  localStorage.removeItem("chars");
  storageSetItem("chars", []);
};
