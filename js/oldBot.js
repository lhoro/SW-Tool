// ----- ZMIENNE GLOBALNE -----
const glb = () =>{
    // Ogólna prędkość bota
    glb.speed = 1;
    // Czas między akcjami(w ms.)
    glb.actionTime = 300;
    // Czas między poruszaniem się/atakiem PVM(w ms.)
    glb.moveTime = 300
    // Czas między atakami PVP(w ms.)
    glb.pvpTime = 300
    // Status respiarki
    glb.respStatus = false;
    // Licznik instancji "Ronin"
    glb.roninCounter = 0;
    // Globalny timer
    glb.timer = 0;
    // ID postaci
    glb.currentCharacter = false;
}


// ----- OKIENKO NARZĘDZIA -----
const toolWindow = () =>{
    // Utworzenie okna
    const toolWindow = document.createElement("div");
        toolWindow.style.width = "200px";
        toolWindow.style.height = "170px";
        toolWindow.style.background = "#1a1a39";
        toolWindow.style.color = "white";
        toolWindow.style.position = "fixed";
        toolWindow.style.right = "5px";
        toolWindow.style.bottom = "5px";
        toolWindow.style.border="2px solid"
        toolWindow.style.border.color="black"
        toolWindow.style.padding="5px";
        toolWindow.style.fontSize="14px";

    // Przycisk ukrywania raportów
    const hideRaportsContainer = document.createElement("div");
    const hideRaportsCheck = document.createElement("input");
        hideRaportsCheck.setAttribute("type", "checkbox");
        hideRaportsCheck.addEventListener('change', (e) => {
            hideRaports(e);
        });
    const hideRaportsLabel = document.createElement("label");
        hideRaportsLabel.style.marginLeft = "5px";
        hideRaportsLabel.innerHTML = "Ukrywaj raporty walk";

    hideRaportsContainer.appendChild(hideRaportsCheck);
    hideRaportsContainer.appendChild(hideRaportsLabel);

    // Informacja o skrótach
    const toolShorts = document.createElement("div");
        toolShorts.style.fontSize="10px";
        toolShorts.innerHTML = `Skróty Klawiszowe:</br>
                                G - Atak chemp / elit / boss</br>
                                P - Walki PVP</br>
                                V - Wykonywanie misji H</br>
                                O - Otchłań </br>
                                I - Respiarka </br>
                                B - Instancja 'Ronin'</br>
                                K - Podnoszenie przedmiotów </br>
                                L - Wymiana roninów na kryształy`;

    // Połączenie elementów okienka w całość
    toolWindow.appendChild(hideRaportsContainer);
    toolWindow.appendChild(toolShorts);

    // Inject okienka
    const gameWindow = getElement("game_win");
    document.body.insertBefore(toolWindow, gameWindow);
}


// ----- OBSŁUGA KLAWISZY -----
// Funkcja ustawiająca nasłuchiwanie na wciśnięcie klawiszy
const shortKeys = () =>{
    window.addEventListener("keydown", (event) => {
        // Wykrywanie klawisza G
        if((event.key == 'g') || (event.key == 'G')){
            if (isMapVisible()) mobAttackAdvanced();
        }
        // Wykrywanie klawisza P
        if((event.key == 'p') || (event.key == 'P')){
            if (isMapVisible()) showAllPlayers();
        }
      	// Wykrywanie klawisza V
        if((event.key == 'v') || (event.key == 'V')){
            if (isMapVisible()) questH();
        }
        // Wykrywanie klawisza O
        if((event.key == 'o') || (event.key == 'O')){
            if (isMapVisible()) soulAttack();
        }
       // Wykrywanie klawisza I
        if((event.key == 'i') || (event.key == 'I')){
            if (isMapVisible()){
                glb.respStatus = !glb.respStatus;
                if(glb.respStatus) resp();
            }
        }
        // Wykrywanie klawisza B
        if((event.key == 'b') || (event.key == 'B')){
            if (isMapVisible()) registerRonin();
        }
        // Wykrywanie klawisza K
        if((event.key == 'k') || (event.key == 'K')){
           if (isMapVisible()) questPick();
        }
        // Wykrywanie klawisza T
        if((event.key == 'T')){
            test();
        }
        // Wykrywanie klawisza L
        if((event.key == 'l') || (event.key == 'L')){
           if (isMapVisible()) exchangeRonin();
        }
        if((event.key == 'Y')){
            backgroundArenaFight();
        }

    }, true);
}// ! Używają się na równi z chatem i przy pisaniu odpala funkcje bociszewa

