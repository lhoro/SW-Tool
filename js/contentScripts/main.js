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
            this.currentCharacterIndex = -1;
            this.lastCharacterId = 0;
            this.characterSwitch = null;
            this.characterSwitchTimeout = null;
            this.config = { ...DEFAULT_CONFIG };
        }

        getLocalData() {
            const cachedChars = storageGetItem("chars", []);

            this.chars = Array.isArray(cachedChars)
                ? cachedChars
                : [];

            console.log("[SW Tool][PAGE] Cache postaci:", this.chars);
        }

        applyConfig(config) {
            this.config = normalizeConfig({
                ...this.config,
                ...config
            });

            setReportsHidden(this.config.hideReports);
            console.log("[SW Tool][PAGE] Zastosowano konfigurację:", this.config);
        }

        syncCharactersFromResponse(response) {
            const serverChars = Array.isArray(response?.chars)
                ? response.chars
                : [];

            if (serverChars.length === 0) {
                return false;
            }

            const previous = new Map(
                this.chars.map((char) => [String(char.id), char])
            );

            this.chars = serverChars
                .map((char) => {
                    const id = Number(char?.id || 0);
                    if (id <= 0) return null;

                    const cached = previous.get(String(id));

                    return {
                        id,
                        name: String(char?.name || ""),
                        surname: String(char?.surname || ""),
                        level: Number(char?.level || 0),
                        data: {
                            tutSave: Number(cached?.data?.tutSave || 0)
                        }
                    };
                })
                .filter(Boolean);

            storageSetItem("chars", this.chars);

            const activeId = Number(GAME.char_id || this.lastCharacterId || 0);
            this.currentCharacterIndex = this.chars.findIndex(
                (char) => Number(char.id) === activeId
            );

            console.info("[SW Tool][PAGE] RX lista postaci:", {
                count: this.chars.length,
                activeId
            });

            return this.chars.length > 0;
        }

        clearCharacterSwitch(reason = null) {
            if (this.characterSwitchTimeout) {
                clearTimeout(this.characterSwitchTimeout);
                this.characterSwitchTimeout = null;
            }

            if (reason) {
                console.warn("[SW Tool][PAGE] Zmiana postaci przerwana:", reason);
            }

            this.characterSwitch = null;
        }

        switchRelative(delta) {
            if (this.characterSwitch) {
                console.info("[SW Tool][PAGE] Zmiana postaci już trwa.");
                return;
            }

            const sourceId = Number(
                GAME.char_id ||
                this.lastCharacterId ||
                this.currentCharacterId ||
                0
            );

            if (sourceId <= 0) {
                console.warn("[SW Tool][PAGE] Brak aktywnej postaci do zmiany.");
                return;
            }

            if (!Array.isArray(this.chars) || this.chars.length === 0) {
                console.warn("[SW Tool][PAGE] Brak zapisanej listy postaci.");
                return;
            }

            const sourceIndex = this.chars.findIndex(
                (char) => Number(char.id) === sourceId
            );

            if (sourceIndex < 0) {
                console.warn(
                    "[SW Tool][PAGE] Aktualnej postaci nie ma w zapisanej liście:",
                    sourceId
                );
                return;
            }

            const targetIndex =
                (sourceIndex + delta + this.chars.length) %
                this.chars.length;
            const targetId = Number(this.chars[targetIndex]?.id || 0);

            if (targetId <= 0 || targetId === sourceId) {
                console.warn("[SW Tool][PAGE] Brak innej postaci do przełączenia.");
                return;
            }

            this.characterSwitch = {
                delta,
                sourceId,
                phase: "waitCharacter",
                targetId
            };

            this.characterSwitchTimeout = setTimeout(() => {
                this.clearCharacterSwitch("timeout odpowiedzi serwera");
            }, 15000);

            console.info("[SW Tool][PAGE] TX bezpośrednia zmiana postaci:", {
                a: 2,
                char_id: targetId,
                sourceId,
                sourceIndex,
                targetIndex,
                count: this.chars.length,
                direction: delta < 0 ? "prev" : "next"
            });

            GAME.emitOrder({
                a: 2,
                char_id: targetId
            });
        }

        nextChar() {
            this.switchRelative(1);
        }

        prevChar() {
            this.switchRelative(-1);
        }

        handleGameResponse(response) {
            if (!response || typeof response !== "object") return;

            const action = Number(response.a);
            const error = Number(response.e || 0);

            if (action === 1 && error === 0 && Array.isArray(response.chars)) {
                this.syncCharactersFromResponse(response);
                return;
            }

            const pending = this.characterSwitch;
            if (!pending) return;

            if (error !== 0 && [2, 999].includes(action)) {
                this.clearCharacterSwitch(
                    "serwer zwrócił błąd a=" + action + ", e=" + error
                );
                return;
            }

            if (
                action === 2 &&
                error === 0 &&
                pending.phase === "waitCharacter"
            ) {
                const responseCharId = Number(response.char_id || pending.targetId);

                if (
                    responseCharId === pending.targetId ||
                    Number(GAME.char_id || 0) === pending.targetId
                ) {
                    this.lastCharacterId = pending.targetId;
                    this.currentCharacterId = pending.targetId;
                    this.currentCharacterIndex = this.chars.findIndex(
                        (char) => Number(char.id) === pending.targetId
                    );

                    console.info("[SW Tool][PAGE] RX zmiana postaci potwierdzona:", {
                        a: 2,
                        char_id: pending.targetId
                    });

                    this.clearCharacterSwitch();
                }
            }
        }

        gameDebug() {
            console.log("Game ID " + GAME.char_id);
            console.log("Char ID " + this.currentCharacterId);
            console.log("INDEX " + this.currentCharacterIndex);
            console.log(this.chars);
            console.log(GAME);
        }

        updateID() {
            const gameCharacterId = Number(GAME.char_id || 0);

            // Podczas a:5 klient może chwilowo ustawić char_id=0.
            // Nie nadpisujemy wtedy ostatniej aktywnej postaci, bo jest ona
            // punktem odniesienia dla "," i ".".
            if (
                gameCharacterId > 0 &&
                gameCharacterId !== Number(this.currentCharacterId)
            ) {
                this.currentCharacterId = gameCharacterId;
                this.lastCharacterId = gameCharacterId;
                this.currentCharacterIndex = this.chars.findIndex(
                    (char) => Number(char.id) === gameCharacterId
                );

                console.info("[SW Tool][PAGE] Zmiana postaci:", {
                    charId: this.currentCharacterId,
                    charIndex: this.currentCharacterIndex
                });

                this.collectDailyReward();

                // Tymczasowo wyłączone na dev.
                // Stara wersja jest oparta o kliknięcia DOM.
                // this.registerTut();
            }
        }

        collectDailyReward() {
            if (!this.config.dailyReward) return;

            if (GAME.char_id != 0 && GAME.quick_opts?.online_reward) {
                setTimeout(() => {
                    console.info("[SW Tool][PAGE] Daily reward TX:", {
                        a: 26,
                        type: 1
                    });

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
                console.info("[SW Tool][PAGE] Legacy tournament registration start.");
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
        BOT.updateID();

        GAME.socket.on("gr", (response) => {
            BOT.handleGameResponse(response);
        });

        setInterval(() => {
            BOT.updateID();
        }, 500);

        $(document).keydown((event) => {
            if (
                event.repeat ||
                $("input, textarea, [contenteditable='true']").is(":focus")
            ) {
                return;
            }

            if (event.key === ",") {
                event.preventDefault();
                BOT.prevChar();
            } else if (event.key === ".") {
                event.preventDefault();
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