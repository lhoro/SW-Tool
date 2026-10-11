(() => {
    const SW_TOOL_CHANNEL = "SW_TOOL_BRIDGE_V1";
    const DEFAULT_CONFIG = Object.freeze({
        dailyReward: true,
        saveTuts: true,
        hideReports: false,
        mapClickMovement: true,
        acceleratedH: false,
        improvedX: false
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
                : DEFAULT_CONFIG.hideReports,
            mapClickMovement: typeof source.mapClickMovement === "boolean"
                ? source.mapClickMovement
                : DEFAULT_CONFIG.mapClickMovement,
            acceleratedH: typeof source.acceleratedH === "boolean"
                ? source.acceleratedH
                : DEFAULT_CONFIG.acceleratedH,
            improvedX: typeof source.improvedX === "boolean"
                ? source.improvedX
                : DEFAULT_CONFIG.improvedX
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
            this.quickActionRunning = false;
            this.roninRunning = false;
            this.quickPanelButtons = [];
            this.quickPanelStatus = null;
            this.roninCounter = 0;
            this.roninTimers = [];
            this.roninFinishedAt = 0;
            this.roninInstanceDefinition = null;
            this.roninDailyLimit = 2;
            this.roninDailyUsageVersion = 0;
            this.currentHQuest = null;
            this.currentHQuestStep = null;
            this.currentHTracked = null;
            this.hTrackedVersion = 0;
            this.acceleratedHPending = false;
            this.currentQuestMove = null;
            this.questMoveVersion = 0;
            this.lastConsumedQuestMoveVersion = 0;
            this.roninQuestId = 0;
            this.currentRoninQuestStep = null;
            this.improvedXPending = false;
            this.improvedXHeld = false;
            this.trainingCaptchaWaiter = null;
            this.dailyRewardClaimStage = 0;
            this.dailyRewardClaimCharacterId = 0;
            this.dailyRewardClaimTimeout = null;
            this.dailyRewardEntryPendingCharacterId = 0;
            this.currentQuickOptions = null;
            this.currentQuickOptionsCharacterId = 0;
            this.currentQuickOptionsFresh = false;
            this.config = { ...DEFAULT_CONFIG };
            this.mapSolver =
                typeof window.SWMapClickSolver === "function"
                    ? new window.SWMapClickSolver(this)
                    : null;
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
            if (this.accountOperationRunning || this.quickActionRunning) {
                console.info("[SW Tool][PAGE] Trwa inna operacja.");
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

            this.mapSolver?.handleResponse(response);

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

            if (
                Array.isArray(response.timed) &&
                this.currentCharacterSnapshot?.char_tables
            ) {
                this.currentCharacterSnapshot.char_tables.timed_actions =
                    response.timed;
            }

            if (action === 3 && error === 0) {
                this.recordPortalsFromMapResponse(response);
                this.handleRoninMapQuestResponse(response);
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
                const entryRewardCheck =
                    this.config.dailyReward === true &&
                    quickCharacterId > 0 &&
                    Number(this.dailyRewardEntryPendingCharacterId) ===
                        quickCharacterId;

                if (this.dailyRewardClaimStage === 2 && !dailyAvailable) {
                    this.finishDailyRewardClaim("quick_opts");
                    this.dailyRewardEntryPendingCharacterId = 0;
                } else if (entryRewardCheck) {
                    if (
                        dailyAvailable &&
                        this.dailyRewardClaimStage === 0 &&
                        !this.accountOperationRunning &&
                        !this.quickActionRunning
                    ) {
                        this.collectDailyReward();
                    } else if (!dailyAvailable) {
                        // Sprawdziliśmy nagrodę przy wejściu i nie ma czego
                        // odbierać. Nie sprawdzamy ponownie przy Quick akcjach.
                        this.dailyRewardEntryPendingCharacterId = 0;
                    }
                }
            }

            if (action === 26) {
                this.handleDailyRewardResponse(response);
            }

            if (action === 22) {
                this.handleRoninQuestStepResponse(response);
                this.handleQuestMoveResponse(response);
                this.handleHQuestResponse(response);
            }

            if (
                action === 998 &&
                String(response.f || "") === "icd_5"
            ) {
                const used = Math.max(0, this._int(response.v));
                this.roninDailyUsageVersion++;

                if (
                    this.currentCharacterSnapshot?.char_data &&
                    typeof this.currentCharacterSnapshot.char_data === "object"
                ) {
                    this.currentCharacterSnapshot.char_data.icd_5 = used;
                }

                const currentId = this._int(
                    GAME.char_id || this.currentCharacterId
                );
                const currentChar = this.chars.find(
                    (char) => this._int(char?.id) === currentId
                );

                if (currentChar) {
                    currentChar.data =
                        currentChar.data &&
                        typeof currentChar.data === "object"
                            ? currentChar.data
                            : {};
                    currentChar.data.icd_5 = used;
                }

                console.info(
                    "[SW Tool][RONIN] Limit dzienny z serwera:",
                    {
                        charId: currentId,
                        used,
                        limit: this.roninDailyLimit
                    }
                );
            }

            if (
                action === 777 &&
                this._enabled(response.instance_finished) &&
                this._int(response.instance) === 5
            ) {
                this.roninFinishedAt = Date.now();
                console.info("[SW Tool][RONIN] Instancja zakończona.", {
                    done: response.done,
                    share: response.share
                });
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

        handleRoninMapQuestResponse(response) {
            if (
                !this.roninRunning ||
                this._int(response?.loc?.id) !== 193 ||
                !response.quests ||
                typeof response.quests !== "object"
            ) {
                return;
            }

            const charId = this._int(
                GAME.char_id || this.currentCharacterId
            );
            const player = Array.isArray(response.players)
                ? response.players.find(
                    (item) =>
                        this._int(item?.id) === charId
                )
                : null;

            const x = this._int(
                player?.x ||
                this.currentCharacterSnapshot?.char_data?.x
            );
            const y = this._int(
                player?.y ||
                this.currentCharacterSnapshot?.char_data?.y
            );

            if (x <= 0 || y <= 0) {
                return;
            }

            const fieldQuests = response.quests[x + "_" + y];
            if (!Array.isArray(fieldQuests)) {
                return;
            }

            const quest = fieldQuests.find(
                (item) => this._int(item?.qb_id) > 0
            );
            const qbId = this._int(quest?.qb_id);

            if (qbId <= 0) {
                return;
            }

            this.roninQuestId = qbId;
            this.currentRoninQuestStep = null;

            console.info(
                "[SW Tool][RONIN] Quest startowy z mapy:",
                {
                    qbId,
                    locationId: 193,
                    x,
                    y,
                    name: String(quest?.name || "")
                }
            );
        }

        async waitForRoninQuestId(timeoutMs = 3000) {
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                const qbId = this._int(this.roninQuestId);
                if (qbId > 0) {
                    return qbId;
                }

                await this.sleep(25);
            }

            throw new Error(
                "Ronin: mapa nie zwróciła questa na polu startowym."
            );
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

                this.dailyRewardEntryPendingCharacterId = gameCharacterId;

                if (
                    !this.accountOperationRunning &&
                    !this.quickActionRunning
                ) {
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
                this.quickActionRunning ||
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

        navigateTo(x, y, options = {}) {
            if (!this.mapSolver) {
                return Promise.reject(
                    new Error("Solver mapy nie został zainicjalizowany.")
                );
            }

            return this.mapSolver.navigateTo(x, y, options);
        }

        stopNavigation(reason = "manual") {
            this.mapSolver?.stop(reason);
        }

        mapNavigationState() {
            return this.mapSolver?.debugState() || null;
        }

        currentCharacterLabel() {
            const character = this.characterData();
            const name = String(character?.name || "").trim();
            if (name) return name;

            const cached = this.chars.find(
                (char) =>
                    Number(char.id) ===
                    Number(
                        GAME.char_id ||
                        this.currentCharacterId ||
                        0
                    )
            );

            return cached?.name || ("#" + Number(GAME.char_id || 0));
        }

        highestAvailableMissionRank() {
            const character = this.characterData();
            if (!character) return 0;

            for (let rank = 5; rank >= 1; rank--) {
                if (this._int(character["a_" + rank]) > 0) {
                    return rank;
                }
            }

            return 0;
        }

        missionFromResponse(response) {
            const raw = response?.mission;
            if (!raw || typeof raw !== "object") return null;

            const mission = { ...raw };
            const rank = this._int(mission.rank);
            const loc = this._int(mission.loc);
            const x = this._int(mission.x);
            const y = this._int(mission.y);

            if (rank <= 0 || loc <= 0 || x <= 0 || y <= 0) {
                return null;
            }

            return mission;
        }

        missionRankCode(rank) {
            return ({
                1: "D",
                2: "C",
                3: "B",
                4: "A",
                5: "S"
            })[this._int(rank)] || "?";
        }

        async runQuickMissionForCurrentCharacter() {
            if (!this.mapSolver) {
                throw new Error("Solver mapy nie jest dostępny.");
            }

            this.setQuickPanelStatus("Misje: sprawdzanie...");
            const status = await this.sendAndWait(
                { a: 207, type: 0 },
                [207, 999],
                (event) =>
                    this._int(event.e) !== 0 ||
                    this._int(event.a) === 207,
                15000
            );

            if (this._int(status.e) !== 0) {
                throw new Error(
                    "Serwer odrzucił sprawdzenie misji (e=" +
                    this._int(status.e) +
                    ")."
                );
            }

            let mission = this.missionFromResponse(status);
            let started = false;

            if (!mission) {
                const rank = this.highestAvailableMissionRank();
                if (rank <= 0) {
                    return {
                        status: "none",
                        message: "Brak dostępnej misji."
                    };
                }

                this.setQuickPanelStatus(
                    "Misje: podejmowanie rangi " +
                    this.missionRankCode(rank) +
                    "..."
                );

                await this.sleep(100);

                const start = await this.sendAndWait(
                    { a: 207, type: 1, rank },
                    [207, 999],
                    (event) =>
                        this._int(event.e) !== 0 ||
                        (
                            this._int(event.a) === 207 &&
                            event.mission &&
                            typeof event.mission === "object"
                        ),
                    15000
                );

                if (this._int(start.e) !== 0) {
                    throw new Error(
                        "Serwer odrzucił podjęcie misji (e=" +
                        this._int(start.e) +
                        ")."
                    );
                }

                mission = this.missionFromResponse(start);
                if (!mission) {
                    throw new Error(
                        "Serwer nie zwrócił celu podjętej misji."
                    );
                }

                started = true;
            }

            const locationId = this._int(mission.loc);
            const x = this._int(mission.x);
            const y = this._int(mission.y);
            const locationName = String(
                mission.pl || mission.en || ""
            ).trim();

            this.setQuickPanelStatus(
                "Misje: dojście do " +
                (locationName || ("mapy " + locationId)) +
                "..."
            );

            await this.mapSolver.navigateToLocation(
                locationId,
                x,
                y,
                { source: "quick-mission" }
            );

            this.setQuickPanelStatus("Misje: wykonywanie...");
            await this.sleep(100);

            const execute = await this.sendAndWait(
                { a: 207, type: 3 },
                [207, 999],
                (event) =>
                    this._int(event.e) !== 0 ||
                    (
                        this._int(event.a) === 207 &&
                        (
                            Array.isArray(event.timed) ||
                            event.done !== undefined
                        )
                    ),
                20000
            );

            if (this._int(execute.e) !== 0) {
                throw new Error(
                    "Serwer odrzucił wykonanie misji (e=" +
                    this._int(execute.e) +
                    ")."
                );
            }

            if (
                Array.isArray(execute.timed) &&
                this.currentCharacterSnapshot?.char_tables
            ) {
                this.currentCharacterSnapshot.char_tables.timed_actions =
                    execute.timed;
            }

            return {
                status: "done",
                started,
                rank: this._int(mission.rank),
                message:
                    "Misja " +
                    this.missionRankCode(mission.rank) +
                    " wykonana."
            };
        }

        setQuickPanelStatus(message, type = "") {
            const status = this.quickPanelStatus;
            if (!status) return;

            status.textContent = String(message || "");
            status.style.color =
                type === "error"
                    ? "#ffb3b3"
                    : type === "success"
                        ? "#b8f3c0"
                        : "#c8c3d4";
        }

        setQuickPanelBusy(busy) {
            for (const button of this.quickPanelButtons) {
                button.disabled = Boolean(busy);
                button.style.opacity = busy ? "0.55" : "1";
                button.style.cursor = busy ? "default" : "pointer";
            }
        }

        async waitForRoninDom(getter, description, timeoutMs = 5000) {
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                try {
                    const value = getter();
                    if (value) return value;
                } catch (_) {
                    // DOM instancji może być właśnie przebudowywany.
                }

                await this.sleep(50);
            }

            throw new Error(
                "Ronin: nie znaleziono elementu: " + description + "."
            );
        }

        roninPressKey(key) {
            const normalized = String(key || "").toLowerCase();
            const codes = {
                w: ["KeyW", 87],
                s: ["KeyS", 83],
                a: ["KeyA", 65],
                d: ["KeyD", 68],
                q: ["KeyQ", 81],
                e: ["KeyE", 69],
                z: ["KeyZ", 90],
                c: ["KeyC", 67],
                f: ["KeyF", 70],
                r: ["KeyR", 82],
                x: ["KeyX", 88],
                h: ["KeyH", 72]
            };
            const entry = codes[normalized];
            if (!entry) {
                throw new Error("Ronin: nieznany klawisz " + normalized + ".");
            }

            const keyboardEvent = new KeyboardEvent("keydown", {
                key: normalized,
                code: entry[0],
                bubbles: true,
                cancelable: true,
                shiftKey: false,
                ctrlKey: false,
                altKey: false,
                metaKey: false
            });

            // keyCode/which są readonly i Chrome potrafi ignorować wartości
            // przekazane do konstruktora KeyboardEvent. Starszy klient gry
            // nadal sprawdza te pola dla części skrótów (m.in. quest H).
            for (const property of ["keyCode", "which", "charCode"]) {
                try {
                    Object.defineProperty(keyboardEvent, property, {
                        configurable: true,
                        get: () => entry[1]
                    });
                } catch (_) {
                    // key/code nadal pozostają fallbackiem.
                }
            }

            document.dispatchEvent(keyboardEvent);
        }

        roninTrackTimer(callback, delayMs) {
            const timerId = setTimeout(() => {
                this.roninTimers = this.roninTimers.filter(
                    (id) => id !== timerId
                );

                if (!this.roninRunning) return;

                try {
                    callback();
                } catch (error) {
                    console.warn(
                        "[SW Tool][RONIN] Zaplanowana akcja nie powiodła się:",
                        error
                    );
                }
            }, delayMs);

            this.roninTimers.push(timerId);
            return timerId;
        }

        clearRoninTimers() {
            for (const timerId of this.roninTimers) {
                clearTimeout(timerId);
            }
            this.roninTimers = [];
        }

        roninMove(count, direction) {
            const total = Math.max(0, this._int(count));
            for (let i = 0; i < total; i++) {
                this.roninTrackTimer(
                    () => this.roninPressKey(direction),
                    i * 300
                );
            }
        }

        roninAttackNormal(count = 8) {
            const total = Math.max(0, this._int(count));
            for (let i = 0; i < total; i++) {
                this.roninTrackTimer(
                    () => this.roninPressKey("f"),
                    i * 50
                );
            }
        }

        handleRoninQuestStepResponse(response) {
            const step = response?.q_step;
            if (!step || typeof step !== "object") {
                return;
            }

            const qbId = this._int(step.qb_id);
            if (qbId <= 0) {
                return;
            }

            this.currentRoninQuestStep = step;

            if (
                this.roninRunning &&
                this._int(this.mapSolver?.map?.locationId) === 193
            ) {
                if (this.roninQuestId !== qbId) {
                    console.info(
                        "[SW Tool][RONIN] Zmiana qb_id z q_step:",
                        {
                            from: this.roninQuestId,
                            to: qbId
                        }
                    );
                }
                this.roninQuestId = qbId;
            }
        }

        async openRoninQuestStep() {
            const questId = this._int(this.roninQuestId);
            if (questId <= 0) {
                throw new Error(
                    "Ronin: nie znam ID aktywnego questa."
                );
            }

            const response = await this.sendAndWait(
                {
                    a: 22,
                    type: 1,
                    id: questId
                },
                [22, 999],
                (event) => {
                    if (this._int(event.e) !== 0) {
                        return true;
                    }

                    return (
                        this._int(event.a) === 22 &&
                        event.q_step &&
                        typeof event.q_step === "object" &&
                        this._int(event.q_step.qb_id) === questId
                    );
                },
                10000
            );

            if (this._int(response.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił otwarcie kroku questa."
                );
            }

            const step = response.q_step || null;
            if (step && typeof step === "object") {
                const qbId = this._int(step.qb_id);
                if (qbId > 0) {
                    this.roninQuestId = qbId;
                }
                this.currentRoninQuestStep = step;
            }

            return step;
        }

        isVisibleQuestAction(element) {
            if (!(element instanceof Element)) return false;
            if (element.disabled) return false;
            if (element.getAttribute("aria-disabled") === "true") return false;
            if (element.classList.contains("disabled")) return false;
            if (element.getClientRects().length === 0) return false;

            const style = getComputedStyle(element);
            return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.pointerEvents !== "none"
            );
        }

        improvedXQuestActions() {
            const windows = [
                ...document.querySelectorAll(".quest_win")
            ].filter((windowElement) =>
                this.isVisibleQuestAction(windowElement)
            );

            const actions = [];
            for (const questWindow of windows) {
                for (const element of questWindow.querySelectorAll(
                    ".newBtn3, .quest_btn"
                )) {
                    if (!this.isVisibleQuestAction(element)) continue;
                    if (!actions.includes(element)) {
                        actions.push(element);
                    }
                }
            }

            return actions;
        }

        questActionType(action) {
            if (!(action instanceof Element)) return "unknown";
            if (action.classList.contains("quest_btn")) return "fight";
            if (action.classList.contains("newBtn3")) return "next";
            return "unknown";
        }

        clickQuestAction(action, source = "quest") {
            if (!(action instanceof Element)) {
                return false;
            }

            const type = this.questActionType(action);
            action.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true
                })
            );

            console.info(
                "[SW Tool][QUEST] Wykonano jednoznaczną akcję.",
                {
                    source,
                    type,
                    text: String(action.textContent || "").trim()
                }
            );

            return type;
        }

        async waitForSingleQuestAction(
            timeoutMs = 3000,
            { failOnMultiple = true } = {}
        ) {
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                const actions = this.improvedXQuestActions();

                if (actions.length > 1) {
                    if (failOnMultiple) {
                        throw new Error(
                            "Quest ma kilka dostępnych akcji — wymagany wybór gracza."
                        );
                    }
                    return null;
                }

                if (actions.length === 1) {
                    return actions[0];
                }

                await this.sleep(25);
            }

            return null;
        }

        runImprovedXFromUserKey(event = null) {
            if (
                this.config.improvedX !== true ||
                this.improvedXPending ||
                this.quickActionRunning ||
                this.accountOperationRunning ||
                this.characterSwitch
            ) {
                return false;
            }

            // Sprawdzamy stan PRZED natywną obsługą X przez grę.
            // Dzięki temu X, które dopiero otwiera okno questa, nie może
            // w tym samym naciśnięciu automatycznie przejść do następnego
            // etapu.
            const actions = this.improvedXQuestActions();

            if (actions.length > 1) {
                console.info(
                    "[SW Tool][X] Wiele opcji questa — wybór pozostawiony graczowi.",
                    { count: actions.length }
                );
                return false;
            }

            if (actions.length !== 1) {
                // Brak istniejącej akcji: przepuszczamy normalne X do gry.
                // Jeśli otworzy ono quest, użytkownik musi nacisnąć X ponownie.
                return false;
            }

            if (event) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }

            this.improvedXPending = true;

            try {
                this.clickQuestAction(actions[0], "improved-x");
                return true;
            } finally {
                this.improvedXPending = false;
            }
        }

        async waitForRoninTimedQuestReady(
            initialStep = null,
            timeoutMs = 45000
        ) {
            const startedAt = Date.now();
            let step = initialStep || await this.openRoninQuestStep();
            let afterDeadlineRetries = 0;

            while (Date.now() - startedAt < timeoutMs) {
                const want = step?.want;

                if (
                    !want ||
                    typeof want !== "object" ||
                    this._int(want.type) !== 6
                ) {
                    return step;
                }

                if (Boolean(want.is_met)) {
                    console.info(
                        "[SW Tool][RONIN] Etap czasowy gotowy.",
                        {
                            type: this._int(want.type),
                            amount: this._int(want.amount),
                            count: this._int(want.count),
                            refreshesAfterDeadline: afterDeadlineRetries
                        }
                    );
                    return step;
                }

                // count w HAR jest timestampem UNIX (sekundy), kiedy etap
                // powinien być gotowy. Śpimy lokalnie do tego momentu zamiast
                // pytać serwer co sekundę.
                const readyAt = this._int(want.count) * 1000;
                const now = Date.now();

                if (readyAt > now) {
                    const remaining = readyAt - now;
                    const left = timeoutMs - (now - startedAt);
                    await this.sleep(
                        Math.max(
                            0,
                            Math.min(remaining + 250, left)
                        )
                    );
                } else {
                    // Rzadki retry po deadline, np. przy różnicy zegarów.
                    await this.sleep(afterDeadlineRetries === 0 ? 250 : 1500);
                }

                step = await this.openRoninQuestStep();
                afterDeadlineRetries++;
            }

            throw new Error(
                "Ronin: etap czasowy questa nie został zaliczony w czasie."
            );
        }

        roninMobSweepTargets(originX, originY, upperHalf) {
            const targets = [];

            if (upperHalf) {
                for (let y = originY - 1; y >= originY - 10; y--) {
                    targets.push({ x: originX, y });
                }

                targets.push({
                    x: originX + 1,
                    y: originY - 10
                });

                for (let y = originY - 9; y <= originY; y++) {
                    targets.push({ x: originX + 1, y });
                }
            } else {
                for (let y = originY + 1; y <= originY + 10; y++) {
                    targets.push({ x: originX, y });
                }

                targets.push({
                    x: originX + 1,
                    y: originY + 10
                });

                for (let y = originY + 9; y >= originY; y--) {
                    targets.push({ x: originX + 1, y });
                }
            }

            return targets.filter((target) => {
                const map = this.mapSolver?.map;
                if (!map) return false;

                const cell = map.cells?.get(
                    target.x + "_" + target.y
                );

                return Boolean(
                    cell &&
                    cell.movable &&
                    target.x >= 1 &&
                    target.y >= 1 &&
                    target.x <= map.maxX &&
                    target.y <= map.maxY
                );
            });
        }

        async roninMobFightOnce({
            questId,
            beforeCount,
            useMulti
        }) {
            const order = useMulti
                ? {
                    a: 13,
                    mob_num: 0,
                    fo: [1, 1, 1, 1, 1]
                }
                : {
                    a: 7,
                    mob_num: 0,
                    rank: 0,
                    quick: 1
                };

            console.info(
                "[SW Tool][RONIN] Walka z mobami:",
                {
                    mode: useMulti ? "multi" : "single",
                    questId,
                    beforeCount,
                    field: this.mapSolver?.field
                        ? {
                            x: this.mapSolver.field.x,
                            y: this.mapSolver.field.y,
                            mobs:
                                this._int(
                                    this.mapSolver.field.mobs?.count
                                ),
                            mf: this.mapSolver.field.multiFight
                        }
                        : null
                }
            );

            const response = await this.sendAndWait(
                order,
                [7, 22, 999],
                (event) => {
                    if (this._int(event.e) !== 0) {
                        return true;
                    }

                    if (
                        this._int(event.a) === 7 &&
                        this._int(event.me) > 0
                    ) {
                        return true;
                    }

                    return (
                        this._int(event.a) === 22 &&
                        this._int(event.track) === questId &&
                        this._int(event.new_amount) > beforeCount
                    );
                },
                10000
            );

            if (this._int(response.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił walkę z mobami."
                );
            }

            if (this._int(response.a) === 7) {
                return {
                    progressed: false,
                    count: beforeCount,
                    reason: this._int(response.me)
                };
            }

            return {
                progressed: true,
                count: this._int(response.new_amount),
                gained: Math.max(
                    0,
                    this._int(response.new_amount) - beforeCount
                )
            };
        }

        async roninClearMobField(state) {
            const field = this.mapSolver?.field;
            const map = this.mapSolver?.map;

            if (
                !field ||
                !map ||
                this._int(field.x) !== this._int(map.x) ||
                this._int(field.y) !== this._int(map.y)
            ) {
                return state;
            }

            let mobsLeft = Math.max(
                0,
                this._int(field.mobs?.count)
            );

            while (
                state.count < state.max &&
                mobsLeft > 0
            ) {
                const multiAvailable =
                    Array.isArray(field.multiFight) &&
                    field.multiFight.includes(0);

                // Jeżeli multiwalka jest dostępna, używamy jej zawsze,
                // nawet gdy zabije więcej mobów niż zostało do celu questa.
                // Ogranicza to liczbę requestów do serwera.
                const useMulti = multiAvailable;

                const result = await this.roninMobFightOnce({
                    questId: state.questId,
                    beforeCount: state.count,
                    useMulti
                });

                if (!result.progressed) {
                    mobsLeft = 0;
                    break;
                }

                state.count = Math.min(
                    state.max,
                    this._int(result.count)
                );

                mobsLeft = Math.max(
                    0,
                    mobsLeft - Math.max(1, this._int(result.gained))
                );

                field.mobs.count = mobsLeft;

                this.setQuickPanelStatus(
                    "Ronin: przeciwnicy " +
                    state.count +
                    "/" +
                    state.max +
                    "..."
                );
            }

            return state;
        }

        async prepareRoninMobCombat(maxTransitions = 6) {
            for (let i = 0; i < maxTransitions; i++) {
                const pendingMove = this.currentQuestMove;

                if (
                    pendingMove &&
                    this._int(pendingMove.version) >
                        this._int(this.lastConsumedQuestMoveVersion) &&
                    this._int(pendingMove.locationId) === 193
                ) {
                    throw new Error(
                        "Ronin: pojawił się quest_move przed etapem przeciwników."
                    );
                }

                let step = this.currentRoninQuestStep;
                if (
                    !step ||
                    typeof step !== "object" ||
                    this._int(step.qb_id) !==
                        this._int(this.roninQuestId)
                ) {
                    step = await this.openRoninQuestStep();
                }

                const want = step?.want;
                const wantType = this._int(want?.type);
                const isMet = Boolean(want?.is_met);

                if (
                    want &&
                    typeof want === "object" &&
                    wantType === 1 &&
                    !isMet
                ) {
                    console.info(
                        "[SW Tool][RONIN] Etap przeciwników gotowy.",
                        {
                            qbId: this._int(step.qb_id),
                            count: this._int(want.count),
                            max: this._int(
                                want.maxv || want.amount
                            ),
                            transitions: i
                        }
                    );
                    return step;
                }

                if (
                    want &&
                    typeof want === "object" &&
                    !isMet
                ) {
                    throw new Error(
                        "Ronin: przed mobami pojawił się nieoczekiwany warunek questa (type " +
                        wantType +
                        ")."
                    );
                }

                // want:false albo zaliczony poprzedni warunek = zwykły dialog.
                await this.roninQuestNext();
            }

            throw new Error(
                "Ronin: nie udało się dojść do etapu przeciwników po " +
                maxTransitions +
                " przejściach dialogu."
            );
        }

        async roninMobCombat() {
            const questId = this._int(this.roninQuestId);
            const step = this.currentRoninQuestStep;
            const want = step?.want;

            if (
                questId <= 0 ||
                !want ||
                typeof want !== "object" ||
                this._int(want.type) !== 1
            ) {
                throw new Error(
                    "Ronin: nie znaleziono etapu zabijania przeciwników."
                );
            }

            const map = this.mapSolver?.map;
            if (!map) {
                throw new Error(
                    "Ronin: brak mapy dla etapu przeciwników."
                );
            }

            const origin = {
                x: this._int(map.x),
                y: this._int(map.y)
            };

            const state = {
                questId,
                count: Math.max(0, this._int(want.count)),
                max: Math.max(
                    this._int(want.maxv),
                    this._int(want.amount)
                )
            };

            if (
                origin.x <= 0 ||
                origin.y <= 0 ||
                state.max <= 0
            ) {
                throw new Error(
                    "Ronin: nieprawidłowy stan etapu przeciwników."
                );
            }

            this.setQuickPanelStatus(
                "Ronin: przeciwnicy " +
                state.count +
                "/" +
                state.max +
                "..."
            );

            await this.roninClearMobField(state);

            const primaryUpper = this.roninCounter % 2 === 0;
            const sweeps = [
                this.roninMobSweepTargets(
                    origin.x,
                    origin.y,
                    primaryUpper
                ),
                this.roninMobSweepTargets(
                    origin.x,
                    origin.y,
                    !primaryUpper
                )
            ];

            for (const targets of sweeps) {
                for (const target of targets) {
                    if (state.count >= state.max) {
                        break;
                    }

                    await this.mapSolver.navigateTo(
                        target.x,
                        target.y,
                        {
                            source: "ronin-mobs",
                            allowBusy: true
                        }
                    );

                    await this.roninClearMobField(state);
                }

                if (state.count >= state.max) {
                    break;
                }
            }

            if (state.count < state.max) {
                throw new Error(
                    "Ronin: zabrakło przeciwników na trasie (" +
                    state.count +
                    "/" +
                    state.max +
                    ")."
                );
            }

            if (
                this._int(this.mapSolver.map?.x) !== origin.x ||
                this._int(this.mapSolver.map?.y) !== origin.y
            ) {
                await this.mapSolver.navigateTo(
                    origin.x,
                    origin.y,
                    {
                        source: "ronin-mobs",
                        allowBusy: true
                    }
                );
            }

            const refreshed = await this.openRoninQuestStep();
            const refreshedWant = refreshed?.want;

            if (
                refreshedWant &&
                typeof refreshedWant === "object" &&
                this._int(refreshedWant.type) === 1 &&
                !Boolean(refreshedWant.is_met)
            ) {
                throw new Error(
                    "Ronin: licznik przeciwników osiągnął cel, ale quest nie został zaliczony."
                );
            }

            console.info(
                "[SW Tool][RONIN] Etap przeciwników zakończony.",
                {
                    questId,
                    count: state.count,
                    max: state.max,
                    returnedTo: origin
                }
            );

            return refreshed;
        }

        async roninQuestAction() {
            const pendingMove = this.currentQuestMove;
            if (
                pendingMove &&
                this._int(pendingMove.version) >
                    this._int(this.lastConsumedQuestMoveVersion) &&
                this._int(pendingMove.locationId) === 193
            ) {
                throw new Error(
                    "Ronin: przed kolejną akcją questa trzeba dojść do nowego celu " +
                    pendingMove.x + "|" + pendingMove.y + "."
                );
            }

            const questId = this._int(this.roninQuestId);
            if (questId <= 0) {
                throw new Error(
                    "Ronin: nie znam ID aktywnego questa."
                );
            }

            let step = this.currentRoninQuestStep;
            if (
                !step ||
                typeof step !== "object" ||
                this._int(step.qb_id) !== questId
            ) {
                step = await this.openRoninQuestStep();
            }

            const want = step?.want;
            const wantType = this._int(want?.type);
            const isMet = Boolean(want?.is_met);

            // HAR: want.type === 7 oznacza walkę questową.
            // Klient wysyła wtedy a:22/type:6, a serwer po walce
            // zwraca ten sam q_step z is_met:true.
            if (
                want &&
                typeof want === "object" &&
                wantType === 7 &&
                !isMet
            ) {
                console.info(
                    "[SW Tool][RONIN] Akcja questa: walka socketowa.",
                    {
                        qbId: questId,
                        wantType,
                        targetId: this._int(want.id)
                    }
                );

                const response = await this.sendAndWait(
                    {
                        a: 22,
                        type: 6,
                        id: questId
                    },
                    [22, 999],
                    (event) => {
                        if (this._int(event.e) !== 0) {
                            return true;
                        }

                        const nextStep = event.q_step;
                        return (
                            this._int(event.a) === 22 &&
                            nextStep &&
                            typeof nextStep === "object" &&
                            this._int(nextStep.qb_id) === questId &&
                            this._int(nextStep.want?.type) === 7 &&
                            Boolean(nextStep.want?.is_met)
                        );
                    },
                    15000
                );

                if (this._int(response.e) !== 0) {
                    throw new Error(
                        "Ronin: serwer odrzucił walkę questową."
                    );
                }

                return "fight";
            }

            // Niezaliczony warunek innego typu nie powinien być omijany
            // przez wymuszone "Dalej".
            if (
                want &&
                typeof want === "object" &&
                !isMet
            ) {
                throw new Error(
                    "Ronin: warunek questa nie jest jeszcze zaliczony (type " +
                    wantType +
                    ")."
                );
            }

            console.info(
                "[SW Tool][RONIN] Akcja questa: Dalej socketowo.",
                {
                    qbId: questId,
                    wantType,
                    isMet
                }
            );

            this.currentRoninQuestStep = null;

            const response = await this.sendAndWait(
                {
                    a: 22,
                    type: 2,
                    button: 1,
                    id: questId
                },
                [22, 999],
                (event) => {
                    if (this._int(event.e) !== 0) {
                        return true;
                    }

                    if (this._int(event.a) !== 22) {
                        return false;
                    }

                    if (
                        event.q_step &&
                        typeof event.q_step === "object"
                    ) {
                        return true;
                    }

                    if (
                        event.quest_move &&
                        typeof event.quest_move === "object"
                    ) {
                        return true;
                    }

                    return false;
                },
                10000
            );

            if (this._int(response.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił przejście dalej."
                );
            }

            return "next";
        }

        async roninQuestNext() {
            return this.roninQuestAction();
        }

        async roninQuestFight() {
            return this.roninQuestAction();
        }

        handleQuestMoveResponse(response) {
            if (
                !response ||
                typeof response !== "object" ||
                !Object.prototype.hasOwnProperty.call(
                    response,
                    "quest_move"
                )
            ) {
                return;
            }

            this.questMoveVersion++;

            const move = response.quest_move;
            if (!move || typeof move !== "object") {
                this.currentQuestMove = null;
                return;
            }

            const qbId = this._int(move.qb_id);
            const locationId = this._int(move.loc);
            const x = this._int(move.x);
            const y = this._int(move.y);

            // Końcowy komunikat questa może zawierać tylko qb_id bez celu.
            if (
                qbId <= 0 ||
                locationId <= 0 ||
                x <= 0 ||
                y <= 0
            ) {
                this.currentQuestMove = null;
                console.info("[SW Tool][QUEST] Cel ruchu wyczyszczony.", {
                    qbId,
                    version: this.questMoveVersion
                });
                return;
            }

            this.currentQuestMove = {
                qbId,
                locationId,
                x,
                y,
                version: this.questMoveVersion,
                receivedAt: Date.now()
            };

            if (
                this.roninRunning &&
                locationId === 193
            ) {
                if (this.roninQuestId !== qbId) {
                    console.info(
                        "[SW Tool][RONIN] Wykryto zmianę qb_id z quest_move:",
                        {
                            from: this.roninQuestId,
                            to: qbId
                        }
                    );
                }

                this.roninQuestId = qbId;
                this.currentRoninQuestStep = null;
            }

            console.info("[SW Tool][QUEST] Nowy cel ruchu:", {
                ...this.currentQuestMove
            });
        }

        async waitForRoninQuestMove(timeoutMs = 4000) {
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                const move = this.currentQuestMove;

                if (
                    move &&
                    this._int(move.version) >
                        this._int(this.lastConsumedQuestMoveVersion) &&
                    this._int(move.locationId) === 193 &&
                    this._int(move.x) > 0 &&
                    this._int(move.y) > 0 &&
                    (
                        this.roninQuestId <= 0 ||
                        this._int(move.qbId) ===
                            this._int(this.roninQuestId)
                    )
                ) {
                    if (this.roninQuestId <= 0) {
                        this.roninQuestId = this._int(move.qbId);
                    }

                    return move;
                }

                await this.sleep(25);
            }

            return null;
        }

        async navigateToRoninQuestMove(
            fallback = null,
            label = ""
        ) {
            const move = await this.waitForRoninQuestMove(4000);

            if (!move) {
                console.warn(
                    "[SW Tool][RONIN] Brak nowego quest_move — używam starej trasy.",
                    {
                        label,
                        currentQuestMove: this.currentQuestMove,
                        questMoveVersion: this.questMoveVersion,
                        lastConsumedQuestMoveVersion:
                            this.lastConsumedQuestMoveVersion,
                        roninQuestId: this.roninQuestId
                    }
                );

                if (typeof fallback === "function") {
                    await fallback();
                    return null;
                }

                throw new Error(
                    "Ronin: serwer nie zwrócił nowego celu quest_move."
                );
            }

            if (!this.mapSolver) {
                throw new Error(
                    "Ronin: solver mapy nie jest dostępny."
                );
            }

            // Rezerwujemy marker od razu, aby kolejny etap nie mógł
            // wykorzystać tego samego celu w czasie nawigacji.
            this.lastConsumedQuestMoveVersion =
                this._int(move.version);

            this.setQuickPanelStatus(
                "Ronin: dojście do celu" +
                (label ? " (" + label + ")" : "") +
                " X:" +
                move.x +
                " Y:" +
                move.y +
                "..."
            );

            console.info("[SW Tool][RONIN] Solver do quest_move:", {
                label,
                ...move
            });

            await this.mapSolver.navigateToLocation(
                move.locationId,
                move.x,
                move.y,
                {
                    source: "ronin-quest",
                    allowBusy: true
                }
            );

            return move;
        }

        handleHQuestResponse(response) {
            if (!response || typeof response !== "object") return;

            const qStep = response.q_step;
            const want = qStep?.want;

            // q_step definiuje aktywny etap H, ale nie jest źródłem prawdy
            // dla licznika przy przejściu między etapami.
            if (qStep && typeof qStep === "object") {
                if (
                    !want ||
                    typeof want !== "object" ||
                    this._int(want.type) !== 39
                ) {
                    this.currentHQuest = null;
                    this.currentHQuestStep = null;
                    this.currentHTracked = null;
                    this.acceleratedHPending = false;
                    return;
                }

                const id = this._int(
                    want.qbid || qStep.qb_id
                );
                const count = this._int(want.count);
                const max = this._int(want.maxv);

                if (id > 0 && max > 0) {
                    this.currentHQuestStep = {
                        id,
                        max,
                        isMet: Boolean(want.is_met)
                    };

                    const tracked = this.currentHTracked;
                    const trackedMatches =
                        tracked &&
                        this._int(tracked.id) === id &&
                        this._int(tracked.max) === max;

                    this.currentHQuest = trackedMatches
                        ? { ...tracked }
                        : {
                            id,
                            count,
                            max,
                            isMet: Boolean(want.is_met),
                            source: "q_step"
                        };

                    this.acceleratedHPending = false;
                }
            }

            // tracked[] jest autorytatywnym źródłem licznika H.
            if (Array.isArray(response.tracked)) {
                const expectedId = this._int(
                    this.currentHQuestStep?.id ||
                    this.currentHTracked?.id ||
                    this.roninQuestId
                );

                const trackedH = response.tracked
                    .map((entry) => entry?.want)
                    .filter(
                        (trackedWant) =>
                            trackedWant &&
                            typeof trackedWant === "object" &&
                            this._int(trackedWant.type) === 39
                    )
                    .find(
                        (trackedWant) =>
                            expectedId <= 0 ||
                            this._int(
                                trackedWant.qbid ||
                                trackedWant.qb_id
                            ) === expectedId
                    );

                if (trackedH) {
                    const id = this._int(
                        trackedH.qbid || trackedH.qb_id
                    );
                    const count = this._int(trackedH.count);
                    const max = this._int(trackedH.maxv);

                    if (id > 0 && max > 0) {
                        this.hTrackedVersion++;

                        this.currentHTracked = {
                            id,
                            count,
                            max,
                            isMet: Boolean(trackedH.is_met),
                            source: "tracked",
                            trackedVersion: this.hTrackedVersion
                        };

                        this.currentHQuest = {
                            ...this.currentHTracked
                        };

                        this.acceleratedHPending = false;

                        console.info(
                            "[SW Tool][H] Stan z tracked:",
                            this.currentHTracked
                        );
                    }
                }
            }

            const trackId = this._int(response.track);
            const newAmount = this._int(response.new_amount);

            if (
                trackId > 0 &&
                this.currentHTracked &&
                trackId === this.currentHTracked.id
            ) {
                this.currentHTracked.count = Math.max(
                    this.currentHTracked.count,
                    newAmount
                );
                this.currentHTracked.isMet =
                    this.currentHTracked.count >=
                    this.currentHTracked.max;

                this.currentHQuest = {
                    ...this.currentHTracked
                };

                this.acceleratedHPending = false;
                return;
            }

            const handler = response.map_handler;
            const handlerId = this._int(handler?.send_tracker);
            const handlerAmount = this._int(handler?.new_amount);

            if (
                handlerId > 0 &&
                this.currentHTracked &&
                handlerId === this.currentHTracked.id
            ) {
                this.currentHTracked.count = Math.max(
                    this.currentHTracked.count,
                    handlerAmount
                );
                this.currentHTracked.isMet =
                    this.currentHTracked.count >=
                    this.currentHTracked.max;

                this.currentHQuest = {
                    ...this.currentHTracked
                };

                this.acceleratedHPending = false;
                return;
            }

            if (response.e !== undefined) {
                this.acceleratedHPending = false;
            }
        }

        acceleratedHCount() {
            if (this.config.acceleratedH !== true) {
                return 0;
            }

            const quest = this.currentHQuest;
            if (!quest || quest.id <= 0 || quest.max <= 0) {
                return 0;
            }

            return Math.max(0, quest.max - quest.count);
        }

        sendHQuestCount(count, { waitForResponse = false } = {}) {
            const quest = this.currentHQuest;
            const amount = Math.max(0, this._int(count));

            if (!quest || quest.id <= 0 || amount <= 0) {
                return waitForResponse
                    ? Promise.resolve(false)
                    : false;
            }

            const order = {
                a: 22,
                type: 7,
                id: quest.id,
                cnt: amount
            };

            console.info("[SW Tool][H] TX pełne H:", order);

            if (waitForResponse) {
                const expectedTotal = Math.min(
                    quest.max,
                    quest.count + amount
                );

                return this.sendAndWait(
                    order,
                    [22, 999],
                    (event) => {
                        if (this._int(event.e) !== 0) {
                            return true;
                        }

                        if (
                            this._int(event.a) !== 22 ||
                            this._int(event.track) !== quest.id
                        ) {
                            return false;
                        }

                        return (
                            this._int(event.new_amount) >=
                            expectedTotal
                        );
                    },
                    10000
                ).then((response) => {
                    if (this._int(response.e) !== 0) {
                        throw new Error(
                            "Serwer odrzucił przyśpieszone H."
                        );
                    }
                    return true;
                });
            }

            if (!GAME.socket?.connected) {
                return false;
            }

            GAME.socket.emit("ga", order);
            return true;
        }

        accelerateHFromUserKey(event = null) {
            if (
                this.config.acceleratedH !== true ||
                this.acceleratedHPending ||
                this.quickActionRunning ||
                this.accountOperationRunning ||
                this.responseWaiter ||
                this.characterSwitch
            ) {
                return false;
            }

            const missing = this.acceleratedHCount();
            if (missing <= 0) {
                return false;
            }

            // Przechwytujemy fizyczne H zanim klient gry policzy własne
            // naciśnięcie. Wysyłamy od razu całą brakującą liczbę jednym
            // a:22/type:7, dokładnie jak klient po przytrzymaniu klawisza.
            if (event) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            }

            this.acceleratedHPending = true;

            const sent = this.sendHQuestCount(missing);
            if (!sent) {
                this.acceleratedHPending = false;
                return false;
            }

            console.info("[SW Tool][H] Przyśpieszone H socket:", {
                id: this.currentHQuest.id,
                count: this.currentHQuest.count,
                max: this.currentHQuest.max,
                sent: missing
            });

            // Gdyby serwer nie odesłał trackera, nie blokujemy H na zawsze.
            setTimeout(() => {
                this.acceleratedHPending = false;
            }, 2500);

            return true;
        }

        async roninQuestH() {
            const startedAt = Date.now();

            while (Date.now() - startedAt < 4000) {
                const activeStep = this.currentHQuestStep;
                const tracked = this.currentHTracked;

                if (
                    activeStep &&
                    tracked &&
                    this._int(tracked.id) === this._int(activeStep.id) &&
                    this._int(tracked.max) === this._int(activeStep.max) &&
                    !tracked.isMet &&
                    tracked.max > tracked.count
                ) {
                    break;
                }

                await this.sleep(25);
            }

            const activeStep = this.currentHQuestStep;
            const quest = this.currentHTracked;

            if (
                !activeStep ||
                !quest ||
                this._int(quest.id) !== this._int(activeStep.id) ||
                this._int(quest.max) !== this._int(activeStep.max) ||
                quest.isMet ||
                quest.max <= quest.count
            ) {
                throw new Error(
                    "Ronin: brak zsynchronizowanego trackera aktywnego kroku H."
                );
            }

            // sendHQuestCount korzysta ze wspólnego stanu H.
            this.currentHQuest = { ...quest };

            const missing = quest.max - quest.count;
            await this.sendHQuestCount(
                missing,
                { waitForResponse: true }
            );

            const step = await this.openRoninQuestStep();
            const want = step?.want;

            if (
                want &&
                typeof want === "object" &&
                this._int(want.type) === 39 &&
                !Boolean(want.is_met)
            ) {
                throw new Error(
                    "Ronin: H zostało wysłane, ale krok questa nadal nie jest zaliczony."
                );
            }

            console.info(
                "[SW Tool][RONIN] H zaliczone i krok odświeżony.",
                {
                    id: quest.id,
                    sent: missing,
                    count: this._int(want?.count),
                    max: this._int(want?.maxv),
                    isMet: Boolean(want?.is_met)
                }
            );

            return step;
        }

        roninCloseInfo() {
            const close =
                document.querySelector("#kom_con .close_koment");
            if (close) {
                close.dispatchEvent(new MouseEvent("click", {
                    bubbles: true
                }));
            }
        }

        async getRoninInstanceDefinition(
            { refresh = false } = {}
        ) {
            if (
                !refresh &&
                this.roninInstanceDefinition &&
                typeof this.roninInstanceDefinition === "object"
            ) {
                return this.roninInstanceDefinition;
            }

            const list = await this.sendAndWait(
                { a: 29, type: 0 },
                [29, 999],
                (event) =>
                    this._int(event.e) !== 0 ||
                    (
                        this._int(event.a) === 29 &&
                        event.raids &&
                        typeof event.raids === "object"
                    ),
                15000
            );

            if (this._int(list.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił listę instancji."
                );
            }

            const ronin =
                list.raids?.list?.["5"] ||
                list.raids?.list?.[5];

            if (!ronin || typeof ronin !== "object") {
                throw new Error(
                    "Ronin: instancja #5 nie jest dostępna na liście serwera."
                );
            }

            this.roninInstanceDefinition = {
                ...ronin
            };
            this.roninDailyLimit = Math.max(
                1,
                this._int(ronin.daily_limit) || 2
            );

            console.info(
                "[SW Tool][RONIN] Definicja instancji:",
                {
                    id: this._int(ronin.id),
                    dailyLimit: this.roninDailyLimit,
                    map: this._int(ronin.map)
                }
            );

            return this.roninInstanceDefinition;
        }

        roninDailyUsage() {
            return Math.max(
                0,
                this._int(
                    this.currentCharacterSnapshot?.char_data?.icd_5
                )
            );
        }

        async waitForRoninDailyUsage(
            expectedMinimum,
            timeoutMs = 3500
        ) {
            const expected = Math.max(0, this._int(expectedMinimum));
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                const used = this.roninDailyUsage();

                if (used >= expected) {
                    return used;
                }

                await this.sleep(25);
            }

            return this.roninDailyUsage();
        }

        async confirmRoninDailyUsage(
            characterId,
            expectedMinimum
        ) {
            let used = await this.waitForRoninDailyUsage(
                expectedMinimum
            );

            if (used >= expectedMinimum) {
                return used;
            }

            console.warn(
                "[SW Tool][RONIN] Brak push icd_5 — odświeżam postać z serwera.",
                {
                    characterId,
                    expectedMinimum,
                    current: used
                }
            );

            await this.switchCharacterForAccountAction(
                characterId,
                0,
                true
            );

            used = this.roninDailyUsage();

            if (used < expectedMinimum) {
                throw new Error(
                    "Ronin: serwer nie potwierdził zwiększenia licznika dziennego (" +
                    used +
                    "/" +
                    this.roninDailyLimit +
                    ")."
                );
            }

            return used;
        }

        async enterRoninInstance() {
            const RONIN_INSTANCE_ID = 5;
            const RONIN_LOCATION_ID = 193;

            this.setQuickPanelStatus("Ronin: sprawdzanie instancji...");
            await this.getRoninInstanceDefinition();

            this.setQuickPanelStatus("Ronin: wybór instancji...");
            const selected = await this.sendAndWait(
                {
                    a: 29,
                    type: 1,
                    instance: RONIN_INSTANCE_ID
                },
                [777, 999],
                (event) =>
                    this._int(event.e) !== 0 ||
                    (
                        this._int(event.a) === 777 &&
                        this._int(event.order) === 1 &&
                        this._int(event.instance_id) ===
                            RONIN_INSTANCE_ID
                    ),
                15000
            );

            if (this._int(selected.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił wybór instancji."
                );
            }

            this.setQuickPanelStatus("Ronin: tworzenie pokoju...");
            const created = await this.sendAndWait(
                {
                    a: 29,
                    type: 2,
                    instance: RONIN_INSTANCE_ID
                },
                [777, 999],
                (event) =>
                    this._int(event.e) !== 0 ||
                    (
                        this._int(event.a) === 777 &&
                        this._int(event.order) === 2 &&
                        this._int(event.instance_id) ===
                            RONIN_INSTANCE_ID &&
                        this._int(event.own_room) > 0
                    ),
                15000
            );

            if (this._int(created.e) !== 0) {
                throw new Error(
                    "Ronin: nie udało się utworzyć pokoju."
                );
            }

            const roomId = this._int(created.own_room);
            if (roomId <= 0) {
                throw new Error(
                    "Ronin: serwer nie zwrócił ID utworzonego pokoju."
                );
            }

            this.setQuickPanelStatus("Ronin: start pokoju...");
            const started = await this.sendAndWait(
                {
                    a: 29,
                    type: 7,
                    room: roomId
                },
                [777, 999],
                (event) => {
                    if (this._int(event.e) !== 0) return true;
                    if (this._int(event.a) !== 777) return false;

                    if (this._int(event.done) === 31) return true;

                    const rooms = Array.isArray(event.rooms)
                        ? event.rooms
                        : [];

                    return rooms.some(
                        (room) =>
                            this._int(room?.id) === roomId &&
                            this._int(room?.status) === 3
                    );
                },
                15000
            );

            if (this._int(started.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił start pokoju."
                );
            }

            this.setQuickPanelStatus("Ronin: wejście do instancji...");
            const entered = await this.sendAndWait(
                {
                    a: 29,
                    type: 8,
                    room: roomId
                },
                [3, 777, 999],
                (event) => {
                    if (this._int(event.e) !== 0) return true;

                    if (
                        this._int(event.a) === 777 &&
                        this._int(event.order) === 8 &&
                        this._int(event.enter_instance) ===
                            RONIN_INSTANCE_ID
                    ) {
                        return true;
                    }

                    return (
                        this._int(event.a) === 3 &&
                        event.loc &&
                        typeof event.loc === "object" &&
                        this._int(event.loc.id) ===
                            RONIN_LOCATION_ID
                    );
                },
                15000
            );

            if (this._int(entered.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił wejście do instancji."
                );
            }

            // W HAR mapa Ronina (loc=193) przychodzi automatycznie po type=8,
            // czasem jeszcze przed potwierdzeniem a=777/order=8.
            const mapStartedAt = Date.now();
            while (Date.now() - mapStartedAt < 5000) {
                if (
                    this._int(this.mapSolver?.map?.locationId) ===
                    RONIN_LOCATION_ID
                ) {
                    break;
                }

                await this.sleep(50);
            }

            if (
                this.mapSolver &&
                this._int(this.mapSolver.map?.locationId) !==
                    RONIN_LOCATION_ID
            ) {
                throw new Error(
                    "Ronin: nie otrzymano mapy instancji (loc=193)."
                );
            }

            console.info("[SW Tool][RONIN] Wejście potwierdzone:", {
                instance: RONIN_INSTANCE_ID,
                room: roomId,
                location: RONIN_LOCATION_ID
            });
        }

        async waitForRoninCompletion(sinceMs, timeoutMs = 12000) {
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                if (this.roninFinishedAt >= sinceMs) {
                    return true;
                }

                await this.sleep(50);
            }

            return false;
        }

        async runRoninRoute() {
            this.setQuickPanelStatus("Ronin: wykonywanie trasy...");

            // Start questa bez syntetycznego X. qb_id pochodzi z a:3.quests.
            await this.waitForRoninQuestId();
            await this.openRoninQuestStep();
            await this.roninQuestAction();

            await this.navigateToRoninQuestMove(null, "1");
            await this.openRoninQuestStep();
            await this.roninQuestH();
            await this.roninQuestAction();

            await this.roninQuestH();
            await this.roninQuestAction();
            await this.roninQuestNext();
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "2");
            await this.openRoninQuestStep();
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "3");

            const timedStep = await this.openRoninQuestStep();
            this.setQuickPanelStatus(
                "Ronin: oczekiwanie na etap czasowy..."
            );
            await this.waitForRoninTimedQuestReady(timedStep);

            await this.roninQuestNext();
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "4");
            await this.openRoninQuestStep();
            await this.roninQuestH();
            await this.roninQuestAction();
            await this.roninQuestFight();
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "5");
            await this.openRoninQuestStep();
            await this.roninQuestNext();
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "6");
            await this.openRoninQuestStep();
            await this.roninQuestFight();
            await this.prepareRoninMobCombat();

            await this.roninMobCombat();
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "7");
            await this.openRoninQuestStep();
            await this.roninQuestNext();

            this.roninCounter++;
        }

        async runQuickRonin() {
            if (this.roninRunning) {
                throw new Error("Ronin jest już wykonywany.");
            }

            await this.getRoninInstanceDefinition();

            const dailyUsed = this.roninDailyUsage();
            if (dailyUsed >= this.roninDailyLimit) {
                throw new Error(
                    "Ronin: dzienny limit wykorzystany (" +
                    dailyUsed +
                    "/" +
                    this.roninDailyLimit +
                    ")."
                );
            }

            this.roninRunning = true;
            this.clearRoninTimers();
            const runStartedAt = Date.now();

            // Od tego momentu każdy nowy quest_move na mapie Ronina jest
            // kandydatem do nawigacji. Nie czyścimy wersji globalnej, tylko
            // zaznaczamy wszystko sprzed startu jako już skonsumowane.
            this.currentQuestMove = null;
            this.lastConsumedQuestMoveVersion = this.questMoveVersion;
            this.roninQuestId = 0;
            this.currentRoninQuestStep = null;
            this.currentHQuest = null;
            this.currentHQuestStep = null;
            this.currentHTracked = null;
            this.acceleratedHPending = false;

            try {
                await this.enterRoninInstance();
                await this.runRoninRoute();

                this.setQuickPanelStatus(
                    "Ronin: czekam na potwierdzenie zakończenia..."
                );

                const finished = await this.waitForRoninCompletion(
                    runStartedAt
                );

                if (!finished) {
                    throw new Error(
                        "Ronin: brak potwierdzenia zakończenia instancji a=777."
                    );
                }
            } finally {
                this.clearRoninTimers();
                this.roninRunning = false;
            }

            return {
                status: "done",
                run: this.roninCounter
            };
        }

        async runQuickAction(action) {
            if (
                this.quickActionRunning ||
                this.accountOperationRunning ||
                this.dailyRewardClaimStage !== 0 ||
                this.characterSwitch ||
                this.responseWaiter ||
                this.mapSolver?.active
            ) {
                throw new Error("Poczekaj na zakończenie bieżącej operacji.");
            }

            if (
                Number(GAME.char_id || this.currentCharacterId || 0) <= 0 ||
                !this.characterData()
            ) {
                throw new Error("Brak aktywnej postaci.");
            }

            const label = this.currentCharacterLabel();
            this.quickActionRunning = true;
            this.setQuickPanelBusy(true);

            try {
                if (action === "training") {
                    this.setQuickPanelStatus("Quick Trening...");
                    const result =
                        await this.startMaxTrainingForCurrentCharacter(
                            label,
                            { trustServerTimedState: true }
                        );

                    if (result === "started") {
                        this.setQuickPanelStatus(
                            "Trening uruchomiony.",
                            "success"
                        );
                    } else if (result === "timed") {
                        this.setQuickPanelStatus(
                            "Akcja czasowa już trwa."
                        );
                    } else {
                        this.setQuickPanelStatus(
                            "Brak umiejętności do treningu."
                        );
                    }
                    return;
                }

                if (action === "arena") {
                    this.setQuickPanelStatus("Quick Arena...");
                    const result =
                        await this.attackArenaForCurrentCharacter();

                    this.setQuickPanelStatus(
                        "Arena: ataki " +
                        result.attacked +
                        ", pominięto " +
                        result.skipped +
                        ", błędy " +
                        result.failed +
                        ".",
                        result.failed > 0 ? "" : "success"
                    );
                    return;
                }

                if (action === "abyss") {
                    this.setQuickPanelStatus("Quick Otchłań...");
                    const attacked =
                        await this.attackSoulAbyssForCurrentCharacter();

                    this.setQuickPanelStatus(
                        attacked
                            ? "Otchłań wykonana."
                            : "Otchłań — cooldown.",
                        attacked ? "success" : ""
                    );
                    return;
                }

                if (action === "mission") {
                    const result =
                        await this.runQuickMissionForCurrentCharacter();

                    this.setQuickPanelStatus(
                        result.message,
                        result.status === "done" ? "success" : ""
                    );
                    return;
                }

                if (action === "ronin") {
                    this.setQuickPanelStatus("Quick Ronin...");
                    const result = await this.runQuickRonin();

                    this.setQuickPanelStatus(
                        "Ronin wykonany. Próba #" +
                        result.run +
                        ".",
                        "success"
                    );
                    return;
                }

                throw new Error(
                    "Nieznana szybka akcja: " + String(action)
                );
            } catch (error) {
                console.error(
                    "[SW Tool][QUICK] Akcja nie powiodła się:",
                    action,
                    error
                );
                this.setQuickPanelStatus(
                    error instanceof Error
                        ? error.message
                        : String(error),
                    "error"
                );
            } finally {
                this.quickActionRunning = false;
                this.setQuickPanelBusy(false);
            }
        }

        mountQuickPanel() {
            document.getElementById("sw-tool-quick-panel")?.remove();

            const panel = document.createElement("div");
            panel.id = "sw-tool-quick-panel";
            Object.assign(panel.style, {
                position: "fixed",
                right: "8px",
                bottom: "8px",
                zIndex: "2147483000",
                width: "188px",
                padding: "7px",
                border: "2px solid #c29e51",
                borderRadius: "7px",
                background: "#1a1a39",
                color: "#fff",
                fontFamily: "Verdana, sans-serif",
                fontSize: "11px",
                boxShadow: "0 4px 16px rgba(0,0,0,.55)"
            });

            const header = document.createElement("div");
            Object.assign(header.style, {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
                color: "#c29e51",
                fontWeight: "700"
            });

            const title = document.createElement("span");
            title.textContent = "SW TOOL — QUICK";

            const collapse = document.createElement("button");
            collapse.type = "button";
            collapse.textContent = "−";
            Object.assign(collapse.style, {
                width: "24px",
                height: "22px",
                padding: "0",
                border: "1px solid #c29e51",
                borderRadius: "4px",
                background: "#30294a",
                color: "#fff",
                cursor: "pointer"
            });

            header.append(title, collapse);

            const body = document.createElement("div");
            body.style.display = "grid";
            body.style.gap = "5px";

            const actions = [
                ["training", "Quick Trening"],
                ["arena", "Quick Arena"],
                ["abyss", "Quick Otchłań"],
                ["mission", "Quick Misje"],
                ["ronin", "Quick Ronin"]
            ];

            this.quickPanelButtons = [];

            for (const [action, label] of actions) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = label;
                Object.assign(button.style, {
                    width: "100%",
                    padding: "6px 7px",
                    border: "1px solid #c29e51",
                    borderRadius: "5px",
                    background: "#30294a",
                    color: "#fff",
                    fontSize: "11px",
                    fontFamily: "Verdana, sans-serif",
                    cursor: "pointer"
                });

                button.addEventListener("mouseenter", () => {
                    if (!button.disabled) {
                        button.style.background = "#463b63";
                    }
                });
                button.addEventListener("mouseleave", () => {
                    button.style.background = "#30294a";
                });
                button.addEventListener("click", () => {
                    this.runQuickAction(action).catch((error) => {
                        console.warn(
                            "[SW Tool][QUICK] Nie można uruchomić akcji:",
                            action,
                            error
                        );
                        this.setQuickPanelStatus(
                            error instanceof Error
                                ? error.message
                                : String(error),
                            "error"
                        );
                    });
                });

                this.quickPanelButtons.push(button);
                body.appendChild(button);
            }

            const status = document.createElement("div");
            Object.assign(status.style, {
                minHeight: "26px",
                marginTop: "6px",
                paddingTop: "5px",
                borderTop: "1px solid rgba(194,158,81,.35)",
                color: "#c8c3d4",
                fontSize: "10px",
                lineHeight: "1.3",
                wordBreak: "break-word"
            });
            status.textContent = "Gotowy.";
            this.quickPanelStatus = status;

            let collapsed = false;
            collapse.addEventListener("click", () => {
                collapsed = !collapsed;
                body.style.display = collapsed ? "none" : "grid";
                status.style.display = collapsed ? "none" : "block";
                collapse.textContent = collapsed ? "+" : "−";
                panel.style.width = collapsed ? "150px" : "188px";
            });

            panel.append(header, body, status);
            document.body.appendChild(panel);
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

                    const expected = [...actions].join("/");
                    const typeInfo =
                        order.type !== undefined
                            ? ", type=" + String(order.type)
                            : "";

                    reject(
                        new Error(
                            "Timeout odpowiedzi serwera (TX a=" +
                            String(order.a) +
                            typeInfo +
                            ", oczekiwano a=" +
                            expected +
                            ")."
                        )
                    );
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

        async switchCharacterForAccountAction(
            charId,
            settleMs = 150,
            forceRefresh = false
        ) {
            const targetId = Number(charId);
            if (targetId <= 0) throw new Error("Nieprawidłowe ID postaci.");

            if (
                !forceRefresh &&
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
            let joined = 0, skipped = 0, failed = 0, dailyClaimed = 0;

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
                        await this.sleep(200);

                        if (
                            await this.claimDailyRewardForAccountAction(label)
                        ) {
                            dailyClaimed++;
                        }

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

            console.info("[SW Tool][ACCOUNT] Turnieje zakończone:", {
                joined,
                skipped,
                failed,
                dailyClaimed
            });
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

        async startMaxTrainingForCurrentCharacter(
            characterName,
            { trustServerTimedState = false } = {}
        ) {
            const maxActions = this.snapshotBonusActive(2) ? 2 : 1;

            // W operacjach całego konta snapshot po a:2 jest świeży, więc
            // możemy oszczędzić request. W Quick akcjach klient WWW potrafi
            // mieć przestarzałe timed_actions — wtedy pytamy serwer.
            if (
                !trustServerTimedState &&
                this.activeTimedActionsCount() >= maxActions
            ) {
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

        async runAccountMissions() {
            const characters = [...this.chars];
            const originalId = Number(
                GAME.char_id ||
                this.lastCharacterId ||
                this.currentCharacterId ||
                0
            );

            let completed = 0;
            let started = 0;
            let continued = 0;
            let skipped = 0;
            let timedSkipped = 0;
            let failed = 0;
            let dailyClaimed = 0;

            try {
                for (let i = 0; i < characters.length; i++) {
                    const char = characters[i];
                    const label =
                        char.name || ("#" + Number(char.id));

                    console.info(
                        "[SW Tool][ACCOUNT] Misje " +
                        (i + 1) +
                        "/" +
                        characters.length +
                        ": " +
                        label
                    );

                    try {
                        await this.switchCharacterForAccountAction(
                            Number(char.id),
                            0
                        );

                        // Ten sam settle co w pozostałych operacjach konta.
                        await this.sleep(200);

                        if (
                            await this.claimDailyRewardForAccountAction(label)
                        ) {
                            dailyClaimed++;
                        }

                        // Po a:2 snapshot jest świeży, więc dla operacji całego
                        // konta możemy bezpiecznie pominąć postać zajętą akcją
                        // czasową zamiast próbować uruchamiać misję.
                        if (this.activeTimedActionsCount() > 0) {
                            skipped++;
                            timedSkipped++;
                            console.info(
                                "[SW Tool][ACCOUNT] Misje — " +
                                label +
                                ": pominięto, trwa akcja czasowa."
                            );
                            continue;
                        }

                        const result =
                            await this.runQuickMissionForCurrentCharacter();

                        if (result?.status === "done") {
                            completed++;

                            if (result.started) {
                                started++;
                            } else {
                                continued++;
                            }

                            console.info(
                                "[SW Tool][ACCOUNT] Misje — " +
                                label +
                                ": " +
                                result.message
                            );
                        } else {
                            skipped++;

                            console.info(
                                "[SW Tool][ACCOUNT] Misje — " +
                                label +
                                ": " +
                                (result?.message || "pominięto.")
                            );
                        }
                    } catch (error) {
                        if (this.isFatalAccountError(error)) {
                            throw error;
                        }

                        failed++;
                        console.warn(
                            "[SW Tool][ACCOUNT] Misje — " +
                            label +
                            ":",
                            error
                        );
                    } finally {
                        this.stopNavigation(
                            "koniec misji dla bieżącej postaci"
                        );

                        // Zostawiamy klientowi WWW czas przed kolejnym a:5/a:2.
                        await this.sleep(200);
                    }
                }
            } finally {
                this.stopNavigation("koniec operacji misji konta");
                await this.restoreAccountCharacter(originalId);
            }

            console.info("[SW Tool][ACCOUNT] Misje zakończone:", {
                completed,
                started,
                continued,
                skipped,
                timedSkipped,
                failed,
                dailyClaimed
            });
        }

        async runAccountRonin() {
            const characters = [...this.chars];
            const originalId = Number(
                GAME.char_id ||
                this.lastCharacterId ||
                this.currentCharacterId ||
                0
            );

            await this.getRoninInstanceDefinition({
                refresh: true
            });

            const dailyLimit = this.roninDailyLimit;
            let completed = 0;
            let skipped = 0;
            let failed = 0;
            let dailyClaimed = 0;

            try {
                for (let i = 0; i < characters.length; i++) {
                    const char = characters[i];
                    const id = Number(char.id);
                    const label =
                        char.name || ("#" + id);

                    console.info(
                        "[SW Tool][ACCOUNT] Ronin " +
                        (i + 1) +
                        "/" +
                        characters.length +
                        ": " +
                        label
                    );

                    try {
                        await this.switchCharacterForAccountAction(
                            id,
                            0
                        );

                        if (
                            await this.claimDailyRewardForAccountAction(label)
                        ) {
                            dailyClaimed++;
                        }

                        let used = this.roninDailyUsage();

                        if (used >= dailyLimit) {
                            skipped++;
                            console.info(
                                "[SW Tool][ACCOUNT] Ronin — " +
                                label +
                                ": pominięto, limit " +
                                used +
                                "/" +
                                dailyLimit +
                                "."
                            );
                            continue;
                        }

                        while (used < dailyLimit) {
                            const attempt = used + 1;

                            this.setQuickPanelStatus(
                                "Ronin konto: " +
                                (i + 1) +
                                "/" +
                                characters.length +
                                " — " +
                                label +
                                " — próba " +
                                attempt +
                                "/" +
                                dailyLimit +
                                "..."
                            );

                            console.info(
                                "[SW Tool][ACCOUNT] Ronin — " +
                                label +
                                ": start próby " +
                                attempt +
                                "/" +
                                dailyLimit +
                                "."
                            );

                            const beforeUsed = used;

                            await this.runQuickRonin();
                            completed++;

                            used = await this.confirmRoninDailyUsage(
                                id,
                                Math.min(
                                    dailyLimit,
                                    beforeUsed + 1
                                )
                            );

                            console.info(
                                "[SW Tool][ACCOUNT] Ronin — " +
                                label +
                                ": próba zakończona, limit " +
                                used +
                                "/" +
                                dailyLimit +
                                "."
                            );
                        }
                    } catch (error) {
                        if (this.isFatalAccountError(error)) {
                            throw error;
                        }

                        failed++;
                        console.warn(
                            "[SW Tool][ACCOUNT] Ronin — " +
                            label +
                            ":",
                            error
                        );
                    } finally {
                        this.stopNavigation(
                            "koniec Ronina dla bieżącej postaci"
                        );
                    }
                }
            } finally {
                this.stopNavigation("koniec operacji Ronin konta");
                await this.restoreAccountCharacter(originalId);
            }

            console.info("[SW Tool][ACCOUNT] Ronin zakończony:", {
                completed,
                skipped,
                failed,
                dailyClaimed,
                dailyLimit
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
            if (this.quickActionRunning || this.mapSolver?.active) {
                throw new Error("Trwa szybka akcja lub nawigacja.");
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
                accountTrainings: () => this.runAccountTrainings(),
                accountMissions: () => this.runAccountMissions(),
                accountRonin: () => this.runAccountRonin()
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
        BOT.mountQuickPanel();

        // Pomocniczy dostęp z DevTools do jednego, zbiorczego rejestru portali.
        // SW_TOOL_PORTALS.get()    -> obiekt
        // SW_TOOL_PORTALS.export() -> sformatowany JSON
        // SW_TOOL_PORTALS.clear()  -> wyczyszczenie rejestru
        window.SW_TOOL_PORTALS = {
            get: () => BOT.getPortalMap(),
            export: () => JSON.stringify(BOT.getPortalMap(), null, 2),
            clear: () => BOT.clearPortalMap()
        };

        // Wspólny interfejs solvera mapy. Później automat misji będzie
        // korzystał z tego samego goTo(x, y), co ręczny klik na mapie.
        window.SW_TOOL_PATH = {
            goTo: (x, y, options = {}) => BOT.navigateTo(x, y, options),
            goToLocation: (locationId, x, y, options = {}) =>
                BOT.mapSolver?.navigateToLocation(
                    locationId,
                    x,
                    y,
                    options
                ),
            stop: (reason = "debug") => BOT.stopNavigation(reason),
            state: () => BOT.mapNavigationState()
        };

        window.SW_TOOL_QUICK = {
            training: () => BOT.runQuickAction("training"),
            arena: () => BOT.runQuickAction("arena"),
            abyss: () => BOT.runQuickAction("abyss"),
            mission: () => BOT.runQuickAction("mission"),
            ronin: () => BOT.runQuickAction("ronin")
        };

        GAME.socket.on("gr", (response) => {
            BOT.handleGameResponse(response);
        });

        setInterval(() => {
            BOT.updateID();
        }, 500);

        window.addEventListener("keydown", (event) => {
            if (!event.isTrusted) {
                return;
            }

            const target = event.target;
            if (
                target instanceof Element &&
                target.closest(
                    "input,textarea,select,[contenteditable='true']"
                )
            ) {
                return;
            }

            const key = String(event.key || "").toLowerCase();

            if (key === "x") {
                if (BOT.config.improvedX === true) {
                    // Przytrzymane X nie może generować kolejnych interakcji
                    // w kliencie gry. Jedno puszczenie klawisza odblokowuje
                    // dopiero następne świadome naciśnięcie.
                    if (BOT.improvedXHeld || event.repeat) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        return;
                    }

                    BOT.improvedXHeld = true;
                    BOT.runImprovedXFromUserKey(event);
                }
                return;
            }

            if (event.repeat) {
                return;
            }

            if (key === "h") {
                BOT.accelerateHFromUserKey(event);
            }
        }, true);

        window.addEventListener("keyup", (event) => {
            if (
                event.isTrusted &&
                String(event.key || "").toLowerCase() === "x"
            ) {
                BOT.improvedXHeld = false;
            }
        }, true);

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