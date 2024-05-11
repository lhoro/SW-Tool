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
            console.log("GID "+GAME.char_id);
            console.log("CID "+this.currentCharacterId)
            console.log("INDEX "+this.currentCharacterIndex);
        }

        updateID() {
            if (GAME.char_id != this.currentCharacterId) {
                this.currentCharacterId = GAME.char_id; 
                this.currentCharacterIndex = this.characters.indexOf(`${this.currentCharacterId }`);
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
                },200);
            }
        }


        nextChar() {
            BOT.showID();
            console.log("NEXT")
            let nextCharID = null;
            if (this.currentCharacterIndex == this.characters.length - 1) {
                nextCharID = this.characters[0];
            } else {
                nextCharID = this.characters[this.currentCharacterIndex + 1];
            }
            console.log(nextCharID)
            GAME.emitOrder({ a: 2, char_id: nextCharID });
            console.log("NEXT END")
        }

        prevChar() {
            BOT.showID();
            console.log("PREV")
            let prevCharID = null;
            if (this.currentCharacterIndex == this.characters.length - 1) {
                prevCharID = this.characters[this.characters.length - 1];
            } else {
                prevCharID = this.characters[this.currentCharacterIndex - 1];
            }
            console.log(prevCharID)
            //var charId = this.getPreviousCharId();
            //GAME.emitOrder({ a: 2, char_id: charId });
            console.log("PREV END")
        }

    }

    
    const BOT = new TOOL();
    BOT.getCharacters();




    
    setInterval(()=>{
        //BOT.showID();
        BOT.updateID();
    }, 2000);

    
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