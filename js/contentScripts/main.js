if( GAME === undefined){
    // Poza grą nic nie robi
}else{
    // BOT
    class TOOL{
        constructor() {
            // Ustawienia postaci
            this.chars = [];
            this.currentCharacterId = 0;
            this.currentCharacterIndex = 0;

            // Ustawienia bota
            this.config = [];

            // Etap odbioru nagrody dziennej: 0=bezczynny, 1=pobieranie danych, 2=oczekiwanie na odbiór
            this.dailyRewardClaimStage = 0;
            this.dailyRewardClaimCharacterId = null;
        };

        // Pobranie danych do bota z localstorage
        getLocalData(){
            this.chars = storageGetItem("chars")
            this.config = storageGetItem("config");
            if(this.chars.length == 0 ) 
                this.getChars();
            console.log(this.chars)
        }

        // Pobieranie listy postaci
        getChars() {
            setTimeout(()=>{
                let allchars = [...$("li[data-option=select_char]")];
                if(allchars.length == 0) {
                    setTimeout(this.getchars, 200);
                } else {
                    const chars = [];
                    allchars.forEach((element, index, array) => {
                        let id = element.getAttribute("data-char_id");
                        const char = {
                            id: id,
                            data: {
                                tutSave: 0
                            }
                        }
                        chars.push((char))
                    });
                    this.chars = chars;
                storageSetItem("chars", this.chars);
                //console.log("Dodano postacie")
                }
            },50);
        }

        // Wybór następnej postaci
        nextChar() {
            let nextCharID = null;
            if (this.currentCharacterIndex == this.chars.length - 1) {
                nextCharID = this.chars[0];
                this.currentCharacterIndex = 0;
            } else {
                nextCharID = this.chars[this.currentCharacterIndex + 1];
                this.currentCharacterIndex+=1;
            }
            GAME.emitOrder({ a: 2, char_id: nextCharID.id });
        }

        // Wybór poprzedniej postaci
        prevChar() {
            let prevCharID = null;
            if (this.currentCharacterIndex == 0) {
                prevCharID = this.chars[this.chars.length - 1];
                this.currentCharacterIndex = this.chars.length - 1;
                
            } else {
                prevCharID = this.chars[this.currentCharacterIndex - 1];
                this.currentCharacterIndex-=1;
            }
           GAME.emitOrder({ a: 2, char_id: prevCharID.id });
        }

        // Wyświetlenie informacji o postaci i danych gry
        gameDebug(){
            console.log("Game ID "+GAME.char_id);
            console.log("Char ID "+this.currentCharacterId)
            console.log("INDEX "+this.currentCharacterIndex);
            console.log(this.chars)
            console.log(GAME)
        }

        // Funkcja aktualizująca ID postaci i wywołująca inne funkcje
        updateID() {
            if (GAME.char_id != this.currentCharacterId) {
                this.currentCharacterId = GAME.char_id; 
                this.currentCharacterIndex = this.chars.findIndex(id => id.id == GAME.char_id);
                
                BOT.collectDailyReward();
                BOT.registerTut();
            }
        }

        // Odbieranie dziennych nagród
        collectDailyReward() {
            if (!this.config.dailyReward ||
                GAME.char_id == 0 ||
                !GAME.quick_opts.online_reward ||
                this.dailyRewardClaimStage !== 0) {
                return;
            }

            this.dailyRewardClaimCharacterId = GAME.char_id;
            this.dailyRewardClaimStage = 1;
            setTimeout(() => {
                if (GAME.char_id != this.dailyRewardClaimCharacterId) {
                    this.resetDailyRewardClaim();
                    return;
                }
                try {
                    // Najpierw pobieramy dane nagrody, tak jak w APP.
                    GAME.socket.emit('ga', { a: 26, type: 0 });
                } catch (error) {
                    this.resetDailyRewardClaim();
                    console.error("Nie udało się pobrać danych nagrody dziennej", error);
                }
            }, 50);
        }

        // Obsługa odpowiedzi serwera na pobranie i odbiór nagrody dziennej
        handleDailyRewardResponse(response) {
            if (!response || response.a != 26 || this.dailyRewardClaimStage === 0) {
                return;
            }

            if (GAME.char_id != this.dailyRewardClaimCharacterId) {
                this.resetDailyRewardClaim();
                return;
            }

            if (Number(response.e || 0) !== 0) {
                this.resetDailyRewardClaim();
                console.error("Serwer odrzucił operację nagrody dziennej", response.e);
                return;
            }

            if (this.dailyRewardClaimStage === 1) {
                if (!Array.isArray(response.daily_data)) {
                    this.resetDailyRewardClaim();
                    console.error("Serwer nie zwrócił danych nagrody dziennej");
                    return;
                }

                this.dailyRewardClaimStage = 2;
                try {
                    GAME.socket.emit('ga', { a: 26, type: 1 });
                } catch (error) {
                    this.resetDailyRewardClaim();
                    console.error("Nie udało się odebrać nagrody dziennej", error);
                }
                return;
            }

            if (this.dailyRewardClaimStage === 2) {
                this.resetDailyRewardClaim();
                setTimeout(() => {
                    $('#daily_reward').fadeOut();
                    kom_clear();
                }, 400);
            }
        }

        resetDailyRewardClaim() {
            this.dailyRewardClaimStage = 0;
            this.dailyRewardClaimCharacterId = null;
        }

        // Zapis na turnieje 
        // Przerobić na sockety
        registerTut(){
            if(this.config.saveTuts){
                if( this.chars[this.currentCharacterIndex].data.tutSave == 0 ){
                    const currentTime = new Date;
                    const currentHour = currentTime.getHours();
                    if ((currentHour >= 18) && (currentHour < 21)){
                        setTimeout(()=>{ 
                            const instMenu = document.getElementsByClassName("select_page");
                            instMenu[22].dispatchEvent(new MouseEvent('click'));
                            setTimeout(()=>{
                                const sign = $('#tour_list_tab .newBtn');
                                sign[0].dispatchEvent(new MouseEvent('click'));

                                this.chars[this.currentCharacterIndex].data.tutSave = 1;
                                storageSetItem("chars", this.chars)                               
                            }, 100);  
                        }, 200);
                    }
                }
            }
        }
    
        accountTutsRegister(index){
            if (index == null || index == 0){
                index = 0;
                setTimeout(()=>{
                        GAME.emitOrder({ a: 2, char_id: this.chars[index].id });                       
                }, 200); 
            }
            console.log(index);
            if( index < this.chars.length -1 ){ 
                setTimeout(()=>{
                        this.registerTut()                       
                }, 1000); 
                setTimeout(()=>{
                        this.nextChar()                     
                }, 2000); 
                setTimeout(()=>{   
                    this.accountTutsRegister(index+=1)                             
                }, 3000); 
            }
        }

    }


    // Uruchomnienie BOTA
    const BOT = new TOOL();

    // Odpowiedź na protokół nagrody dziennej (a=26)
    if (GAME.socket && typeof GAME.socket.on === "function") {
        GAME.socket.on('ga', (response) => BOT.handleDailyRewardResponse(response));
    }

    // Sprawdzenie local storage
    storageCheck();

    // Pobranie danych z local storage
    BOT.getLocalData();

    // Aktualizowanie ID postaci co 2s
    setInterval(()=>{
        BOT.updateID();
    }, 2000);

    hideReports();

    // Odczytanie wciśnięcia klawiszy
    $(document).keydown((event) => {
        if (!$("input, textarea").is(":focus")) {
            // Poprzednia postać
            if (event.key === ",") {
                BOT.prevChar();
            } 
            // Następna postać
            else if (event.key === ".") {
                BOT.nextChar();
            }
        }
    });



    // Reakcja na polecenie z popupu (via background → contentScript)
    window.addEventListener("message", (event) => {
        if (event.source !== window || event.data.direction !== "inject") return;
            if (event.data.action === "getConfig") {
                window.postMessage({ direction: "content", payload: storageGetItem("config") }, "*");
            }
            if (event.data.action === "setConfig") {
                console.log("[INIECT] Ustaw config")
                console.log(event.data.config)
                storageSetItem("config", event.data.config)
            }
            if (event.data.action === "resetConfig") {
                storageSetDefault();
                BOT.getChars();
                window.postMessage({ direction: "content", payload: storageGetItem("config") }, "*");
            }
            if (event.data.action === "changeReports") {
                setTimeout(()=>{
                    hideReports();
                }, 100);
            }
            if (event.data.action === "accTuts") {
                BOT.accountTutsRegister();
            }

    });
















    /*
    // Symulacja zdarzenia gry (np. timer, klik, efekt)
    setTimeout(() => {
    const gameEvent = {
        type: "ALERT",
        message: "Gracz awansował na poziom 10!"
    };

    console.log("[INJECTED] Symulacja zdarzenia gry - wysyłam do rozszerzenia");
    window.postMessage({ direction: "game-to-extension", payload: gameEvent }, "*");
    }, 5000);
    */

}   

















