const switches = [
  { id: "autoDay", default: true },
  { id: "autoTut", default: true },
  { id: "hideReports", default: true }
];

// Inicjalizacja
switches.forEach(({ id, default: defaultValue }) => {
  const input = document.getElementById(id);
  const storedValue = localStorage.getItem(id);

  if (storedValue === null) {
    // Jeśli brak zapisu w localStorage — ustaw domyślnie na true
    input.checked = defaultValue;
    localStorage.setItem(id, defaultValue);
  } else {
    // W przeciwnym razie — użyj zapisanej wartości
    input.checked = storedValue === "true";
  }

  // Obsługa zmiany i zapis do localStorage
  input.addEventListener("change", function () {
    localStorage.setItem(id, this.checked);
    console.log(`${id}:`, this.checked);
  });
});