// Funkcje odpowiadające za wciśnięcie klawiszy występujących domyślnie w grze.
const pressW = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "w",
            keyCode: 87,
            code: "KeyW",
            which: 87,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
    })
    );
}
const pressS = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "s",
            keyCode: 83,
            code: "KeyS",
            which: 83,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
    })
    );
}
const pressA = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "a",
            keyCode: 65,
            code: "KeyA",
            which: 65,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
    })
    );
}
const pressD = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "d",
            keyCode: 68,
            code: "KeyD",
            which: 68,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
    })
    );;
}
const pressQ = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "q",
            keyCode: 81,
            code: "KeyQ",
            which: 81,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
    })
    );
}
const pressE = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "e",
            keyCode: 69,
            code: "KeyE",
            which: 69,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
        })
    );
}
const pressZ = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "z",
            keyCode: 90,
            code: "KeyZ",
            which: 90,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
        })
    );
}
const pressC = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "c",
            keyCode: 67,
            code: "KeyC",
            which: 67,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
    })
    );
}
const pressF = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "f",
            keyCode: 70,
            code: "KeyF",
            which: 70,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
        })
    );
}
const pressR = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "r",
            keyCode: 82,
            code: "KeyR",
            which: 82,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
    })
    );
}
const pressX = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "x",
            keyCode: 88,
            code: "KeyX",
            which: 88,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
    })
    );
}
const pressH = () => {
    document.dispatchEvent(
        new KeyboardEvent("keydown", {
            key: "h",
            keyCode: 72,
            code: "KeyH",
            which: 72,
            shiftKey: false,
            ctrlKey: false,
            metaKey: false
        })
    );
}


// ----- FUNKCJE MODYFIKUJĄCE GRĘ -----
// Skrócenie listy questów
const questListShort = () =>{
    const questContainer = getElement("quest_track_con");
    questContainer.style.maxHeight = "200px";
    questContainer.style.overflow = "scroll";
    questContainer.style.overflowX = "hidden";
}

// Dodatkowe funkcje przy wyborze postaci
const selectChar =() => {
    const chars = getElement("char_list_con", "option");
    for(let i = 0 ; i < chars.length; i++ ){
        chars[i].addEventListener('click', (e) => {
            glb.currentCharacter = chars[i].getAttribute("data-char_id");
            setTimeout(()=>{ claimDailyReward() }, 250);
        });
    }
}

// Dodatkowe funkcje przy zmianie postaci
const switchChar = () =>{
    const changeButton = getElement("changeProfile");
    changeButton.addEventListener('click', (e) => {
        setTimeout(()=>{ selectChar() }, 250);
    });
}

// Ukrycie raportów walk
const hideRaports = (e) =>{
    // Pobranie informacji o panelu walki
    const raport = getElement("fight_view");
    // Sprawdzanie stanu checkboxa i zmiana stanu panelu walki przez dodanie/usunięcie hidden
    if(!e.currentTarget.checked){
        raport.classList.remove("hidden");
    }
    else{
        raport.classList.add("hidden");
    }
}

// Zamykanie okienka z informacjami
const closeInfo = () =>{
    const gameInfo = getElement("kom_con", "close_koment");
    if(gameInfo.length>0){
        gameInfo[0].dispatchEvent(new MouseEvent('click'));
    }
}

// Połączenie funkcji modyfikujących w jedną
const gameModify = () =>{
    questListShort();
    switchChar();
    setTimeout(()=>{ selectChar(); }, 200);
}


// ----- FUNKCJE SPRAWDZAJĄCE -----
// Sprawdzanie czy mapa jest widoczna
const isMapVisible = () => {
    const map = getElement("page_game_map").style.getPropertyValue("display");
    return ((map == "block") ? true : false);
}









// Rozwijanie listy graczy i wywoływanie ataku wszystkich
const showAllPlayers = () =>{
    const morePlayers = document.getElementsByClassName("more_players");
    // Sprawdzenie czy potrzeba rozwijać listę, jeśli nie to wywołuje funkcjię ataku.
    if(morePlayers[0]){
        // Jeśli istnieje button pobieranie z niego liczby i wywołanie kliknięcia
        let morePlayersCount = parseInt(morePlayers[0].innerHTML);
        morePlayers[0].dispatchEvent(new MouseEvent('click'));
        // Sprawdznie czy trzeba będzie jeszcze rozwijać listę,
        // Jeśli tak wywołanie funkcji od nowa, jeśli nie wywołanie funkcji ataku.
        if( morePlayersCount > 20 ){
            setTimeout(()=>{
                showAllPlayers();
            }, glb.actionTime/glb.speed );
        }
        else{
            setTimeout(()=>{
                advFight();
            }, glb.actionTime/glb.speed );
        }
    }
    else
    {
        setTimeout(()=>{
            advFight();
        }, glb.actionTime/glb.speed );
    }
}



