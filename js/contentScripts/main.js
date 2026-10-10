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
            this.currentCharacterSnapshot = null;
            this.responseWaiter = null;
            this.accountOperationRunning = false;
            this.trainingCaptchaWaiter = null;
            this.dailyRewardClaimStage = 0;
            this.dailyRewardClaimCharacterId = 0;
            this.dailyRewardClaimTimeout = null;
            this.currentQuickOptions = null;
            this.currentQuickOptionsCharacterId = 0;
            this.currentQuickOptionsFresh = false;
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
                            tutSave: Number(cached?.data?.tutSave || 0),
                            tutSaveUntil: Number(cached?.data?.tutSaveUntil || 0)
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
            if (this.accountOperationRunning) {
                console.info("[SW Tool][PAGE] Trwa operacja całego konta.");
                return;
            }

            if (this.dailyRewardClaimStage !== 0 || this.responseWaiter) {
                console.info(
                    "[SW Tool][PAGE] Trwa poprzednie zapytanie — zmiana postaci poczeka."
                );
                return;
            }

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
            }

            if (
                action === 2 &&
                error === 0 &&
                response.char_data &&
                typeof response.char_data === "object"
            ) {
                const responseCharId = Number(
                    response.char_id ||
                    GAME.char_id ||
                    this.currentCharacterId ||
                    0
                );

                this.currentCharacterSnapshot = response;

                if (responseCharId > 0) {
                    this.lastCharacterId = responseCharId;
                    this.currentCharacterId = responseCharId;
                    this.currentCharacterIndex = this.chars.findIndex(
                        (char) => Number(char.id) === responseCharId
                    );

                    if (
                        Number(this.currentQuickOptionsCharacterId) !==
                        responseCharId
                    ) {
                        this.currentQuickOptions = null;
                        this.currentQuickOptionsCharacterId = responseCharId;
                        this.currentQuickOptionsFresh = false;
                    }
                }
            }

            if (action === 3 && error === 0) {
                this.recordPortalsFromMapResponse(response);
            }

            if (
                action === 607 &&
                response.quick_opts &&
                typeof response.quick_opts === "object"
            ) {
                const quickCharacterId = Number(
                    GAME.char_id || this.currentCharacterId || 0
                );

                this.currentQuickOptions = {
                    ...response.quick_opts
                };
                this.currentQuickOptionsCharacterId = quickCharacterId;
                this.currentQuickOptionsFresh = quickCharacterId > 0;

                const dailyAvailable = this._enabled(
                    response.quick_opts.online_reward
                );

                if (this.dailyRewardClaimStage === 2 && !dailyAvailable) {
                    this.finishDailyRewardClaim("quick_opts");
                } else if (
                    dailyAvailable &&
                    this.dailyRewardClaimStage === 0 &&
                    !this.accountOperationRunning
                ) {
                    this.collectDailyReward();
                }
            }

            if (action === 26) {
                this.handleDailyRewardResponse(response);
            }

            this.routeResponseWaiter(response);

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

        getPortalMap() {
            const stored = storageGetItem("portalMap", null);
            const locations =
                stored &&
                typeof stored === "object" &&
                !Array.isArray(stored) &&
                stored.locations &&
                typeof stored.locations === "object" &&
                !Array.isArray(stored.locations)
                    ? stored.locations
                    : {};

            return {
                version: 1,
                updatedAt:
                    stored &&
                    typeof stored === "object" &&
                    typeof stored.updatedAt === "string"
                        ? stored.updatedAt
                        : null,
                locations
            };
        }

        clearPortalMap() {
            const empty = {
                version: 1,
                updatedAt: new Date().toISOString(),
                locations: {}
            };
            storageSetItem("portalMap", empty);
            console.info("[SW Tool][PORTALS] Rejestr portali wyczyszczony.");
            return empty;
        }

        portalLocationName(rawLoc) {
            if (!rawLoc || typeof rawLoc !== "object") return "";
            const pl = String(rawLoc.pl || "").trim();
            if (pl) return pl;
            return String(rawLoc.en || rawLoc.name || "").trim();
        }

        portalTargetName(rawPortal) {
            const data = rawPortal?.loc_data;
            if (!data || typeof data !== "object") return "";
            const pl = String(data.pl || "").trim();
            if (pl) return pl;
            return String(data.en || data.name || "").trim();
        }

        recordPortalsFromMapResponse(response) {
            const rawLoc = response?.loc;
            const rawPortals = response?.tps;

            if (
                !rawLoc ||
                typeof rawLoc !== "object" ||
                !Array.isArray(rawPortals)
            ) {
                return;
            }

            const locationId = this._int(rawLoc.id);
            if (locationId <= 0) return;

            const registry = this.getPortalMap();
            const locationKey = String(locationId);
            const existing = registry.locations[locationKey];
            const current =
                existing && typeof existing === "object"
                    ? existing
                    : {
                        id: locationId,
                        name: "",
                        portals: []
                    };

            current.id = locationId;
            current.name = this.portalLocationName(rawLoc) || current.name || "";

            const portalMap = new Map();
            if (Array.isArray(current.portals)) {
                for (const portal of current.portals) {
                    if (!portal || typeof portal !== "object") continue;
                    const key = [
                        this._int(portal.x),
                        this._int(portal.y),
                        this._int(portal.targetLocationId),
                        String(portal.targetLocationName || "")
                    ].join(":");
                    portalMap.set(key, portal);
                }
            }

            for (const raw of rawPortals) {
                if (!raw || typeof raw !== "object") continue;

                const x = this._int(raw.x);
                const y = this._int(raw.y);
                if (x <= 0 || y <= 0) continue;

                const targetLocationId = this._int(raw.target_loc);
                const targetLocationName = this.portalTargetName(raw);
                const locData =
                    raw.loc_data && typeof raw.loc_data === "object"
                        ? raw.loc_data
                        : {};

                const portal = {
                    fromLocationId: locationId,
                    fromLocationName: current.name,
                    x,
                    y,
                    targetLocationId,
                    targetLocationName,
                    levelRequirementEnabled: this._enabled(raw.lvl_req),
                    requiredLevel: this._int(locData.level),
                    requiredReborn: this._int(locData.reborn),
                    questRequirementEnabled: this._enabled(raw.need_quest),
                    questDone: this._enabled(raw.quest_done)
                };

                const key = [
                    x,
                    y,
                    targetLocationId,
                    targetLocationName
                ].join(":");

                portalMap.set(key, portal);
            }

            current.portals = [...portalMap.values()].sort((left, right) => {
                const byX = this._int(left.x) - this._int(right.x);
                if (byX !== 0) return byX;
                const byY = this._int(left.y) - this._int(right.y);
                if (byY !== 0) return byY;
                return (
                    this._int(left.targetLocationId) -
                    this._int(right.targetLocationId)
                );
            });
            current.updatedAt = new Date().toISOString();

            registry.locations[locationKey] = current;
            registry.updatedAt = current.updatedAt;
            storageSetItem("portalMap", registry);

            const totalLocations = Object.keys(registry.locations).length;
            const totalPortals = Object.values(registry.locations).reduce(
                (sum, location) =>
                    sum +
                    (Array.isArray(location?.portals)
                        ? location.portals.length
                        : 0),
                0
            );

            console.info("[SW Tool][PORTALS] Zapisano mapę:", {
                locationId,
                locationName: current.name,
                portalsOnMap: current.portals.length,
                totalLocations,
                totalPortals
            });
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

            // Podczas a:5 (np. synchronizacji operacji całego konta)
            // klient może chwilowo ustawić char_id=0. Nie nadpisujemy wtedy
            // ostatniej aktywnej postaci.
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

                if (
                    this.dailyRewardClaimStage !== 0 &&
                    Number(this.dailyRewardClaimCharacterId) !== gameCharacterId
                ) {
                    this.resetDailyRewardClaim(
                        "zmiana postaci podczas odbioru nagrody"
                    );
                }

                if (!this.accountOperationRunning) {
                    this.collectDailyReward();
                }

                // Tymczasowo wyłączone na dev.
                // Stara wersja jest oparta o kliknięcia DOM.
                // this.registerTut();
            }
        }

        collectDailyReward() {
            if (
                !this.config.dailyReward ||
                this.accountOperationRunning ||
                this.characterSwitch ||
                this.responseWaiter ||
                Number(GAME.char_id || 0) <= 0 ||
                !this._enabled(GAME.quick_opts?.online_reward) ||
                this.dailyRewardClaimStage !== 0
            ) {
                return;
            }

            const characterId = Number(GAME.char_id);
            this.dailyRewardClaimCharacterId = characterId;
            this.dailyRewardClaimStage = 1;

            setTimeout(() => {
                if (
                    this.dailyRewardClaimStage !== 1 ||
                    Number(GAME.char_id || 0) !== characterId
                ) {
                    if (this.dailyRewardClaimStage !== 0) {
                        this.resetDailyRewardClaim(
                            "postać zmieniła się przed pobraniem danych nagrody"
                        );
                    }
                    return;
                }

                try {
                    if (!GAME.socket?.connected) {
                        throw new Error("Socket.IO nie jest połączone.");
                    }

                    console.info("[SW Tool][PAGE] Daily reward TX:", {
                        a: 26,
                        type: 0,
                        charId: characterId
                    });

                    GAME.socket.emit("ga", {
                        a: 26,
                        type: 0
                    });
                    this.armDailyRewardTimeout();
                } catch (error) {
                    console.error(
                        "[SW Tool][PAGE] Nie udało się pobrać danych nagrody dziennej:",
                        error
                    );
                    this.resetDailyRewardClaim("błąd wysyłki type=0");
                }
            }, 50);
        }

        handleDailyRewardResponse(response) {
            if (
                !response ||
                Number(response.a) !== 26 ||
                this.dailyRewardClaimStage === 0
            ) {
                return;
            }

            const characterId = Number(GAME.char_id || 0);
            if (
                characterId <= 0 ||
                characterId !== Number(this.dailyRewardClaimCharacterId)
            ) {
                this.resetDailyRewardClaim(
                    "odpowiedź nagrody dotyczy już innej postaci"
                );
                return;
            }

            const error = this._int(response.e);
            if (error !== 0) {
                console.error(
                    "[SW Tool][PAGE] Serwer odrzucił operację nagrody dziennej:",
                    { e: error, stage: this.dailyRewardClaimStage }
                );
                this.resetDailyRewardClaim("błąd serwera e=" + error);
                return;
            }

            if (this.dailyRewardClaimStage === 1) {
                if (!Array.isArray(response.daily_data)) {
                    console.error(
                        "[SW Tool][PAGE] Serwer nie zwrócił daily_data dla nagrody dziennej."
                    );
                    this.resetDailyRewardClaim("brak daily_data");
                    return;
                }

                this.dailyRewardClaimStage = 2;

                try {
                    if (!GAME.socket?.connected) {
                        throw new Error("Socket.IO nie jest połączone.");
                    }

                    console.info("[SW Tool][PAGE] Daily reward TX:", {
                        a: 26,
                        type: 1,
                        charId: characterId
                    });

                    GAME.socket.emit("ga", {
                        a: 26,
                        type: 1
                    });
                    this.armDailyRewardTimeout();
                } catch (error) {
                    console.error(
                        "[SW Tool][PAGE] Nie udało się odebrać nagrody dziennej:",
                        error
                    );
                    this.resetDailyRewardClaim("błąd wysyłki type=1");
                }
                return;
            }

            if (this.dailyRewardClaimStage === 2) {
                this.finishDailyRewardClaim("a=26");
            }
        }

        armDailyRewardTimeout() {
            clearTimeout(this.dailyRewardClaimTimeout);

            this.dailyRewardClaimTimeout = setTimeout(() => {
                if (this.dailyRewardClaimStage === 0) return;

                console.warn(
                    "[SW Tool][PAGE] Timeout operacji nagrody dziennej:",
                    {
                        stage: this.dailyRewardClaimStage,
                        charId: this.dailyRewardClaimCharacterId
                    }
                );

                this.resetDailyRewardClaim("timeout");
            }, 15000);
        }

        finishDailyRewardClaim(source = "response") {
            const characterId = this.dailyRewardClaimCharacterId;
            this.resetDailyRewardClaim();

            if (GAME.quick_opts && typeof GAME.quick_opts === "object") {
                GAME.quick_opts.online_reward = 0;
            }

            if (
                this.currentQuickOptions &&
                typeof this.currentQuickOptions === "object" &&
                Number(this.currentQuickOptionsCharacterId) === Number(characterId)
            ) {
                this.currentQuickOptions.online_reward = 0;
                this.currentQuickOptionsFresh = true;
            }

            console.info("[SW Tool][PAGE] Nagroda dzienna odebrana:", {
                charId: characterId,
                source
            });

            setTimeout(() => {
                $("#daily_reward").fadeOut();

                if (typeof kom_clear === "function") {
                    kom_clear();
                }
            }, 400);
        }

        resetDailyRewardClaim(reason = "") {
            clearTimeout(this.dailyRewardClaimTimeout);
            this.dailyRewardClaimTimeout = null;
            this.dailyRewardClaimStage = 0;
            this.dailyRewardClaimCharacterId = 0;

            if (reason) {
                console.info(
                    "[SW Tool][PAGE] Reset odbioru nagrody dziennej:",
                    reason
                );
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

        _int(value) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        _enabled(value) {
            return !(
                value === null ||
                value === undefined ||
                value === false ||
                value === 0 ||
                value === "0" ||
                value === ""
            );
        }

        isTournamentWindowOpen(date = new Date()) {
            const hour = date.getHours();
            return hour >= 18 && hour < 21;
        }

        sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }

        isFatalAccountError(error) {
            return Boolean(error?.swToolFatalAuth);
        }

        routeResponseWaiter(response) {
            const waiter = this.responseWaiter;
            if (!waiter) return;

            const action = this._int(response.a);
            const initError = action === 999 && this._int(response.e) !== 0;

            if (!waiter.actions.has(action) && !initError) return;
            if (!initError && waiter.predicate && !waiter.predicate(response)) {
                return;
            }

            this.responseWaiter = null;
            clearTimeout(waiter.timeoutId);

            console.info("[SW Tool][ACCOUNT] RX GR:", {
                a: this._int(response.a),
                type: response.type,
                e: response.e
            });

            if (initError) {
                const error = new Error(
                    "Serwer zgłosił błąd autoryzacji sesji (a=999, e=" +
                    this._int(response.e) +
                    ")."
                );
                error.swToolFatalAuth = true;
                waiter.reject(error);
                return;
            }

            waiter.resolve(response);
        }

        sendAndWait(order, expectedActions, predicate = null, timeoutMs = 15000) {
            if (this.responseWaiter) {
                return Promise.reject(
                    new Error("Trwa już oczekiwanie na odpowiedź serwera.")
                );
            }

            const actions = new Set(
                (Array.isArray(expectedActions)
                    ? expectedActions
                    : [expectedActions]
                ).map(Number)
            );

            return new Promise((resolve, reject) => {
                const waiter = {
                    actions,
                    predicate,
                    resolve,
                    reject,
                    timeoutId: null
                };

                waiter.timeoutId = setTimeout(() => {
                    if (this.responseWaiter === waiter) {
                        this.responseWaiter = null;
                    }
                    reject(new Error("Timeout odpowiedzi serwera."));
                }, timeoutMs);

                this.responseWaiter = waiter;

                try {
                    const safeOrder = {
                        ...order,
                        ...(order.captchaResponse
                            ? { captchaResponse: "<ukryty token>" }
                            : {})
                    };

                    console.info("[SW Tool][ACCOUNT] TX GA:", safeOrder);

                    if (!GAME.socket?.connected) {
                        throw new Error("Socket.IO nie jest połączone.");
                    }

                    // APP wysyła operacje bezpośrednio jako socket.emit("ga", data).
                    // Dla workflow całego konta robimy dokładnie to samo.
                    GAME.socket.emit("ga", order);
                } catch (error) {
                    clearTimeout(waiter.timeoutId);
                    if (this.responseWaiter === waiter) {
                        this.responseWaiter = null;
                    }
                    reject(error);
                }
            });
        }

        waitForCharacterSettled(targetId, timeoutMs = 3000, settleMs = 150) {
            const startedAt = Date.now();

            return new Promise((resolve, reject) => {
                const check = () => {
                    if (Number(GAME.char_id || 0) === Number(targetId)) {
                        // Oficjalny klient potrafi jeszcze dokończyć aktualizację
                        // własnego stanu po RX a:2. Jedna krótka tura zapobiega
                        // wysłaniu kolejnej akcji zbyt wcześnie.
                        setTimeout(resolve, settleMs);
                        return;
                    }

                    if (Date.now() - startedAt >= timeoutMs) {
                        reject(
                            new Error(
                                "Klient WWW nie ustawił aktywnej postaci " +
                                targetId +
                                " po odpowiedzi a:2."
                            )
                        );
                        return;
                    }

                    setTimeout(check, 25);
                };

                check();
            });
        }

        async switchCharacterForAccountAction(charId, settleMs = 150) {
            const targetId = Number(charId);
            if (targetId <= 0) throw new Error("Nieprawidłowe ID postaci.");

            if (
                Number(GAME.char_id || this.currentCharacterId || 0) === targetId &&
                this.currentCharacterSnapshot?.char_data
            ) {
                return this.currentCharacterSnapshot;
            }

            // Operacje całego konta naśladują synchronizację z APP:
            // relog a:5 -> lista a:1 -> wybór a:2 -> pełne char_data.
            // Skróty "," i "." nadal przełączają postać bezpośrednim a:2.
            const listResponse = await this.sendAndWait(
                { a: 5 },
                [1, 999],
                (event) =>
                    this._int(event.e) !== 0 ||
                    (
                        this._int(event.a) === 1 &&
                        Array.isArray(event.chars)
                    ),
                15000
            );

            if (this._int(listResponse.e) !== 0) {
                throw new Error(
                    "Serwer odrzucił synchronizację listy postaci."
                );
            }

            if (!Array.isArray(listResponse.chars)) {
                throw new Error("Serwer nie zwrócił listy postaci.");
            }

            // handleGameResponse() synchronizuje this.chars przed rozwiązaniem
            // waitera, ale sprawdzamy target także na surowej odpowiedzi.
            const targetExists = listResponse.chars.some((char) =>
                this._int(char?.id) === targetId
            );

            if (!targetExists) {
                throw new Error(
                    "Wybranej postaci nie ma na liście zwróconej przez serwer."
                );
            }

            this.currentCharacterSnapshot = null;
            this.currentQuickOptions = null;
            this.currentQuickOptionsCharacterId = targetId;
            this.currentQuickOptionsFresh = false;

            const response = await this.sendAndWait(
                { a: 2, char_id: targetId },
                [2, 999],
                (event) =>
                    this._int(event.e) !== 0 ||
                    (
                        this._int(event.a) === 2 &&
                        this._int(event.char_id || targetId) === targetId &&
                        event.char_data &&
                        typeof event.char_data === "object"
                    ),
                20000
            );

            if (this._int(response.e) !== 0) {
                throw new Error("Serwer odrzucił zmianę postaci.");
            }

            if (!response.char_data || typeof response.char_data !== "object") {
                throw new Error("Serwer nie zwrócił pełnych danych postaci.");
            }

            this.currentCharacterSnapshot = response;
            this.lastCharacterId = targetId;
            this.currentCharacterId = targetId;
            this.currentCharacterIndex = this.chars.findIndex(
                (char) => Number(char.id) === targetId
            );

            await this.waitForCharacterSettled(targetId, 3000, settleMs);

            console.info("[SW Tool][ACCOUNT] Postać gotowa:", {
                char_id: targetId
            });

            return response;
        }

        characterData() {
            const data = this.currentCharacterSnapshot?.char_data;
            return data && typeof data === "object" ? data : null;
        }

        async waitForAccountQuickOptions(characterId, timeoutMs = 1500) {
            const targetId = Number(characterId || 0);
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                if (
                    this.currentQuickOptionsFresh &&
                    Number(this.currentQuickOptionsCharacterId) === targetId &&
                    this.currentQuickOptions &&
                    typeof this.currentQuickOptions === "object"
                ) {
                    return this.currentQuickOptions;
                }

                await this.sleep(25);
            }

            // Fallback dla sytuacji, gdy oficjalny klient WWW zdążył już
            // zaktualizować GAME.quick_opts, ale a:607 nie został przechwycony.
            if (
                Number(GAME.char_id || 0) === targetId &&
                GAME.quick_opts &&
                typeof GAME.quick_opts === "object"
            ) {
                this.currentQuickOptions = {
                    ...GAME.quick_opts
                };
                this.currentQuickOptionsCharacterId = targetId;
                this.currentQuickOptionsFresh = true;
                return this.currentQuickOptions;
            }

            return null;
        }

        async claimDailyRewardForAccountAction(characterName) {
            if (!this.config.dailyReward) return false;

            const characterId = Number(
                GAME.char_id || this.currentCharacterId || 0
            );
            if (characterId <= 0) return false;

            const quickOptions = await this.waitForAccountQuickOptions(
                characterId
            );

            if (
                !quickOptions ||
                !this._enabled(quickOptions.online_reward)
            ) {
                return false;
            }

            try {
                console.info(
                    "[SW Tool][ACCOUNT] Nagroda dzienna — odbieranie:",
                    {
                        character: characterName,
                        charId: characterId
                    }
                );

                const data = await this.sendAndWait(
                    { a: 26, type: 0 },
                    [26, 999],
                    (event) =>
                        this._int(event.e) !== 0 ||
                        (
                            this._int(event.a) === 26 &&
                            Array.isArray(event.daily_data)
                        ),
                    15000
                );

                if (this._int(data.e) !== 0) {
                    throw new Error(
                        "Serwer odrzucił pobranie danych nagrody dziennej."
                    );
                }

                if (!Array.isArray(data.daily_data)) {
                    throw new Error(
                        "Serwer nie zwrócił danych nagrody dziennej."
                    );
                }

                await this.sleep(100);

                const claimed = await this.sendAndWait(
                    { a: 26, type: 1 },
                    [26, 607, 999],
                    (event) =>
                        this._int(event.e) !== 0 ||
                        this._int(event.a) === 26 ||
                        (
                            this._int(event.a) === 607 &&
                            event.quick_opts &&
                            typeof event.quick_opts === "object" &&
                            !this._enabled(event.quick_opts.online_reward)
                        ),
                    15000
                );

                if (this._int(claimed.e) !== 0) {
                    throw new Error(
                        "Serwer odrzucił odbiór nagrody dziennej."
                    );
                }

                if (
                    GAME.quick_opts &&
                    typeof GAME.quick_opts === "object"
                ) {
                    GAME.quick_opts.online_reward = 0;
                }

                if (
                    this.currentQuickOptions &&
                    typeof this.currentQuickOptions === "object" &&
                    Number(this.currentQuickOptionsCharacterId) === characterId
                ) {
                    this.currentQuickOptions.online_reward = 0;
                    this.currentQuickOptionsFresh = true;
                }

                setTimeout(() => {
                    $("#daily_reward").fadeOut();

                    if (typeof kom_clear === "function") {
                        kom_clear();
                    }
                }, 400);

                console.info(
                    "[SW Tool][ACCOUNT] Nagroda dzienna odebrana:",
                    {
                        character: characterName,
                        charId: characterId
                    }
                );

                await this.sleep(100);
                return true;
            } catch (error) {
                if (this.isFatalAccountError(error)) {
                    throw error;
                }

                console.warn(
                    "[SW Tool][ACCOUNT] Nagroda dzienna — " +
                    characterName + ":",
                    error
                );
                return false;
            }
        }

        snapshotBonusActive(bonusId) {
            const bonuses = this.currentCharacterSnapshot?.char_tables?.bonusy;
            if (!Array.isArray(bonuses)) return false;
            const now = Math.floor(Date.now() / 1000);

            return bonuses.some((bonus) =>
                bonus &&
                typeof bonus === "object" &&
                this._int(bonus.bonus_id) === bonusId &&
                this._int(bonus.expires) > now
            );
        }

        activeTimedActionsCount() {
            const timed = this.currentCharacterSnapshot?.char_tables?.timed_actions;
            if (!Array.isArray(timed)) return 0;
            const now = Math.floor(Date.now() / 1000);

            return timed.filter((item) =>
                item &&
                typeof item === "object" &&
                this._int(item.end) > now
            ).length;
        }

        defaultTrainingSkill() {
            const character = this.characterData();
            if (!character) return null;

            const skills = [
                [8, "tai"], [9, "ken"], [10, "shuriken"], [11, "nin"],
                [1, "nin_fire"], [2, "nin_water"], [3, "nin_earth"],
                [4, "nin_wind"], [5, "nin_thunder"], [6, "gen"],
                [7, "kin"], [13, "sen"], [12, "fuin"]
            ];

            let bestId = null;
            let bestValue = -1;

            for (const [id, field] of skills) {
                const value = this._int(character[field]);
                if (value <= 0) continue;
                if (bestId === null || value > bestValue) {
                    bestId = id;
                    bestValue = value;
                }
            }

            return bestId;
        }

        isTournamentCategoryForCharacter(cat, reborn, level) {
            if (reborn !== 0 || cat < 1 || cat > 16) return false;
            const minLevel = 15 + ((cat - 1) * 15);
            return cat === 16
                ? level >= minLevel
                : level >= minLevel && level <= minLevel + 14;
        }

        tourServerSaysJoined(tour, characterId) {
            const directKeys = [
                "signed", "joined", "registered", "is_signed",
                "is_member", "in_tour", "my", "mine"
            ];

            if (directKeys.some((key) => this._enabled(tour?.[key]))) {
                return true;
            }

            for (const key of ["members", "member_ids", "players", "participants"]) {
                const members = tour?.[key];
                if (!Array.isArray(members)) continue;

                for (const member of members) {
                    if (this._int(member) === characterId) return true;
                    if (
                        member &&
                        typeof member === "object" &&
                        (
                            this._int(member.id) === characterId ||
                            this._int(member.char_id) === characterId
                        )
                    ) {
                        return true;
                    }
                }
            }

            return false;
        }

        findJoinableTournament(tours, characterId) {
            const character = this.characterData();
            if (!character || !Array.isArray(tours)) return null;

            const now = Math.floor(Date.now() / 1000);
            const level = this._int(character.level);
            const reborn = this._int(character.reborn);

            const candidates = tours.filter((tour) => {
                if (!tour || typeof tour !== "object") return false;
                if (this._int(tour.type) !== 0 || this._int(tour.status) !== 0) {
                    return false;
                }
                if (this._int(tour.end_time) <= now) return false;

                const maxMembers = this._int(tour.max_members);
                if (
                    maxMembers > 0 &&
                    this._int(tour.members_in) >= maxMembers
                ) {
                    return false;
                }

                return this.isTournamentCategoryForCharacter(
                    this._int(tour.cat),
                    reborn,
                    level
                );
            });

            candidates.sort(
                (a, b) => this._int(a.end_time) - this._int(b.end_time)
            );

            for (const tour of candidates) {
                if (this._int(tour.id) <= 0) continue;
                if (this.tourServerSaysJoined(tour, characterId)) return null;
                return tour;
            }

            return null;
        }

        async restoreAccountCharacter(originalCharacterId) {
            const originalId = Number(originalCharacterId || 0);
            if (
                originalId <= 0 ||
                Number(GAME.char_id || this.currentCharacterId || 0) === originalId
            ) {
                return;
            }

            try {
                await this.switchCharacterForAccountAction(originalId);
            } catch (error) {
                console.warn("[SW Tool][ACCOUNT] Przywrócenie postaci:", error);
            }
        }

        async runAccountTournaments() {
            if (!this.isTournamentWindowOpen()) {
                throw new Error(
                    "Turnieje są dostępne tylko w godzinach 18:00–21:00."
                );
            }

            const characters = [...this.chars];
            const originalId = Number(
                GAME.char_id || this.lastCharacterId || this.currentCharacterId || 0
            );
            let joined = 0, skipped = 0, failed = 0;

            try {
                for (let i = 0; i < characters.length; i++) {
                    const char = characters[i];
                    const id = Number(char.id);
                    const label = char.name || ("#" + id);
                    const now = Math.floor(Date.now() / 1000);

                    console.info("[SW Tool][ACCOUNT] Turnieje " + (i + 1) + "/" + characters.length + ": " + label);

                    if (Number(char.data?.tutSaveUntil || 0) > now) {
                        skipped++;
                        continue;
                    }

                    try {
                        await this.switchCharacterForAccountAction(id);
                        const list = await this.sendAndWait(
                            { a: 57, type: 0, type2: 0, page: 1 },
                            57
                        );

                        if (this._int(list.e) !== 0 || !Array.isArray(list.tours)) {
                            throw new Error("Błąd listy turniejów.");
                        }

                        const tour = this.findJoinableTournament(list.tours, id);
                        if (!tour) {
                            skipped++;
                            continue;
                        }

                        const join = await this.sendAndWait(
                            { a: 57, type: 1, tid: this._int(tour.id) },
                            57
                        );

                        if (this._int(join.e) !== 0) {
                            throw new Error("Serwer odrzucił zapis.");
                        }

                        char.data = char.data || {};
                        char.data.tutSaveUntil = this._int(tour.end_time);
                        storageSetItem("chars", this.chars);
                        joined++;
                    } catch (error) {
                        failed++;
                        console.warn("[SW Tool][ACCOUNT] Turnieje — " + label + ":", error);
                    }
                }
            } finally {
                await this.restoreAccountCharacter(originalId);
            }

            console.info("[SW Tool][ACCOUNT] Turnieje zakończone:", { joined, skipped, failed });
        }

        waitForGameCaptcha(timeoutMs = 15000) {
            const startedAt = Date.now();

            return new Promise((resolve, reject) => {
                const check = () => {
                    if (
                        window.GameCaptcha &&
                        typeof window.GameCaptcha.render === "function" &&
                        typeof window.GameCaptcha.getResponse === "function"
                    ) {
                        resolve(window.GameCaptcha);
                        return;
                    }

                    if (Date.now() - startedAt >= timeoutMs) {
                        reject(
                            new Error(
                                "Widget Turnstile gry nie jest dostępny na stronie."
                            )
                        );
                        return;
                    }

                    setTimeout(check, 100);
                };

                check();
            });
        }

        async waitForTrainingCaptcha(characterName) {
            if (this.trainingCaptchaWaiter) {
                throw new Error("Trwa już weryfikacja Turnstile.");
            }

            const GameCaptcha = await this.waitForGameCaptcha();
            const name = String(characterName || "postać");

            return new Promise((resolve, reject) => {
                let widget = null;
                let pollId = null;
                let timeoutId = null;
                let finished = false;

                const overlay = document.createElement("div");
                overlay.id = "sw-tool-training-captcha";
                Object.assign(overlay.style, {
                    position: "fixed",
                    inset: "0",
                    zIndex: "2147483647",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0, 0, 0, 0.72)"
                });

                const panel = document.createElement("div");
                Object.assign(panel.style, {
                    width: "min(420px, calc(100vw - 32px))",
                    padding: "18px",
                    border: "2px solid #c29e51",
                    borderRadius: "10px",
                    background: "#2b2540",
                    color: "#fff",
                    fontFamily: "Verdana, sans-serif",
                    boxShadow: "0 10px 40px rgba(0,0,0,.55)"
                });

                const title = document.createElement("div");
                title.textContent = "Potwierdź trening — " + name;
                Object.assign(title.style, {
                    marginBottom: "8px",
                    color: "#c29e51",
                    fontWeight: "700",
                    fontSize: "16px"
                });

                const status = document.createElement("div");
                status.textContent =
                    "Trwa weryfikacja. Jeśli pojawi się test, rozwiąż go.";
                Object.assign(status.style, {
                    marginBottom: "12px",
                    fontSize: "12px",
                    lineHeight: "1.4",
                    color: "#ddd"
                });

                const challenge = document.createElement("div");
                Object.assign(challenge.style, {
                    minHeight: "80px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "12px"
                });

                const cancel = document.createElement("button");
                cancel.type = "button";
                cancel.textContent = "Anuluj treningi";
                Object.assign(cancel.style, {
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #c29e51",
                    borderRadius: "6px",
                    background: "#3a314d",
                    color: "#fff",
                    cursor: "pointer"
                });

                panel.append(title, status, challenge, cancel);
                overlay.appendChild(panel);
                document.body.appendChild(overlay);

                const cleanup = () => {
                    if (pollId !== null) clearInterval(pollId);
                    if (timeoutId !== null) clearTimeout(timeoutId);

                    try {
                        if (
                            widget !== null &&
                            typeof GameCaptcha.remove === "function"
                        ) {
                            GameCaptcha.remove(widget);
                        }
                    } catch (_) {
                        // Usunięcie DOM poniżej wystarczy jako fallback.
                    }

                    overlay.remove();
                    this.trainingCaptchaWaiter = null;
                };

                const finish = (callback, value) => {
                    if (finished) return;
                    finished = true;
                    cleanup();
                    callback(value);
                };

                cancel.addEventListener("click", () => {
                    finish(
                        reject,
                        new Error("Weryfikacja Turnstile została anulowana.")
                    );
                });

                this.trainingCaptchaWaiter = {
                    cancel: () => {
                        finish(
                            reject,
                            new Error("Weryfikacja Turnstile została przerwana.")
                        );
                    }
                };

                try {
                    widget = GameCaptcha.render(challenge);
                } catch (error) {
                    finish(
                        reject,
                        new Error("Nie udało się uruchomić Turnstile.")
                    );
                    return;
                }

                pollId = setInterval(() => {
                    if (finished) return;

                    try {
                        const token = String(
                            GameCaptcha.getResponse(widget) || ""
                        ).trim();

                        if (!token) return;

                        if (
                            token.length < 20 ||
                            token.length > 2048 ||
                            /\s/.test(token)
                        ) {
                            status.textContent =
                                "Weryfikacja zwróciła nieprawidłowy wynik.";
                            return;
                        }

                        status.textContent = "Weryfikacja zakończona.";
                        console.info(
                            "[SW Tool][ACCOUNT] Turnstile potwierdzony dla treningu."
                        );

                        finish(resolve, token);
                    } catch (_) {
                        // Widget może jeszcze nie być gotowy; następny poll spróbuje ponownie.
                    }
                }, 500);

                timeoutId = setTimeout(() => {
                    finish(
                        reject,
                        new Error(
                            "Przekroczono czas oczekiwania na potwierdzenie Turnstile."
                        )
                    );
                }, 180000);
            });
        }

        async startMaxTrainingForCurrentCharacter(characterName) {
            const maxActions = this.snapshotBonusActive(2) ? 2 : 1;
            if (this.activeTimedActionsCount() >= maxActions) {
                return "timed";
            }

            const skillId = this.defaultTrainingSkill();
            if (!skillId) return "skill";

            const trainingData = await this.sendAndWait(
                { a: 8, type: 1 },
                8,
                (event) =>
                    this._int(event.type) === 1 ||
                    (event.train_res && typeof event.train_res === "object") ||
                    this._int(event.e) !== 0
            );

            if (this._int(trainingData.e) !== 0) {
                throw new Error("Serwer odrzucił dane treningu.");
            }

            let captchaToken = null;
            const captchaRequired = this._enabled(trainingData.captcha);

            console.info("[SW Tool][ACCOUNT] Sprawdzenie Turnstile:", {
                character: characterName,
                required: captchaRequired
            });

            if (captchaRequired) {
                console.info(
                    "[SW Tool][ACCOUNT] Trening wymaga Turnstile:",
                    characterName
                );

                // Token jest jednorazowy i dotyczy wyłącznie tej postaci.
                // Kolejna postać zawsze wykonuje własne a:8/type:1
                // i ponownie sprawdza pole captcha.
                captchaToken = await this.waitForTrainingCaptcha(
                    characterName
                );
            }

            const duration = this.snapshotBonusActive(1) ? 12 : 6;

            // Po odpowiedzi a:8/type:1 (i ewentualnym Turnstile) zostawiamy
            // klientowi WWW 100 ms przed wysłaniem właściwego startu treningu.
            await this.sleep(100);

            const started = await this.sendAndWait(
                {
                    a: 8,
                    type: 2,
                    stat: String(skillId),
                    duration: String(duration),
                    ...(captchaToken
                        ? { captchaResponse: captchaToken }
                        : {})
                },
                8,
                (event) =>
                    this._int(event.type) === 2 ||
                    Array.isArray(event.timed) ||
                    event.done !== undefined ||
                    this._int(event.e) !== 0,
                20000
            );

            if (this._int(started.e) !== 0) {
                throw new Error("Serwer odrzucił rozpoczęcie treningu.");
            }

            if (
                Array.isArray(started.timed) &&
                this.currentCharacterSnapshot?.char_tables
            ) {
                this.currentCharacterSnapshot.char_tables.timed_actions = started.timed;
            }

            return "started";
        }

        async runAccountTrainings() {
            const characters = [...this.chars];
            const originalId = Number(
                GAME.char_id || this.lastCharacterId || this.currentCharacterId || 0
            );
            let started = 0, skipped = 0, failed = 0, dailyClaimed = 0;

            try {
                for (let i = 0; i < characters.length; i++) {
                    const char = characters[i];
                    const label = char.name || ("#" + Number(char.id));
                    console.info("[SW Tool][ACCOUNT] Treningi " + (i + 1) + "/" + characters.length + ": " + label);

                    try {
                        await this.switchCharacterForAccountAction(
                            Number(char.id),
                            0
                        );

                        // Po pełnym a:2 dajemy klientowi WWW czas na
                        // zsynchronizowanie aktywnej postaci przed a:8.
                        await this.sleep(200);

                        if (
                            await this.claimDailyRewardForAccountAction(label)
                        ) {
                            dailyClaimed++;
                        }

                        const result =
                            await this.startMaxTrainingForCurrentCharacter(
                                label
                            );

                        if (result === "started") started++;
                        else skipped++;
                    } catch (error) {
                        if (this.isFatalAccountError(error)) {
                            throw error;
                        }

                        failed++;
                        console.warn("[SW Tool][ACCOUNT] Treningi — " + label + ":", error);
                    } finally {
                        // Nie przechodzimy od razu do kolejnego a:5/a:2.
                        await this.sleep(200);
                    }
                }
            } finally {
                await this.restoreAccountCharacter(originalId);
            }

            console.info("[SW Tool][ACCOUNT] Treningi zakończone:", {
                started,
                skipped,
                failed,
                dailyClaimed
            });
        }

        async attackArenaForCurrentCharacter() {
            const list = await this.sendAndWait(
                { a: 46, type: 0 },
                46,
                (event) =>
                    (event.area_oponents && typeof event.area_oponents === "object") ||
                    this._int(event.e) !== 0
            );

            if (this._int(list.e) !== 0) {
                throw new Error("Serwer odrzucił listę Areny PvP.");
            }

            const players = list.area_oponents?.players;
            if (!Array.isArray(players)) {
                throw new Error("Brak listy graczy Areny PvP.");
            }

            // Klient WWW dostaje chwilę na przetworzenie odpowiedzi listy Areny
            // zanim wyślemy pierwszą akcję ataku.
            await this.sleep(100);

            const now = Math.floor(Date.now() / 1000);
            let attacked = 0, skipped = 0, failed = 0;

            for (let index = 0; index < players.length; index++) {
                const raw = players[index];

                if (
                    !raw ||
                    typeof raw !== "object" ||
                    !raw.data ||
                    typeof raw.data !== "object" ||
                    this._int(raw.data.id) <= 0
                ) {
                    skipped++;
                    continue;
                }

                if (this._int(raw.cd) > now) {
                    skipped++;
                    continue;
                }

                try {
                    const attack = await this.sendAndWait(
                        { a: 46, type: 1, index },
                        [7, 46],
                        (event) =>
                            this._int(event.e) !== 0 ||
                            event.result !== undefined ||
                            event.apvp_cd !== undefined ||
                            (
                                this._int(event.a) === 46 &&
                                this._int(event.type) === 1
                            ),
                        30000
                    );

                    if (this._int(attack.e) === 0) attacked++;
                    else failed++;
                } catch (error) {
                    if (this.isFatalAccountError(error)) {
                        throw error;
                    }

                    failed++;
                    console.warn(
                        "[SW Tool][ACCOUNT] Arena PvP — atak " +
                        index + ":",
                        error
                    );
                }

                // Każdą kolejną akcję na tej samej postaci oddzielamy 100 ms.
                await this.sleep(100);
            }

            return { attacked, skipped, failed };
        }

        async runAccountArenaPvp() {
            const characters = [...this.chars];
            const originalId = Number(
                GAME.char_id || this.lastCharacterId || this.currentCharacterId || 0
            );
            let attacked = 0, skipped = 0, timedSkipped = 0, failed = 0, dailyClaimed = 0;

            try {
                for (let i = 0; i < characters.length; i++) {
                    const char = characters[i];
                    const label = char.name || ("#" + Number(char.id));
                    console.info("[SW Tool][ACCOUNT] Arena PvP " + (i + 1) + "/" + characters.length + ": " + label);

                    try {
                        await this.switchCharacterForAccountAction(
                            Number(char.id),
                            0
                        );

                        // Po pełnym a:2 pozwalamy oficjalnemu klientowi WWW
                        // dokończyć aktualizację GAME i stanu aktywnej postaci.
                        await this.sleep(200);

                        if (
                            await this.claimDailyRewardForAccountAction(label)
                        ) {
                            dailyClaimed++;
                        }

                        if (this.activeTimedActionsCount() > 0) {
                            skipped++;
                            timedSkipped++;
                            continue;
                        }

                        const result = await this.attackArenaForCurrentCharacter();
                        attacked += result.attacked;
                        skipped += result.skipped;
                        failed += result.failed;
                    } catch (error) {
                        if (this.isFatalAccountError(error)) {
                            throw error;
                        }

                        failed++;
                        console.warn("[SW Tool][ACCOUNT] Arena PvP — " + label + ":", error);
                    } finally {
                        // Zostawiamy 200 ms po zakończeniu pracy na postaci,
                        // zanim rozpocznie się kolejne a:5/a:2.
                        await this.sleep(200);
                    }
                }
            } finally {
                await this.restoreAccountCharacter(originalId);
            }

            console.info("[SW Tool][ACCOUNT] Arena PvP zakończona:", {
                attacked,
                skipped,
                timedSkipped,
                failed,
                dailyClaimed
            });
        }

        async attackSoulAbyssForCurrentCharacter() {
            const info = await this.sendAndWait({ a: 59, type: 0 }, 59);

            if (this._int(info.e) !== 0) {
                throw new Error("Serwer odrzucił dane Otchłani Dusz.");
            }

            const now = Math.floor(Date.now() / 1000);
            const cooldownUntil = this._int(info.cd);

            if (cooldownUntil > now) {
                return false;
            }

            // a:59/type:0 zostało już potwierdzone przez serwer. Dajemy
            // klientowi WWW 100 ms przed właściwym atakiem type:1.
            await this.sleep(100);

            const attack = await this.sendAndWait(
                { a: 59, type: 1 },
                59,
                null,
                30000
            );

            if (this._int(attack.e) !== 0) {
                throw new Error("Serwer odrzucił atak w Otchłani Dusz.");
            }

            return true;
        }

        async runAccountSoulAbyss() {
            const characters = [...this.chars];
            const originalId = Number(
                GAME.char_id || this.lastCharacterId || this.currentCharacterId || 0
            );
            let attacked = 0, cooldown = 0, failed = 0, dailyClaimed = 0;

            try {
                for (let i = 0; i < characters.length; i++) {
                    const char = characters[i];
                    const label = char.name || ("#" + Number(char.id));
                    console.info("[SW Tool][ACCOUNT] Otchłań " + (i + 1) + "/" + characters.length + ": " + label);

                    try {
                        await this.switchCharacterForAccountAction(
                            Number(char.id),
                            0
                        );

                        // Ten sam bezpieczny rytm co w Arenie: po zmianie
                        // postaci czekamy, aż oficjalny klient WWW ją przetworzy.
                        await this.sleep(200);

                        if (
                            await this.claimDailyRewardForAccountAction(label)
                        ) {
                            dailyClaimed++;
                        }

                        if (await this.attackSoulAbyssForCurrentCharacter()) attacked++;
                        else cooldown++;
                    } catch (error) {
                        if (this.isFatalAccountError(error)) {
                            throw error;
                        }

                        failed++;
                        console.warn("[SW Tool][ACCOUNT] Otchłań — " + label + ":", error);
                    } finally {
                        // 200 ms przed kolejną zmianą postaci.
                        await this.sleep(200);
                    }
                }
            } finally {
                await this.restoreAccountCharacter(originalId);
            }

            console.info("[SW Tool][ACCOUNT] Otchłań zakończona:", {
                attacked,
                cooldown,
                failed,
                dailyClaimed
            });
        }

        startAccountOperation(action) {
            if (
                action === "accountTournaments" &&
                !this.isTournamentWindowOpen()
            ) {
                throw new Error(
                    "Turnieje są dostępne tylko w godzinach 18:00–21:00."
                );
            }

            if (this.accountOperationRunning) {
                throw new Error("Trwa już operacja na całym koncie.");
            }
            if (this.dailyRewardClaimStage !== 0 || this.responseWaiter) {
                throw new Error(
                    "Poczekaj na odpowiedź serwera dla poprzedniego zapytania."
                );
            }
            if (this.characterSwitch) {
                throw new Error("Poczekaj na zakończenie zmiany postaci.");
            }
            if (!Array.isArray(this.chars) || this.chars.length === 0) {
                throw new Error("Brak zapisanej listy postaci.");
            }

            const runners = {
                accountTournaments: () => this.runAccountTournaments(),
                accountSoulAbyss: () => this.runAccountSoulAbyss(),
                accountArenaPvp: () => this.runAccountArenaPvp(),
                accountTrainings: () => this.runAccountTrainings()
            };
            const runner = runners[action];
            if (!runner) {
                throw new Error("Nieznana operacja konta: " + String(action));
            }

            this.accountOperationRunning = true;
            Promise.resolve()
                .then(runner)
                .catch((error) => {
                    console.error("[SW Tool][ACCOUNT] Operacja nie powiodła się:", action, error);
                })
                .finally(() => {
                    if (this.trainingCaptchaWaiter?.cancel) {
                        this.trainingCaptchaWaiter.cancel();
                    }

                    this.accountOperationRunning = false;
                });

            return {
                started: true,
                action,
                characters: this.chars.length
            };
        }
    }

    const initTool = async () => {
        await waitForGame();

        storageCheck();

        BOT = new TOOL();
        BOT.applyConfig(pendingConfig);
        BOT.getLocalData();
        BOT.updateID();

        // Pomocniczy dostęp z DevTools do jednego, zbiorczego rejestru portali.
        // SW_TOOL_PORTALS.get()    -> obiekt
        // SW_TOOL_PORTALS.export() -> sformatowany JSON
        // SW_TOOL_PORTALS.clear()  -> wyczyszczenie rejestru
        window.SW_TOOL_PORTALS = {
            get: () => BOT.getPortalMap(),
            export: () => JSON.stringify(BOT.getPortalMap(), null, 2),
            clear: () => BOT.clearPortalMap()
        };

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

                const result = tool.startAccountOperation(
                    data.payload?.action
                );

                sendBridgeResponse(data.requestId, true, result);
                return;
            }

            if (data.action === "portalMap.get") {
                const tool = await toolReadyPromise;
                sendBridgeResponse(
                    data.requestId,
                    true,
                    { portalMap: tool.getPortalMap() }
                );
                return;
            }

            if (data.action === "portalMap.clear") {
                const tool = await toolReadyPromise;
                sendBridgeResponse(
                    data.requestId,
                    true,
                    { portalMap: tool.clearPortalMap() }
                );
                return;
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