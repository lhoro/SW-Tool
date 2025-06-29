// Odczytywanie danych z local storage
const storageSetItem = (item, data) =>  {
    data = JSON.stringify(data),
    localStorage.setItem(item, data)
}

// Dodawanie/Edytowanie danych w local storage
const storageGetItem = (item) =>  {
    return JSON.parse(localStorage.getItem(item))
}

// Ustawienia domyślne w local storage
const storageSetDefault = () =>  {
    const config = {
        dailyReward: true,
        saveTuts: true,
        hideReports: false
    }

    storageSetItem("chars", [] );
    storageSetItem("config", config);
}

// Sprawdzenie czy w local storage są dane
const storageCheck = () =>{
    if(!storageGetItem("chars") || !storageGetItem("config")) {
        storageSetDefault();
    }
}

// Resetowanie local storage w razie problemów
const storageReset = () => {
    console.log("RESET")
    localStorage.removeItem("chars");
    localStorage.removeItem("config");
    storageSetDefault();
}