// ----- FUNKCJA PORUSZANIA SIĘ -----
const move = (count, dir) =>{
    let i = 0;
    const goLoop = (i) =>{
        switch (dir) {
            case 'w': pressW(); break;
            case 's': pressS(); break;
            case 'a': pressA(); break;
            case 'd': pressD(); break;
            case 'q': pressQ(); break;
            case 'e': pressE(); break;
            case 'z': pressZ(); break;
            case 'c': pressC(); break;
        }
        i++;
        if (i < count) {
            setTimeout(()=> {
                goLoop(i);
            }, glb.actionTime/glb.speed);
        }
    }
    goLoop(0);
}



// ----- FUNKCJE ATAKÓW -----
// Atak mobów normal bez mutliwalki
const mobAttackNormal = (count) => {
    // Atakowanie wszystkich mobów z danego pola
    let i = 0;
    const atkLoop = (i) =>{
        i++;
        pressF();
        if (i < count) {
            setTimeout(()=>{
                atkLoop(i);
            }, 50);
        }
    }
    atkLoop(0);
}

// Atakowanie multiwalką
const mobAttackMulti = () => {
    pressR();
}

// Atak chempionów / elit / bossów / biju
const mobAttackAdvanced = () =>{
  // Pobieranie informacji o mobach na danym polu
    const mobs = document.getElementsByClassName("map_bicon");
    // Atakowanie moba grupowo
    mobs[5].dispatchEvent(new MouseEvent('click'));
}// ! Bug gdy chemp+ jest wyżej niż normale

// Atak PVP na daneym polu
const advFight = () =>{
    // Pobranie informacji o ilości graczy na polu
    const players = document.getElementsByClassName("right_btns");
    // Pętla ataku
    const atkLoop = (i) =>{
        // Sprawdzanie czy gracz nie zotał wcześniej zaatakowany
        if(players[i].lastChild.classList[2]!="initial_hide_forced"){
            // Wykonanie ataku
            players[i].lastChild.dispatchEvent(new MouseEvent('click'));
        }
        // Przejście do ataku następnego gracza
        i++;
        if (i < players.length) {
            setTimeout(()=>{
                atkLoop(i);
            }, 100);
        }
    }
    // Koniec pętli ataku

    // Wywołanie pętli ataku od gracza 1
    atkLoop(0);
}// ? Czasem pomija pierwszego gracza sprwadzić dlaczego


// Otchłań dusz
const soulAttack = () => {
    // Pobranie listy buttonów
    const buttons = document.getElementsByClassName("gold_button ");
    // Sprawdzenie który button odpowiada za walkę w otchłani
    for(let i = 0; i < buttons.length; i++ ){
        if(buttons[i].getAttribute("data-option")=="soulfight"){
            // Wywołanie ataku
            buttons[i].dispatchEvent(new MouseEvent('click'));
            break;
        }
    }
}



// ----- FUNKCJE W QUESTACH -----
// Next w questach
const questNext = () =>{
    const questWindow = document.getElementsByClassName("quest_win");
    let buttons = questWindow[0].getElementsByClassName("newBtn3");
    buttons[0].dispatchEvent(new MouseEvent('click'));
}

// Walki w questach
const questFight = () =>{
    const questWindow = document.getElementsByClassName("quest_win");
    let buttons = questWindow[0].getElementsByClassName("quest_btn");
    buttons[0].dispatchEvent(new MouseEvent('click'));
}

// H quest
const questH = () => {
    const questWindow = document.getElementsByClassName("quest_win");
    if (questWindow.length > 0){
        if(questWindow[0].innerHTML.search("klawisz H") >= 0){
          	const questInfo = questWindow[0].getElementsByClassName("red");
            let start = questInfo[0].lastChild.getAttribute("data-count");
          	const end = questInfo[0].lastChild.getAttribute("data-max");

            while(start < end ){
                start++;
                pressH();
            }
        }
    }
}

// Podnoszenie w questach
const questPick = () =>{
    const questWindow = document.getElementsByClassName("mob_list_con");
    let buttons = questWindow[0].getElementsByClassName("btn_small_gold");
    buttons[0].dispatchEvent(new MouseEvent('click'));
}



