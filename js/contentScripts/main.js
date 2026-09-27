(() => {
    const SW_TOOL_CHANNEL = "SW_TOOL_BRIDGE_V1";
    const DEFAULT_CONFIG = Object.freeze({
        dailyReward: true,
        saveTuts: true,
        hideReports: false
    });

    let BOT = null;
    let pendingConfig = { ...DEFAULT_CONFIG };

    const normalizeConfig = (config) => {
        const source = config && typeof config === "object" ? config : {};

        return {
            dailyReward: typeof source.dailyReward === "boolean"
                ? source.dailyReward
                : DEFAULT_CONFIG.dailyReward,
            saveTuts: typeof source.saveTuts === "boolean"
                ? source.saveTuts
                : DEFAULT_CONFIG.saveTuts,
            hideReports: typeof source.hideReports === "boolean"
                ? source.hideReports
                : DEFAULT_CONFIG.hideReports
        };
    };

    const sendBridgeResponse = (requestId, ok, payload = {}, error = null) => {
        window.postMessage({
            channel: SW_TOOL_CHANNEL,
            direction: "page-to-extension",
            requestId,
            ok,
            payload,
            error
        }, window.location.origin);
    };

    const waitForGame = (timeout = 15000) => {
        const startedAt = Date.now();

        return new Promise((resolve, reject) => {
            const check = () => {
                const gameReady =
                    typeof window.GAME !== "undefined" &&
                    typeof window.jQuery !== "undefined" &&
                    typeof storageGetItem === "function" &&
                    typeof storageSetItem === "function" &&
                    typeof storageCheck === "function" &&
                    typeof setReportsHidden === "function";

                if (gameReady) {
                    resolve();
                    return;
                }

                if (Date.now() - startedAt >= timeout) {
                    reject(new Error("Klient gry GAME nie został wykryty w wymaganym czasie."));
                    return;
                }

                setTimeout(check, 100);
            };

            check();
        });
    };

    class TOOL {
        constructor() {
            this.chars = [];
            this.currentCharacterId = 0;
            this.currentCharacterIndex = 0;
            this.config = { ...DEFAULT_CONFIG };
        }

        getLocalData() {
            this.chars = storageGetItem("chars", []);

            if (!Array.isArray(this.chars)) {
                this.chars = [];
            }

            if (this.chars.length === 0) {
                this.getChars();
            }

            console.log("[SW Tool][PAGE] Postacie:", this.chars);
        }

        applyConfig(config) {
            this.config = normalizeConfig({
                ...this.config,
                ...config
            });

            setReportsHidden(this.config.hideReports);
            console.log("[SW Tool][PAGE] Zastosowano konfigurację:", this.config);
        }

        getChars() {
            setTimeout(() => {
                const allchars = [...$("li[data-option=select_char]")];

                if (allchars.length === 0) {
                    setTimeout(() => this.getChars(), 200);
                    return;
                }

                this.chars = allchars.map((element) => ({
                    id: element.getAttribute("data-char_id"),
                    data: {
                        tutSave: 0
                    }
                }));

                storageSetItem("chars", this.chars);
            }, 50);
        }

        nextChar() {
            if (this.chars.length === 0) return;

            let nextChar;

            if (this.currentCharacterIndex === this.chars.length - 1) {
                nextChar = this.chars[0];
                this.currentCharacterIndex = 0;
            } else {
                nextChar = this.chars[this.currentCharacterIndex + 1];
                this.currentCharacterIndex += 1;
            }

            GAME.emitOrder({ a: 2, char_id: nextChar.id });
        }

        prevChar() {
            if (this.chars.length === 0) return;

            let prevChar;

            if (this.currentCharacterIndex === 0) {
                prevChar = this.chars[this.chars.length - 1];
                this.currentCharacterIndex = this.chars.length - 1;
            } else {
                prevChar = this.chars[this.currentCharacterIndex - 1];
                this.currentCharacterIndex -= 1;
            }

            GAME.emitOrder({ a: 2, char_id: prevChar.id });
        }

        gameDebug() {
            console.log("Game ID " + GAME.char_id);
            console.log("Char ID " + this.currentCharacterId);
            console.log("INDEX " + this.currentCharacterIndex);
            console.log(this.chars);
            console.log(GAME);
        }

        updateID() {
            if (GAME.char_id != this.currentCharacterId) {
                this.currentCharacterId = GAME.char_id;
                this.currentCharacterIndex = this.chars.findIndex(
                    (char) => char.id == GAME.char_id
                );

                this.collectDailyReward();
                this.registerTut();
            }
        }

        collectDailyReward() {
            if (!this.config.dailyReward) return;

            if (GAME.char_id != 0 && GAME.quick_opts?.online_reward) {
                setTimeout(() => {
                    GAME.socket.emit("ga", {
                        a: 26,
                        type: 1
                    });

                    setTimeout(() => {
                        $("#daily_reward").fadeOut();

                        if (typeof kom_clear === "function") {
                            kom_clear();
                        }
                    }, 400);
                }, 50);
            }
        }

        registerTut() {
            if (!this.config.saveTuts) return;

            const currentChar = this.chars[this.currentCharacterIndex];
            if (!currentChar || !currentChar.data) return;
            if (currentChar.data.tutSave != 0) return;

            const currentHour = new Date().getHours();
            if (currentHour < 18 || currentHour >= 21) return;

            setTimeout(() => {
                const instMenu = document.getElementsByClassName("select_page");
                const tournamentMenu = instMenu[22];

                if (!tournamentMenu) return;
                tournamentMenu.dispatchEvent(new MouseEvent("click"));

                setTimeout(() => {
                    const sign = $("#tour_list_tab .newBtn");
                    if (!sign[0]) return;

                    sign[0].dispatchEvent(new MouseEvent("click"));
                    currentChar.data.tutSave = 1;
                    storageSetItem("chars", this.chars);
                }, 100);
            }, 200);
        }

        accountTutsRegister(index = 0) {
            if (this.chars.length === 0) return;

            if (index === 0) {
                setTimeout(() => {
                    GAME.emitOrder({
                        a: 2,
                        char_id: this.chars[index].id
                    });
                }, 200);
            }

            console.log("[SW Tool][PAGE] Turnieje, index:", index);

            if (index < this.chars.length - 1) {
                setTimeout(() => this.registerTut(), 1000);
                setTimeout(() => this.nextChar(), 2000);
                setTimeout(() => this.accountTutsRegister(index + 1), 3000);
            }
        }
    }

    const initTool = async () => {
        await waitForGame();

        storageCheck();

        BOT = new TOOL();
        BOT.applyConfig(pendingConfig);
        BOT.getLocalData();

        setInterval(() => {
            BOT.updateID();
        }, 2000);

        $(document).keydown((event) => {
            if ($("input, textarea").is(":focus")) return;

            if (event.key === ",") {
                BOT.prevChar();
            } else if (event.key === ".") {
                BOT.nextChar();
            }
        });

        console.info("[SW Tool][PAGE] TOOL gotowy.");
        return BOT;
    };

    const toolReadyPromise = initTool().catch((error) => {
        console.error("[SW Tool][PAGE] Inicjalizacja TOOL nie powiodła się.", error);
        throw error;
    });

    // Bridge rejestrujemy od razu. Nie zależy od tego, czy GAME jest już gotowe.
    window.addEventListener("message", async (event) => {
        if (event.source !== window || event.origin !== window.location.origin) return;

        const data = event.data;
        if (
            !data ||
            data.channel !== SW_TOOL_CHANNEL ||
            data.direction !== "extension-to-page" ||
            !data.requestId
        ) {
            return;
        }

        try {
            if (data.action === "config.apply") {
                pendingConfig = normalizeConfig(data.payload?.config);

                if (BOT) {
                    BOT.applyConfig(pendingConfig);
                }

                sendBridgeResponse(data.requestId, true, {
                    config: pendingConfig,
                    gameReady: Boolean(BOT)
                });
                return;
            }

            if (data.action === "action.run") {
                const tool = await toolReadyPromise;

                if (data.payload?.action === "accountTournaments") {
                    tool.accountTutsRegister();

                    sendBridgeResponse(data.requestId, true, {
                        started: true
                    });
                    return;
                }

                throw new Error(
                    "Nieznana akcja strony: " + String(data.payload?.action)
                );
            }

            throw new Error(
                "Nieznana akcja bridge: " + String(data.action)
            );
        } catch (error) {
            console.error("[SW Tool][PAGE]", error);

            sendBridgeResponse(
                data.requestId,
                false,
                {},
                error instanceof Error ? error.message : String(error)
            );
        }
    });

    console.info("[SW Tool][PAGE] Bridge zarejestrowany.");
})();

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