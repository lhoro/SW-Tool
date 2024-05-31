if( GAME === undefined){
    // Poza grą nic nie robi
}else{
    class TOOL{
        constructor() {
            this.characters = [];
            this.currentCharacterId = 0;
            this.currentCharacterIndex = 0;
            
        };
        
        showID(){
            console.log(this.characters)
            console.log("Game ID "+GAME.char_id);
            console.log("Char ID "+this.currentCharacterId)
            console.log("INDEX "+this.currentCharacterIndex);
        }

        updateID() {
            if (GAME.char_id != this.currentCharacterId) {
                this.currentCharacterId = GAME.char_id; 
                this.currentCharacterIndex = this.characters.indexOf(`${this.currentCharacterId }`);
                BOT.collectActivities();
            }
        }

        getCharacters() {
            if (GAME == undefined) {
                setTimeout(getCharacters, 200);
            } else {
                setTimeout(()=>{
                    let allCharacters = [...$("li[data-option=select_char]")];
                    if(allCharacters.length == 0) {
                        setTimeout(this.getCharacters, 200);
                    } else {
                        allCharacters.forEach((element, index, array) => {
                            this.characters.push(element.getAttribute("data-char_id"));
                        });
                    }
                },50);
            }
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

        createWindow() {
            console.log("CW");
        }

        collectActivities() {
            console.log("CA")
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
                }, 1800);
            }
        }

    }

    
    const BOT = new TOOL();
    BOT.getCharacters();
    BOT.createWindow();




    
    setInterval(()=>{
        BOT.updateID();
    }, 2000);

    // Przechwytywanie wciskania przycisków
    $(document).keydown((event) => {
        if (!$("input, textarea").is(":focus")) {
             if (event.key === ",") {
                BOT.prevChar();
            } else if (event.key === ".") {
                BOT.nextChar();
            }
        }
    });
    
}   