/* Zapisywanie całego konta na turnieje V2
BOT = {
    chars:[],
    timeout:2000,
    page:1
}

GAME.emitOrder = (data) => GAME.socket.emit('ga',data);

BOT.Start = function(){
    if(this.chars.length > 0){
        setTimeout(function(){ BOT.LogIn(); },this.timeout);
    }else{
        GAME.komunikat("KONIEC!");
    }
}

BOT.LogIn = function(){
    char_id = parseInt(this.chars);
    GAME.emitOrder({a:2,char_id:char_id});

    setTimeout(function(){ BOT.loadTour(1); },this.timeout);
}

BOT.switchPages = function(){
    $('.page_switch').hide();
$('#page_game_tournaments').show();
}

BOT.loadTour = function(tour){
    if(tour == 1){
        GAME.emitOrder({a:57,type:0,type2:0,page:BOT.page});
        BOT.switchPages();
        setTimeout(function(){
            if($("button[data-option='tournament_sign']").length == 1){
                setTimeout(function(){ BOT.sign(1); },(BOT.timeout+100));
                BOT.page = 1;
            }else{
                BOT.page = 2;
                setTimeout(function(){ BOT.loadTour(1); },BOT.timeout);
            }
        },this.timeout+100);
    }else{
        GAME.emitOrder({a:57,type:0,type2:1,page:BOT.page});
        BOT.switchPages();
        setTimeout(function(){ BOT.sign(2); },this.timeout);
    }
}

BOT.sign = function(t){
    if(t == 1){
        GAME.emitOrder({a:57,type:1,tid:$("button[data-option='tournament_sign']").attr("data-tid")});
        setTimeout(function(){ BOT.loadTour(2); },this.timeout);
    }else{
        GAME.emitOrder({a:57,type:4,tid:$(this).data('tid')});
        this.chars.shift();
        setTimeout(function(){ BOT.Start(); },this.timeout);
    }
}

BOT.GetChars = function(){
    for(i=0; i<GAME.player_chars; i++){
        char = $("li[data-option=select_char]").eq(i);
        BOT.chars.push(char.attr("data-char_id"));
    }
    
    BOT.Start();
}();
*/