// ----- RESP -----
const resp = (i) =>{
    if ( glb.respStatus) {
        // Wywoływanie funkcji odpowiedzialnych za poruszanie się po mapie i atak
        setTimeout(()=> { pressE(); setTimeout(()=> { pressR(); setTimeout(()=> { mobAttackAdvanced()}, 25) }, 25); }, 75);
        setTimeout(()=> { pressZ(); setTimeout(()=> { pressR(); setTimeout(()=> { mobAttackAdvanced()}, 25)}, 25); }, 150);
        // Zapętlenie funkcji respiarki
        setTimeout(()=> { resp() }, 150);
    }
}//



// ----- INSTANCJE I MISJE-----
// Aktualizacja timera instancji przy akcji
const timerUpdate = (time) => {
    glb.timer = glb.timer + (time * (glb.actionTime / glb.speed)) + (glb.actionTime / glb.speed)
    return glb.timer;
} // ? Sprawdzić

// Aktualizacja timera instancji  przy czekaniu
const timerUpdateWait = (sec) => {
    glb.timer = glb.timer + (sec * 1000)
    return glb.timer;
} // ? Sprawdzić

// Ronin
const doRonin = () =>{
    pressX();
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ move(2, "e") },  timerUpdate(1));
    setTimeout(()=>{ move(12,"d")},   timerUpdate(2));
    setTimeout(()=>{ move(2, "e") },  timerUpdate(12));
    setTimeout(()=>{ pressX() },      timerUpdate(2));
    setTimeout(()=>{ questH() },      timerUpdate(1));
    setTimeout(()=>{ pressX()},       timerUpdate(5));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ pressX() },      timerUpdate(1));
    setTimeout(()=>{ questH() },      timerUpdate(1));
    setTimeout(()=>{ pressX() },      timerUpdate(5));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ move(2, "c") },  timerUpdate(1));
    setTimeout(()=>{ move(2, "d") },  timerUpdate(2));
    setTimeout(()=>{ move(2, "c") },  timerUpdate(2));
    setTimeout(()=>{ pressX() },      timerUpdate(2));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ move(1, "a") },  timerUpdate(1));
    setTimeout(()=>{ pressX() },      timerUpdate(1));
    setTimeout(()=>{ pressX() },      timerUpdateWait(31));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ move(1, "d") },  timerUpdate(1));
    setTimeout(()=>{ pressX() },      timerUpdate(1));
    setTimeout(()=>{ questH() },      timerUpdate(1));
    setTimeout(()=>{ pressX() },      timerUpdate(5));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ questFight() },  timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ move(3, "q") },  timerUpdate(1));
    setTimeout(()=>{ move(4, "w") },  timerUpdate(3));
    setTimeout(()=>{ move(7, "d") },  timerUpdate(4));
    setTimeout(()=>{ move(4, "c") },  timerUpdate(7));
    setTimeout(()=>{ move(1, "s") },  timerUpdate(4));
    setTimeout(()=>{ pressX() },      timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ move(2, "d") },  timerUpdate(1));
    setTimeout(()=>{ pressX() },      timerUpdate(3));
    setTimeout(()=>{ questFight() },  timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    if( glb.roninCounter % 2 == 0){
        setTimeout(()=>{ mobAttackNormal(8)}, timerUpdate(1));
        setTimeout(()=>{ pressW() },          timerUpdate(1));
        setTimeout(()=>{ mobAttackNormal(8)}, timerUpdate(1));
        setTimeout(()=>{ pressW() },          timerUpdate(1));
        setTimeout(()=>{ mobAttackNormal(8)}, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressD() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressA() }, timerUpdate(1));
    }
    else{
        setTimeout(()=>{ mobAttackNormal(8)}, timerUpdate(1));
        setTimeout(()=>{ pressS() },          timerUpdate(1));
        setTimeout(()=>{ mobAttackNormal(8)}, timerUpdate(1));
        setTimeout(()=>{ pressS() },          timerUpdate(1));
        setTimeout(()=>{ mobAttackNormal(8)}, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressS() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressD() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressW() }, timerUpdate(1));
        setTimeout(()=>{ pressR() }, timerUpdate(1));
        setTimeout(()=>{ pressA() }, timerUpdate(1));
    }
    setTimeout(()=>{ pressX() },      timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(1));
    setTimeout(()=>{ move(2, "d") },  timerUpdate(1));
    setTimeout(()=>{ questNext() },   timerUpdate(2));
    glb.roninCounter++;
    glb.timer = 0;
} // ? Sprawdzić

