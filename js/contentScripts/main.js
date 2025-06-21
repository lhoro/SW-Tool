if( GAME === undefined){
    // Poza grą nic nie robi
}else{
    // BOT
    class TOOL{
        constructor() {
            // Ustawienia postaci
            this.characters = [];
            this.currentCharacterId = 0;
            this.currentCharacterIndex = 0;



            // Ustawienia bota
            this.collectDaily = true; 
            this.tutRegister = true;
            

            // Ustawienia konta
            this.tutRegisterTable = [];
        };

        getLocalData(){
            console.log("Pobieraczek")

            console.log(JSON.parse(localStorage.getItem("config")));
            if(JSON.parse(localStorage.getItem("config") === null)){
                console.log("coś tu pusto xD")
                const config = { 
                    dailyReward: true, 
                    tutRegister: true,
                    hideRaports: true
                }
                console.log(config)
                localStorage.setItem("config", JSON.stringify(config))
            }

            console.log(JSON.parse(localStorage.getItem('config')));
            console.log("Koniec pobieraczka")
        }
        
        showID(){
            console.log(this.characters)
            console.log("Game ID "+GAME.char_id);
            console.log("Char ID "+this.currentCharacterId)
            console.log("INDEX "+this.currentCharacterIndex);
            console.log(GAME)
        }

        updateID() {
            if (GAME.char_id != this.currentCharacterId) {
                this.currentCharacterId = GAME.char_id; 
                this.currentCharacterIndex = this.characters.indexOf(`${this.currentCharacterId }`);
                BOT.collectDailyReward();
                BOT.registerTut();

                //console.log(this.tutRegisterTable);
                //console.log(this.characters)
                console.log(JSON.parse(localStorage.getItem("char")))

                console.log(GAME.login)
            }
        }

        getCharacters() {
            if (GAME == undefined) {
                setTimeout(getCharacters, 200);
            } else {
                setTimeout(()=>{
                    let allCharacters = [...$("li[data-option=select_char]")];

                    console.log(allCharacters);

                    if(allCharacters.length == 0) {
                        setTimeout(this.getCharacters, 200);
                    } else {
                        allCharacters.forEach((element, index, array) => {
                            this.characters.push(element.getAttribute("data-char_id"));
                            this.tutRegisterTable.push([element.getAttribute("data-char_id"),0]);
                        });                        
                    }
                    localStorage.setItem("char", JSON.stringify(this.tutRegisterTable));
                },50);
            }

            this.showID();
        }

        nextChar() {
            let nextCharID = null;
            if (this.currentCharacterIndex == this.characters.length - 1) {
                nextCharID = this.characters[0];
            } else {
                nextCharID = this.characters[this.currentCharacterIndex + 1];
            }
            GAME.emitOrder({ a: 2, char_id: nextCharID });
            setTimeout(()=>{
                BOT.updateID();
            },20);

        }

        prevChar() {
            let prevCharID = null;
            if (this.currentCharacterIndex == 0) {
                prevCharID = this.characters[this.characters.length - 1];
            } else {
                prevCharID = this.characters[this.currentCharacterIndex - 1];
            }
            GAME.emitOrder({ a: 2, char_id: prevCharID });
            setTimeout(()=>{
                BOT.updateID();
            },20);
        }

        collectDailyReward() {
            if(this.collectDaily){
                if (GAME.char_id != 0 && GAME.quick_opts.online_reward) {
                    setTimeout(() => {
                        GAME.socket.emit('ga', {
                            a: 26,
                            type: 1
                        });
                        setTimeout(() => {
                            $('#daily_reward').fadeOut();
                            kom_clear();
                        }, 400);
                    }, 500);
                }
            }
        }

        // Zapis na turnieje 
            // ! Dokończyć na socketach 
        registerTut(){
            if(this.tutRegister){
                if( this.tutRegisterTable[this.currentCharacterIndex][1] == 0 ){
                    const currentTime = new Date;
                    const currentHour = currentTime.getHours();
                    if ((currentHour >= 18) && (currentHour < 21)){
                        setTimeout(()=>{ 
                            const instMenu = document.getElementsByClassName("select_page");
                            instMenu[22].dispatchEvent(new MouseEvent('click'));
                            setTimeout(()=>{
                                const sign = $('#tour_list_tab .newBtn');
                                    this.tutRegisterTable[this.currentCharacterIndex][1] = 1;
                                    sign[0].dispatchEvent(new MouseEvent('click'));                               
                            }, 100);                
                        }, 200);
                    }
                }
            }
        }

    }



    
    // Uruchomnienie BOTA
    const BOT = new TOOL();
    // Pobranie danych z local storage
    BOT.getLocalData();
    
    // Pobranie listy postaci
    BOT.getCharacters();
    

    // Aktualizowanie ID postaci
    setInterval(()=>{
        BOT.updateID();
    }, 2000);

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
}   