// Wymiana ronina
const exchangeRonin = () => {
    const exchangeWindow = document.getElementById("exchange_con");
    const exchangeItems = exchangeWindow.getElementsByClassName("exchange_opt")
    const item = exchangeItems[0].getAttribute("data-original-title");
    const start = exchangeItems[0].getAttribute("data-original-title").indexOf("(");
    const stop = exchangeItems[0].getAttribute("data-original-title").indexOf(")");
    let ronin = item.substr(start+1, stop-start-1);
    console.log(ronin);
    const exchange = ()=>{
        if((ronin/15)>1){
            exchangeItems[0].dispatchEvent(new MouseEvent('click'));
            ronin-=15
            console.log(ronin);
            setTimeout(()=>{ exchange() }, 50);
        }
    }
    exchange();

} // ? Sprawdzić


// ----- OPCJE DODATKOWE -----
// Odbieranie nagród dziennych
const claimDailyReward = () =>{
    const dailyRevardIcon = document.getElementsByClassName("dail");
    if (dailyRevardIcon.length>0){
        dailyRevardIcon[0].dispatchEvent(new MouseEvent('click'));
        setTimeout(()=>{
            const currentDay = document.getElementsByClassName("current");
            currentDay[0].dispatchEvent(new MouseEvent('click'));
            setTimeout(()=>{
                closeInfo();
                setTimeout(()=>{
                    const dailyWindow = document.getElementById("daily_reward");
                    const dailyWindowClose = dailyWindow.getElementsByClassName("closeb");
                    dailyWindowClose[0].dispatchEvent(new MouseEvent('click'));
                }, 250);
            }, 250);
        }, 250);
    }
}


// ----- TEST -----
const test = () =>{

}

const registerRonin = () =>{
    const instMenu = document.getElementsByClassName("select_page");
    instMenu[28].dispatchEvent(new MouseEvent('click'));
    setTimeout(()=>{
        const instList = document.getElementById("instance_list");
        console.log(instList);
        const instSingleList = instList.getElementsByClassName("option");
        instSingleList[1].dispatchEvent(new MouseEvent('click'));
        setTimeout(()=>{
            let instWindow = document.getElementById("instance_view");
            let instButtons = instWindow.getElementsByClassName("newBtn");
            console.log(instButtons);
            for(let i = 0; i < instButtons.length; i++ ){
                if(instButtons[i].getAttribute("data-option")=="instance_create_room"){
                   instButtons[i].dispatchEvent(new MouseEvent('click'));
                   break;
                }
            }
            setTimeout(()=>{
                instWindow = document.getElementById("instance_view");
                instButtons = instWindow.getElementsByClassName("newBtn");
                for(let i = 0; i < instButtons.length; i++ ){
                    if(instButtons[i].getAttribute("data-option")=="start_instance_room"){
                        instButtons[i].dispatchEvent(new MouseEvent('click'));
                        console.log(instButtons[i]);
                        break;
                    }
                }
                setTimeout(()=>{
                    instWindow = document.getElementById("instance_view");
                    instButtons = instWindow.getElementsByClassName("newBtn");
                    for(let i = 0; i < instButtons.length; i++ ){
                        setTimeout(()=>{
                            if(instButtons[i].getAttribute("data-option")=="enter_instance_room"){
                                instButtons[i].dispatchEvent(new MouseEvent('click'));
                            }
                        }, i*250);
                    }
                    setTimeout(()=>{
                        const mapButton = document.getElementById("map_link_btn");
                        mapButton.dispatchEvent(new MouseEvent('click'));
                        setTimeout(()=>{
                            closeInfo();
                        }, 100);
                        setTimeout(()=>{
                            doRonin();
                        }, 250);
                    }, 1500);
                }, 250);
            }, 250);
        }, 250);
    }, 250);
}


// ----- FUNKCJE POMOCNICZE -----
// Ulepszone pobieranie elementu
const getElement = (parent, element, index) =>{
    if(!element){
        return document.getElementById(`${parent}`)
    }
    else{
        parent = document.getElementById(`${parent}`);
        element = parent.getElementsByClassName(`${element}`);
        if((!index) && index != 0){
             return element;
        }
        else{
             return element[index]
        }
    }
}

// ----- FUNKCJA GŁÓWNA -----
(()=>{
    // Inicjacja zmiennych globalnych
    glb();
    // Utworzenie okienka
    toolWindow();
    // Dodanie wykrywania klawiszy szybkiego użycia
    shortKeys();
    // Modyfikacje elementów gry
    gameModify();
})();
