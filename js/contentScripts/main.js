(() => {
    const SW_TOOL_CHANNEL = "SW_TOOL_BRIDGE_V1";
    const DEFAULT_CONFIG = Object.freeze({
        dailyReward: true,
        saveTuts: true,
        hideReports: false,
        mapClickMovement: true,
        acceleratedH: false,
        improvedX: false,
        killRespawnedMobs: false,
        expKillChampions: false,
        expKillElites: false,
        expKillBosses: false,
        debugLogs: false,
        preferTraining: true
    });

    let BOT = null;
    let pendingConfig = { ...DEFAULT_CONFIG };

    window.SW_TOOL_DEBUG_LOGS = false;

    const toolConsole = (
        level,
        ...args
    ) => {
        if (
            window.SW_TOOL_DEBUG_LOGS !==
                true
        ) {
            return;
        }

        const method =
            globalThis.console?.[level];

        if (
            typeof method ===
                "function"
        ) {
            method.apply(
                globalThis.console,
                args
            );
        }
    };

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
                : DEFAULT_CONFIG.improvedX,
            killRespawnedMobs: typeof source.killRespawnedMobs === "boolean"
                ? source.killRespawnedMobs
                : DEFAULT_CONFIG.killRespawnedMobs,
            expKillChampions: typeof source.expKillChampions === "boolean"
                ? source.expKillChampions
                : DEFAULT_CONFIG.expKillChampions,
            expKillElites: typeof source.expKillElites === "boolean"
                ? source.expKillElites
                : DEFAULT_CONFIG.expKillElites,
            expKillBosses: typeof source.expKillBosses === "boolean"
                ? source.expKillBosses
                : DEFAULT_CONFIG.expKillBosses,
            debugLogs: typeof source.debugLogs === "boolean"
                ? source.debugLogs
                : DEFAULT_CONFIG.debugLogs,
            preferTraining: typeof source.preferTraining === "boolean"
                ? source.preferTraining
                : DEFAULT_CONFIG.preferTraining
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
            this.charactersFromServer = false;
            this.currentCharacterId = 0;
            this.currentCharacterIndex = -1;
            this.lastCharacterId = 0;
            this.characterSwitch = null;
            this.characterSwitchTimeout = null;
            this.currentCharacterSnapshot = null;
            this.responseWaiter = null;
            this.accountOperationRunning = false;
            this.accountOperationAction = null;
            this.quickActionRunning = false;
            this.quickActionName = null;
            this.characterPreferences = {};
            this.roninRunning = false;
            this.quickPanelButtons = [];
            this.quickPanelStatus = null;
            this.quickLogEntries = [];
            this.quickLogPreview = null;
            this.quickLogList = null;
            this.quickLogExpanded = false;
            this.roninCounter = 0;
            this.roninTimers = [];
            this.roninFinishedAt = 0;
            this.roninReturnSync = null;
            this.roninInstanceDefinition = null;
            this.roninDailyLimit = 2;
            this.roninDailyUsageVersion = 0;
            this.currentHQuest = null;
            this.currentHQuestStep = null;
            this.currentHTracked = null;
            this.currentQuestStep = null;
            this.testZodiacQuestStep = null;
            this.testZodiacTrackVersion = 0;
            this.questKillRunning = false;
            this.pickupQuestRunning = false;
            this.pickupQuestStop = false;
            this.pickupQuestState = null;
            this.questKillState = null;
            this.questKillButton = null;
            this.questKillDomObserver = null;
            this.respawnRunning = false;
            this.respawnButton = null;
            this.respawnLimitInput = null;
            this.respawnPaLimit = 0;
            this.respawnFieldWaiter = null;
            this.expRunning = false;
            this.expStopRequested = false;
            this.expButton = null;
            this.pveActionPointsExhausted = false;
            this.hTrackedVersion = 0;
            this.acceleratedHPending = false;
            this.currentQuestMove = null;
            this.questMoveVersion = 0;
            this.lastConsumedQuestMoveVersion = 0;
            this.roninQuestId = 0;
            this.currentRoninQuestStep = null;
            this.lastRoninMapResponse = null;
            this.improvedXPending = false;
            this.improvedXHPending = null;
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

            toolConsole("log", "[SW Tool][PAGE] Cache postaci:", this.chars);
        }

        applyConfig(config) {
            this.config = normalizeConfig({
                ...this.config,
                ...config
            });

            window.SW_TOOL_DEBUG_LOGS =
                this.config.debugLogs ===
                true;

            setReportsHidden(this.config.hideReports);
            toolConsole("log", "[SW Tool][PAGE] Zastosowano konfigurację:", this.config);
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
            this.charactersFromServer = true;

            const activeId = Number(GAME.char_id || this.lastCharacterId || 0);
            this.currentCharacterIndex = this.chars.findIndex(
                (char) => Number(char.id) === activeId
            );

            toolConsole("info", "[SW Tool][PAGE] RX lista postaci:", {
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
                toolConsole("warn", "[SW Tool][PAGE] Zmiana postaci przerwana:", reason);
            }

            this.characterSwitch = null;
        }

        switchRelative(delta) {
            if (this.accountOperationRunning || this.quickActionRunning) {
                toolConsole("info", "[SW Tool][PAGE] Trwa inna operacja.");
                return;
            }

            if (this.dailyRewardClaimStage !== 0 || this.responseWaiter) {
                toolConsole("info", 
                    "[SW Tool][PAGE] Trwa poprzednie zapytanie — zmiana postaci poczeka."
                );
                return;
            }

            if (this.characterSwitch) {
                toolConsole("info", "[SW Tool][PAGE] Zmiana postaci już trwa.");
                return;
            }

            const sourceId = Number(
                GAME.char_id ||
                this.lastCharacterId ||
                this.currentCharacterId ||
                0
            );

            if (sourceId <= 0) {
                toolConsole("warn", "[SW Tool][PAGE] Brak aktywnej postaci do zmiany.");
                return;
            }

            if (!Array.isArray(this.chars) || this.chars.length === 0) {
                toolConsole("warn", "[SW Tool][PAGE] Brak zapisanej listy postaci.");
                return;
            }

            const sourceIndex = this.chars.findIndex(
                (char) => Number(char.id) === sourceId
            );

            if (sourceIndex < 0) {
                toolConsole("warn", 
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
                toolConsole("warn", "[SW Tool][PAGE] Brak innej postaci do przełączenia.");
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

            toolConsole("info", "[SW Tool][PAGE] TX bezpośrednia zmiana postaci:", {
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

            if (
                action === 602 &&
                error === 0
            ) {
                this.routeRespawnFieldWaiter(
                    response
                );
            }

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

            // Rejestrujemy nowe, rzeczywiście odebrane RX powrotu.
            // MapSolver i dane postaci mogły jeszcze zawierać starą lokację.
            const returnSync = this.roninReturnSync;
            if (
                returnSync &&
                this._int(GAME.char_id || this.currentCharacterId) ===
                    returnSync.characterId
            ) {
                if (
                    action === 3 &&
                    error === 0 &&
                    this._int(response.loc?.id) === 193
                ) {
                    returnSync.enteredMap = true;
                }

                if (returnSync.finishedAt > 0) {
                    if (
                        action === 3 &&
                        error === 0 &&
                        this._int(response.loc?.id) ===
                            returnSync.originLocationId
                    ) {
                        returnSync.returnMapReceived = true;
                    }

                    if (action === 998) {
                        const field = String(response.f || "");
                        if (
                            field === "instance_id" &&
                            this._int(response.v) === 0
                        ) {
                            returnSync.instanceCleared = true;
                        }
                        if (
                            field === "loc" &&
                            this._int(response.v) ===
                                returnSync.originLocationId
                        ) {
                            returnSync.originLocationReceived = true;
                        }
                        if (field === "icd_5") {
                            returnSync.dailyUsageReceived = true;
                            returnSync.dailyUsage = this._int(response.v);
                        }
                    }
                }
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

            this.handleTestZodiacQuestResponse(response);

            if (action === 22) {
                this.handleRoninQuestStepResponse(response);
                this.handleQuestMoveResponse(response);
                this.handleHQuestResponse(response);
            }

            // Progres killi może przyjść bezpośrednio w odpowiedzi walki
            // (np. a=7: track/new_amount albo map_handler.send_tracker),
            // a nie wyłącznie w a=22.
            this.handleQuestKillResponse(response);
            this.handlePickupQuestResponse(response);

            if (
                action === 998 &&
                ["instance_id", "loc", "x", "y"].includes(
                    String(response.f || "")
                ) &&
                this.currentCharacterSnapshot?.char_data &&
                typeof this.currentCharacterSnapshot.char_data === "object"
            ) {
                const field = String(response.f);
                this.currentCharacterSnapshot.char_data[field] =
                    this._int(response.v);
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

                toolConsole("info", 
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
                this._int(response.instance) === 5 &&
                this.roninRunning &&
                (
                    this._int(response.char_id) === 0 ||
                    this._int(response.char_id) ===
                        this._int(this.currentCharacterId)
                )
            ) {
                this.roninFinishedAt = Date.now();
                if (
                    this.roninReturnSync &&
                    this.roninReturnSync.characterId ===
                        this._int(this.currentCharacterId)
                ) {
                    this.roninReturnSync.finishedAt = this.roninFinishedAt;
                }
                toolConsole("info", "[SW Tool][RONIN] Instancja zakończona — czekam na teleport i rozliczenie.", {
                    done: response.done,
                    share: response.share,
                    charId: response.char_id,
                    returnLocation: this.roninReturnSync?.originLocationId
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

                    toolConsole("info", "[SW Tool][PAGE] RX zmiana postaci potwierdzona:", {
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
            toolConsole("info", "[SW Tool][PORTALS] Rejestr portali wyczyszczony.");
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

            toolConsole("info", "[SW Tool][PORTALS] Zapisano mapę:", {
                locationId,
                locationName: current.name,
                portalsOnMap: current.portals.length,
                totalLocations,
                totalPortals
            });
        }

        roninQuestFromMapResponse(response) {
            if (
                this._int(response?.loc?.id) !== 193 ||
                !response.quests ||
                typeof response.quests !== "object"
            ) {
                return null;
            }

            const charId = this._int(
                GAME.char_id || this.currentCharacterId
            );

            const players = Array.isArray(response.players)
                ? response.players
                : [];

            const player =
                players.find(
                    (item) =>
                        this._int(item?.id) === charId
                ) ||
                players.find(
                    (item) =>
                        String(item?.name || "") ===
                        String(
                            this.currentCharacterSnapshot
                                ?.char_data?.name ||
                            ""
                        )
                ) ||
                null;

            const x = this._int(player?.x);
            const y = this._int(player?.y);

            if (x > 0 && y > 0) {
                const fieldQuests =
                    response.quests[x + "_" + y];

                if (Array.isArray(fieldQuests)) {
                    const quest = fieldQuests.find(
                        (item) =>
                            this._int(item?.qb_id) > 0
                    );

                    if (quest) {
                        return {
                            quest,
                            qbId: this._int(quest.qb_id),
                            x,
                            y,
                            source: "player-field"
                        };
                    }
                }
            }

            // Fallback: na mapie instancji startowy quest może przyjść,
            // zanim klient zdąży poprawnie zsynchronizować GAME.char_id /
            // snapshot pozycji. Wtedy nie uzależniamy qb_id od pola gracza.
            for (const [field, raw] of Object.entries(response.quests)) {
                if (!Array.isArray(raw)) continue;

                const quest = raw.find(
                    (item) =>
                        this._int(item?.qb_id) > 0
                );

                if (!quest) continue;

                const [fx, fy] = String(field)
                    .split("_")
                    .map((value) => this._int(value));

                return {
                    quest,
                    qbId: this._int(quest.qb_id),
                    x: fx,
                    y: fy,
                    source: "quests-scan"
                };
            }

            return null;
        }

        handleRoninMapQuestResponse(response) {
            if (
                !this.roninRunning ||
                this._int(response?.loc?.id) !== 193
            ) {
                return;
            }

            this.lastRoninMapResponse = response;

            const found =
                this.roninQuestFromMapResponse(response);

            if (!found || found.qbId <= 0) {
                toolConsole("warn", 
                    "[SW Tool][RONIN] Mapa instancji bez rozpoznanego qb_id.",
                    {
                        charId: this._int(
                            GAME.char_id ||
                            this.currentCharacterId
                        ),
                        questFields:
                            response.quests &&
                            typeof response.quests === "object"
                                ? Object.keys(response.quests)
                                : []
                    }
                );
                return;
            }

            this.roninQuestId = found.qbId;
            this.currentRoninQuestStep = null;

            toolConsole("info", 
                "[SW Tool][RONIN] Quest startowy z mapy:",
                {
                    qbId: found.qbId,
                    locationId: 193,
                    x: found.x,
                    y: found.y,
                    source: found.source,
                    name: String(
                        found.quest?.name || ""
                    )
                }
            );
        }

        async waitForRoninQuestId(timeoutMs = 5000) {
            const startedAt = Date.now();

            while (Date.now() - startedAt < timeoutMs) {
                const qbId = this._int(this.roninQuestId);
                if (qbId > 0) {
                    return qbId;
                }

                const recovered =
                    this.roninQuestFromMapResponse(
                        this.lastRoninMapResponse
                    );

                if (
                    recovered &&
                    recovered.qbId > 0
                ) {
                    this.roninQuestId =
                        recovered.qbId;

                    toolConsole("info", 
                        "[SW Tool][RONIN] Quest startowy odzyskany z cache mapy:",
                        {
                            qbId: recovered.qbId,
                            source:
                                recovered.source,
                            x: recovered.x,
                            y: recovered.y
                        }
                    );

                    return recovered.qbId;
                }

                await this.sleep(25);
            }

            throw new Error(
                "Ronin: mapa instancji nie zawiera rozpoznawalnego qb_id questa startowego."
            );
        }

        async waitForRoninStartQuestReady({
            timeoutMs = 8500
        } = {}) {
            // Mapa (loc=193) i quest z quests muszą pochodzić
            // z aktualnego wejścia. Pierwszy q_step dopiero po
            // odświeżeniu klienta, a nie natychmiast po order:8.
            const startedAt = Date.now();
            let mapRefreshed = false;

            while (Date.now() - startedAt < timeoutMs) {
                const mapLocation =
                    this._int(this.mapSolver?.map?.locationId);
                const mapResponse = this.lastRoninMapResponse;
                const quest = this.roninQuestFromMapResponse(
                    mapResponse
                );

                if (
                    mapLocation === 193 &&
                    quest?.qbId > 0 &&
                    this._int(this.roninQuestId) === quest.qbId
                ) {
                    // Klientowi WWW dajemy krótką chwilę na obsłużenie
                    // renderu i interakcji pola po otrzymaniu mapy.
                    await this.sleep(400);

                    if (
                        this._int(this.mapSolver?.map?.locationId) !== 193
                    ) {
                        throw new Error(
                            "Ronin: lokalizacja zmieniła się podczas ładowania startu."
                        );
                    }

                    toolConsole(
                        "info",
                        "[SW Tool][RONIN] Startowy quest gotowy po synchronizacji mapy.",
                        {
                            questId: quest.qbId,
                            x: quest.x,
                            y: quest.y,
                            elapsedMs: Date.now() - startedAt,
                            refreshedMap: mapRefreshed
                        }
                    );
                    return quest.qbId;
                }

                if (
                    !mapRefreshed &&
                    Date.now() - startedAt >= 900 &&
                    this.mapSolver &&
                    mapLocation === 193
                ) {
                    mapRefreshed = true;
                    await this.mapSolver.refreshMap();
                    continue;
                }

                await this.sleep(50);
            }

            throw new Error(
                "Ronin: startowy quest nie został załadowany po wejściu na mapę 193."
            );
        }

        gameDebug() {
            toolConsole("log", "Game ID " + GAME.char_id);
            toolConsole("log", "Char ID " + this.currentCharacterId);
            toolConsole("log", "INDEX " + this.currentCharacterIndex);
            toolConsole("log", this.chars);
            toolConsole("log", GAME);
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

                toolConsole("info", "[SW Tool][PAGE] Zmiana postaci:", {
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

                    toolConsole("info", "[SW Tool][PAGE] Daily reward TX:", {
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
                    toolConsole("error", 
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
                toolConsole("error", 
                    "[SW Tool][PAGE] Serwer odrzucił operację nagrody dziennej:",
                    { e: error, stage: this.dailyRewardClaimStage }
                );
                this.resetDailyRewardClaim("błąd serwera e=" + error);
                return;
            }

            if (this.dailyRewardClaimStage === 1) {
                if (!Array.isArray(response.daily_data)) {
                    toolConsole("error", 
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

                    toolConsole("info", "[SW Tool][PAGE] Daily reward TX:", {
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
                    toolConsole("error", 
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

                toolConsole("warn", 
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

            toolConsole("info", "[SW Tool][PAGE] Nagroda dzienna odebrana:", {
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
                toolConsole("info", 
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
                toolConsole("info", "[SW Tool][PAGE] Legacy tournament registration start.");
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

        addQuickLog(message, type = "") {
            const text = String(message || "").trim();
            if (!text) return;

            const now = new Date();
            const time = [
                String(now.getHours()).padStart(2, "0"),
                String(now.getMinutes()).padStart(2, "0"),
                String(now.getSeconds()).padStart(2, "0")
            ].join(":");

            this.quickLogEntries.push({
                time,
                message: text,
                type
            });

            if (this.quickLogEntries.length > 200) {
                this.quickLogEntries.splice(
                    0,
                    this.quickLogEntries.length - 200
                );
            }

        }

        setQuickPanelStatus(message, type = "") {
            this.addQuickLog(message, type);
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
                    toolConsole("warn", 
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

            this.currentQuestStep = step;
            this.currentRoninQuestStep = step;

            if (
                this.roninRunning &&
                this._int(this.mapSolver?.map?.locationId) === 193
            ) {
                if (this.roninQuestId !== qbId) {
                    toolConsole("info", 
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

            toolConsole("info", 
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

        markImprovedXHQuestComplete(id, max) {
            const questId = this._int(id);
            const questMax = Math.max(
                0,
                this._int(max)
            );

            if (questId <= 0 || questMax <= 0) {
                return;
            }

            if (
                this.currentHQuest &&
                this._int(this.currentHQuest.id) ===
                    questId
            ) {
                this.currentHQuest.count =
                    questMax;
                this.currentHQuest.max =
                    questMax;
                this.currentHQuest.isMet =
                    true;
            }

            if (
                this.currentHTracked &&
                this._int(this.currentHTracked.id) ===
                    questId
            ) {
                this.currentHTracked.count =
                    questMax;
                this.currentHTracked.max =
                    questMax;
                this.currentHTracked.isMet =
                    true;
            }

            if (
                this.currentHQuestStep &&
                this._int(this.currentHQuestStep.id) ===
                    questId
            ) {
                this.currentHQuestStep.max =
                    questMax;
                this.currentHQuestStep.isMet =
                    true;
            }
        }

        clearImprovedXHPending(reason = "") {
            if (!this.improvedXHPending) {
                return;
            }

            const pending = this.improvedXHPending;
            this.improvedXHPending = null;

            toolConsole("info", 
                "[SW Tool][X] Zwolniono oczekiwanie H.",
                {
                    ...pending,
                    reason
                }
            );
        }

        syncImprovedXHPending() {
            const pending = this.improvedXHPending;
            if (!pending) return false;

            const tracked =
                this.currentHTracked &&
                this._int(this.currentHTracked.id) ===
                    this._int(pending.id) &&
                this._int(this.currentHTracked.max) ===
                    this._int(pending.max)
                    ? this.currentHTracked
                    : null;

            const quest =
                this.currentHQuest &&
                this._int(this.currentHQuest.id) ===
                    this._int(pending.id) &&
                this._int(this.currentHQuest.max) ===
                    this._int(pending.max)
                    ? this.currentHQuest
                    : null;

            const step =
                this.currentHQuestStep &&
                this._int(this.currentHQuestStep.id) ===
                    this._int(pending.id) &&
                this._int(this.currentHQuestStep.max) ===
                    this._int(pending.max)
                    ? this.currentHQuestStep
                    : null;

            const count = Math.max(
                this._int(tracked?.count),
                this._int(quest?.count)
            );

            const complete =
                Boolean(tracked?.isMet) ||
                Boolean(quest?.isMet) ||
                Boolean(step?.isMet) ||
                count >= this._int(pending.max);

            if (!complete) {
                return false;
            }

            this.markImprovedXHQuestComplete(
                pending.id,
                pending.max
            );

            this.clearImprovedXHPending(
                "potwierdzone przez stan questa"
            );

            this.setQuickPanelStatus(
                "X: quest H zaliczony " +
                pending.max +
                "/" +
                pending.max +
                ".",
                "success"
            );

            return true;
        }

        improvedXHQuestState() {
            const quest = this.currentHQuest;

            if (
                !quest ||
                this._int(quest.id) <= 0 ||
                this._int(quest.max) <= 0
            ) {
                return null;
            }

            const id = this._int(quest.id);
            const max = Math.max(
                0,
                this._int(quest.max)
            );

            const tracked =
                this.currentHTracked &&
                this._int(this.currentHTracked.id) === id &&
                this._int(this.currentHTracked.max) === max
                    ? this.currentHTracked
                    : null;

            const step =
                this.currentHQuestStep &&
                this._int(this.currentHQuestStep.id) === id &&
                this._int(this.currentHQuestStep.max) === max
                    ? this.currentHQuestStep
                    : null;

            const count = Math.max(
                0,
                this._int(quest.count),
                this._int(tracked?.count)
            );

            const complete =
                Boolean(quest.isMet) ||
                Boolean(tracked?.isMet) ||
                Boolean(step?.isMet) ||
                count >= max;

            if (complete) {
                this.markImprovedXHQuestComplete(
                    id,
                    max
                );

                toolConsole("info", 
                    "[SW Tool][X] H jest już zaliczone — przechodzę do następnej akcji questa.",
                    {
                        id,
                        count: Math.max(count, max),
                        max
                    }
                );

                return null;
            }

            // Sam tracked[] nie wystarcza do wysłania H.
            // Po "Dalej" serwer potrafi najpierw przysłać tracker nowego
            // etapu, a q_step dopiero po otwarciu/odświeżeniu okna questa.
            // Dopóki nie mamy q_step dla dokładnie tego samego id/max,
            // kolejne X ma zostać przepuszczone do klienta gry.
            if (!step) {
                return {
                    id,
                    count,
                    max,
                    missing: max - count,
                    ready: false,
                    reason: "step-not-synced"
                };
            }

            return {
                id,
                count,
                max,
                missing: max - count,
                ready: true,
                reason: ""
            };
        }

        improvedXQuestWindowOpen() {
            return [
                ...document.querySelectorAll(".quest_win")
            ].some((windowElement) =>
                this.isVisibleQuestAction(windowElement)
            );
        }

        async runImprovedXFromUserKey(event = null) {
            if (
                this.config.improvedX !== true ||
                this.improvedXPending ||
                this.quickActionRunning ||
                this.accountOperationRunning ||
                this.responseWaiter ||
                this.characterSwitch
            ) {
                return false;
            }

            // Aktywny quest typu H ma pierwszeństwo przed klikaniem
            // przycisków questa. Jedno X = jedna akcja: dobijamy H do 100%,
            // a dopiero kolejne X może przejść dialog dalej.
            const hQuest =
                this.improvedXHQuestState();

            if (hQuest) {
                // Tracker nowego etapu może przyjść wcześniej niż q_step.
                // W takim stanie NIE wysyłamy H i NIE klikamy starego przycisku
                // z DOM. X trafia do gry, aby klient otworzył/odświeżył etap.
                if (hQuest.ready !== true) {
                    toolConsole("info", 
                        "[SW Tool][X] H czeka na q_step aktywnego etapu — przepuszczam X do gry.",
                        {
                            id: hQuest.id,
                            count: hQuest.count,
                            max: hQuest.max,
                            reason: hQuest.reason
                        }
                    );

                    this.setQuickPanelStatus(
                        "X: synchronizuję etap questa H..."
                    );

                    return false;
                }

                // Jeżeli q_step H jest zsynchronizowany, ale okno questa
                // jest zamknięte, pierwsze X zostawiamy klientowi gry.
                // Dopiero kolejne X, przy widocznym .quest_win, wysyła pełne H.
                if (!this.improvedXQuestWindowOpen()) {
                    toolConsole("info", 
                        "[SW Tool][X] Quest H aktywny, ale okno questa jest zamknięte — pierwsze X otwiera okno.",
                        {
                            id: hQuest.id,
                            count: hQuest.count,
                            max: hQuest.max
                        }
                    );

                    this.setQuickPanelStatus(
                        "X: otwieram okno questa H..."
                    );

                    return false;
                }

                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                }

                this.improvedXPending = true;
                this.acceleratedHPending = true;

                try {
                    this.setQuickPanelStatus(
                        "X: quest H " +
                        hQuest.count +
                        "/" +
                        hQuest.max +
                        " → 100%..."
                    );

                    const existingPending =
                        this.improvedXHPending;

                    if (
                        existingPending &&
                        this._int(existingPending.id) ===
                            hQuest.id &&
                        this._int(existingPending.max) ===
                            hQuest.max
                    ) {
                        const age =
                            Date.now() -
                            this._int(
                                existingPending.sentAt
                            );

                        if (age < 2500) {
                            this.setQuickPanelStatus(
                                "X: H wysłane — czekam na aktualizację questa..."
                            );
                            return true;
                        }

                        this.clearImprovedXHPending(
                            "brak aktualizacji przez 2.5 s — można ponowić"
                        );
                    }

                    this.currentHQuest = {
                        ...(this.currentHQuest || {}),
                        id: hQuest.id,
                        count: hQuest.count,
                        max: hQuest.max,
                        isMet: false
                    };

                    this.improvedXHPending = {
                        id: hQuest.id,
                        max: hQuest.max,
                        expected: hQuest.max,
                        sentAt: Date.now()
                    };

                    const sent =
                        this.sendHQuestCount(
                            hQuest.missing,
                            {
                                waitForResponse: false
                            }
                        );

                    if (!sent) {
                        this.clearImprovedXHPending(
                            "nie udało się wysłać socketu"
                        );
                        throw new Error(
                            "Nie udało się wysłać H."
                        );
                    }

                    toolConsole("info", 
                        "[SW Tool][X] Quest H wysłany bez blokującego waitera.",
                        {
                            id: hQuest.id,
                            before: hQuest.count,
                            sent: hQuest.missing,
                            max: hQuest.max
                        }
                    );

                    this.setQuickPanelStatus(
                        "X: H wysłane " +
                        hQuest.count +
                        "/" +
                        hQuest.max +
                        " → " +
                        hQuest.max +
                        "/" +
                        hQuest.max +
                        "."
                    );

                    return true;
                } catch (error) {
                    toolConsole("error", 
                        "[SW Tool][X] Automatyczne H nie powiodło się:",
                        error
                    );

                    this.setQuickPanelStatus(
                        "X: H — " +
                        (
                            error instanceof Error
                                ? error.message
                                : String(error)
                        ),
                        "error"
                    );

                    return true;
                } finally {
                    this.acceleratedHPending = false;
                    this.improvedXPending = false;
                }
            }

            // Sprawdzamy stan PRZED natywną obsługą X przez grę.
            // Dzięki temu X, które dopiero otwiera okno questa, nie może
            // w tym samym naciśnięciu automatycznie przejść do następnego
            // etapu.
            const actions = this.improvedXQuestActions();

            if (actions.length > 1) {
                toolConsole("info", 
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
                this.clickQuestAction(
                    actions[0],
                    "improved-x"
                );
                return true;
            } finally {
                this.improvedXPending = false;
            }
        }

        async refreshRoninQuestClientState(
            reason = "quest",
            {
                settleMs = 300,
                pressX = true
            } = {}
        ) {
            const questId = this._int(this.roninQuestId);
            if (questId <= 0) {
                throw new Error(
                    "Ronin: nie znam ID questa do odświeżenia."
                );
            }

            // Samo a:22/type:1 odświeża stan serwerowy, ale nie zawsze
            // przebudowuje klientowe okno questa. Stary Ronin wykonywał
            // w tych miejscach ponowne X, dlatego zachowujemy ten sygnał
            // tylko dla etapów, które faktycznie wymagają synchronizacji UI.
            if (pressX) {
                toolConsole(
                    "info",
                    "[SW Tool][RONIN] Odświeżam klientowy stan questa przez X.",
                    {
                        reason,
                        qbId: questId
                    }
                );

                this.currentRoninQuestStep = null;
                this.roninPressKey("x");

                if (settleMs > 0) {
                    await this.sleep(settleMs);
                }
            }

            const step = await this.openRoninQuestStep();

            toolConsole(
                "info",
                "[SW Tool][RONIN] Stan questa po odświeżeniu.",
                {
                    reason,
                    qbId: this._int(step?.qb_id),
                    wantType: this._int(step?.want?.type),
                    isMet: Boolean(step?.want?.is_met),
                    count: this._int(step?.want?.count),
                    max: this._int(step?.want?.maxv)
                }
            );

            return step;
        }

        async waitForRoninTimedQuestReady(
            initialStep = null
        ) {
            const step =
                initialStep ||
                await this.openRoninQuestStep();

            const want =
                step?.want;

            if (
                !want ||
                typeof want !== "object" ||
                this._int(
                    want.type
                ) !== 6
            ) {
                return step;
            }

            // Stary, sprawdzony Ronin nie czekał na lokalne want.is_met.
            // Sekwencja była dokładnie: 31 s -> X -> Dalej.
            this.setQuickPanelStatus(
                "Ronin: etap czasowy — czekam 31 s..."
            );

            toolConsole(
                "info",
                "[SW Tool][RONIN] Czekajka start.",
                {
                    waitMs: 31000,
                    serverCount:
                        this._int(
                            want.count
                        ),
                    serverAmount:
                        this._int(
                            want.amount
                        )
                }
            );

            await this.sleep(
                31000
            );

            this.currentRoninQuestStep =
                null;
            this.roninPressKey(
                "x"
            );

            // Nie wymagamy tutaj want.is_met=true. W tym etapie klient
            // starego bota przechodził dalej po samym upływie czasu.
            return step;
        }

        async roninTimedQuestNext() {
            const questId =
                this._int(
                    this.roninQuestId
                );

            if (questId <= 0) {
                throw new Error(
                    "Ronin: nie znam ID aktywnego questa czasowego."
                );
            }

            toolConsole(
                "info",
                "[SW Tool][RONIN] Etap czasowy: wysyłam Dalej po 31 s.",
                {
                    qbId:
                        questId
                }
            );

            this.currentRoninQuestStep =
                null;

            const response =
                await this.sendAndWait(
                    {
                        a: 22,
                        type: 2,
                        button: 1,
                        id:
                            questId
                    },
                    [22, 999],
                    (event) => {
                        if (
                            this._int(
                                event.e
                            ) !== 0
                        ) {
                            return true;
                        }

                        if (
                            this._int(
                                event.a
                            ) !== 22
                        ) {
                            return false;
                        }

                        if (
                            event.q_step &&
                            typeof event.q_step ===
                                "object"
                        ) {
                            return (
                                this._int(
                                    event.q_step
                                        .qb_id
                                ) ===
                                questId
                            );
                        }

                        if (
                            event.quest_move &&
                            typeof event.quest_move ===
                                "object"
                        ) {
                            return (
                                this._int(
                                    event.quest_move
                                        .qb_id
                                ) ===
                                questId
                            );
                        }

                        return false;
                    },
                    10000
                );

            if (
                this._int(
                    response.e
                ) !== 0
            ) {
                throw new Error(
                    "Ronin: serwer odrzucił przejście dalej po etapie czasowym."
                );
            }

            return response;
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

            toolConsole("info", 
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

        async syncRoninMobQuestState(
            state,
            reason = "mob-fight"
        ) {
            const step = await this.openRoninQuestStep();
            const want = step?.want;
            const wantType = this._int(want?.type);

            // Zmiana typu kroku oznacza, że serwer faktycznie zakończył
            // etap przeciwników i przeszedł dalej.
            if (
                !want ||
                typeof want !== "object" ||
                wantType !== 1
            ) {
                state.serverDone = true;

                toolConsole(
                    "info",
                    "[SW Tool][RONIN] Serwer zakończył etap przeciwników.",
                    {
                        reason,
                        nextWantType: wantType,
                        qbId: this._int(step?.qb_id)
                    }
                );

                return step;
            }

            const serverCount = Math.max(
                0,
                this._int(want.count)
            );
            const serverMax = Math.max(
                1,
                this._int(want.maxv),
                this._int(want.amount)
            );

            state.count = serverCount;
            state.max = serverMax;
            state.serverDone = Boolean(want.is_met);

            this.setQuickPanelStatus(
                "Ronin: przeciwnicy " +
                state.count +
                "/" +
                state.max +
                (state.serverDone ? " ✓" : "") +
                "..."
            );

            toolConsole(
                "info",
                "[SW Tool][RONIN] Potwierdzenie killi z q_step.",
                {
                    reason,
                    count: state.count,
                    max: state.max,
                    isMet: state.serverDone
                }
            );

            return step;
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
                !state.serverDone &&
                mobsLeft > 0
            ) {
                const multiAvailable =
                    Array.isArray(field.multiFight) &&
                    field.multiFight.includes(0);

                const useMulti = multiAvailable;
                const beforeCount = state.count;

                const result = await this.roninMobFightOnce({
                    questId: state.questId,
                    beforeCount,
                    useMulti
                });

                if (!result.progressed) {
                    mobsLeft = 0;
                    break;
                }

                // Wynik trackera traktujemy wyłącznie jako informację
                // pomocniczą. Źródłem prawdy jest świeży q_step poniżej.
                const trackerCount = this._int(result.count);
                const gained = Math.max(
                    1,
                    this._int(result.gained)
                );

                mobsLeft = Math.max(
                    0,
                    mobsLeft - gained
                );
                field.mobs.count = mobsLeft;

                await this.syncRoninMobQuestState(
                    state,
                    "po walce " +
                    beforeCount +
                    " -> tracker " +
                    trackerCount
                );

                if (state.serverDone) {
                    break;
                }
            }

            return state;
        }

        async confirmRoninMobIntroButton(step) {
            const questId = this._int(step?.qb_id);
            if (questId <= 0 ||
                this._int(step?.want?.type) !== 1 ||
                Boolean(step?.want?.is_met)) {
                return false;
            }

            // Stary Ronin wciskał tu DWA razy Dalej po walce questowej.
            // Drugi przycisk może pozostać widoczny, mimo że type:1
            // zostało już zwrócone przez serwer. Nie wysyłamy go jednak
            // w ciemno: sprawdzamy rzeczywisty przycisk oficjalnego klienta.
            this.setQuickPanelStatus(
                "Ronin: synchronizuję ostatnie Dalej przed Quest Kille..."
            );
            if (!this.improvedXQuestWindowOpen()) {
                this.roninPressKey("x");
            }
            await this.sleep(300);

            const actions = this.improvedXQuestActions();
            if (actions.length === 0) {
                toolConsole(
                    "info",
                    "[SW Tool][RONIN] Brak dodatkowego przycisku przed mobami — etap gotowy.",
                    { questId }
                );
                return false;
            }

            if (actions.length !== 1 ||
                this.questActionType(actions[0]) !== "next") {
                throw new Error(
                    "Ronin: przed mobami klient pokazuje inną akcję niż pojedyncze Dalej."
                );
            }

            const buttonText = String(
                actions[0].textContent || ""
            ).trim();

            const response = await this.sendAndWait(
                {
                    a: 22,
                    type: 2,
                    button: 1,
                    id: questId
                },
                [22, 999],
                (event) => {
                    if (this._int(event.a) === 999) {
                        return this._int(event.e) !== 0;
                    }
                    if (this._int(event.a) !== 22) {
                        return false;
                    }
                    if (this._int(event.e) !== 0) {
                        return true;
                    }
                    if (
                        this._int(event.q_step?.qb_id) === questId ||
                        this._int(event.quest_move?.qb_id) === questId
                    ) {
                        return true;
                    }
                    return Array.isArray(event.tracked) &&
                        event.tracked.some((entry) =>
                            this._int(entry?.qb_id) === questId
                        );
                },
                10000
            );

            if (this._int(response.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił ostatnie Dalej przed Quest Kille (e=" +
                    this._int(response.e) + ")."
                );
            }

            toolConsole(
                "info",
                "[SW Tool][RONIN] Potwierdzono dodatkowe Dalej na polu mobów.",
                {
                    questId,
                    buttonText,
                    responseHasStep: Boolean(response.q_step),
                    responseHasTracker: Array.isArray(response.tracked),
                    responseHasMove: Boolean(response.quest_move)
                }
            );
            return true;
        }

        async prepareRoninMobCombat(maxTransitions = 8) {
            let fightOnMobField = false;
            let nextAfterFight = 0;
            let introButtonChecked = false;

            // Stary Ronin otwierał quest na polu mobów przed walką i Dalej.
            // Dzięki temu UI klienta nie zostaje ze stanem poprzedniego pola.
            if (!this.improvedXQuestWindowOpen()) {
                this.roninPressKey("x");
            }
            await this.sleep(250);

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

                const step = await this.openRoninQuestStep();
                const want = step?.want;
                const wantType = this._int(want?.type);
                const isMet = Boolean(want?.is_met);

                toolConsole(
                    "info",
                    "[SW Tool][RONIN] Dialog przed Quest Kille — aktualny krok.",
                    {
                        qbId: this._int(step?.qb_id),
                        title: String(step?.title || step?.header || ""),
                        wantType,
                        isMet,
                        transition: i,
                        fightOnMobField,
                        nextAfterFight,
                        buttons: this.improvedXQuestActions().map((action) => ({
                            type: this.questActionType(action),
                            text: String(action.textContent || "").trim()
                        }))
                    }
                );

                if (
                    want &&
                    typeof want === "object" &&
                    wantType === 1 &&
                    !isMet
                ) {
                    // W starej trasie po walce na tym polu były dwa Dalej.
                    // Pierwsze może już odsłonić type:1; weryfikujemy,
                    // czy klient nadal pokazuje drugie Dalej.
                    if (
                        fightOnMobField &&
                        nextAfterFight === 1 &&
                        !introButtonChecked
                    ) {
                        introButtonChecked = true;
                        const pressed =
                            await this.confirmRoninMobIntroButton(step);
                        if (pressed) {
                            const verified =
                                await this.openRoninQuestStep();
                            if (
                                this._int(verified?.qb_id) !==
                                    this._int(step.qb_id) ||
                                this._int(verified?.want?.type) !== 1 ||
                                Boolean(verified?.want?.is_met)
                            ) {
                                throw new Error(
                                    "Ronin: po ostatnim Dalej serwer nie potwierdził aktywnego etapu mobów."
                                );
                            }
                            return verified;
                        }
                    }

                    toolConsole(
                        "info",
                        "[SW Tool][RONIN] Etap przeciwników gotowy.",
                        {
                            qbId: this._int(step.qb_id),
                            count: this._int(want.count),
                            max: this._int(want.maxv || want.amount),
                            transitions: i,
                            postFightNext: nextAfterFight
                        }
                    );
                    return step;
                }

                if (
                    want &&
                    typeof want === "object" &&
                    wantType === 7 &&
                    !isMet
                ) {
                    toolConsole(
                        "info",
                        "[SW Tool][RONIN] Walka questowa przed mobami.",
                        { qbId: this._int(step.qb_id), transition: i }
                    );
                    await this.roninQuestFight(step);
                    fightOnMobField = true;
                    continue;
                }

                if (
                    want &&
                    typeof want === "object" &&
                    !isMet
                ) {
                    throw new Error(
                        "Ronin: przed mobami niezakończony warunek type " +
                        wantType + "."
                    );
                }

                // Jeśli walka na tym polu jest już zaliczona,
                // nadal sprawdzamy dwa osobne Dalej z dawnej trasy.
                if (wantType === 7 && isMet) {
                    fightOnMobField = true;
                }

                // Każda akcja na dokładnie tym q_step, który przed chwilą
                // otrzymaliśmy; bez dodatkowego type:1 między analizą a Dalej.
                const result = await this.roninQuestNext(step);
                if (result !== "next") {
                    throw new Error(
                        "Ronin: nieoczekiwana akcja zamiast Dalej przed mobami (" +
                        result + ")."
                    );
                }
                if (fightOnMobField) {
                    nextAfterFight++;
                }
            }

            throw new Error(
                "Ronin: nie udało się dojść do mobów po " +
                maxTransitions + " przejściach dialogu."
            );
        }

        async roninMobCombat() {
            const questId = this._int(this.roninQuestId);
            const step = await this.openRoninQuestStep();
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
                    1,
                    this._int(want.maxv),
                    this._int(want.amount)
                ),
                serverDone: Boolean(want.is_met)
            };

            if (
                origin.x <= 0 ||
                origin.y <= 0
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
                    if (state.serverDone) {
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

                if (state.serverDone) {
                    break;
                }
            }

            // Ostateczna weryfikacja serwerowa. Lokalny tracker nigdy nie
            // kończy już etapu samodzielnie.
            const refreshed =
                await this.syncRoninMobQuestState(
                    state,
                    "koniec patrolu"
                );

            if (!state.serverDone) {
                throw new Error(
                    "Ronin: etap mobów nadal niezaliczony na serwerze (" +
                    state.count +
                    "/" +
                    state.max +
                    "). Nie wysyłam Dalej."
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

            toolConsole(
                "info",
                "[SW Tool][RONIN] Etap przeciwników zakończony serwerowo.",
                {
                    questId,
                    count: state.count,
                    max: state.max,
                    returnedTo: origin
                }
            );

            return refreshed;
        }

        async roninQuestAction(knownStep = null) {
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

            // Przed każdą akcją pobieramy świeży q_step zamiast ufać
            // currentRoninQuestStep. Odpowiedź poprzedniej akcji może być
            // już nieaktualna względem przebudowy okna/trackera klienta.
            const step =
                knownStep &&
                typeof knownStep === "object" &&
                this._int(knownStep.qb_id) === questId
                    ? knownStep
                    : await this.openRoninQuestStep();

            // Otwieranie q_step bywało już wykonane w pętli przygotowania.
            // Dodatkowe otwarcie pomiędzy odczytem a kliknięciem potrafiło
            // przebudować klientowy dialog i ukryć przycisk.
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
                toolConsole("info", 
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

            toolConsole("info", 
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
                        return (
                            this._int(
                                event.q_step.qb_id
                            ) === questId
                        );
                    }

                    if (
                        event.quest_move &&
                        typeof event.quest_move === "object"
                    ) {
                        return (
                            this._int(
                                event.quest_move.qb_id
                            ) === questId
                        );
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

        async roninQuestNext(step = null) {
            return this.roninQuestAction(step);
        }

        async roninQuestFight(step = null) {
            return this.roninQuestAction(step);
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
                toolConsole("info", "[SW Tool][QUEST] Cel ruchu wyczyszczony.", {
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
                    toolConsole("info", 
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

            toolConsole("info", "[SW Tool][QUEST] Nowy cel ruchu:", {
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

        async advanceRoninUntilQuestMove({
            label = "",
            maxTransitions = 5
        } = {}) {
            const limit =
                Math.max(
                    1,
                    this._int(
                        maxTransitions
                    )
                );

            for (
                let transition = 0;
                transition < limit;
                transition++
            ) {
                const pending =
                    this.currentQuestMove;

                if (
                    pending &&
                    this._int(
                        pending.version
                    ) >
                        this._int(
                            this
                                .lastConsumedQuestMoveVersion
                        ) &&
                    this._int(
                        pending.locationId
                    ) === 193
                ) {
                    toolConsole(
                        "info",
                        "[SW Tool][RONIN] quest_move gotowy przed kolejnym Dalej.",
                        {
                            label,
                            transition,
                            qbId:
                                this._int(
                                    pending.qbId
                                ),
                            x:
                                this._int(
                                    pending.x
                                ),
                            y:
                                this._int(
                                    pending.y
                                ),
                            version:
                                this._int(
                                    pending.version
                                )
                        }
                    );

                    return pending;
                }

                const step =
                    await this.openRoninQuestStep();

                const moveAfterOpen =
                    this.currentQuestMove;

                if (
                    moveAfterOpen &&
                    this._int(
                        moveAfterOpen.version
                    ) >
                        this._int(
                            this
                                .lastConsumedQuestMoveVersion
                        ) &&
                    this._int(
                        moveAfterOpen.locationId
                    ) === 193
                ) {
                    toolConsole(
                        "info",
                        "[SW Tool][RONIN] Samo odświeżenie q_step przyniosło quest_move.",
                        {
                            label,
                            transition,
                            qbId:
                                this._int(
                                    moveAfterOpen.qbId
                                ),
                            x:
                                this._int(
                                    moveAfterOpen.x
                                ),
                            y:
                                this._int(
                                    moveAfterOpen.y
                                ),
                            version:
                                this._int(
                                    moveAfterOpen.version
                                )
                        }
                    );

                    return moveAfterOpen;
                }

                const want =
                    step?.want;
                const wantType =
                    this._int(
                        want?.type
                    );
                const isMet =
                    Boolean(
                        want?.is_met
                    );

                toolConsole(
                    "info",
                    "[SW Tool][RONIN] Przed ruchem — analiza kroku dialogu.",
                    {
                        label,
                        transition,
                        qbId:
                            this._int(
                                step?.qb_id
                            ),
                        wantType,
                        isMet,
                        hasWant:
                            Boolean(
                                want &&
                                typeof want ===
                                    "object"
                            )
                    }
                );

                // Jeżeli trafimy na walkę questową zamiast zwykłego dialogu,
                // wykonujemy ją i dalej czekamy na quest_move.
                if (
                    want &&
                    typeof want ===
                        "object" &&
                    wantType === 7 &&
                    !isMet
                ) {
                    await this.roninQuestFight();
                    continue;
                }

                // Innego niezakończonego warunku nie wolno omijać przez Dalej.
                if (
                    want &&
                    typeof want ===
                        "object" &&
                    !isMet
                ) {
                    throw new Error(
                        "Ronin: przed " +
                        (label || "kolejnym ruchem") +
                        " pojawił się niezakończony warunek type " +
                        wantType +
                        "."
                    );
                }

                await this.roninQuestNext();

                // Odpowiedź Dalej może od razu zawierać quest_move.
                // Dajemy wyłącznie krótkie oczekiwanie na handler odpowiedzi,
                // bez stałego timera sterującego logiką.
                const moved =
                    await this.waitForRoninQuestMove(
                        500
                    );

                if (moved) {
                    toolConsole(
                        "info",
                        "[SW Tool][RONIN] Dalej wygenerowało quest_move.",
                        {
                            label,
                            transition:
                                transition + 1,
                            qbId:
                                this._int(
                                    moved.qbId
                                ),
                            x:
                                this._int(
                                    moved.x
                                ),
                            y:
                                this._int(
                                    moved.y
                                ),
                            version:
                                this._int(
                                    moved.version
                                )
                        }
                    );

                    return moved;
                }
            }

            throw new Error(
                "Ronin: nie otrzymano quest_move " +
                (label
                    ? "przed " + label + " "
                    : "") +
                "po " +
                limit +
                " przejściach dialogu."
            );
        }

        async navigateToRoninQuestMove(
            fallback = null,
            label = ""
        ) {
            const move = await this.waitForRoninQuestMove(4000);

            if (!move) {
                toolConsole("warn", 
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

            toolConsole("info", "[SW Tool][RONIN] Solver do quest_move:", {
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

                    if (this.improvedXHPending) {
                        this.clearImprovedXHPending(
                            "q_step przeszedł do następnego etapu"
                        );
                    }

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
                        type: 39,
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
                    this.syncImprovedXHPending();
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

                        toolConsole("info", 
                            "[SW Tool][H] Stan z tracked:",
                            this.currentHTracked
                        );

                        this.syncImprovedXHPending();
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
                this.syncImprovedXHPending();
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
                this.syncImprovedXHPending();
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

        hQuestConfirmedAmount(response, questId) {
            if (!response || typeof response !== "object") {
                return 0;
            }

            const targetId = this._int(questId);
            let confirmed = 0;

            if (
                this._int(response.track) === targetId
            ) {
                confirmed = Math.max(
                    confirmed,
                    this._int(response.new_amount)
                );
            }

            const handler = response.map_handler;
            if (
                this._int(handler?.send_tracker) ===
                targetId
            ) {
                confirmed = Math.max(
                    confirmed,
                    this._int(handler?.new_amount)
                );
            }

            if (Array.isArray(response.tracked)) {
                for (const entry of response.tracked) {
                    const want = entry?.want;
                    if (
                        !want ||
                        typeof want !== "object" ||
                        this._int(want.type) !== 39
                    ) {
                        continue;
                    }

                    const id = this._int(
                        want.qbid ||
                        want.qb_id ||
                        entry?.qb_id
                    );

                    if (id !== targetId) {
                        continue;
                    }

                    confirmed = Math.max(
                        confirmed,
                        this._int(want.count),
                        Boolean(want.is_met)
                            ? this._int(want.maxv)
                            : 0
                    );
                }
            }

            const qStep = response.q_step;
            const want = qStep?.want;
            if (
                want &&
                typeof want === "object" &&
                this._int(want.type) === 39
            ) {
                const id = this._int(
                    want.qbid ||
                    want.qb_id ||
                    qStep?.qb_id
                );

                if (id === targetId) {
                    confirmed = Math.max(
                        confirmed,
                        this._int(want.count),
                        Boolean(want.is_met)
                            ? this._int(want.maxv)
                            : 0
                    );
                }
            }

            return confirmed;
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

            toolConsole("info", "[SW Tool][H] TX pełne H:", order);

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

                        if (this._int(event.a) !== 22) {
                            return false;
                        }

                        return (
                            this.hQuestConfirmedAmount(
                                event,
                                quest.id
                            ) >= expectedTotal
                        );
                    },
                    10000
                ).then((response) => {
                    if (this._int(response.e) !== 0) {
                        throw new Error(
                            "Serwer odrzucił przyśpieszone H."
                        );
                    }

                    const confirmed =
                        this.hQuestConfirmedAmount(
                            response,
                            quest.id
                        );

                    if (confirmed > 0) {
                        const next = {
                            ...(this.currentHQuest || quest),
                            id: quest.id,
                            count: confirmed,
                            max: quest.max,
                            isMet: confirmed >= quest.max
                        };

                        this.currentHQuest = next;

                        if (
                            this.currentHTracked &&
                            this._int(
                                this.currentHTracked.id
                            ) === quest.id
                        ) {
                            this.currentHTracked.count =
                                confirmed;
                            this.currentHTracked.isMet =
                                confirmed >= quest.max;
                        }

                        if (
                            this.currentHQuestStep &&
                            this._int(
                                this.currentHQuestStep.id
                            ) === quest.id &&
                            confirmed >= quest.max
                        ) {
                            this.currentHQuestStep.isMet =
                                true;
                        }
                    }

                    return {
                        ...response,
                        swToolHConfirmedAmount:
                            confirmed
                    };
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

            toolConsole("info", "[SW Tool][H] Przyśpieszone H socket:", {
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

            // Po H synchronizujemy nie tylko q_step, ale również okno
            // questa. W starym Roninie po H następowało ponowne X przed
            // przejściem dalej i ten krok okazuje się istotny dla klienta.
            let step = await this.refreshRoninQuestClientState(
                "quest H po wysłaniu 100%",
                {
                    settleMs: 300,
                    pressX: true
                }
            );
            let want = step?.want;

            // Dajemy socketowi jeszcze krótki retry, jeśli klient zdążył
            // przebudować okno, ale serwerowy q_step przyszedł chwilę później.
            if (
                want &&
                typeof want === "object" &&
                this._int(want.type) === 39 &&
                !Boolean(want.is_met)
            ) {
                await this.sleep(350);
                step = await this.openRoninQuestStep();
                want = step?.want;
            }

            if (
                want &&
                typeof want === "object" &&
                this._int(want.type) === 39 &&
                !Boolean(want.is_met)
            ) {
                throw new Error(
                    "Ronin: H zostało wysłane, ale krok questa nadal nie jest zaliczony po odświeżeniu klienta."
                );
            }

            toolConsole("info", 
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

        roninRequiredLevel() {
            return Math.max(
                1,
                this._int(
                    this.roninInstanceDefinition?.req_level
                ) || 30
            );
        }

        async waitForRoninReturn(timeoutMs = 30000) {
            const sync = this.roninReturnSync;
            if (!sync || sync.finishedAt <= 0) {
                throw new Error(
                    "Ronin: nie ma potwierdzonego końca instancji do oczekiwania na teleport."
                );
            }

            if (sync.confirmed) {
                return true;
            }

            const startedAt = Date.now();

            this.setQuickPanelStatus(
                "Ronin: czekam na teleport powrotny i rozliczenie..."
            );

            while (Date.now() - startedAt < timeoutMs) {
                if (
                    sync.characterId !==
                    this._int(GAME.char_id || this.currentCharacterId)
                ) {
                    throw new Error(
                        "Ronin: postać zmieniła się przed potwierdzeniem teleportu."
                    );
                }

                // Wyłącznie NOWE pakiety odebrane po a:777.
                // Poprzedni stan snapshotu/mapy nigdy nie zaliczy powrotu.
                if (
                    sync.instanceCleared &&
                    sync.originLocationReceived &&
                    sync.returnMapReceived &&
                    sync.dailyUsageReceived
                ) {
                    if (!sync.confirmed) {
                        sync.confirmed = true;
                        this.setQuickPanelStatus(
                            "Ronin: teleport i rozliczenie potwierdzone — " +
                            sync.originLocationId +
                            " (" + sync.dailyUsage + "/" +
                            this.roninDailyLimit + ")"
                        );

                        toolConsole(
                            "info",
                            "[SW Tool][RONIN] Teleport powrotny i rozliczenie potwierdzone.",
                            {
                                characterId: sync.characterId,
                                originLocationId: sync.originLocationId,
                                originX: sync.originX,
                                originY: sync.originY,
                                icd_5: sync.dailyUsage,
                                elapsedAfterFinishMs:
                                    Date.now() - sync.finishedAt
                            }
                        );

                        // Dopiero po otrzymaniu pełnego RX dajemy oficjalnemu
                        // klientowi moment na wyrenderowanie pola powrotnego.
                        await this.sleep(350);
                    }

                    return true;
                }

                await this.sleep(50);
            }

            toolConsole(
                "warn",
                "[SW Tool][RONIN] Niepełny powrót z instancji; wstrzymuję dalsze akcje.",
                {
                    characterId: sync.characterId,
                    originLocationId: sync.originLocationId,
                    finishedAt: sync.finishedAt,
                    instanceCleared: sync.instanceCleared,
                    originLocationReceived: sync.originLocationReceived,
                    returnMapReceived: sync.returnMapReceived,
                    dailyUsageReceived: sync.dailyUsageReceived,
                    currentMap: this._int(this.mapSolver?.map?.locationId),
                    currentLoc: this._int(
                        this.currentCharacterSnapshot?.char_data?.loc
                    )
                }
            );

            return false;
        }

        async ensureRoninReturned(characterId) {
            const sync = this.roninReturnSync;
            if (
                !sync ||
                sync.characterId !== this._int(characterId)
            ) {
                throw new Error(
                    "Ronin: brak stanu powrotu dla bieżącej postaci."
                );
            }

            if (await this.waitForRoninReturn()) {
                return true;
            }

            // Nie używamy a:2 jako zastępczego teleportu i nie zmieniamy
            // postaci, dopóki serwer nie potwierdzi powrotu.
            const error = new Error(
                "Ronin: serwer nie potwierdził teleportu powrotnego i rozliczenia " +
                "(loc=" + sync.originLocationId + "). Kolejny obieg i zmiana postaci wstrzymane."
            );
            this.setQuickPanelStatus(error.message, "error");
            error.swToolUnsafeRoninReturn = true;
            throw error;
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

            toolConsole("info", 
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

            toolConsole("warn", 
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
                    (
                        this._int(event.a) === 999 &&
                        this._int(event.e) !== 0
                    ) ||
                    (
                        this._int(event.a) === 777 &&
                        this._int(event.order) === 1 &&
                        (
                            this._int(event.e) !== 0 ||
                            this._int(event.instance_id) ===
                                RONIN_INSTANCE_ID
                        )
                    ),
                15000
            );

            if (this._int(selected.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił wybór instancji (order=" +
                    this._int(selected.order) + ", e=" + this._int(selected.e) + ")."
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
                    (
                        this._int(event.a) === 999 &&
                        this._int(event.e) !== 0
                    ) ||
                    (
                        this._int(event.a) === 777 &&
                        this._int(event.order) === 2 &&
                        (
                            this._int(event.e) !== 0 ||
                            (
                                this._int(event.instance_id) ===
                                    RONIN_INSTANCE_ID &&
                                this._int(event.own_room) > 0
                            )
                        )
                    ),
                15000
            );

            if (this._int(created.e) !== 0) {
                throw new Error(
                    "Ronin: serwer odrzucił tworzenie pokoju (order=" +
                    this._int(created.order) + ", e=" + this._int(created.e) + ")."
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
                    const action = this._int(event.a);
                    if (action === 999) {
                        return this._int(event.e) !== 0;
                    }
                    if (action !== 777) return false;
                    // Nie przechwytujemy opóźnionych błędów order:9
                    // po zakończeniu poprzedniej instancji.
                    if (this._int(event.e) !== 0) {
                        return this._int(event.order) === 7;
                    }

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
                    "Ronin: serwer odrzucił start pokoju (order=" +
                    this._int(started.order) + ", e=" + this._int(started.e) + ")."
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
                    const action = this._int(event.a);
                    if (action === 999) {
                        return this._int(event.e) !== 0;
                    }

                    if (action === 777) {
                        if (this._int(event.order) !== 8) return false;
                        return (
                            this._int(event.e) !== 0 ||
                            this._int(event.enter_instance) ===
                                RONIN_INSTANCE_ID
                        );
                    }

                    return (
                        action === 3 &&
                        this._int(event.e) === 0 &&
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
                    "Ronin: serwer odrzucił wejście do instancji (order=" +
                    this._int(entered.order) + ", e=" + this._int(entered.e) + ")."
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

            // To nie order:8, lecz gotowa mapa i quest są warunkiem
            // rozpoczęcia pierwszego kroku Ronina.
            await this.waitForRoninStartQuestReady();

            toolConsole("info", "[SW Tool][RONIN] Wejście potwierdzone:", {
                instance: RONIN_INSTANCE_ID,
                room: roomId,
                location: RONIN_LOCATION_ID,
                questId: this._int(this.roninQuestId)
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

            await this.roninTimedQuestNext();
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "4");
            await this.openRoninQuestStep();
            await this.roninQuestH();
            await this.roninQuestAction();
            await this.roninQuestFight();
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "5");

            // Stary Ronin wykonywał w tym miejscu 3x Dalej, ale w praktyce
            // serwer czasem generuje quest_move już po 2 przejściach.
            // Nie zakładamy liczby dialogów: idziemy Dalej aż serwer faktycznie
            // zwróci nowy quest_move prowadzący do punktu 6.
            await this.advanceRoninUntilQuestMove({
                label: "punktem 6",
                maxTransitions: 5
            });

            await this.navigateToRoninQuestMove(null, "6");

            // Pobieramy i zachowujemy dokładnie ten q_step, którym serwer
            // potwierdził wejście w etap przeciwników (want.type === 1).
            // Nie przechodzimy już przez globalny currentQuestStep, bo mógł
            // zostać nadpisany przez poboczny a:22 między przygotowaniem
            // etapu a startem Quest Kille.
            const mobStep =
                await this.prepareRoninMobCombat();

            toolConsole(
                "info",
                "[SW Tool][RONIN] Start Quest Kille z bezpośrednio potwierdzonego q_step.",
                {
                    qbId:
                        this._int(
                            mobStep?.qb_id
                        ),
                    wantType:
                        this._int(
                            mobStep?.want?.type
                        ),
                    count:
                        this._int(
                            mobStep?.want?.count
                        ),
                    max:
                        Math.max(
                            this._int(
                                mobStep?.want?.maxv
                            ),
                            this._int(
                                mobStep?.want?.amount
                            )
                        ),
                    isMet:
                        Boolean(
                            mobStep?.want?.is_met
                        )
                }
            );

            const killResult = await this.runQuestKills({
                allowQuickAction: true,
                allowAccountOperation: true,
                requireQuestWindow: false,
                initialStep: mobStep
            });

            if (!killResult?.done) {
                throw new Error(
                    "Ronin: Quest Kille nie ukończyło etapu przeciwników (" +
                    this._int(killResult?.count) +
                    "/" +
                    this._int(killResult?.max) +
                    ")."
                );
            }

            // Stary Ronin po zakończeniu bicia mobów ponownie naciskał X.
            // Robimy to dopiero po pełnym zakończeniu Quest Kille, żeby
            // odświeżyć okno/krok przed przejściem dialogu dalej.
            await this.refreshRoninQuestClientState(
                "po Quest Kille",
                {
                    settleMs: 300,
                    pressX: true
                }
            );
            await this.roninQuestNext();

            await this.navigateToRoninQuestMove(null, "7");
            await this.openRoninQuestStep();
            await this.roninQuestNext();

            this.roninCounter++;
        }

        async runSingleRoninAttempt() {
            if (this.roninRunning) {
                throw new Error("Ronin jest już wykonywany.");
            }

            // Quick Ronina nie blokujemy lokalnym icd_5, bo aktywna postać
            // mogła pozostać zalogowana przez reset o 00:00. W tym trybie
            // ostatecznym źródłem prawdy pozostaje serwer przy wejściu.
            await this.getRoninInstanceDefinition();

            const currentLevel = this._int(
                this.currentCharacterSnapshot?.char_data?.level
            );
            const requiredLevel = this.roninRequiredLevel();

            if (currentLevel < requiredLevel) {
                throw new Error(
                    "Ronin: wymagany poziom " +
                    requiredLevel +
                    " (postać ma " +
                    currentLevel +
                    ")."
                );
            }

            const originData =
                this.currentCharacterSnapshot?.char_data;
            const originLocationId =
                this._int(originData?.loc);

            if (
                !originData ||
                originLocationId <= 0 ||
                originLocationId === 193
            ) {
                throw new Error(
                    "Ronin: przed startem brak poprawnej lokalizacji powrotnej z a:2."
                );
            }

            const previousReturn = this.roninReturnSync;
            if (
                previousReturn?.enteredMap &&
                !previousReturn.confirmed
            ) {
                const error = new Error(
                    "Ronin: poprzednia instancja nie ma potwierdzonego teleportu powrotnego."
                );
                error.swToolUnsafeRoninReturn = true;
                throw error;
            }

            this.roninReturnSync = {
                characterId:
                    this._int(
                        this.currentCharacterSnapshot?.char_id ||
                        originData.id ||
                        this.currentCharacterId
                    ),
                originLocationId,
                originX: this._int(originData.x),
                originY: this._int(originData.y),
                enteredMap: false,
                finishedAt: 0,
                instanceCleared: false,
                originLocationReceived: false,
                returnMapReceived: false,
                dailyUsageReceived: false,
                dailyUsage: null,
                confirmed: false
            };

            toolConsole(
                "info",
                "[SW Tool][RONIN] Zapisano lokalizację powrotu przed wejściem.",
                {
                    charId: this.roninReturnSync.characterId,
                    originLocationId,
                    originX: this.roninReturnSync.originX,
                    originY: this.roninReturnSync.originY
                }
            );

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
            this.lastRoninMapResponse = null;
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

                // runSingleRoninAttempt() kończy się dopiero po
                // rzeczywistym powrocie i pakiecie icd_5 z serwera.
                await this.ensureRoninReturned(
                    this.roninReturnSync.characterId
                );
            } catch (error) {
                // Gdy wejście na mapę 193 już nastąpiło, ale do końca
                // lub powrotu nie dotarliśmy, zmiana postaci jest niebezpieczna.
                const sync = this.roninReturnSync;
                if (sync?.enteredMap && !sync.confirmed) {
                    error.swToolUnsafeRoninReturn = true;
                }
                throw error;
            } finally {
                this.clearRoninTimers();
                this.roninRunning = false;
            }

            return {
                status: "done",
                run: this.roninCounter
            };
        }

        async runQuickRonin() {
            const availability =
                await this.quickAllRoninAvailability();

            if (!availability.available) {
                return {
                    status: "skipped",
                    attempts: 0,
                    used: availability.used || 0,
                    limit:
                        availability.limit ||
                        this.roninDailyLimit,
                    reason:
                        availability.reason ||
                        "niedostępny"
                };
            }

            const characterId = this._int(
                GAME.char_id || this.currentCharacterId
            );
            const limit = availability.limit;
            const initialUsed = Math.max(
                0,
                this._int(availability.used)
            );
            const plannedAttempts = Math.max(
                0,
                limit - initialUsed
            );
            let used = initialUsed;
            let attempts = 0;

            for (
                let index = 0;
                index < plannedAttempts;
                index++
            ) {
                const attempt =
                    initialUsed + index + 1;

                this.setQuickPanelStatus(
                    "Ronin: próba " +
                    attempt +
                    "/" +
                    limit +
                    "..."
                );

                await this.runSingleRoninAttempt();
                attempts++;

                const expectedUsed =
                    Math.min(
                        limit,
                        initialUsed + attempts
                    );

                used =
                    await this.confirmRoninDailyUsage(
                        characterId,
                        expectedUsed
                    );

                if (
                    used > expectedUsed &&
                    attempts < plannedAttempts
                ) {
                    toolConsole(
                        "warn",
                        "[SW Tool][RONIN] Licznik icd_5 przeskoczył przed końcem zaplanowanych prób — nie kończę Ronina przedwcześnie.",
                        {
                            initialUsed,
                            expectedUsed,
                            reportedUsed: used,
                            plannedAttempts,
                            attempts
                        }
                    );
                }

                await this.ensureRoninReturned(
                    characterId
                );
            }

            return {
                status: "done",
                attempts,
                used,
                limit
            };
        }

        async quickAllRoninAvailability() {
            const characterId = this._int(
                GAME.char_id || this.currentCharacterId
            );

            if (characterId <= 0) {
                return {
                    available: false,
                    reason: "brak aktywnej postaci"
                };
            }

            await this.getRoninInstanceDefinition();

            // Świeże a:2 daje aktualny icd_5 także po resecie o północy.
            await this.switchCharacterForAccountAction(
                characterId,
                0,
                true
            );

            const data = this.characterData();
            const level = this._int(data?.level);
            const requiredLevel = this.roninRequiredLevel();
            const used = this.roninDailyUsage();
            const limit = this.roninDailyLimit;
            const instanceId = this._int(data?.instance_id);

            if (level < requiredLevel) {
                return {
                    available: false,
                    reason:
                        "poziom " +
                        level +
                        "/" +
                        requiredLevel,
                    level,
                    requiredLevel,
                    used,
                    limit
                };
            }

            if (used >= limit) {
                return {
                    available: false,
                    reason:
                        "limit " +
                        used +
                        "/" +
                        limit,
                    level,
                    requiredLevel,
                    used,
                    limit
                };
            }

            if (instanceId > 0) {
                return {
                    available: false,
                    reason: "postać jest już w instancji",
                    level,
                    requiredLevel,
                    used,
                    limit,
                    instanceId
                };
            }

            return {
                available: true,
                level,
                requiredLevel,
                used,
                limit
            };
        }

        async runQuickAllForCurrentCharacter(label) {
            const summary = [];
            const warnings = [];

            const runStep = async (
                name,
                status,
                callback
            ) => {
                this.setQuickPanelStatus(status);

                try {
                    const result = await callback();
                    return {
                        ok: true,
                        result
                    };
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : String(error);

                    warnings.push(name + ": " + message);
                    toolConsole("warn", 
                        "[SW Tool][QUICK ALL] " +
                        name +
                        " nie powiodło się:",
                        error
                    );

                    return {
                        ok: false,
                        error: message
                    };
                }
            };

            const abyss = await runStep(
                "Otchłań",
                "Quick ALL: Otchłań...",
                () => this.attackSoulAbyssForCurrentCharacter()
            );

            if (abyss.ok) {
                summary.push(
                    abyss.result
                        ? "Otchłań ✓"
                        : "Otchłań cooldown"
                );
            } else {
                summary.push("Otchłań błąd");
            }

            const arena = await runStep(
                "Arena",
                "Quick ALL: Arena PvP...",
                () => this.attackArenaForCurrentCharacter()
            );

            if (arena.ok) {
                const result = arena.result || {};
                summary.push(
                    "Arena " +
                    this._int(result.attacked) +
                    " at."
                );
            } else {
                summary.push("Arena błąd");
            }

            this.setQuickPanelStatus(
                "Quick ALL: sprawdzanie Ronina..."
            );

            try {
                const ronin = await this.runQuickRonin();

                if (ronin.status === "skipped") {
                    summary.push(
                        "Ronin pominięty (" +
                        ronin.reason +
                        ")"
                    );
                    this.setQuickPanelStatus(
                        "Quick ALL: Ronin pominięty — " +
                        ronin.reason
                    );
                } else {
                    summary.push(
                        "Ronin " +
                        ronin.attempts +
                        "x ✓"
                    );
                }
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : String(error);

                toolConsole("error", 
                    "[SW Tool][QUICK ALL] Ronin nie zakończył się poprawnie — zatrzymuję Quick ALL:",
                    error
                );

                throw new Error(
                    "Quick ALL zatrzymany podczas Ronina: " +
                    message
                );
            }

            if (this.preferredAfterAll()) {
                const training = await runStep(
                    "Trening",
                    "Quick ALL: Trening...",
                    () =>
                        this.startMaxTrainingForCurrentCharacter(
                            label,
                            {
                                trustServerTimedState: true
                            }
                        )
                );

                if (training.ok) {
                    const result = training.result;
                    if (result === "started") {
                        summary.push("Trening uruchomiony");
                    } else if (result === "timed") {
                        summary.push("Akcja czasowa już trwa");
                    } else {
                        summary.push("Brak treningu");
                    }
                } else {
                    summary.push("Trening błąd");
                }
            } else {
                const mission = await runStep(
                    "Misje",
                    "Quick ALL: Misje...",
                    () =>
                        this.runQuickMissionForCurrentCharacter()
                );

                if (mission.ok) {
                    summary.push(
                        mission.result?.message ||
                        "Misje zakończone"
                    );
                } else {
                    summary.push("Misje błąd");
                }
            }

            return {
                summary,
                warnings,
                preferred: this.preferredAfterAll() ? "training" : "mission"
            };
        }

        handlePickupQuestResponse(response) {
            const state = this.pickupQuestState;
            if (!state || !response || Number(response.a) !== 22) return;
            if (response.track !== undefined &&
                this._int(response.track) === state.questId) {
                state.count = Math.min(state.max,
                    state.count + Math.max(0, this._int(response.amount)));
                this.setQuickPanelStatus("Pickup Quest: " +
                    state.count + "/" + state.max + " ✓");
            }
            const step = response.q_step;
            if (step && this._int(step.qb_id) === state.questId &&
                this._int(step.want?.type) === 22) {
                state.count = Math.min(state.max, Math.max(state.count,
                    this._int(step.want.count)));
            }
        }

        pickupQuestTargets(map, itemId) {
            const targets = new Map();
            const positive = value => {
                const n = Number(value);
                return Number.isSafeInteger(n) && n > 0 ? n : 0;
            };
            const record = (node, x, y, allowPlainId = false, depth = 0) => {
                if (!node || typeof node !== "object" || depth > 3) return;
                if (Array.isArray(node)) {
                    node.slice(0, 200).forEach(v => record(v, x, y, allowPlainId, depth + 1));
                    return;
                }
                const px = positive(node.x) || x;
                const py = positive(node.y) || y;
                const id = positive(node.mine_id) ||
                    positive(node.mineId) || positive(node.mid) ||
                    (allowPlainId ? positive(node.id) : 0);
                const resource = positive(node.item_id) ||
                    positive(node.itemId) || positive(node.resource_id) ||
                    positive(node.resourceId);
                if (px && py && id && (!resource || resource === itemId)) {
                    const cell = map.cells?.get(px + "_" + py);
                    if (cell?.movable) {
                        targets.set(px + "_" + py + "_" + id, {
                            x: px, y: py, mineId: id, itemId: resource
                        });
                    }
                }
                for (const [key, child] of Object.entries(node)) {
                    if (/^(mines?|mining|pickups?|bags?|finds?|resources?|res)$/i.test(key) &&
                        child && typeof child === "object") {
                        record(child, px, py, true, depth + 1);
                    }
                }
            };
            const rawMap = map.pickupRawMap || {};
            for (const [key, raw] of Object.entries(rawMap)) {
                const match = /^(\d+)_(\d+)$/.exec(key);
                if (match && raw && typeof raw === "object") {
                    record(raw, positive(match[1]), positive(match[2]));
                }
            }
            return [...targets.values()];
        }

        async waitForPickupQuestDelay(durationMs) {
            const end = Date.now() + Math.max(0, durationMs);
            while (Date.now() < end) {
                if (this.pickupQuestStop) throw new Error("Pickup Quest zatrzymany.");
                await this.sleep(Math.min(500, end - Date.now()));
            }
        }

        togglePickupQuest() {
            if (this.pickupQuestRunning) {
                this.pickupQuestStop = true;
                this.setQuickPanelStatus("Pickup Quest: zatrzymuję i wracam na start...");
                return { stopping: true };
            }
            if (this.accountOperationRunning || this.quickActionRunning ||
                this.questKillRunning || this.expRunning || this.respawnRunning ||
                this.roninRunning || this.characterSwitch ||
                this.responseWaiter || this.mapSolver?.active) {
                throw new Error("Poczekaj na zakończenie bieżącej automatyzacji.");
            }
            this.pickupQuestRunning = true;
            this.pickupQuestStop = false;
            Promise.resolve().then(() => this.runPickupQuest())
                .catch(error => {
                    const message = error instanceof Error ? error.message : String(error);
                    this.setQuickPanelStatus("Pickup Quest: " + message, "error");
                    toolConsole("warn", "[SW Tool][PICKUP] ", error);
                })
                .finally(() => {
                    this.pickupQuestRunning = false;
                    this.pickupQuestStop = false;
                    this.pickupQuestState = null;
                });
            return { started: true };
        }

        async runPickupQuest() {
            const step = this.currentQuestStep;
            const parsed = this.questKillWantState(step?.want, step?.qb_id, [22]);
            if (!parsed) {
                throw new Error("Otwórz quest ze zbieraniem przedmiotów (want.type=22).");
            }
            if (parsed.isMet) {
                this.setQuickPanelStatus("Pickup Quest: wymaganie jest już ukończone.", "success");
                return;
            }
            const map = this.mapSolver?.map;
            if (!map?.cells || !this._int(map.locationId) ||
                !this._int(map.x) || !this._int(map.y)) {
                throw new Error("Brak gotowej mapy. Otwórz mapę gry.");
            }
            const candidates = this.pickupQuestTargets(map, parsed.targetId);
            if (!candidates.length) {
                throw new Error("Brak rozpoznanych sakiewek w danych mapy a:3. " +
                    "Potrzebny eksport TX/RX z wejściem na mapę.");
            }
            const origin = { locationId: map.locationId, x: map.x, y: map.y };
            const state = {
                questId: parsed.questId,
                itemId: parsed.targetId,
                count: parsed.count,
                max: parsed.max,
                attempts: 0,
                start: origin
            };
            this.pickupQuestState = state;
            const cooldowns = new Map();
            const runUntil = Date.now() + 40 * 60000;
            let operationError = null;
            this.setQuickPanelStatus("Pickup Quest: " + state.count + "/" +
                state.max + ", sakiewki: " + candidates.length + ".");
            try {
                while (!this.pickupQuestStop && state.count < state.max &&
                       state.attempts < 100 && Date.now() < runUntil) {
                    if (this._int(this.mapSolver?.map?.locationId) !== origin.locationId) {
                        throw new Error("Postać opuściła mapę questa.");
                    }
                    const now = Date.now();
                    const available = candidates
                        .filter(p => (cooldowns.get(p.mineId) || 0) <= now)
                        .map(p => {
                            const path = this.mapSolver.findShortestPath(
                                map, { x: map.x, y: map.y }, { x: p.x, y: p.y });
                            return path ? { ...p, distance: path.length } : null;
                        })
                        .filter(Boolean)
                        .sort((a, b) => a.distance - b.distance);
                    if (!available.length) {
                        const ready = Math.min(...candidates.map(p =>
                            cooldowns.get(p.mineId) || runUntil));
                        if (!Number.isFinite(ready) || ready <= now) {
                            throw new Error("Brak osiągalnych pól ze znajdźkami.");
                        }
                        this.setQuickPanelStatus("Pickup Quest: zasoby na cooldownie — czekam.");
                        await this.waitForPickupQuestDelay(Math.min(ready - now, runUntil - now));
                        continue;
                    }
                    const target = available[0];
                    await this.mapSolver.navigateTo(target.x, target.y, {
                        source: "quest-pickup", allowBusy: true
                    });
                    if (this.pickupQuestStop) break;
                    await this.waitForQuestKillField(target.x, target.y, 1800);
                    state.attempts++;
                    const before = state.count;
                    this.setQuickPanelStatus("Pickup Quest: " + before + "/" + state.max +
                        " • zbieranie " + target.x + "|" + target.y + "...");
                    const started = await this.sendAndWait(
                        { a: 22, type: 8, mid: target.mineId },
                        [22, 999],
                        event => Boolean(event.mining) || this._int(event.e) !== 0,
                        15000
                    );
                    if (this._int(started.e) !== 0 || !started.mining) {
                        cooldowns.set(target.mineId, Date.now() + 30000);
                        continue;
                    }
                    const mining = started.mining;
                    const cdMs = Math.max(10000, Math.min(600000,
                        this._int(mining.cd) * 1000));
                    cooldowns.set(target.mineId, Date.now() + cdMs);
                    const expires = Number(mining.expires || 0);
                    const durationMs = Math.max(0, this._int(mining.duration)) * 1000;
                    const remaining = expires > Date.now() ?
                        Math.min(30000, expires - Date.now() + 150) :
                        Math.min(30000, durationMs + 150);
                    await this.waitForPickupQuestDelay(remaining);
                    const finished = await this.sendAndWait(
                        { a: 22, type: 8 },
                        [22, 999],
                        event => event.done !== undefined ||
                            event.track !== undefined || this._int(event.e) !== 0,
                        15000
                    );
                    if (this._int(finished.e) !== 0) {
                        throw new Error("Serwer odrzucił zakończenie zbierania.");
                    }
                    for (let i = 0; i < 12 && state.count === before; i++) {
                        await this.sleep(100);
                    }
                    this.setQuickPanelStatus("Pickup Quest: " + state.count + "/" +
                        state.max + " • próby " + state.attempts + ".");
                }
                if (state.count < state.max && !this.pickupQuestStop) {
                    throw new Error("Nie ukończono zbierania w limicie prób lub czasu (" +
                        state.count + "/" + state.max + ").");
                }
            } catch (error) {
                operationError = error;
            } finally {
                try {
                    if (this._int(this.mapSolver?.map?.locationId) === origin.locationId &&
                        (this._int(map.x) !== origin.x || this._int(map.y) !== origin.y)) {
                        this.setQuickPanelStatus("Pickup Quest: wracam na pole questa...");
                        await this.mapSolver.navigateToLocation(
                            origin.locationId, origin.x, origin.y, {
                                source: "quest-pickup-return", allowBusy: true
                            });
                    }
                } catch (error) {
                    if (!operationError) operationError = error;
                }
            }
            if (operationError) throw operationError;
            this.setQuickPanelStatus(state.count >= state.max ?
                "Pickup Quest ukończony: " + state.count + "/" + state.max + "." :
                "Pickup Quest zatrzymany.", state.count >= state.max ? "success" : "");
        }

        questKillWantState(
            want,
            questId = 0,
            allowedTypes = [1]
        ) {
            if (
                !want ||
                typeof want !== "object"
            ) {
                return null;
            }

            const wantType =
                this._int(want.type);
            const normalizedTypes =
                (
                    Array.isArray(allowedTypes)
                        ? allowedTypes
                        : [allowedTypes]
                )
                    .map((value) =>
                        this._int(value)
                    )
                    .filter((value) =>
                        value > 0
                    );

            if (
                !normalizedTypes.includes(
                    wantType
                )
            ) {
                return null;
            }

            const id = this._int(
                want.qbid ||
                want.qb_id ||
                questId
            );
            const count = Math.max(
                0,
                this._int(want.count)
            );
            const max = Math.max(
                0,
                this._int(want.maxv),
                this._int(want.amount)
            );

            if (id <= 0 || max <= 0) {
                return null;
            }

            return {
                questId: id,
                wantType,
                count,
                max,
                isMet:
                    Boolean(want.is_met) ||
                    count >= max,
                targetId: this._int(want.id),
                targetName: String(
                    want.name || ""
                ).trim()
            };
        }

        questKillTrackerMatches(
            trackerId,
            state = this.questKillState
        ) {
            const id = this._int(trackerId);
            if (id <= 0 || !state) {
                return false;
            }

            const questId =
                this._int(state.questId);
            const targetId =
                this._int(state.targetId);

            return (
                id === questId ||
                (
                    targetId > 0 &&
                    id === targetId
                )
            );
        }

        questKillDomRoots() {
            const roots = [];

            const tracker =
                document.getElementById(
                    "quest_track_con"
                );
            if (tracker) {
                roots.push(tracker);
            }

            for (
                const element of
                document.querySelectorAll(
                    ".mob_list_con"
                )
            ) {
                if (
                    !roots.includes(element)
                ) {
                    roots.push(element);
                }
            }

            return roots;
        }

        questKillDomProgressCandidate(
            state
        ) {
            if (!state) {
                return null;
            }

            const expectedMax =
                Math.max(
                    0,
                    this._int(state.max)
                );
            const currentCount =
                Math.max(
                    0,
                    this._int(state.count)
                );
            const targetName =
                String(
                    state.targetName || ""
                )
                    .trim()
                    .toLowerCase();

            if (expectedMax <= 0) {
                return null;
            }

            const candidates = [];
            const pushCandidate = (
                count,
                max,
                element,
                source
            ) => {
                const parsedCount =
                    Math.max(
                        0,
                        this._int(count)
                    );
                const parsedMax =
                    Math.max(
                        0,
                        this._int(max)
                    );

                if (
                    parsedMax <= 0 ||
                    parsedCount >
                        parsedMax ||
                    parsedMax !==
                        expectedMax
                ) {
                    return;
                }

                const text =
                    String(
                        element?.textContent ||
                        ""
                    )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();
                const normalized =
                    text.toLowerCase();

                let score = 100;

                if (
                    targetName &&
                    normalized.includes(
                        targetName
                    )
                ) {
                    score += 80;
                }

                if (
                    parsedCount >=
                    currentCount
                ) {
                    score += 20;
                }

                if (
                    text.length > 0 &&
                    text.length <= 160
                ) {
                    score += 10;
                }

                candidates.push({
                    count:
                        parsedCount,
                    max:
                        parsedMax,
                    score,
                    source,
                    text
                });
            };

            for (
                const root of
                this.questKillDomRoots()
            ) {
                const elements = [
                    root,
                    ...root.querySelectorAll(
                        "*"
                    )
                ];

                for (const element of elements) {
                    if (
                        !(element instanceof Element)
                    ) {
                        continue;
                    }

                    const attrCount =
                        element.getAttribute(
                            "data-count"
                        );
                    const attrMax =
                        element.getAttribute(
                            "data-max"
                        );

                    if (
                        attrCount !== null &&
                        attrMax !== null
                    ) {
                        pushCandidate(
                            attrCount,
                            attrMax,
                            element,
                            "data-count"
                        );
                    }

                    const text =
                        String(
                            element.textContent ||
                            ""
                        );

                    const regex =
                        /(\d+)\s*(?:\/|\bz\b)\s*(\d+)/gi;
                    let match = null;

                    while (
                        (
                            match =
                                regex.exec(
                                    text
                                )
                        )
                    ) {
                        pushCandidate(
                            match[1],
                            match[2],
                            element,
                            "text"
                        );
                    }
                }
            }

            if (
                candidates.length === 0
            ) {
                return null;
            }

            candidates.sort(
                (left, right) =>
                    (
                        right.score -
                        left.score
                    ) ||
                    (
                        right.count -
                        left.count
                    )
            );

            return candidates[0];
        }

        syncQuestKillProgressFromDom(
            state = this.questKillState
        ) {
            if (
                !this.questKillRunning ||
                !state
            ) {
                return false;
            }

            const candidate =
                this.questKillDomProgressCandidate(
                    state
                );

            if (!candidate) {
                return false;
            }

            const before =
                this._int(state.count);
            const next =
                Math.max(
                    before,
                    this._int(
                        candidate.count
                    )
                );

            if (next === before) {
                return false;
            }

            state.count =
                Math.min(
                    this._int(state.max),
                    next
                );

            this.setQuickPanelStatus(
                "Quest Kille: " +
                state.count +
                "/" +
                state.max +
                " ✓"
            );

            toolConsole("info", 
                "[SW Tool][PVE] Quest Kille — progres z trackera klienta:",
                {
                    before,
                    count:
                        state.count,
                    max:
                        state.max,
                    source:
                        candidate.source,
                    text:
                        candidate.text
                }
            );

            return true;
        }

        startQuestKillDomObserver() {
            this.stopQuestKillDomObserver();

            const roots =
                this.questKillDomRoots();

            if (
                roots.length === 0 ||
                typeof MutationObserver !==
                    "function"
            ) {
                return;
            }

            this.questKillDomObserver =
                new MutationObserver(
                    () => {
                        this.syncQuestKillProgressFromDom();
                    }
                );

            for (const root of roots) {
                this.questKillDomObserver.observe(
                    root,
                    {
                        childList: true,
                        subtree: true,
                        characterData: true,
                        attributes: true,
                        attributeFilter: [
                            "data-count",
                            "data-max"
                        ]
                    }
                );
            }

            this.syncQuestKillProgressFromDom();
        }

        stopQuestKillDomObserver() {
            if (
                this.questKillDomObserver
            ) {
                this.questKillDomObserver.disconnect();
                this.questKillDomObserver =
                    null;
            }
        }

        handleQuestKillResponse(response) {
            const state = this.questKillState;
            if (
                !this.questKillRunning ||
                !state ||
                !response ||
                typeof response !== "object"
            ) {
                return false;
            }

            const action =
                this._int(response.a);
            const relevant =
                action === 7 ||
                action === 22 ||
                response.track !==
                    undefined ||
                Array.isArray(
                    response.tracked
                ) ||
                response.map_handler !==
                    undefined ||
                response.q_step !==
                    undefined;

            if (!relevant) {
                return false;
            }

            let nextCount = Math.max(
                0,
                this._int(state.count)
            );
            let nextMax = Math.max(
                0,
                this._int(state.max)
            );
            const beforeCount =
                nextCount;

            const applyWant = (
                want,
                fallbackQuestId = 0
            ) => {
                const parsed =
                    this.questKillWantState(
                        want,
                        fallbackQuestId,
                        state.allowedWantTypes ||
                            [1]
                    );

                if (!parsed) {
                    return false;
                }

                const sameQuest =
                    parsed.questId ===
                        this._int(state.questId) ||
                    (
                        this._int(state.stepId) > 0 &&
                        parsed.questId ===
                            this._int(state.stepId)
                    );
                const sameTarget =
                    this._int(state.targetId) > 0 &&
                    this._int(parsed.targetId) ===
                        this._int(state.targetId);

                if (
                    !sameQuest &&
                    !sameTarget
                ) {
                    return false;
                }

                nextCount = Math.max(
                    nextCount,
                    parsed.count,
                    parsed.isMet
                        ? parsed.max
                        : 0
                );
                nextMax = Math.max(
                    nextMax,
                    parsed.max
                );

                return true;
            };

            const applyTracker = (
                trackerId,
                amount
            ) => {
                if (
                    !this.questKillTrackerMatches(
                        trackerId,
                        state
                    )
                ) {
                    return false;
                }

                const value =
                    Math.max(
                        0,
                        this._int(amount)
                    );

                if (value <= 0) {
                    return false;
                }

                nextCount = Math.max(
                    nextCount,
                    value
                );
                return true;
            };

            // Odpowiedzi multiwalki nie zawsze mają progres w tym samym
            // miejscu co zwykła walka. Przechodzimy więc po odpowiedzi
            // rekurencyjnie, ale z limitem głębokości/liczby obiektów.
            const seen = new Set();
            let scanned = 0;

            const scan = (
                value,
                depth = 0
            ) => {
                if (
                    !value ||
                    typeof value !== "object" ||
                    depth > 7 ||
                    scanned >= 300 ||
                    seen.has(value)
                ) {
                    return;
                }

                seen.add(value);
                scanned++;

                if (Array.isArray(value)) {
                    for (const entry of value) {
                        scan(
                            entry,
                            depth + 1
                        );
                    }
                    return;
                }

                const fallbackQuestId =
                    this._int(
                        value.qb_id ||
                        value.qbid
                    );

                if (
                    value.want &&
                    typeof value.want === "object"
                ) {
                    applyWant(
                        value.want,
                        fallbackQuestId
                    );
                }

                // Czasem sam obiekt trackera jest już strukturą want.
                if (
                    (
                        state.allowedWantTypes ||
                        [1]
                    ).includes(
                        this._int(value.type)
                    ) &&
                    (
                        value.count !== undefined ||
                        value.maxv !== undefined ||
                        value.amount !== undefined
                    )
                ) {
                    applyWant(
                        value,
                        fallbackQuestId
                    );
                }

                applyTracker(
                    value.track,
                    value.new_amount !==
                        undefined
                        ? value.new_amount
                        : (
                            action === 22
                                ? value.amount
                                : undefined
                        )
                );
                applyTracker(
                    value.send_tracker,
                    value.new_amount
                );

                // Spotykany wariant: identyfikator qbid/qb_id + count
                // bez zewnętrznego wrappera "want".
                const objectQuestId =
                    this._int(
                        value.qbid ||
                        value.qb_id
                    );

                if (
                    objectQuestId > 0 &&
                    (
                        objectQuestId ===
                            this._int(state.questId) ||
                        objectQuestId ===
                            this._int(state.stepId)
                    )
                ) {
                    const objectCount =
                        Math.max(
                            0,
                            this._int(
                                value.count
                            ),
                            this._int(
                                value.new_amount
                            )
                        );

                    if (objectCount > 0) {
                        nextCount = Math.max(
                            nextCount,
                            objectCount
                        );
                    }

                    nextMax = Math.max(
                        nextMax,
                        this._int(
                            value.maxv
                        ),
                        this._int(
                            value.amount
                        )
                    );

                    if (
                        Boolean(value.is_met) &&
                        nextMax > 0
                    ) {
                        nextCount = Math.max(
                            nextCount,
                            nextMax
                        );
                    }
                }

                for (
                    const nested of
                    Object.values(value)
                ) {
                    if (
                        nested &&
                        typeof nested === "object"
                    ) {
                        scan(
                            nested,
                            depth + 1
                        );
                    }
                }
            };

            scan(response);

            nextCount = Math.min(
                nextMax || nextCount,
                nextCount
            );

            const changed =
                nextCount !== state.count ||
                nextMax !== state.max;

            if (changed) {
                const before =
                    state.count;
                state.count =
                    nextCount;
                state.max =
                    nextMax;

                this.setQuickPanelStatus(
                    "Quest Kille: " +
                    state.count +
                    "/" +
                    state.max +
                    (
                        state.count > before
                            ? " ✓"
                            : ""
                    )
                );

                toolConsole("info", 
                    "[SW Tool][PVE] Quest Kille — progres:",
                    {
                        questId:
                            state.questId,
                        stepId:
                            state.stepId,
                        targetId:
                            state.targetId,
                        before,
                        count:
                            state.count,
                        max: state.max,
                        action:
                            this._int(
                                response.a
                            ),
                        scanned
                    }
                );
            }

            return (
                nextCount >
                    beforeCount ||
                nextCount >=
                    nextMax
            );
        }

        async waitForQuestKillProgress(
            state,
            beforeCount,
            timeoutMs = 80
        ) {
            const before =
                Math.max(
                    0,
                    this._int(beforeCount)
                );
            const startedAt = Date.now();

            while (
                Date.now() - startedAt <
                timeoutMs
            ) {
                this.syncQuestKillProgressFromDom(
                    state
                );

                if (
                    this._int(state?.count) >
                        before ||
                    this._int(state?.count) >=
                        this._int(state?.max)
                ) {
                    return true;
                }

                await this.sleep(10);
            }

            this.syncQuestKillProgressFromDom(
                state
            );

            return (
                this._int(state?.count) >
                    before ||
                this._int(state?.count) >=
                    this._int(state?.max)
            );
        }

        questKillPathToNearestUnvisited(
            map,
            startX,
            startY,
            visited
        ) {
            if (
                !map?.cells ||
                !(visited instanceof Set)
            ) {
                return null;
            }

            const start = {
                x: this._int(startX),
                y: this._int(startY)
            };

            if (
                start.x <= 0 ||
                start.y <= 0
            ) {
                return null;
            }

            const keyOf = (x, y) =>
                x + "_" + y;
            const startKey =
                keyOf(start.x, start.y);

            const directions = [
                [0, 1],
                [1, 1],
                [1, 0],
                [1, -1],
                [0, -1],
                [-1, -1],
                [-1, 0],
                [-1, 1]
            ];

            const queue = [start];
            const searched =
                new Set([startKey]);
            const parent = new Map();
            const coords =
                new Map([
                    [startKey, start]
                ]);

            while (queue.length > 0) {
                const point =
                    queue.shift();

                for (const [dx, dy] of directions) {
                    const next = {
                        x: point.x + dx,
                        y: point.y + dy
                    };

                    if (
                        next.x < 1 ||
                        next.y < 1 ||
                        next.x > map.maxX ||
                        next.y > map.maxY
                    ) {
                        continue;
                    }

                    const key =
                        keyOf(next.x, next.y);
                    if (searched.has(key)) {
                        continue;
                    }

                    const cell =
                        map.cells.get(key);
                    if (
                        !cell ||
                        !cell.movable
                    ) {
                        continue;
                    }

                    searched.add(key);
                    parent.set(
                        key,
                        keyOf(point.x, point.y)
                    );
                    coords.set(key, next);

                    if (!visited.has(key)) {
                        const reversed = [];
                        let cursor = key;

                        while (
                            cursor !== startKey
                        ) {
                            const current =
                                coords.get(cursor);
                            if (!current) {
                                return null;
                            }

                            reversed.push(current);
                            cursor =
                                parent.get(cursor);

                            if (!cursor) {
                                return null;
                            }
                        }

                        return reversed.reverse();
                    }

                    queue.push(next);
                }
            }

            return null;
        }

        questKillPatrolOrder(
            map,
            startX,
            startY
        ) {
            if (!map?.cells) {
                return [];
            }

            const keyOf = (x, y) =>
                x + "_" + y;
            const start = {
                x: this._int(startX),
                y: this._int(startY)
            };

            if (
                start.x <= 0 ||
                start.y <= 0
            ) {
                return [];
            }

            const directions = [
                [0, 1],
                [1, 1],
                [1, 0],
                [1, -1],
                [0, -1],
                [-1, -1],
                [-1, 0],
                [-1, 1]
            ];

            const queue = [start];
            const visited = new Set([
                keyOf(start.x, start.y)
            ]);
            const order = [];

            while (queue.length > 0) {
                const point = queue.shift();
                order.push(point);

                for (const [dx, dy] of directions) {
                    const x = point.x + dx;
                    const y = point.y + dy;

                    if (
                        x < 1 ||
                        y < 1 ||
                        x > map.maxX ||
                        y > map.maxY
                    ) {
                        continue;
                    }

                    const key = keyOf(x, y);
                    if (visited.has(key)) {
                        continue;
                    }

                    const cell =
                        map.cells.get(key);
                    if (
                        !cell ||
                        !cell.movable
                    ) {
                        continue;
                    }

                    visited.add(key);
                    queue.push({ x, y });
                }
            }

            return order;
        }

        async waitForQuestKillField(
            x,
            y,
            timeoutMs = 150
        ) {
            const targetX = this._int(x);
            const targetY = this._int(y);
            const startedAt = Date.now();

            while (
                Date.now() - startedAt <
                timeoutMs
            ) {
                const field =
                    this.mapSolver?.field;

                if (
                    field &&
                    this._int(field.x) ===
                        targetX &&
                    this._int(field.y) ===
                        targetY
                ) {
                    return field;
                }

                await this.sleep(25);
            }

            return null;
        }

        questKillRemovedCount(response) {
            const removed =
                response?.remove_mob;

            if (
                Array.isArray(removed) &&
                Array.isArray(removed[1])
            ) {
                return removed[1].length;
            }

            return 0;
        }

        async questKillClearCurrentField(
            state,
            point
        ) {
            let field =
                await this.waitForQuestKillField(
                    point.x,
                    point.y
                );

            if (!field) {
                this.setQuickPanelStatus(
                    "Quest Kille: " +
                    point.x +
                    "|" +
                    point.y +
                    " — brak a:602, pomijam."
                );
                return {
                    fights: 0,
                    singleFights: 0,
                    skipped: true
                };
            }

            let mobs = Math.max(
                0,
                this._int(
                    field.mobs?.count
                )
            );
            let multiAvailable =
                Array.isArray(
                    field.multiFight
                ) &&
                field.multiFight.includes(0);

            toolConsole("info", 
                "[SW Tool][PVE] Quest Kille — pole:",
                {
                    x: point.x,
                    y: point.y,
                    mobs,
                    multiAvailable,
                    mf: field.multiFight,
                    progress:
                        state.count +
                        "/" +
                        state.max
                }
            );

            if (mobs <= 0) {
                return {
                    fights: 0,
                    singleFights: 0,
                    skipped: false
                };
            }

            let fights = 0;
            let singleFights = 0;
            let removed = 0;
            let attempts = 0;

            while (
                state.count < state.max &&
                mobs > 0 &&
                attempts < 40
            ) {
                this.syncQuestKillProgressFromDom(
                    state
                );

                if (
                    this._int(state.count) >=
                    this._int(state.max)
                ) {
                    break;
                }

                attempts++;

                const liveField =
                    this.mapSolver?.field;

                if (
                    liveField &&
                    this._int(liveField.x) ===
                        this._int(point.x) &&
                    this._int(liveField.y) ===
                        this._int(point.y)
                ) {
                    field = liveField;
                    mobs = Math.max(
                        0,
                        this._int(
                            field.mobs?.count
                        )
                    );
                    multiAvailable =
                        Array.isArray(
                            field.multiFight
                        ) &&
                        field.multiFight.includes(0);
                }

                if (mobs <= 0) {
                    break;
                }

                const fieldBeforeFight =
                    field;
                const countBeforeFight =
                    this._int(state.count);
                let response = null;

                if (!multiAvailable) {
                    this.setQuickPanelStatus(
                        "Quest Kille: " +
                        point.x +
                        "|" +
                        point.y +
                        " — zwykła walka " +
                        (singleFights + 1) +
                        ", czekam na multi..."
                    );

                    response =
                        await this.sendAndWait(
                            {
                                a: 7,
                                mob_num: 0,
                                rank: 0,
                                quick: 1
                            },
                            [7, 999],
                            (event) =>
                                this._int(event.e) !== 0 ||
                                (
                                    this._int(event.a) === 7 &&
                                    (
                                        this._int(event.me) > 0 ||
                                        event.result !== undefined ||
                                        event.remove_mob !== undefined
                                    )
                                ),
                            5000
                        );

                    this.assertPveActionPoints(
                        response,
                        "walka"
                    );

                    this.assertPveActionPoints(
                        response,
                        "walka"
                    );

                    if (
                        this._int(response.e) !== 0
                    ) {
                        throw new Error(
                            "Serwer odrzucił zwykłą walkę na polu " +
                            point.x +
                            "|" +
                            point.y +
                            "."
                        );
                    }

                    this.assertPveActionPoints(
                        response,
                        "walka"
                    );

                    this.assertPveActionPoints(
                        response,
                        "walka"
                    );

                    if (
                        this._int(response.me) > 0
                    ) {
                        toolConsole("info", 
                            "[SW Tool][PVE] Quest Kille — zwykła walka zakończona kodem me:",
                            {
                                x: point.x,
                                y: point.y,
                                me: this._int(
                                    response.me
                                ),
                                singleFights
                            }
                        );
                        break;
                    }

                    singleFights++;
                    removed +=
                        this.questKillRemovedCount(
                            response
                        );
                } else {
                    this.setQuickPanelStatus(
                        "Quest Kille: " +
                        point.x +
                        "|" +
                        point.y +
                        " — multi " +
                        (fights + 1) +
                        "..."
                    );

                    response =
                        await this.sendAndWait(
                            {
                                a: 13,
                                mob_num: 0,
                                fo: [1, 1, 1, 1, 1]
                            },
                            [7, 999],
                            (event) =>
                                this._int(event.e) !== 0 ||
                                (
                                    this._int(event.a) === 7 &&
                                    (
                                        this._int(event.mm) === 1 ||
                                        this._int(event.me) > 0 ||
                                        event.result !== undefined
                                    )
                                ),
                            5000
                        );

                    if (
                        this._int(response.e) !== 0
                    ) {
                        throw new Error(
                            "Serwer odrzucił multiwalkę na polu " +
                            point.x +
                            "|" +
                            point.y +
                            "."
                        );
                    }

                    if (
                        this._int(response.me) > 0
                    ) {
                        toolConsole("info", 
                            "[SW Tool][PVE] Quest Kille — koniec multi na polu:",
                            {
                                x: point.x,
                                y: point.y,
                                me: this._int(
                                    response.me
                                ),
                                fights,
                                singleFights,
                                removed
                            }
                        );
                        break;
                    }

                    fights++;
                    removed +=
                        this.questKillRemovedCount(
                            response
                        );
                }

                // sendAndWait rozwiązuje się po odpowiedzi walki, ale
                // tracker questa może przyjść w osobnym evencie chwilę później.
                // Najpierw przetwarzamy samą odpowiedź jeszcze raz lokalnie,
                // a jeśli licznik nie drgnął, dajemy trackerowi krótkie okno.
                this.handleQuestKillResponse(
                    response
                );

                if (
                    this._int(state.count) >=
                    this._int(state.max)
                ) {
                    break;
                }

                const removedInFight =
                    this.questKillRemovedCount(
                        response
                    );

                if (
                    removedInFight > 0 &&
                    this._int(state.count) ===
                        countBeforeFight
                ) {
                    const progressed =
                        await this.waitForQuestKillProgress(
                            state,
                            countBeforeFight
                        );

                    if (!progressed) {
                        toolConsole("debug", 
                            "[SW Tool][PVE] Quest Kille — walka usunęła moby, ale tracker nie zwiększył licznika.",
                            {
                                action:
                                    this._int(
                                        response?.a
                                    ),
                                questId:
                                    state.questId,
                                stepId:
                                    state.stepId,
                                targetId:
                                    state.targetId,
                                count:
                                    state.count,
                                max:
                                    state.max,
                                keys:
                                    response &&
                                    typeof response === "object"
                                        ? Object.keys(
                                            response
                                        )
                                        : []
                            }
                        );
                    }
                }

                if (
                    this._int(state.count) >=
                    this._int(state.max)
                ) {
                    break;
                }

                // Nie blokujemy socketów czekaniem na a=602.
                // Jeśli nowy stan pola już dotarł, użyjemy go od razu;
                // jeśli dotrze chwilę później, kolejna iteracja go przejmie.
                const liveAfterFight =
                    this.mapSolver?.field;
                const wasMulti =
                    multiAvailable;

                if (
                    liveAfterFight &&
                    liveAfterFight !==
                        fieldBeforeFight &&
                    this._int(liveAfterFight.x) ===
                        this._int(point.x) &&
                    this._int(liveAfterFight.y) ===
                        this._int(point.y)
                ) {
                    field =
                        liveAfterFight;
                    mobs = Math.max(
                        0,
                        this._int(
                            field.mobs?.count
                        )
                    );
                    multiAvailable =
                        Array.isArray(
                            field.multiFight
                        ) &&
                        field.multiFight.includes(0);
                } else {
                    const removedNow =
                        this.questKillRemovedCount(
                            response
                        );

                    mobs = Math.max(
                        0,
                        mobs -
                            Math.max(
                                1,
                                removedNow
                            )
                    );
                }

                if (
                    !wasMulti &&
                    multiAvailable
                ) {
                    toolConsole("info", 
                        "[SW Tool][PVE] Quest Kille — multiwalka odblokowana:",
                        {
                            x: point.x,
                            y: point.y,
                            singleFights,
                            mf:
                                field.multiFight
                        }
                    );

                    this.setQuickPanelStatus(
                        "Quest Kille: " +
                        point.x +
                        "|" +
                        point.y +
                        " — multi odblokowane po " +
                        singleFights +
                        " zwykłych walkach."
                    );
                }

                // Minimalny yield dla event loop. Tracker klienta jest
                // źródłem prawdy dla multiwalki, więc po renderze synchronizujemy
                // licznik jeszcze raz przed następnym atakiem.
                await this.sleep(20);
                this.syncQuestKillProgressFromDom(
                    state
                );
            }

            this.setQuickPanelStatus(
                "Quest Kille: pole " +
                point.x +
                "|" +
                point.y +
                " — zwykłe " +
                singleFights +
                "x, multi " +
                fights +
                "x" +
                (
                    removed > 0
                        ? ", remove_mob " +
                          removed
                        : ""
                ) +
                "."
            );

            return {
                fights,
                singleFights,
                removed,
                skipped: false
            };
        }

        async runQuestKills({
            allowQuickAction = false,
            allowAccountOperation = false,
            requireQuestWindow = true,
            allowedWantTypes = [1],
            initialStep = null,
            repeatUntilDone = false,
            repeatDelayMs = 350
        } = {}) {
            if (
                this.questKillRunning ||
                this.pickupQuestRunning ||
                this.respawnRunning ||
                this.expRunning ||
                (
                    this.quickActionRunning &&
                    !allowQuickAction
                ) ||
                (
                    this.accountOperationRunning &&
                    !allowAccountOperation
                ) ||
                this.dailyRewardClaimStage !== 0 ||
                this.characterSwitch ||
                this.responseWaiter ||
                this.mapSolver?.active
            ) {
                throw new Error(
                    "Poczekaj na zakończenie bieżącej operacji."
                );
            }

            if (
                requireQuestWindow &&
                !this.improvedXQuestWindowOpen()
            ) {
                throw new Error(
                    "Quest Kille: najpierw otwórz okno questa."
                );
            }

            const step =
                initialStep &&
                typeof initialStep === "object"
                    ? initialStep
                    : this.currentQuestStep;

            if (
                !step ||
                typeof step !== "object"
            ) {
                throw new Error(
                    "Quest Kille: brak zsynchronizowanego q_step."
                );
            }

            const normalizedWantTypes =
                (
                    Array.isArray(
                        allowedWantTypes
                    )
                        ? allowedWantTypes
                        : [allowedWantTypes]
                )
                    .map((value) =>
                        this._int(value)
                    )
                    .filter((value) =>
                        value > 0
                    );

            const parsed =
                this.questKillWantState(
                    step.want,
                    step.qb_id,
                    normalizedWantTypes
                );

            if (!parsed) {
                throw new Error(
                    "Quest Kille: aktywny etap nie pasuje do obsługiwanych typów (" +
                    normalizedWantTypes.join(",") +
                    ")."
                );
            }

            if (parsed.isMet) {
                throw new Error(
                    "Quest Kille: wymaganie jest już zaliczone."
                );
            }

            const map =
                this.mapSolver?.map;

            if (
                !map ||
                this._int(map.locationId) <= 0 ||
                this._int(map.x) <= 0 ||
                this._int(map.y) <= 0
            ) {
                throw new Error(
                    "Quest Kille: brak gotowej mapy/pozycji."
                );
            }

            const start = {
                locationId:
                    this._int(map.locationId),
                locationName:
                    String(
                        map.locationName || ""
                    ),
                x: this._int(map.x),
                y: this._int(map.y)
            };

            const reachable =
                this.questKillPatrolOrder(
                    map,
                    start.x,
                    start.y
                );

            if (reachable.length === 0) {
                throw new Error(
                    "Quest Kille: brak osiągalnych pól do patrolu."
                );
            }

            const state = {
                questId:
                    parsed.questId,
                stepId:
                    this._int(
                        step.qb_id
                    ),
                wantType:
                    parsed.wantType,
                allowedWantTypes:
                    normalizedWantTypes,
                targetId:
                    parsed.targetId,
                targetName:
                    parsed.targetName,
                count:
                    parsed.count,
                max:
                    parsed.max,
                start,
                visited: 0,
                moves: 0,
                revisits: 0,
                rounds: 1,
                fights: 0,
                singleFights: 0,
                removed: 0
            };

            const visited =
                new Set();

            this.pveActionPointsExhausted = false;
            this.questKillRunning = true;
            this.questKillState = state;
            this.startQuestKillDomObserver();
            this.syncPveModeButtons();

            if (this.questKillButton) {
                this.questKillButton.disabled =
                    true;
                this.questKillButton.style.opacity =
                    "0.55";
                this.questKillButton.style.cursor =
                    "default";
            }

            this.setQuickPanelStatus(
                "Quest Kille: start " +
                state.count +
                "/" +
                state.max +
                " • " +
                start.locationName +
                " " +
                start.x +
                "|" +
                start.y +
                " • osiągalne pola " +
                reachable.length +
                "."
            );

            toolConsole("info", 
                "[SW Tool][PVE] Quest Kille — start oszczędnego patrolu:",
                {
                    ...state,
                    reachableFields:
                        reachable.length
                }
            );

            let operationError = null;

            try {
                while (
                    state.count <
                        state.max &&
                    !this.pveActionPointsExhausted
                ) {
                    if (
                        this._int(
                            this.mapSolver?.map
                                ?.locationId
                        ) !==
                        start.locationId
                    ) {
                        throw new Error(
                            "Quest Kille: postać opuściła mapę patrolu."
                        );
                    }

                    const currentX =
                        this._int(
                            this.mapSolver?.map?.x
                        );
                    const currentY =
                        this._int(
                            this.mapSolver?.map?.y
                        );
                    const currentKey =
                        currentX +
                        "_" +
                        currentY;

                    // Pole czyścimy tylko przy pierwszej faktycznej wizycie.
                    // Przejście przez stare pole do nowego frontu nie powoduje
                    // ponownego atakowania i nie zawyża visited.
                    if (!visited.has(currentKey)) {
                        visited.add(
                            currentKey
                        );
                        state.visited =
                            visited.size;

                        const cleared =
                            await this.questKillClearCurrentField(
                                state,
                                {
                                    x: currentX,
                                    y: currentY
                                }
                            );

                        state.fights +=
                            this._int(
                                cleared?.fights
                            );
                        state.singleFights +=
                            this._int(
                                cleared?.singleFights
                            );
                        state.removed +=
                            this._int(
                                cleared?.removed
                            );

                        if (
                            state.count >=
                            state.max
                        ) {
                            break;
                        }
                    }

                    const path =
                        this.questKillPathToNearestUnvisited(
                            map,
                            currentX,
                            currentY,
                            visited
                        );

                    if (
                        !path ||
                        path.length === 0
                    ) {
                        if (
                            repeatUntilDone &&
                            state.count <
                                state.max &&
                            !this.pveActionPointsExhausted
                        ) {
                            state.rounds++;
                            visited.clear();

                            const respawnWaitMs =
                                Math.max(
                                    0,
                                    this._int(
                                        repeatDelayMs
                                    )
                                );

                            this.setQuickPanelStatus(
                                "Quest Kille: brak dropu — czekam " +
                                Math.ceil(
                                    respawnWaitMs /
                                    60000
                                ) +
                                " min na resp mobów przed obiegiem " +
                                state.rounds +
                                "."
                            );

                            toolConsole(
                                "info",
                                "[SW Tool][PVE] Quest Kille — czekam na resp przed kolejnym obiegiem.",
                                {
                                    questId:
                                        state.questId,
                                    count:
                                        state.count,
                                    max:
                                        state.max,
                                    round:
                                        state.rounds,
                                    respawnWaitMs
                                }
                            );

                            if (respawnWaitMs > 0) {
                                await this.sleep(
                                    respawnWaitMs
                                );
                            }

                            this.setQuickPanelStatus(
                                "Quest Kille: respawn wait zakończony — zaczynam obieg " +
                                state.rounds +
                                "."
                            );

                            continue;
                        }

                        break;
                    }

                    // Idziemy tylko o jeden krok. Dzięki temu każde nowe pole
                    // jest sprawdzane/atakowane od razu, zamiast przelatywać
                    // przez nie w drodze do odległego punktu patrolu.
                    const next =
                        path[0];
                    const nextKey =
                        next.x +
                        "_" +
                        next.y;

                    if (visited.has(nextKey)) {
                        state.revisits++;
                    }

                    state.moves++;

                    this.setQuickPanelStatus(
                        "Quest Kille: " +
                        state.count +
                        "/" +
                        state.max +
                        " • ruch " +
                        state.moves +
                        " • unikalne pola " +
                        state.visited +
                        (
                            state.revisits > 0
                                ? " • powtórki " +
                                  state.revisits
                                : ""
                        ) +
                        "."
                    );

                    await this.mapSolver.navigateTo(
                        next.x,
                        next.y,
                        {
                            source:
                                "quest-kills",
                            allowBusy: true
                        }
                    );
                }
            } catch (error) {
                operationError = error;

                if (
                    this.isPveNoActionPointsError(
                        error
                    )
                ) {
                    this.pveActionPointsExhausted =
                        true;
                    this.setQuickPanelStatus(
                        "Quest Kille STOP — brak punktów akcji."
                    );
                } else {
                    toolConsole("error", 
                        "[SW Tool][PVE] Quest Kille — błąd patrolu:",
                        error
                    );
                }
            } finally {
                try {
                    const currentLocation =
                        this._int(
                            this.mapSolver?.map
                                ?.locationId
                        );
                    const currentX =
                        this._int(
                            this.mapSolver?.map?.x
                        );
                    const currentY =
                        this._int(
                            this.mapSolver?.map?.y
                        );

                    if (
                        !this.pveActionPointsExhausted &&
                        !this.isPveNoActionPointsError(
                            operationError
                        ) &&
                        (
                            currentLocation !==
                                start.locationId ||
                            currentX !==
                                start.x ||
                            currentY !==
                                start.y
                        )
                    ) {
                        this.setQuickPanelStatus(
                            "Quest Kille: wracam na pole startowe " +
                            start.x +
                            "|" +
                            start.y +
                            "..."
                        );

                        await this.mapSolver
                            .navigateToLocation(
                                start.locationId,
                                start.x,
                                start.y,
                                {
                                    source:
                                        "quest-kills-return",
                                    allowBusy: true
                                }
                            );
                    }
                } catch (returnError) {
                    toolConsole("error", 
                        "[SW Tool][PVE] Quest Kille — nie udało się wrócić na start:",
                        returnError
                    );

                    if (!operationError) {
                        operationError =
                            returnError;
                    }
                }

                this.stopQuestKillDomObserver();
                this.questKillRunning =
                    false;
                this.questKillState =
                    null;
                this.syncPveModeButtons();

                if (
                    this.questKillButton
                ) {
                    this.questKillButton.disabled =
                        false;
                    this.questKillButton.style.opacity =
                        "1";
                    this.questKillButton.style.cursor =
                        "pointer";
                }
            }

            if (
                operationError &&
                this.isPveNoActionPointsError(
                    operationError
                )
            ) {
                return {
                    ...state,
                    end: {
                        x:
                            this._int(
                                this.mapSolver?.map?.x
                            ),
                        y:
                            this._int(
                                this.mapSolver?.map?.y
                            )
                    },
                    done: false,
                    stopped: true,
                    reason:
                        "no-action-points"
                };
            }

            if (operationError) {
                throw operationError;
            }

            const endX =
                this._int(
                    this.mapSolver?.map?.x
                );
            const endY =
                this._int(
                    this.mapSolver?.map?.y
                );

            if (
                state.count >= state.max
            ) {
                this.setQuickPanelStatus(
                    "Quest Kille: cel osiągnięty " +
                    state.count +
                    "/" +
                    state.max +
                    " • ruchy " +
                    state.moves +
                    " • unikalne pola " +
                    state.visited +
                    " • powtórki " +
                    state.revisits +
                    " • zwykłe " +
                    state.singleFights +
                    "x • multi " +
                    state.fights +
                    "x • powrót na start ✓",
                    "success"
                );
            } else {
                this.setQuickPanelStatus(
                    "Quest Kille: mapa przeszukana, nadal " +
                    state.count +
                    "/" +
                    state.max +
                    " • ruchy " +
                    state.moves +
                    " • unikalne pola " +
                    state.visited +
                    " • powtórki " +
                    state.revisits +
                    " • powrót na start ✓"
                );
            }

            toolConsole("info", 
                "[SW Tool][PVE] Quest Kille — koniec:",
                state
            );

            return {
                ...state,
                end: {
                    x: endX,
                    y: endY
                },
                done:
                    state.count >=
                    state.max
            };
        }

        normalizePveErrorText(value) {
            return String(value || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();
        }

        pveActionPointFailureDetails(response) {
            const texts = [];
            let zeroCounter = false;
            const seen = new Set();
            let scanned = 0;

            const scan = (value, key = "", depth = 0) => {
                if (
                    value === null ||
                    value === undefined ||
                    depth > 6 ||
                    scanned >= 180
                ) {
                    return;
                }

                if (typeof value === "string") {
                    if (value.trim()) texts.push(value);
                    return;
                }

                if (typeof value === "number") {
                    const normalizedKey =
                        String(key || "")
                            .toLowerCase()
                            .replace(/[^a-z_]/g, "");

                    if (
                        value <= 0 &&
                        [
                            "ap",
                            "pa",
                            "action_points",
                            "actionpoints",
                            "action_point",
                            "actionpoint"
                        ].includes(normalizedKey)
                    ) {
                        zeroCounter = true;
                    }
                    return;
                }

                if (
                    typeof value !== "object" ||
                    seen.has(value)
                ) {
                    return;
                }

                seen.add(value);
                scanned++;

                if (Array.isArray(value)) {
                    for (let index = 0; index < value.length; index++) {
                        scan(
                            value[index],
                            String(index),
                            depth + 1
                        );
                    }
                    return;
                }

                for (const [nestedKey, nestedValue] of Object.entries(value)) {
                    scan(
                        nestedValue,
                        nestedKey,
                        depth + 1
                    );
                }
            };

            scan(response);

            const visibleMessage =
                document.querySelector("#kom_con")?.textContent;

            if (
                visibleMessage &&
                String(visibleMessage).trim()
            ) {
                texts.push(visibleMessage);
            }

            const text =
                this.normalizePveErrorText(
                    texts.join(" | ")
                );

            const textMatch =
                /brak.{0,40}punkt.{0,20}akcji/.test(text) ||
                /za malo.{0,40}punkt.{0,20}akcji/.test(text) ||
                /niewystarczaj.{0,40}punkt.{0,20}akcji/.test(text) ||
                /nie masz.{0,50}punkt.{0,20}akcji/.test(text) ||
                /punkt.{0,20}akcji.{0,40}(brak|za malo|niewystarczaj)/.test(text) ||
                /brak.{0,20}\bpa\b/.test(text) ||
                /za malo.{0,20}\bpa\b/.test(text) ||
                /not enough.{0,30}action points?/.test(text) ||
                /insufficient.{0,30}action points?/.test(text);

            const failureSignal =
                this._int(
                    response?.e
                ) !== 0 ||
                this._int(
                    response?.me
                ) > 0;

            const exhausted =
                zeroCounter ||
                (
                    failureSignal &&
                    textMatch
                );

            return {
                exhausted,
                text,
                zeroCounter
            };
        }

        isPveActionPointFailure(response) {
            return Boolean(
                this.pveActionPointFailureDetails(
                    response
                ).exhausted
            );
        }

        createPveNoActionPointsError(
            context = "akcja",
            response = null
        ) {
            const error =
                new Error(
                    "Brak punktów akcji — zatrzymuję PVE (" +
                    String(context) +
                    ")."
                );

            error.code =
                "PVE_NO_ACTION_POINTS";
            error.response =
                response;
            return error;
        }

        isPveNoActionPointsError(error) {
            return Boolean(
                error &&
                (
                    error.code ===
                        "PVE_NO_ACTION_POINTS" ||
                    String(
                        error.message || ""
                    ).includes(
                        "Brak punktów akcji"
                    )
                )
            );
        }

        assertPveActionPoints(
            response,
            context
        ) {
            if (
                this.isPveActionPointFailure(
                    response
                )
            ) {
                this.pveActionPointsExhausted =
                    true;

                throw this.createPveNoActionPointsError(
                    context,
                    response
                );
            }
        }

        syncPveModeButtons() {
            if (this.respawnButton) {
                this.respawnButton.textContent =
                    this.respawnRunning
                        ? "Respiarka STOP"
                        : "Respiarka";
            }

            if (this.expButton) {
                this.expButton.textContent =
                    this.expRunning
                        ? "Expiarka STOP"
                        : "Expiarka";
            }

            if (this.questKillButton) {
                const blocked =
                    this.respawnRunning ||
                    this.expRunning;

                if (!this.questKillRunning) {
                    this.questKillButton.disabled =
                        blocked;
                    this.questKillButton.style.opacity =
                        blocked ? "0.55" : "1";
                    this.questKillButton.style.cursor =
                        blocked
                            ? "default"
                            : "pointer";
                }
            }

            if (this.respawnButton) {
                const blocked =
                    !this.respawnRunning &&
                    (
                        this.questKillRunning ||
                this.pickupQuestRunning ||
                        this.expRunning
                    );

                this.respawnButton.disabled =
                    blocked;
                this.respawnButton.style.opacity =
                    blocked ? "0.55" : "1";
                this.respawnButton.style.cursor =
                    blocked
                        ? "default"
                        : "pointer";
            }

            if (this.expButton) {
                const blocked =
                    !this.expRunning &&
                    (
                        this.questKillRunning ||
                this.pickupQuestRunning ||
                        this.respawnRunning
                    );

                this.expButton.disabled =
                    blocked;
                this.expButton.style.opacity =
                    blocked ? "0.55" : "1";
                this.expButton.style.cursor =
                    blocked
                        ? "default"
                        : "pointer";
            }
        }

        pveModeStartGuard(mode) {
            const otherPveRunning =
                (
                    mode !== "quest-kills" &&
                    this.questKillRunning
                ) ||
                (
                    mode !== "respawn" &&
                    this.respawnRunning
                ) ||
                (
                    mode !== "exp" &&
                    this.expRunning
                );

            if (
                otherPveRunning ||
                this.quickActionRunning ||
                this.accountOperationRunning ||
                this.dailyRewardClaimStage !== 0 ||
                this.characterSwitch ||
                this.responseWaiter ||
                this.mapSolver?.active
            ) {
                throw new Error(
                    "Poczekaj na zakończenie bieżącej operacji."
                );
            }

            if (!this.mapSolver?.map) {
                throw new Error(
                    "Brak danych mapy. Otwórz mapę gry i spróbuj ponownie."
                );
            }
        }

        respawnPairForCurrentField() {
            const map =
                this.mapSolver?.map;

            if (
                !map ||
                this._int(map.x) <= 0 ||
                this._int(map.y) <= 0
            ) {
                return null;
            }

            const start = {
                x: this._int(map.x),
                y: this._int(map.y)
            };

            // Najpierw dokładnie wzorzec W/S, potem pozostałe przeciwne
            // kierunki. Skosy są fallbackiem dla map z wąskimi przejściami.
            const candidates = [
                {
                    dx: 0,
                    dy: -1,
                    label: "W/S"
                },
                {
                    dx: 0,
                    dy: 1,
                    label: "S/W"
                },
                {
                    dx: -1,
                    dy: 0,
                    label: "A/D"
                },
                {
                    dx: 1,
                    dy: 0,
                    label: "D/A"
                },
                {
                    dx: -1,
                    dy: -1,
                    label: "Q/C"
                },
                {
                    dx: 1,
                    dy: -1,
                    label: "E/Z"
                },
                {
                    dx: -1,
                    dy: 1,
                    label: "Z/E"
                },
                {
                    dx: 1,
                    dy: 1,
                    label: "C/Q"
                }
            ];

            for (const candidate of candidates) {
                const neighbor = {
                    x:
                        start.x +
                        candidate.dx,
                    y:
                        start.y +
                        candidate.dy
                };

                const cell =
                    map.cells?.get(
                        neighbor.x +
                        "_" +
                        neighbor.y
                    );

                if (
                    cell &&
                    cell.movable
                ) {
                    return {
                        start,
                        neighbor,
                        label:
                            candidate.label
                    };
                }
            }

            return null;
        }

        routeRespawnFieldWaiter(
            response
        ) {
            const waiter =
                this.respawnFieldWaiter;

            if (!waiter) {
                return;
            }

            if (
                this._int(
                    response?.a
                ) !== 602 ||
                this._int(
                    response?.e
                ) !== 0 ||
                this._int(
                    response?.x
                ) !== waiter.x ||
                this._int(
                    response?.y
                ) !== waiter.y
            ) {
                return;
            }

            this.respawnFieldWaiter =
                null;
            clearTimeout(
                waiter.timeoutId
            );

            waiter.resolve(
                this.mapSolver?.field ||
                null
            );
        }

        armRespawnFieldWaiter(
            x,
            y,
            timeoutMs = 1500
        ) {
            if (
                this.respawnFieldWaiter
            ) {
                clearTimeout(
                    this.respawnFieldWaiter
                        .timeoutId
                );
                this.respawnFieldWaiter
                    .reject(
                        new Error(
                            "Respiarka: poprzednie oczekiwanie na a:602 zostało zastąpione."
                        )
                    );
                this.respawnFieldWaiter =
                    null;
            }

            const targetX =
                this._int(x);
            const targetY =
                this._int(y);

            let waiter = null;

            const promise =
                new Promise(
                    (
                        resolve,
                        reject
                    ) => {
                        waiter = {
                            x:
                                targetX,
                            y:
                                targetY,
                            resolve,
                            reject,
                            timeoutId:
                                null
                        };

                        waiter.timeoutId =
                            setTimeout(
                                () => {
                                    if (
                                        this.respawnFieldWaiter ===
                                        waiter
                                    ) {
                                        this.respawnFieldWaiter =
                                            null;
                                    }

                                    reject(
                                        new Error(
                                            "Respiarka: timeout oczekiwania na a:602 dla pola " +
                                            targetX +
                                            "|" +
                                            targetY +
                                            "."
                                        )
                                    );
                                },
                                timeoutMs
                            );

                        this.respawnFieldWaiter =
                            waiter;
                    }
                );

            return {
                promise,
                cancel:
                    () => {
                        if (
                            this.respawnFieldWaiter !==
                            waiter
                        ) {
                            return;
                        }

                        clearTimeout(
                            waiter.timeoutId
                        );
                        this.respawnFieldWaiter =
                            null;
                        waiter.reject(
                            new Error(
                                "Respiarka: anulowano oczekiwanie na a:602."
                            )
                        );
                    }
            };
        }

        currentRespawnField(
            point
        ) {
            const field =
                this.mapSolver?.field;

            if (
                field &&
                this._int(
                    field.x
                ) ===
                    this._int(
                        point.x
                    ) &&
                this._int(
                    field.y
                ) ===
                    this._int(
                        point.y
                    )
            ) {
                return field;
            }

            return null;
        }

        respawnNormalMobCount(
            field
        ) {
            const entries =
                Array.isArray(
                    field?.mobs?.entries
                )
                    ? field.mobs.entries
                    : [];

            const normalEntry =
                entries[0];

            if (
                normalEntry &&
                typeof normalEntry ===
                    "object" &&
                Array.isArray(
                    normalEntry.ranks
                )
            ) {
                return {
                    count:
                        Math.max(
                            0,
                            this._int(
                                normalEntry.ranks[0]
                            )
                        ),
                    source:
                        "mobs[0].ranks[0]",
                    raw:
                        normalEntry
                };
            }

            // Fallback dla starszej/niepełnej odpowiedzi a:602.
            // mobs.suma może obejmować także wyższe rangi, dlatego
            // używamy go wyłącznie gdy ranks[0] nie istnieje.
            return {
                count:
                    Math.max(
                        0,
                        this._int(
                            field?.mobs?.count
                        )
                    ),
                source:
                    "mobs.suma-fallback",
                raw:
                    normalEntry
            };
        }

        async respawnFight(
            multi,
            point
        ) {
            const response =
                multi
                    ? await this.sendAndWait(
                        {
                            a: 13,
                            mob_num: 0,
                            fo: [
                                1,
                                1,
                                1,
                                1,
                                1
                            ]
                        },
                        [7, 999],
                        (event) =>
                            this._int(
                                event.e
                            ) !== 0 ||
                            (
                                this._int(
                                    event.a
                                ) === 7 &&
                                (
                                    this._int(
                                        event.mm
                                    ) === 1 ||
                                    this._int(
                                        event.me
                                    ) > 0 ||
                                    event.result !==
                                        undefined ||
                                    event.remove_mob !==
                                        undefined
                                )
                            ),
                        5000
                    )
                    : await this.sendAndWait(
                        {
                            a: 7,
                            mob_num: 0,
                            rank: 0,
                            quick: 1
                        },
                        [7, 999],
                        (event) =>
                            this._int(
                                event.e
                            ) !== 0 ||
                            (
                                this._int(
                                    event.a
                                ) === 7 &&
                                (
                                    this._int(
                                        event.me
                                    ) > 0 ||
                                    event.result !==
                                        undefined ||
                                    event.remove_mob !==
                                        undefined
                                )
                            ),
                        5000
                    );

            this.assertPveActionPoints(
                response,
                "walka Respiarki"
            );

            if (
                this._int(
                    response.e
                ) !== 0
            ) {
                throw new Error(
                    "Respiarka: serwer odrzucił " +
                    (
                        multi
                            ? "multiwalkę"
                            : "zwykłą walkę"
                    ) +
                    " na polu " +
                    point.x +
                    "|" +
                    point.y +
                    "."
                );
            }

            return response;
        }

        respawnAdvancedTargets(
            field
        ) {
            const entries =
                Array.isArray(
                    field?.mobs?.entries
                )
                    ? field.mobs.entries
                    : [];

            const rankLabels = {
                1: "champion",
                2: "elita",
                3: "boss"
            };

            const targets = [];

            // mobs[0] = zwykły slot. Wpisy 1+ opisują wyższe klasy
            // występujące na mapie. ranks[1..3] to liczebność
            // championów / elit / bossów na aktualnym polu.
            for (
                let mobNum = 1;
                mobNum < entries.length;
                mobNum++
            ) {
                const entry =
                    entries[mobNum];

                if (
                    !entry ||
                    typeof entry !==
                        "object"
                ) {
                    continue;
                }

                const ranks =
                    Array.isArray(
                        entry.ranks
                    )
                        ? entry.ranks
                        : [];

                // Najpierw boss, potem elita, potem champion.
                for (
                    const rank of
                    [3, 2, 1]
                ) {
                    const count =
                        Math.max(
                            0,
                            this._int(
                                ranks[rank]
                            )
                        );

                    if (count <= 0) {
                        continue;
                    }

                    targets.push({
                        mobNum,
                        rank,
                        count,
                        label:
                            rankLabels[rank],
                        mobId:
                            this._int(
                                entry.mob_id
                            ),
                        mobName:
                            String(
                                entry.pl ||
                                entry.en ||
                                ""
                            )
                    });
                }
            }

            return targets;
        }

        async respawnKillAdvancedMobs(
            state,
            point,
            field
        ) {
            if (
                this.config
                    ?.killRespawnedMobs !==
                    true ||
                !this.respawnRunning
            ) {
                return {
                    fights: 0,
                    removed: 0,
                    paSpent: 0,
                    targets: 0
                };
            }

            const targets =
                this.respawnAdvancedTargets(
                    field
                );

            if (
                targets.length === 0
            ) {
                return {
                    fights: 0,
                    removed: 0,
                    paSpent: 0,
                    targets: 0
                };
            }

            toolConsole("info", 
                "[SW Tool][PVE] Respiarka — zrespione moby z a:602:",
                {
                    x:
                        point.x,
                    y:
                        point.y,
                    targets
                }
            );

            let fights = 0;
            let removed = 0;
            let paSpent = 0;

            for (
                const target of
                targets
            ) {
                for (
                    let index = 0;
                    index <
                        target.count &&
                    this.respawnRunning;
                    index++
                ) {
                    if (
                        state.paLimit > 0 &&
                        state.paSpent >=
                            state.paLimit
                    ) {
                        state.limitReached =
                            true;
                        this.respawnRunning =
                            false;
                        break;
                    }

                    const response =
                        await this.sendAndWait(
                            {
                                a: 7,
                                mob_num:
                                    target.mobNum,
                                rank:
                                    target.rank,
                                quick: 1
                            },
                            [7, 999],
                            (event) =>
                                this._int(
                                    event.e
                                ) !== 0 ||
                                (
                                    this._int(
                                        event.a
                                    ) === 7 &&
                                    (
                                        this._int(
                                            event.me
                                        ) > 0 ||
                                        event.result !==
                                            undefined ||
                                        event.remove_mob !==
                                            undefined
                                    )
                                ),
                            1200
                        );

                    this.assertPveActionPoints(
                        response,
                        "walka ze zrespionym mobem"
                    );

                    const error =
                        this._int(
                            response.e
                        );
                    const me =
                        this._int(
                            response.me
                        );

                    if (
                        error !== 0 ||
                        me > 0
                    ) {
                        toolConsole("warn", 
                            "[SW Tool][PVE] Respiarka — serwer odrzucił znany cel z a:602:",
                            {
                                x:
                                    point.x,
                                y:
                                    point.y,
                                mobNum:
                                    target.mobNum,
                                rank:
                                    target.rank,
                                type:
                                    target.label,
                                mobId:
                                    target.mobId,
                                mobName:
                                    target.mobName,
                                expected:
                                    target.count,
                                attempt:
                                    index + 1,
                                e:
                                    error,
                                me
                            }
                        );
                        break;
                    }

                    const killed =
                        this.questKillRemovedCount(
                            response
                        );

                    state.paSpent++;
                    state.advancedFights++;
                    state.advancedPaSpent++;
                    state.advancedRemoved +=
                        Math.max(
                            1,
                            killed
                        );

                    fights++;
                    paSpent++;
                    removed +=
                        Math.max(
                            1,
                            killed
                        );

                    toolConsole("info", 
                        "[SW Tool][PVE] Respiarka — socket kill:",
                        {
                            x:
                                point.x,
                            y:
                                point.y,
                            mobNum:
                                target.mobNum,
                            rank:
                                target.rank,
                            type:
                                target.label,
                            mobId:
                                target.mobId,
                            mobName:
                                target.mobName,
                            remaining:
                                target.count -
                                index -
                                1,
                            paSpent:
                                state.paSpent,
                            paLimit:
                                state.paLimit
                        }
                    );

                    if (
                        state.paLimit > 0 &&
                        state.paSpent >=
                            state.paLimit
                    ) {
                        state.limitReached =
                            true;
                        this.respawnRunning =
                            false;
                        break;
                    }

                }

                if (
                    !this.respawnRunning
                ) {
                    break;
                }
            }

            return {
                fights,
                removed,
                paSpent,
                targets:
                    targets.length
            };
        }

        async respawnMaintainField(
            state,
            point,
            field = null
        ) {
            if (
                !this.respawnRunning
            ) {
                return;
            }

            field =
                field ||
                this.currentRespawnField(
                    point
                );

            if (!field) {
                return;
            }

            if (
                this.config
                    ?.killRespawnedMobs ===
                    true
            ) {
                await this.respawnKillAdvancedMobs(
                    state,
                    point,
                    field
                );

                if (
                    !this.respawnRunning
                ) {
                    return;
                }
            }

            const key =
                point.x +
                "_" +
                point.y;
            const mobInfo =
                this.respawnNormalMobCount(
                    field
                );
            const multiAvailable =
                Array.isArray(
                    field.multiFight
                ) &&
                field.multiFight.includes(
                    0
                );

            if (
                multiAvailable
            ) {
                state.multiUnlocked.add(
                    key
                );
            }

            toolConsole("info", 
                "[SW Tool][PVE] Respiarka — pole:",
                {
                    x:
                        point.x,
                    y:
                        point.y,
                    normalMobs:
                        mobInfo.count,
                    source:
                        mobInfo.source,
                    totalMobs:
                        this._int(
                            field.mobs?.count
                        ),
                    multiAvailable,
                    unlocked:
                        state.multiUnlocked.has(
                            key
                        ),
                    paSpent:
                        state.paSpent,
                    paLimit:
                        state.paLimit,
                    rawSlot0:
                        mobInfo.raw
                }
            );

            const canSpend =
                (cost = 1) =>
                    state.paLimit ===
                        0 ||
                    state.paSpent +
                        Math.max(
                            1,
                            this._int(cost)
                        ) <=
                        state.paLimit;

            // Na każdym z dwóch pól najpierw odblokowujemy multi.
            // Robimy maksymalnie jedną zwykłą walkę na wizytę, żeby nie stać
            // w miejscu i nie blokować samego respienia.
            if (
                !multiAvailable &&
                mobInfo.count > 0
            ) {
                if (!canSpend(1)) {
                    state.limitReached =
                        true;
                    this.respawnRunning =
                        false;
                    return;
                }

                await this.respawnFight(
                    false,
                    point
                );

                state.paSpent++;
                state.singleFights++;

                if (
                    state.paLimit > 0 &&
                    state.paSpent >=
                        state.paLimit
                ) {
                    state.limitReached =
                        true;
                    this.respawnRunning =
                        false;
                }

                return;
            }

            // Po odblokowaniu multi pozwalamy mobom się nazbierać.
            // Gdy normalny slot osiągnie próg, wykonujemy jedną multiwalkę
            // i wracamy do oscylowania między polami.
            if (
                multiAvailable &&
                mobInfo.count >=
                    state.multiThreshold
            ) {
                // Multiwalka kosztuje tyle PA, ile mobów bierze udział
                // w walce. Przed wysłaniem używamy liczby z pola jako
                // estymacji, żeby nie przekroczyć ustawionego limitu PA.
                const estimatedMultiCost =
                    Math.max(
                        1,
                        this._int(
                            mobInfo.count
                        )
                    );

                if (
                    !canSpend(
                        estimatedMultiCost
                    )
                ) {
                    state.limitReached =
                        true;
                    this.respawnRunning =
                        false;

                    this.setQuickPanelStatus(
                        "Respiarka STOP — multi wymaga ok. " +
                        estimatedMultiCost +
                        " PA, pozostało " +
                        Math.max(
                            0,
                            state.paLimit -
                                state.paSpent
                        ) +
                        " PA."
                    );
                    return;
                }

                const response =
                    await this.respawnFight(
                        true,
                        point
                    );

                const removedByMulti =
                    this.questKillRemovedCount(
                        response
                    );
                const actualMultiCost =
                    Math.max(
                        1,
                        removedByMulti > 0
                            ? removedByMulti
                            : estimatedMultiCost
                    );

                state.paSpent +=
                    actualMultiCost;
                state.multiFights++;
                state.multiPaSpent +=
                    actualMultiCost;

                if (
                    state.paLimit > 0 &&
                    state.paSpent >=
                        state.paLimit
                ) {
                    state.limitReached =
                        true;
                    this.respawnRunning =
                        false;
                }
            }
        }

        stopRespawner() {
            if (!this.respawnRunning) {
                return;
            }

            this.respawnRunning = false;

            if (
                this.respawnFieldWaiter
            ) {
                const waiter =
                    this.respawnFieldWaiter;
                this.respawnFieldWaiter =
                    null;
                clearTimeout(
                    waiter.timeoutId
                );
                waiter.resolve(
                    null
                );
            }

            if (
                this.mapSolver?.active &&
                String(
                    this.mapSolver.source || ""
                ).startsWith(
                    "pve-respawn"
                )
            ) {
                this.mapSolver.stop(
                    "Respiarka STOP"
                );
            }

            this.syncPveModeButtons();
            this.setQuickPanelStatus(
                "Respiarka zatrzymana."
            );
        }

        async runRespawner() {
            this.pveModeStartGuard(
                "respawn"
            );

            // Limit PA jest teraz zarządzany przez dashboard, bez starego inputu.
            const paLimit = Math.max(0, Math.floor(this._int(this.respawnPaLimit)));

            const map =
                this.mapSolver?.map;
            const startLocationId =
                this._int(
                    map?.locationId
                );
            const pair =
                this.respawnPairForCurrentField();

            if (!pair) {
                throw new Error(
                    "Respiarka: brak sąsiedniego dostępnego pola."
                );
            }

            const state = {
                paLimit,
                paSpent: 0,
                moves: 0,
                singleFights: 0,
                multiFights: 0,
                multiPaSpent: 0,
                advancedFights: 0,
                advancedRemoved: 0,
                advancedPaSpent: 0,
                multiThreshold: 10,
                multiUnlocked:
                    new Set(),
                limitReached: false
            };

            this.pveActionPointsExhausted =
                false;
            this.respawnRunning =
                true;
            this.syncPveModeButtons();

            let toNeighbor = true;
            let operationError = null;

            this.setQuickPanelStatus(
                "Respiarka START • " +
                pair.label +
                " • " +
                pair.start.x +
                "|" +
                pair.start.y +
                " ↔ " +
                pair.neighbor.x +
                "|" +
                pair.neighbor.y +
                " • multi od 10 normalnych" +
                (
                    paLimit > 0
                        ? " • limit " +
                          paLimit +
                          " PA."
                        : " • bez limitu PA."
                )
            );

            toolConsole("info", 
                "[SW Tool][PVE] Respiarka — start:",
                {
                    locationId:
                        startLocationId,
                    pair,
                    multiThreshold:
                        state.multiThreshold,
                    killRespawnedMobs:
                        this.config
                            ?.killRespawnedMobs ===
                            true,
                    paLimit
                }
            );

            try {
                // Pole startowe też musi odblokować multi / zostać
                // wyczyszczone po osiągnięciu progu.
                await this.respawnMaintainField(
                    state,
                    pair.start,
                    this.currentRespawnField(
                        pair.start
                    )
                );

                while (
                    this.respawnRunning
                ) {
                    if (
                        this._int(
                            this.mapSolver?.map
                                ?.locationId
                        ) !==
                        startLocationId
                    ) {
                        throw new Error(
                            "Respiarka: postać opuściła mapę startową."
                        );
                    }

                    if (
                        state.paLimit > 0 &&
                        state.paSpent >=
                            state.paLimit
                    ) {
                        state.limitReached =
                            true;
                        break;
                    }

                    const target =
                        toNeighbor
                            ? pair.neighbor
                            : pair.start;

                    const fieldWait =
                        this.armRespawnFieldWaiter(
                            target.x,
                            target.y
                        );

                    let result = null;

                    try {
                        result =
                            await this.mapSolver
                                .navigateTo(
                                    target.x,
                                    target.y,
                                    {
                                        source:
                                            "pve-respawn",
                                        allowBusy: true
                                    }
                                );
                    } catch (error) {
                        fieldWait.cancel();
                        fieldWait.promise.catch(
                            () => {}
                        );
                        throw error;
                    }

                    if (
                        !this.respawnRunning
                    ) {
                        fieldWait.cancel();
                        fieldWait.promise.catch(
                            () => {}
                        );
                        break;
                    }

                    if (
                        !result?.ok
                    ) {
                        fieldWait.cancel();
                        fieldWait.promise.catch(
                            () => {}
                        );
                        throw new Error(
                            "Respiarka: nie udało się wykonać ruchu."
                        );
                    }

                    const targetField =
                        await fieldWait.promise;

                    if (
                        !this.respawnRunning
                    ) {
                        break;
                    }

                    state.moves++;
                    state.paSpent++;
                    toNeighbor =
                        !toNeighbor;

                    if (
                        state.paLimit > 0 &&
                        state.paSpent >=
                            state.paLimit
                    ) {
                        state.limitReached =
                            true;
                        this.respawnRunning =
                            false;
                        break;
                    }

                    await this.respawnMaintainField(
                        state,
                        target,
                        targetField
                    );

                    if (
                        !this.respawnRunning
                    ) {
                        break;
                    }

                    if (
                        state.moves === 1 ||
                        state.moves % 20 === 0
                    ) {
                        this.setQuickPanelStatus(
                            "Respiarka • PA " +
                            state.paSpent +
                            (
                                state.paLimit > 0
                                    ? "/" +
                                      state.paLimit
                                    : ""
                            ) +
                            " • ruchy " +
                            state.moves +
                            " • zwykłe " +
                            state.singleFights +
                            "x • multi " +
                            state.multiFights +
                            "x (" +
                            state.multiPaSpent +
                            " PA) • zrespione " +
                            state.advancedFights +
                            "x."
                        );
                    }
                }
            } catch (error) {
                operationError =
                    error;

                if (
                    this.isPveNoActionPointsError(
                        error
                    )
                ) {
                    this.pveActionPointsExhausted =
                        true;
                    this.setQuickPanelStatus(
                        "Respiarka STOP — brak punktów akcji."
                    );
                }
            } finally {
                this.respawnRunning =
                    false;

                if (
                    this.respawnFieldWaiter
                ) {
                    clearTimeout(
                        this.respawnFieldWaiter
                            .timeoutId
                    );
                    this.respawnFieldWaiter =
                        null;
                }

                this.syncPveModeButtons();
            }

            if (
                operationError &&
                this.isPveNoActionPointsError(
                    operationError
                )
            ) {
                return {
                    ...state,
                    multiUnlocked:
                        [
                            ...state.multiUnlocked
                        ],
                    stopped: true,
                    reason:
                        "no-action-points",
                    end: {
                        x:
                            this._int(
                                this.mapSolver?.map?.x
                            ),
                        y:
                            this._int(
                                this.mapSolver?.map?.y
                            )
                    }
                };
            }

            if (operationError) {
                throw operationError;
            }

            const reason =
                state.limitReached
                    ? "pa-limit"
                    : "manual";

            if (
                state.limitReached
            ) {
                this.setQuickPanelStatus(
                    "Respiarka STOP — wykorzystano " +
                    state.paSpent +
                    "/" +
                    state.paLimit +
                    " PA • ruchy " +
                    state.moves +
                    " • zwykłe " +
                    state.singleFights +
                    "x • multi " +
                    state.multiFights +
                    "x (" +
                    state.multiPaSpent +
                    " PA) • zrespione " +
                    state.advancedFights +
                    "x."
                );
            }

            toolConsole("info", 
                "[SW Tool][PVE] Respiarka — stop:",
                {
                    ...state,
                    multiUnlocked:
                        [
                            ...state.multiUnlocked
                        ],
                    reason,
                    x:
                        this._int(
                            this.mapSolver?.map?.x
                        ),
                    y:
                        this._int(
                            this.mapSolver?.map?.y
                        )
                }
            );

            return {
                ...state,
                multiUnlocked:
                    [
                        ...state.multiUnlocked
                    ],
                stopped: true,
                reason
            };
        }

        toggleRespawner() {
            if (this.respawnRunning) {
                this.stopRespawner();
                return Promise.resolve({
                    stopped: true
                });
            }

            return this.runRespawner();
        }

        async waitForExpField(
            x,
            y,
            timeoutMs = 150
        ) {
            const targetX =
                this._int(x);
            const targetY =
                this._int(y);
            const startedAt =
                Date.now();

            while (
                Date.now() - startedAt <
                timeoutMs
            ) {
                const field =
                    this.mapSolver?.field;

                if (
                    field &&
                    this._int(field.x) ===
                        targetX &&
                    this._int(field.y) ===
                        targetY
                ) {
                    return field;
                }

                await this.sleep(15);
            }

            return null;
        }

        expAdvancedRankEnabled(
            rank
        ) {
            if (
                this._int(rank) === 1
            ) {
                return this.config
                    ?.expKillChampions ===
                    true;
            }

            if (
                this._int(rank) === 2
            ) {
                return this.config
                    ?.expKillElites ===
                    true;
            }

            if (
                this._int(rank) === 3
            ) {
                return this.config
                    ?.expKillBosses ===
                    true;
            }

            return false;
        }

        async expKillConfiguredAdvancedMobs(
            point,
            field
        ) {
            if (
                !this.expRunning ||
                !(
                    this.config
                        ?.expKillChampions ===
                        true ||
                    this.config
                        ?.expKillElites ===
                        true ||
                    this.config
                        ?.expKillBosses ===
                        true
                )
            ) {
                return {
                    fights: 0,
                    removed: 0,
                    champions: 0,
                    elites: 0,
                    bosses: 0
                };
            }

            const targets =
                this.respawnAdvancedTargets(
                    field
                ).filter(
                    (target) =>
                        this.expAdvancedRankEnabled(
                            target.rank
                        )
                );

            let fights = 0;
            let removed = 0;
            let champions = 0;
            let elites = 0;
            let bosses = 0;

            for (
                const target of
                targets
            ) {
                for (
                    let index = 0;
                    index <
                        target.count &&
                    this.expRunning;
                    index++
                ) {
                    const response =
                        await this.sendAndWait(
                            {
                                a: 7,
                                mob_num:
                                    target.mobNum,
                                rank:
                                    target.rank,
                                quick: 1
                            },
                            [7, 999],
                            (event) =>
                                this._int(
                                    event.e
                                ) !== 0 ||
                                (
                                    this._int(
                                        event.a
                                    ) === 7 &&
                                    (
                                        this._int(
                                            event.me
                                        ) > 0 ||
                                        event.result !==
                                            undefined ||
                                        event.remove_mob !==
                                            undefined
                                    )
                                ),
                            5000
                        );

                    this.assertPveActionPoints(
                        response,
                        "walka Expiarki z mobem wyższej klasy"
                    );

                    if (
                        this._int(
                            response.e
                        ) !== 0 ||
                        this._int(
                            response.me
                        ) > 0
                    ) {
                        break;
                    }

                    const killed =
                        Math.max(
                            1,
                            this.questKillRemovedCount(
                                response
                            )
                        );

                    fights++;
                    removed +=
                        killed;

                    if (
                        target.rank === 1
                    ) {
                        champions +=
                            killed;
                    } else if (
                        target.rank === 2
                    ) {
                        elites +=
                            killed;
                    } else if (
                        target.rank === 3
                    ) {
                        bosses +=
                            killed;
                    }

                    toolConsole("info", 
                        "[SW Tool][PVE] Expiarka — advanced socket kill:",
                        {
                            x:
                                point.x,
                            y:
                                point.y,
                            mobNum:
                                target.mobNum,
                            rank:
                                target.rank,
                            type:
                                target.label,
                            mobId:
                                target.mobId,
                            mobName:
                                target.mobName,
                            remaining:
                                target.count -
                                index -
                                1
                        }
                    );
                }

                if (
                    !this.expRunning
                ) {
                    break;
                }
            }

            return {
                fights,
                removed,
                champions,
                elites,
                bosses
            };
        }

        async expClearCurrentField(
            point
        ) {
            let field =
                await this.waitForExpField(
                    point.x,
                    point.y
                );

            if (
                !field ||
                !this.expRunning
            ) {
                return {
                    fights: 0,
                    singleFights: 0,
                    removed: 0,
                    skipped:
                        !field
                };
            }

            const advanced =
                await this.expKillConfiguredAdvancedMobs(
                    point,
                    field
                );

            if (
                !this.expRunning
            ) {
                return {
                    fights: 0,
                    singleFights: 0,
                    removed: 0,
                    advancedFights:
                        this._int(
                            advanced?.fights
                        ),
                    advancedRemoved:
                        this._int(
                            advanced?.removed
                        ),
                    champions:
                        this._int(
                            advanced?.champions
                        ),
                    elites:
                        this._int(
                            advanced?.elites
                        ),
                    bosses:
                        this._int(
                            advanced?.bosses
                        ),
                    skipped: false
                };
            }

            let mobs =
                this.respawnNormalMobCount(
                    field
                ).count;
            let fights = 0;
            let singleFights = 0;
            let removed = 0;
            let attempts = 0;

            while (
                this.expRunning &&
                mobs > 0 &&
                attempts < 50
            ) {
                attempts++;

                const liveField =
                    this.mapSolver?.field;

                if (
                    liveField &&
                    this._int(liveField.x) ===
                        this._int(point.x) &&
                    this._int(liveField.y) ===
                        this._int(point.y)
                ) {
                    field =
                        liveField;
                    mobs =
                        this.respawnNormalMobCount(
                            field
                        ).count;
                }

                if (
                    !this.expRunning ||
                    mobs <= 0
                ) {
                    break;
                }

                const multiAvailable =
                    Array.isArray(
                        field.multiFight
                    ) &&
                    field.multiFight.includes(
                        0
                    );
                const fieldBeforeFight =
                    field;
                let response = null;

                if (multiAvailable) {
                    response =
                        await this.sendAndWait(
                            {
                                a: 13,
                                mob_num: 0,
                                fo: [
                                    1,
                                    1,
                                    1,
                                    1,
                                    1
                                ]
                            },
                            [7, 999],
                            (event) =>
                                this._int(
                                    event.e
                                ) !== 0 ||
                                (
                                    this._int(
                                        event.a
                                    ) === 7 &&
                                    (
                                        this._int(
                                            event.mm
                                        ) === 1 ||
                                        this._int(
                                            event.me
                                        ) > 0 ||
                                        event.result !==
                                            undefined ||
                                        event.remove_mob !==
                                            undefined
                                    )
                                ),
                            5000
                        );

                    this.assertPveActionPoints(
                        response,
                        "walka"
                    );

                    this.assertPveActionPoints(
                        response,
                        "walka"
                    );

                    if (
                        this._int(
                            response.e
                        ) !== 0
                    ) {
                        throw new Error(
                            "Expiarka: serwer odrzucił multiwalkę."
                        );
                    }

                    this.assertPveActionPoints(
                        response,
                        "walka"
                    );

                    this.assertPveActionPoints(
                        response,
                        "walka"
                    );

                    if (
                        this._int(
                            response.me
                        ) > 0
                    ) {
                        break;
                    }

                    fights++;
                } else {
                    response =
                        await this.sendAndWait(
                            {
                                a: 7,
                                mob_num: 0,
                                rank: 0,
                                quick: 1
                            },
                            [7, 999],
                            (event) =>
                                this._int(
                                    event.e
                                ) !== 0 ||
                                (
                                    this._int(
                                        event.a
                                    ) === 7 &&
                                    (
                                        this._int(
                                            event.me
                                        ) > 0 ||
                                        event.result !==
                                            undefined ||
                                        event.remove_mob !==
                                            undefined
                                    )
                                ),
                            5000
                        );

                    if (
                        this._int(
                            response.e
                        ) !== 0
                    ) {
                        throw new Error(
                            "Expiarka: serwer odrzucił zwykłą walkę."
                        );
                    }

                    if (
                        this._int(
                            response.me
                        ) > 0
                    ) {
                        break;
                    }

                    singleFights++;
                }

                const removedNow =
                    this.questKillRemovedCount(
                        response
                    );
                removed +=
                    removedNow;

                const liveAfterFight =
                    this.mapSolver?.field;

                if (
                    liveAfterFight &&
                    liveAfterFight !==
                        fieldBeforeFight &&
                    this._int(
                        liveAfterFight.x
                    ) ===
                        this._int(point.x) &&
                    this._int(
                        liveAfterFight.y
                    ) ===
                        this._int(point.y)
                ) {
                    field =
                        liveAfterFight;
                    mobs =
                        this.respawnNormalMobCount(
                            field
                        ).count;
                } else {
                    mobs =
                        Math.max(
                            0,
                            mobs -
                                Math.max(
                                    1,
                                    removedNow
                                )
                        );
                }

                if (
                    attempts === 1 ||
                    attempts % 5 === 0 ||
                    mobs <= 0
                ) {
                    this.setQuickPanelStatus(
                        "Expiarka: " +
                        point.x +
                        "|" +
                        point.y +
                        " • moby " +
                        mobs +
                        " • zwykłe " +
                        singleFights +
                        "x • multi " +
                        fights +
                        "x."
                    );
                }

                await this.sleep(20);
            }

            return {
                fights,
                singleFights,
                removed,
                advancedFights:
                    this._int(
                        advanced?.fights
                    ),
                advancedRemoved:
                    this._int(
                        advanced?.removed
                    ),
                champions:
                    this._int(
                        advanced?.champions
                    ),
                elites:
                    this._int(
                        advanced?.elites
                    ),
                bosses:
                    this._int(
                        advanced?.bosses
                    ),
                skipped: false
            };
        }

        stopExpiarka() {
            if (!this.expRunning) {
                return;
            }

            this.expStopRequested =
                true;
            this.expRunning =
                false;

            if (
                this.mapSolver?.active &&
                String(
                    this.mapSolver.source || ""
                ).startsWith(
                    "pve-exp"
                )
            ) {
                this.mapSolver.stop(
                    "Expiarka STOP"
                );
            }

            this.syncPveModeButtons();
            this.setQuickPanelStatus(
                "Expiarka zatrzymana — pozostaję na aktualnym polu."
            );
        }

        expSweepSegmentPlan(
            map,
            startX,
            startY
        ) {
            const reachable =
                this.questKillPatrolOrder(
                    map,
                    startX,
                    startY
                );

            if (
                !Array.isArray(reachable) ||
                reachable.length === 0
            ) {
                return null;
            }

            const reachableKeys =
                new Set(
                    reachable.map(
                        (point) =>
                            point.x +
                            "_" +
                            point.y
                    )
                );

            const build = (
                orientation
            ) => {
                const vertical =
                    orientation ===
                    "pionowo";
                const laneValues =
                    [
                        ...new Set(
                            reachable.map(
                                (point) =>
                                    vertical
                                        ? this._int(
                                            point.x
                                        )
                                        : this._int(
                                            point.y
                                        )
                            )
                        )
                    ].sort(
                        (a, b) =>
                            a - b
                    );

                const segments = [];
                const byId =
                    new Map();
                const cellToSegment =
                    new Map();

                for (
                    let laneIndex = 0;
                    laneIndex <
                        laneValues.length;
                    laneIndex++
                ) {
                    const lane =
                        laneValues[
                            laneIndex
                        ];
                    const coordinates = [];

                    for (
                        const point of
                        reachable
                    ) {
                        if (
                            (
                                vertical &&
                                this._int(
                                    point.x
                                ) === lane
                            ) ||
                            (
                                !vertical &&
                                this._int(
                                    point.y
                                ) === lane
                            )
                        ) {
                            coordinates.push(
                                vertical
                                    ? this._int(
                                        point.y
                                    )
                                    : this._int(
                                        point.x
                                    )
                            );
                        }
                    }

                    coordinates.sort(
                        (a, b) =>
                            a - b
                    );

                    let run = [];

                    const flush = () => {
                        if (
                            run.length === 0
                        ) {
                            return;
                        }

                        const id =
                            orientation +
                            ":" +
                            lane +
                            ":" +
                            run[0] +
                            "-" +
                            run[
                                run.length -
                                1
                            ];

                        const cells =
                            run.map(
                                (coord) =>
                                    vertical
                                        ? {
                                            x: lane,
                                            y: coord
                                        }
                                        : {
                                            x: coord,
                                            y: lane
                                        }
                            );

                        const segment = {
                            id,
                            orientation,
                            lane,
                            laneIndex,
                            min:
                                run[0],
                            max:
                                run[
                                    run.length -
                                    1
                                ],
                            cells,
                            neighbors:
                                new Set()
                        };

                        segments.push(
                            segment
                        );
                        byId.set(
                            id,
                            segment
                        );

                        for (
                            const cell of
                            cells
                        ) {
                            cellToSegment.set(
                                cell.x +
                                "_" +
                                cell.y,
                                id
                            );
                        }

                        run = [];
                    };

                    for (
                        const coord of
                        coordinates
                    ) {
                        if (
                            run.length === 0 ||
                            coord ===
                                run[
                                    run.length -
                                    1
                                ] +
                                    1
                        ) {
                            run.push(
                                coord
                            );
                        } else {
                            flush();
                            run.push(
                                coord
                            );
                        }
                    }

                    flush();
                }

                const byLane =
                    new Map();

                for (
                    const segment of
                    segments
                ) {
                    if (
                        !byLane.has(
                            segment.lane
                        )
                    ) {
                        byLane.set(
                            segment.lane,
                            []
                        );
                    }

                    byLane
                        .get(
                            segment.lane
                        )
                        .push(
                            segment
                        );
                }

                const rangeGap = (
                    left,
                    right
                ) => {
                    if (
                        left.max <
                        right.min
                    ) {
                        return (
                            right.min -
                            left.max
                        );
                    }

                    if (
                        right.max <
                        left.min
                    ) {
                        return (
                            left.min -
                            right.max
                        );
                    }

                    return 0;
                };

                for (
                    let index = 0;
                    index <
                        laneValues.length -
                            1;
                    index++
                ) {
                    const lane =
                        laneValues[index];
                    const nextLane =
                        laneValues[
                            index + 1
                        ];

                    // Tylko faktycznie sąsiednie kolumny/rzędy tworzą
                    // bezpośrednie połączenie segmentów.
                    if (
                        nextLane !==
                        lane + 1
                    ) {
                        continue;
                    }

                    const left =
                        byLane.get(
                            lane
                        ) || [];
                    const right =
                        byLane.get(
                            nextLane
                        ) || [];

                    for (
                        const a of left
                    ) {
                        for (
                            const b of right
                        ) {
                            // Ruch po skosie jest dozwolony, więc odcinki
                            // łączą się również gdy ich końce różnią się o 1.
                            if (
                                rangeGap(
                                    a,
                                    b
                                ) <= 1
                            ) {
                                a.neighbors.add(
                                    b.id
                                );
                                b.neighbors.add(
                                    a.id
                                );
                            }
                        }
                    }
                }

                const splitPenalty =
                    Math.max(
                        0,
                        segments.length -
                            laneValues.length
                    );

                return {
                    orientation,
                    vertical,
                    segments,
                    byId,
                    cellToSegment,
                    laneValues,
                    reachableCount:
                        reachable.length,
                    splitPenalty,
                    score:
                        splitPenalty *
                            20 +
                        segments.length
                };
            };

            const vertical =
                build(
                    "pionowo"
                );
            const horizontal =
                build(
                    "poziomo"
                );
            const plan =
                vertical.score <=
                horizontal.score
                    ? vertical
                    : horizontal;

            const extremeLane =
                plan.laneValues[0];
            const extremeSegments =
                plan.segments
                    .filter(
                        (segment) =>
                            segment.lane ===
                            extremeLane
                    )
                    .sort(
                        (a, b) =>
                            a.min -
                            b.min
                    );

            plan.firstSegment =
                extremeSegments[0] ||
                plan.segments[0] ||
                null;

            plan.reachableKeys =
                reachableKeys;

            return plan;
        }

        expSegmentPoint(
            segment,
            coord
        ) {
            return segment.orientation ===
                "pionowo"
                ? {
                    x:
                        segment.lane,
                    y:
                        coord
                }
                : {
                    x:
                        coord,
                    y:
                        segment.lane
                };
        }

        expSegmentNearestEnd(
            segment,
            point
        ) {
            const axis =
                segment.orientation ===
                    "pionowo"
                    ? this._int(
                        point?.y
                    )
                    : this._int(
                        point?.x
                    );

            const minDistance =
                Math.abs(
                    axis -
                    segment.min
                );
            const maxDistance =
                Math.abs(
                    axis -
                    segment.max
                );

            return minDistance <=
                maxDistance
                ? "min"
                : "max";
        }

        expSegmentEndpoint(
            segment,
            side
        ) {
            return this.expSegmentPoint(
                segment,
                side === "max"
                    ? segment.max
                    : segment.min
            );
        }

        expSegmentContainsAxis(
            segment,
            axis
        ) {
            return (
                axis >=
                    segment.min -
                        1 &&
                axis <=
                    segment.max +
                        1
            );
        }

        expSelectNextSegment(
            plan,
            currentSegment,
            previousSegment,
            exitPoint,
            visitedSegments,
            laneDirection
        ) {
            const axis =
                plan.vertical
                    ? this._int(
                        exitPoint.y
                    )
                    : this._int(
                        exitPoint.x
                    );

            const candidates =
                [...currentSegment.neighbors]
                    .map(
                        (id) =>
                            plan.byId.get(
                                id
                            )
                    )
                    .filter(
                        (segment) =>
                            segment &&
                            !visitedSegments.has(
                                segment.id
                            ) &&
                            this.expSegmentContainsAxis(
                                segment,
                                axis
                            )
                    );

            if (
                candidates.length === 0
            ) {
                return null;
            }

            const previousLane =
                previousSegment
                    ? previousSegment.lane
                    : null;

            candidates.sort(
                (left, right) => {
                    const score = (
                        segment
                    ) => {
                        let value = 0;

                        // Najważniejsza reguła: jeżeli przeszliśmy za koniec
                        // przeszkody i po drugiej stronie mamy NIEODWIEDZONY
                        // segment w kolumnie/rzędzie, z którego przyszliśmy,
                        // wracamy właśnie nim. To daje "owinięcie" przeszkody
                        // zamiast dalszego marszu i późniejszego nadrabiania.
                        if (
                            previousLane !==
                                null &&
                            segment.lane ===
                                previousLane &&
                            previousSegment &&
                            segment.id !==
                                previousSegment.id
                        ) {
                            value -=
                                1000;
                        }

                        const delta =
                            segment.lane -
                            currentSegment.lane;
                        const direction =
                            delta === 0
                                ? 0
                                : delta > 0
                                    ? 1
                                    : -1;

                        if (
                            laneDirection !==
                                0 &&
                            direction ===
                                laneDirection
                        ) {
                            value -= 100;
                        }

                        const minDistance =
                            Math.abs(
                                axis -
                                segment.min
                            );
                        const maxDistance =
                            Math.abs(
                                axis -
                                segment.max
                            );

                        value +=
                            Math.min(
                                minDistance,
                                maxDistance
                            ) *
                            5;

                        // Segment z mniejszą liczbą niewykorzystanych wyjść
                        // obsługujemy wcześniej, żeby nie zostawiać kieszeni.
                        let freeNeighbors = 0;
                        for (
                            const id of
                            segment.neighbors
                        ) {
                            if (
                                !visitedSegments.has(
                                    id
                                )
                            ) {
                                freeNeighbors++;
                            }
                        }

                        value +=
                            freeNeighbors;

                        return value;
                    };

                    return (
                        score(left) -
                        score(right)
                    );
                }
            );

            return candidates[0];
        }

        expNearestUnvisitedSegment(
            plan,
            current,
            visitedSegments
        ) {
            let best = null;

            for (
                const segment of
                plan.segments
            ) {
                if (
                    visitedSegments.has(
                        segment.id
                    )
                ) {
                    continue;
                }

                for (
                    const side of
                    ["min", "max"]
                ) {
                    const endpoint =
                        this.expSegmentEndpoint(
                            segment,
                            side
                        );
                    const path =
                        this.mapSolver
                            .findShortestPath(
                                this.mapSolver
                                    ?.map,
                                current,
                                endpoint
                            );

                    if (!path) {
                        continue;
                    }

                    if (
                        !best ||
                        path.length <
                            best.path.length
                    ) {
                        best = {
                            segment,
                            side,
                            path
                        };
                    }
                }
            }

            return best;
        }

        async expVisitField(
            state,
            visited,
            point
        ) {
            const key =
                point.x +
                "_" +
                point.y;

            if (
                visited.has(key) ||
                !this.expRunning
            ) {
                return;
            }

            visited.add(key);
            state.visited =
                visited.size;

            const cleared =
                await this.expClearCurrentField(
                    point
                );

            state.fights +=
                this._int(
                    cleared?.fights
                );
            state.singleFights +=
                this._int(
                    cleared?.singleFights
                );
            state.removed +=
                this._int(
                    cleared?.removed
                );
            state.advancedFights +=
                this._int(
                    cleared?.advancedFights
                );
            state.advancedRemoved +=
                this._int(
                    cleared?.advancedRemoved
                );
            state.championsKilled +=
                this._int(
                    cleared?.champions
                );
            state.elitesKilled +=
                this._int(
                    cleared?.elites
                );
            state.bossesKilled +=
                this._int(
                    cleared?.bosses
                );
        }

        async runExpiarka() {
            this.pveModeStartGuard(
                "exp"
            );

            const map =
                this.mapSolver?.map;

            if (
                !map ||
                this._int(
                    map.locationId
                ) <= 0 ||
                this._int(map.x) <= 0 ||
                this._int(map.y) <= 0
            ) {
                throw new Error(
                    "Expiarka: brak gotowej mapy/pozycji."
                );
            }

            const start = {
                locationId:
                    this._int(
                        map.locationId
                    ),
                locationName:
                    String(
                        map.locationName || ""
                    ),
                x:
                    this._int(map.x),
                y:
                    this._int(map.y)
            };

            const plan =
                this.expSweepSegmentPlan(
                    map,
                    start.x,
                    start.y
                );

            if (
                !plan ||
                !plan.firstSegment
            ) {
                throw new Error(
                    "Expiarka: brak osiągalnych pól."
                );
            }

            const visited =
                new Set();
            const visitedSegments =
                new Set();
            const state = {
                start,
                orientation:
                    plan.orientation,
                reachable:
                    plan.reachableCount,
                segments:
                    plan.segments.length,
                visited: 0,
                visitedSegments: 0,
                moves: 0,
                solverBridges: 0,
                obstacleWraps: 0,
                revisitedMoves: 0,
                fights: 0,
                singleFights: 0,
                removed: 0,
                advancedFights: 0,
                advancedRemoved: 0,
                championsKilled: 0,
                elitesKilled: 0,
                bossesKilled: 0
            };

            this.pveActionPointsExhausted =
                false;
            this.expRunning =
                true;
            this.expStopRequested =
                false;
            this.syncPveModeButtons();

            this.setQuickPanelStatus(
                "Expiarka START • segmenty " +
                plan.orientation +
                " • " +
                plan.segments.length +
                " pasów/odcinków • pola " +
                plan.reachableCount +
                " • advanced: " +
                (
                    [
                        this.config
                            ?.expKillChampions ===
                            true
                            ? "C"
                            : "",
                        this.config
                            ?.expKillElites ===
                            true
                            ? "E"
                            : "",
                        this.config
                            ?.expKillBosses ===
                            true
                            ? "B"
                            : ""
                    ]
                        .filter(Boolean)
                        .join("/") ||
                    "wył."
                ) +
                "."
            );

            toolConsole("info", 
                "[SW Tool][PVE] Expiarka — plan segmentowy:",
                {
                    start,
                    orientation:
                        plan.orientation,
                    segments:
                        plan.segments.map(
                            (segment) => ({
                                id:
                                    segment.id,
                                lane:
                                    segment.lane,
                                min:
                                    segment.min,
                                max:
                                    segment.max,
                                neighbors:
                                    [
                                        ...segment.neighbors
                                    ]
                            })
                        ),
                    reachable:
                        plan.reachableCount,
                    splitPenalty:
                        plan.splitPenalty
                }
            );

            let operationError = null;

            const moveOne = async (
                target,
                source =
                    "pve-exp-segment"
            ) => {
                const beforeKey =
                    this._int(
                        this.mapSolver?.map?.x
                    ) +
                    "_" +
                    this._int(
                        this.mapSolver?.map?.y
                    );

                const moved =
                    await this.mapSolver
                        .navigateTo(
                            target.x,
                            target.y,
                            {
                                source,
                                allowBusy: true
                            }
                        );

                if (
                    !this.expRunning
                ) {
                    return false;
                }

                if (!moved?.ok) {
                    throw new Error(
                        "Expiarka: nie udało się wykonać kroku."
                    );
                }

                state.moves++;

                const after = {
                    x:
                        this._int(
                            this.mapSolver?.map?.x
                        ),
                    y:
                        this._int(
                            this.mapSolver?.map?.y
                        )
                };
                const afterKey =
                    after.x +
                    "_" +
                    after.y;

                if (
                    visited.has(
                        afterKey
                    ) &&
                    afterKey !==
                        beforeKey
                ) {
                    state.revisitedMoves++;
                }

                await this.expVisitField(
                    state,
                    visited,
                    after
                );

                return true;
            };

            const moveTo = async (
                target,
                bridge = false
            ) => {
                let bridgeCounted =
                    false;

                while (
                    this.expRunning
                ) {
                    const current = {
                        x:
                            this._int(
                                this.mapSolver?.map?.x
                            ),
                        y:
                            this._int(
                                this.mapSolver?.map?.y
                            )
                    };

                    if (
                        current.x ===
                            target.x &&
                        current.y ===
                            target.y
                    ) {
                        return true;
                    }

                    const path =
                        this.mapSolver
                            .findShortestPath(
                                map,
                                current,
                                target
                            );

                    if (
                        !path ||
                        path.length === 0
                    ) {
                        return false;
                    }

                    if (
                        bridge &&
                        !bridgeCounted
                    ) {
                        state.solverBridges++;
                        bridgeCounted =
                            true;
                    }

                    if (
                        !await moveOne(
                            path[0],
                            bridge
                                ? "pve-exp-bridge"
                                : "pve-exp-segment"
                        )
                    ) {
                        return false;
                    }
                }

                return false;
            };

            try {
                // Pole startowe również jest częścią pokrycia mapy.
                await this.expVisitField(
                    state,
                    visited,
                    {
                        x:
                            this._int(
                                this.mapSolver?.map?.x
                            ),
                        y:
                            this._int(
                                this.mapSolver?.map?.y
                            )
                    }
                );

                let currentSegment =
                    plan.firstSegment;
                let previousSegment =
                    null;
                let laneDirection = 1;

                while (
                    this.expRunning &&
                    visitedSegments.size <
                        plan.segments.length
                ) {
                    if (
                        this._int(
                            this.mapSolver?.map
                                ?.locationId
                        ) !==
                        start.locationId
                    ) {
                        throw new Error(
                            "Expiarka: postać opuściła mapę patrolu."
                        );
                    }

                    if (
                        visitedSegments.has(
                            currentSegment.id
                        )
                    ) {
                        const currentPoint = {
                            x:
                                this._int(
                                    this.mapSolver?.map?.x
                                ),
                            y:
                                this._int(
                                    this.mapSolver?.map?.y
                                )
                        };
                        const fallback =
                            this.expNearestUnvisitedSegment(
                                plan,
                                currentPoint,
                                visitedSegments
                            );

                        if (!fallback) {
                            break;
                        }

                        currentSegment =
                            fallback.segment;
                        if (
                            !await moveTo(
                                this.expSegmentEndpoint(
                                    currentSegment,
                                    fallback.side
                                ),
                                true
                            )
                        ) {
                            break;
                        }
                    }

                    const currentPoint = {
                        x:
                            this._int(
                                this.mapSolver?.map?.x
                            ),
                        y:
                            this._int(
                                this.mapSolver?.map?.y
                            )
                    };
                    const entrySide =
                        this.expSegmentNearestEnd(
                            currentSegment,
                            currentPoint
                        );
                    const exitSide =
                        entrySide === "min"
                            ? "max"
                            : "min";
                    const entry =
                        this.expSegmentEndpoint(
                            currentSegment,
                            entrySide
                        );

                    const alreadyAtEntry =
                        currentPoint.x ===
                            entry.x &&
                        currentPoint.y ===
                            entry.y;

                    if (!alreadyAtEntry) {
                        if (
                            !await moveTo(
                                entry,
                                true
                            )
                        ) {
                            break;
                        }
                    }

                    const orderedCells =
                        entrySide === "min"
                            ? currentSegment.cells
                            : [
                                ...currentSegment.cells
                            ].reverse();

                    for (
                        const cell of
                        orderedCells
                    ) {
                        if (
                            !this.expRunning
                        ) {
                            break;
                        }

                        const x =
                            this._int(
                                this.mapSolver?.map?.x
                            );
                        const y =
                            this._int(
                                this.mapSolver?.map?.y
                            );

                        if (
                            x === cell.x &&
                            y === cell.y
                        ) {
                            await this.expVisitField(
                                state,
                                visited,
                                cell
                            );
                            continue;
                        }

                        if (
                            !await moveOne(
                                cell
                            )
                        ) {
                            break;
                        }
                    }

                    if (
                        !this.expRunning
                    ) {
                        break;
                    }

                    visitedSegments.add(
                        currentSegment.id
                    );
                    state.visitedSegments =
                        visitedSegments.size;

                    const exitPoint =
                        this.expSegmentEndpoint(
                            currentSegment,
                            exitSide
                        );

                    let nextSegment =
                        this.expSelectNextSegment(
                            plan,
                            currentSegment,
                            previousSegment,
                            exitPoint,
                            visitedSegments,
                            laneDirection
                        );

                    if (nextSegment) {
                        const newDirection =
                            Math.sign(
                                nextSegment.lane -
                                currentSegment.lane
                            );

                        if (
                            previousSegment &&
                            nextSegment.lane ===
                                previousSegment.lane &&
                            nextSegment.id !==
                                previousSegment.id
                        ) {
                            state.obstacleWraps++;
                        }

                        if (
                            newDirection !== 0
                        ) {
                            laneDirection =
                                newDirection;
                        }

                        previousSegment =
                            currentSegment;
                        currentSegment =
                            nextSegment;
                    } else {
                        const fallback =
                            this.expNearestUnvisitedSegment(
                                plan,
                                exitPoint,
                                visitedSegments
                            );

                        if (!fallback) {
                            break;
                        }

                        previousSegment =
                            currentSegment;
                        currentSegment =
                            fallback.segment;
                        if (
                            !await moveTo(
                                this.expSegmentEndpoint(
                                    currentSegment,
                                    fallback.side
                                ),
                                true
                            )
                        ) {
                            break;
                        }

                        const delta =
                            currentSegment.lane -
                            previousSegment.lane;

                        if (delta !== 0) {
                            laneDirection =
                                Math.sign(
                                    delta
                                );
                        }
                    }

                    if (
                        state.visitedSegments === 1 ||
                        state.visitedSegments %
                                5 ===
                            0 ||
                        state.visited ===
                            plan.reachableCount
                    ) {
                        this.setQuickPanelStatus(
                            "Expiarka • " +
                            plan.orientation +
                            " • pola " +
                            state.visited +
                            "/" +
                            plan.reachableCount +
                            " • segmenty " +
                            state.visitedSegments +
                            "/" +
                            plan.segments.length +
                            " • obejścia " +
                            state.obstacleWraps +
                            " • mosty " +
                            state.solverBridges +
                            "."
                        );
                    }
                }
            } catch (error) {
                operationError =
                    error;

                if (
                    this.isPveNoActionPointsError(
                        error
                    )
                ) {
                    this.pveActionPointsExhausted =
                        true;
                    this.setQuickPanelStatus(
                        "Expiarka STOP — brak punktów akcji • zabito C:" +
                        state.championsKilled +
                        " E:" +
                        state.elitesKilled +
                        " B:" +
                        state.bossesKilled +
                        "."
                    );
                }
            }

            const stoppedByUser =
                this.expStopRequested;

            if (
                !stoppedByUser &&
                !operationError &&
                !this.pveActionPointsExhausted
            ) {
                try {
                    const currentLocation =
                        this._int(
                            this.mapSolver?.map
                                ?.locationId
                        );
                    const currentX =
                        this._int(
                            this.mapSolver?.map?.x
                        );
                    const currentY =
                        this._int(
                            this.mapSolver?.map?.y
                        );

                    if (
                        currentLocation !==
                            start.locationId ||
                        currentX !==
                            start.x ||
                        currentY !==
                            start.y
                    ) {
                        this.setQuickPanelStatus(
                            "Expiarka: mapa wyczyszczona — wracam na " +
                            start.x +
                            "|" +
                            start.y +
                            "..."
                        );

                        await this.mapSolver
                            .navigateToLocation(
                                start.locationId,
                                start.x,
                                start.y,
                                {
                                    source:
                                        "pve-exp-return",
                                    allowBusy: true
                                }
                            );
                    }
                } catch (error) {
                    operationError =
                        error;
                }
            }

            this.expRunning =
                false;
            this.expStopRequested =
                false;
            this.syncPveModeButtons();

            if (
                operationError &&
                this.isPveNoActionPointsError(
                    operationError
                )
            ) {
                return {
                    ...state,
                    stoppedByUser: false,
                    stopped: true,
                    reason:
                        "no-action-points",
                    end: {
                        x:
                            this._int(
                                this.mapSolver?.map?.x
                            ),
                        y:
                            this._int(
                                this.mapSolver?.map?.y
                            )
                    }
                };
            }

            if (operationError) {
                throw operationError;
            }

            const end = {
                x:
                    this._int(
                        this.mapSolver?.map?.x
                    ),
                y:
                    this._int(
                        this.mapSolver?.map?.y
                    )
            };

            this.setQuickPanelStatus(
                stoppedByUser
                    ? "Expiarka STOP • pozostaję " +
                      end.x +
                      "|" +
                      end.y +
                      " • zabito C:" +
                      state.championsKilled +
                      " E:" +
                      state.elitesKilled +
                      " B:" +
                      state.bossesKilled +
                      "."
                    : "Expiarka zakończona • " +
                      plan.orientation +
                      " • pola " +
                      state.visited +
                      "/" +
                      plan.reachableCount +
                      " • obejścia " +
                      state.obstacleWraps +
                      " • mosty " +
                      state.solverBridges +
                      " • powtórne ruchy " +
                      state.revisitedMoves +
                      " • zwykłe " +
                      state.singleFights +
                      "x • multi " +
                      state.fights +
                      "x • advanced " +
                      state.advancedFights +
                      "x [C:" +
                      state.championsKilled +
                      " E:" +
                      state.elitesKilled +
                      " B:" +
                      state.bossesKilled +
                      "] • powrót na start ✓",
                stoppedByUser
                    ? ""
                    : "success"
            );

            toolConsole("info", 
                "[SW Tool][PVE] Expiarka — koniec:",
                {
                    ...state,
                    plan: {
                        orientation:
                            plan.orientation,
                        segments:
                            plan.segments.length,
                        splitPenalty:
                            plan.splitPenalty
                    },
                    stoppedByUser,
                    end
                }
            );

            return {
                ...state,
                stoppedByUser,
                end
            };
        }

        toggleExpiarka() {
            if (this.expRunning) {
                this.stopExpiarka();
                return Promise.resolve({
                    stopped: true
                });
            }

            return this.runExpiarka();
        }

        clickQuestActionAndWaitForSocket(
            action,
            {
                label = "akcja questa",
                timeoutMs = 10000
            } = {}
        ) {
            if (!(action instanceof Element)) {
                return Promise.reject(
                    new Error(
                        "TEST: brak przycisku questa do kliknięcia."
                    )
                );
            }

            const socket =
                GAME.socket;

            if (!socket?.connected) {
                return Promise.reject(
                    new Error(
                        "Socket.IO nie jest połączone."
                    )
                );
            }

            return new Promise(
                (resolve, reject) => {
                    const originalEmit =
                        socket.emit;
                    let txOrder = null;
                    let settled = false;

                    const cleanup = () => {
                        if (
                            socket.emit ===
                            wrappedEmit
                        ) {
                            socket.emit =
                                originalEmit;
                        }

                        socket.off(
                            "gr",
                            onResponse
                        );
                        clearTimeout(
                            timeoutId
                        );
                    };

                    const fail = (
                        message
                    ) => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        reject(
                            new Error(message)
                        );
                    };

                    const succeed = (
                        response
                    ) => {
                        if (settled) return;
                        settled = true;
                        cleanup();

                        toolConsole(
                            "info",
                            "[SW Tool][TEST] Klik questa potwierdzony socketem.",
                            {
                                label,
                                text:
                                    String(
                                        action.textContent ||
                                        ""
                                    ).trim(),
                                tx:
                                    txOrder,
                                rx: {
                                    a:
                                        this._int(
                                            response?.a
                                        ),
                                    e:
                                        this._int(
                                            response?.e
                                        ),
                                    type:
                                        response?.type,
                                    questEnd:
                                        this._int(
                                            response?.quest_end
                                        ),
                                    qStepId:
                                        this._int(
                                            response
                                                ?.q_step
                                                ?.qb_id
                                        )
                                }
                            }
                        );

                        resolve({
                            order:
                                txOrder,
                            response
                        });
                    };

                    const onResponse =
                        (response) => {
                            if (
                                !txOrder ||
                                !response ||
                                typeof response !==
                                    "object"
                            ) {
                                return;
                            }

                            const actionId =
                                this._int(
                                    response.a
                                );

                            if (
                                actionId === 999 &&
                                this._int(
                                    response.e
                                ) !== 0
                            ) {
                                fail(
                                    "TEST: błąd autoryzacji po " +
                                    label +
                                    "."
                                );
                                return;
                            }

                            if (
                                actionId !==
                                this._int(
                                    txOrder.a
                                )
                            ) {
                                return;
                            }

                            if (
                                this._int(
                                    response.e
                                ) !== 0
                            ) {
                                fail(
                                    "TEST: serwer odrzucił " +
                                    label +
                                    " (a=" +
                                    this._int(
                                        txOrder.a
                                    ) +
                                    ", type=" +
                                    String(
                                        txOrder.type ??
                                        "-"
                                    ) +
                                    ", e=" +
                                    this._int(
                                        response.e
                                    ) +
                                    ")."
                                );
                                return;
                            }

                            succeed(response);
                        };

                    const wrappedEmit =
                        function (
                            event,
                            ...args
                        ) {
                            if (
                                !txOrder &&
                                event === "ga"
                            ) {
                                const candidate =
                                    args.length <= 1
                                        ? args[0]
                                        : args;

                                if (
                                    candidate &&
                                    typeof candidate ===
                                        "object" &&
                                    !Array.isArray(
                                        candidate
                                    ) &&
                                    Number(
                                        candidate.a
                                    ) > 0
                                ) {
                                    txOrder = {
                                        ...candidate
                                    };

                                    toolConsole(
                                        "info",
                                        "[SW Tool][TEST] TX z kliknięcia questa.",
                                        {
                                            label,
                                            text:
                                                String(
                                                    action
                                                        .textContent ||
                                                    ""
                                                ).trim(),
                                            order:
                                                txOrder
                                        }
                                    );
                                }
                            }

                            return originalEmit.apply(
                                this,
                                [
                                    event,
                                    ...args
                                ]
                            );
                        };

                    socket.emit =
                        wrappedEmit;
                    socket.on(
                        "gr",
                        onResponse
                    );

                    const timeoutId =
                        setTimeout(
                            () => {
                                if (
                                    !txOrder
                                ) {
                                    fail(
                                        "TEST: " +
                                        label +
                                        " nie wygenerowało TX ga."
                                    );
                                    return;
                                }

                                fail(
                                    "TEST: timeout RX po " +
                                    label +
                                    " (TX a=" +
                                    this._int(
                                        txOrder.a
                                    ) +
                                    ", type=" +
                                    String(
                                        txOrder.type ??
                                        "-"
                                    ) +
                                    ")."
                                );
                            },
                            timeoutMs
                        );

                    try {
                        this.clickQuestAction(
                            action,
                            label
                        );
                    } catch (error) {
                        fail(
                            error instanceof Error
                                ? error.message
                                : String(error)
                        );
                    }
                }
            );
        }

        pressClientKeyAndWaitForSocket(
            key,
            {
                label = "akcja klienta",
                timeoutMs = 10000
            } = {}
        ) {
            const socket =
                GAME.socket;

            if (!socket?.connected) {
                return Promise.reject(
                    new Error(
                        "Socket.IO nie jest połączone."
                    )
                );
            }

            return new Promise(
                (resolve, reject) => {
                    const originalEmit =
                        socket.emit;
                    let txOrder = null;
                    let settled = false;

                    const cleanup = () => {
                        if (
                            socket.emit ===
                            wrappedEmit
                        ) {
                            socket.emit =
                                originalEmit;
                        }

                        socket.off(
                            "gr",
                            onResponse
                        );
                        clearTimeout(
                            timeoutId
                        );
                    };

                    const fail = (
                        message
                    ) => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        reject(
                            new Error(message)
                        );
                    };

                    const succeed = (
                        response
                    ) => {
                        if (settled) return;
                        settled = true;
                        cleanup();

                        toolConsole(
                            "info",
                            "[SW Tool][TEST] Akcja klienta potwierdzona socketem.",
                            {
                                label,
                                tx: txOrder,
                                rx: {
                                    a:
                                        this._int(
                                            response?.a
                                        ),
                                    e:
                                        this._int(
                                            response?.e
                                        ),
                                    type:
                                        response?.type,
                                    questEnd:
                                        this._int(
                                            response?.quest_end
                                        ),
                                    qStepId:
                                        this._int(
                                            response
                                                ?.q_step
                                                ?.qb_id
                                        )
                                }
                            }
                        );

                        resolve({
                            order:
                                txOrder,
                            response
                        });
                    };

                    const responseMatches =
                        (response) => {
                            if (
                                !txOrder ||
                                !response ||
                                typeof response !==
                                    "object"
                            ) {
                                return false;
                            }

                            const action =
                                this._int(
                                    response.a
                                );

                            if (
                                action === 999 &&
                                this._int(
                                    response.e
                                ) !== 0
                            ) {
                                return true;
                            }

                            return (
                                action ===
                                this._int(
                                    txOrder.a
                                )
                            );
                        };

                    const onResponse =
                        (response) => {
                            if (
                                !responseMatches(
                                    response
                                )
                            ) {
                                return;
                            }

                            if (
                                this._int(
                                    response.e
                                ) !== 0
                            ) {
                                fail(
                                    "TEST: serwer odrzucił " +
                                    label +
                                    " (a=" +
                                    this._int(
                                        txOrder?.a
                                    ) +
                                    ", type=" +
                                    String(
                                        txOrder?.type ??
                                        "-"
                                    ) +
                                    ", e=" +
                                    this._int(
                                        response.e
                                    ) +
                                    ")."
                                );
                                return;
                            }

                            succeed(response);
                        };

                    const wrappedEmit =
                        function (
                            event,
                            ...args
                        ) {
                            if (
                                !txOrder &&
                                event === "ga"
                            ) {
                                const candidate =
                                    args.length <= 1
                                        ? args[0]
                                        : args;

                                if (
                                    candidate &&
                                    typeof candidate ===
                                        "object" &&
                                    !Array.isArray(
                                        candidate
                                    ) &&
                                    Number(
                                        candidate.a
                                    ) > 0
                                ) {
                                    txOrder = {
                                        ...candidate
                                    };

                                    toolConsole(
                                        "info",
                                        "[SW Tool][TEST] TX z klientowego X.",
                                        {
                                            label,
                                            order:
                                                txOrder
                                        }
                                    );
                                }
                            }

                            return originalEmit.apply(
                                this,
                                [
                                    event,
                                    ...args
                                ]
                            );
                        };

                    socket.emit =
                        wrappedEmit;
                    socket.on(
                        "gr",
                        onResponse
                    );

                    const timeoutId =
                        setTimeout(
                            () => {
                                if (
                                    !txOrder
                                ) {
                                    fail(
                                        "TEST: " +
                                        label +
                                        " nie wygenerowało żadnego TX ga."
                                    );
                                    return;
                                }

                                fail(
                                    "TEST: timeout RX po " +
                                    label +
                                    " (TX a=" +
                                    this._int(
                                        txOrder.a
                                    ) +
                                    ", type=" +
                                    String(
                                        txOrder.type ??
                                        "-"
                                    ) +
                                    ")."
                                );
                            },
                            timeoutMs
                        );

                    try {
                        this.roninPressKey(
                            key
                        );
                    } catch (error) {
                        fail(
                            error instanceof Error
                                ? error.message
                                : String(error)
                        );
                    }
                }
            );
        }

        testZodiacDomQuestStep() {
            const roots =
                this.questKillDomRoots();

            for (const root of roots) {
                const text =
                    String(
                        root?.textContent || ""
                    )
                        .replace(/\s+/g, " ")
                        .trim();

                const normalized =
                    text
                        .normalize("NFD")
                        .replace(
                            /[\u0300-\u036f]/g,
                            ""
                        )
                        .toLowerCase();

                if (
                    !normalized.includes(
                        "moc zodiaku"
                    ) ||
                    !normalized.includes(
                        "nienasycony krysztal"
                    ) ||
                    !normalized.includes(
                        "obcy ninja"
                    )
                ) {
                    continue;
                }

                let count = 0;
                let max = 1;

                const elements = [
                    root,
                    ...root.querySelectorAll("*")
                ];

                for (const element of elements) {
                    if (
                        !(element instanceof Element)
                    ) {
                        continue;
                    }

                    const elementText =
                        String(
                            element.textContent || ""
                        )
                            .replace(/\s+/g, " ")
                            .trim()
                            .normalize("NFD")
                            .replace(
                                /[\u0300-\u036f]/g,
                                ""
                            )
                            .toLowerCase();

                    if (
                        !elementText.includes(
                            "nienasycony krysztal"
                        ) &&
                        !elementText.includes(
                            "obcy ninja"
                        )
                    ) {
                        continue;
                    }

                    const attrCount =
                        element.getAttribute(
                            "data-count"
                        );
                    const attrMax =
                        element.getAttribute(
                            "data-max"
                        );

                    if (
                        attrCount !== null &&
                        attrMax !== null
                    ) {
                        count = Math.max(
                            count,
                            this._int(
                                attrCount
                            )
                        );
                        max = Math.max(
                            max,
                            this._int(
                                attrMax
                            )
                        );
                    }

                    const match =
                        String(
                            element.textContent || ""
                        ).match(
                            /(\d+)\s*(?:\/|z)\s*(\d+)/i
                        );

                    if (match) {
                        count = Math.max(
                            count,
                            this._int(
                                match[1]
                            )
                        );
                        max = Math.max(
                            max,
                            this._int(
                                match[2]
                            )
                        );
                    }
                }

                max = Math.max(1, max);
                count = Math.min(
                    max,
                    Math.max(0, count)
                );

                return {
                    qb_id: 1359249,
                    header: "Moc Zodiaku",
                    source:
                        "quest-journal-dom",
                    want: {
                        qbid: 1359249,
                        type: 5,
                        id: 31,
                        amount: max,
                        is_met:
                            count >= max,
                        tl: 0,
                        name:
                            "Nienasycony Kryształ",
                        name2:
                            "Obcy Ninja",
                        count,
                        maxv: max,
                        trackable: 1
                    }
                };
            }

            return null;
        }

        async waitForTestZodiacDomTracker(
            timeoutMs = 1800
        ) {
            const startedAt = Date.now();

            while (
                Date.now() - startedAt <
                timeoutMs
            ) {
                const step =
                    this.testZodiacDomQuestStep();

                if (step) {
                    toolConsole(
                        "info",
                        "[SW Tool][TEST] Moc Zodiaku — aktywny quest potwierdzony z dziennika.",
                        {
                            count:
                                this._int(
                                    step.want?.count
                                ),
                            max:
                                this._int(
                                    step.want?.maxv
                                ),
                            source:
                                step.source
                        }
                    );

                    return step;
                }

                await this.sleep(40);
            }

            return null;
        }

        handleTestZodiacQuestResponse(response) {
            if (
                !response ||
                typeof response !== "object"
            ) {
                return false;
            }

            const questId = 1359249;

            if (
                this._int(response.quest_end) ===
                questId
            ) {
                this.testZodiacQuestStep = {
                    qb_id: questId,
                    header: "Moc Zodiaku",
                    ended: true,
                    want: null
                };
                this.testZodiacTrackVersion++;
                return true;
            }

            const lists = [];

            if (Array.isArray(response.track)) {
                lists.push(response.track);
            }

            if (Array.isArray(response.tracked)) {
                lists.push(response.tracked);
            }

            for (const list of lists) {
                for (const entry of list) {
                    const entryId =
                        this._int(
                            entry?.qb_id ||
                            entry?.qbid ||
                            entry?.id
                        );

                    if (
                        entryId !== questId ||
                        !entry?.want ||
                        typeof entry.want !==
                            "object" ||
                        this._int(
                            entry.want.type
                        ) !== 5
                    ) {
                        continue;
                    }

                    this.testZodiacQuestStep = {
                        qb_id: questId,
                        header:
                            String(
                                entry.header ||
                                "Moc Zodiaku"
                            ),
                        want: {
                            ...entry.want
                        }
                    };
                    this.testZodiacTrackVersion++;

                    toolConsole(
                        "info",
                        "[SW Tool][TEST] Moc Zodiaku — tracker z serwera.",
                        {
                            count:
                                this._int(
                                    entry.want.count
                                ),
                            max:
                                Math.max(
                                    this._int(
                                        entry.want.maxv
                                    ),
                                    this._int(
                                        entry.want.amount
                                    )
                                ),
                            isMet:
                                Boolean(
                                    entry.want.is_met
                                ),
                            target:
                                String(
                                    entry.want.name2 ||
                                    ""
                                ),
                            item:
                                String(
                                    entry.want.name ||
                                    ""
                                )
                        }
                    );

                    return true;
                }
            }

            return false;
        }

        async waitForTestZodiacTracker(
            questId,
            timeoutMs = 2500
        ) {
            const id = this._int(questId);
            const startedAt = Date.now();

            while (
                Date.now() - startedAt <
                timeoutMs
            ) {
                const step =
                    this.testZodiacQuestStep;

                if (
                    step &&
                    this._int(step.qb_id) === id
                ) {
                    return step;
                }

                await this.sleep(25);
            }

            return null;
        }

        async startOrOpenTestDailyQuest(
            questId,
            timeoutMs = 4000
        ) {
            const id = this._int(questId);
            if (id <= 0) {
                throw new Error(
                    "TEST: nieprawidłowe ID questa."
                );
            }

            const existing =
                this.currentQuestStep &&
                this._int(
                    this.currentQuestStep.qb_id
                ) === id
                    ? this.currentQuestStep
                    : null;

            if (existing) {
                return existing;
            }

            // Dla nieprzyjętego questa a:22/type:1 nie musi w ogóle
            // odpowiedzieć. Najpierw czekamy, aż klient faktycznie dostanie
            // a:602 dla bieżącego pola; navigateTo kończy się już po a:4
            // i wcześniejsze X mogło trafić zanim pole questa było gotowe.
            const currentX =
                this._int(this.mapSolver?.map?.x);
            const currentY =
                this._int(this.mapSolver?.map?.y);

            const field =
                await this.waitForQuestKillField(
                    currentX,
                    currentY,
                    1800
                );

            if (!field) {
                throw new Error(
                    "TEST: brak a:602 dla pola questa " +
                    currentX +
                    "|" +
                    currentY +
                    "."
                );
            }

            // Mały settle po a:602 pozwala klientowi zbudować interakcję
            // pola/NPC zanim wyślemy syntetyczne X.
            await this.sleep(180);

            this.currentQuestStep = null;
            this.roninPressKey("x");

            toolConsole(
                "info",
                "[SW Tool][TEST] Moc Zodiaku — X po gotowym a:602.",
                {
                    x: currentX,
                    y: currentY
                }
            );

            const startedAt = Date.now();
            let clickedAction = false;

            while (
                Date.now() - startedAt <
                timeoutMs
            ) {
                const step =
                    this.currentQuestStep;

                if (
                    step &&
                    this._int(step.qb_id) === id
                ) {
                    return step;
                }

                const actions =
                    this.improvedXQuestActions();

                if (
                    actions.length > 1
                ) {
                    throw new Error(
                        "TEST: Moc Zodiaku otworzyło kilka akcji — nie wybieram automatycznie."
                    );
                }

                if (
                    actions.length === 1 &&
                    !clickedAction
                ) {
                    clickedAction = true;

                    this.clickQuestAction(
                        actions[0],
                        "test-zodiac-start"
                    );
                }

                await this.sleep(50);
            }

            const step =
                this.currentQuestStep;

            if (
                step &&
                this._int(step.qb_id) === id
            ) {
                return step;
            }

            throw new Error(
                "TEST: pole 13|4 było gotowe (a:602), ale X nie otworzył/synchronizował Moc Zodiaku."
            );
        }

        testZodiacQuestFromMapResponse(
            response,
            {
                questId = 1359249,
                x = 13,
                y = 4
            } = {}
        ) {
            if (
                !response ||
                typeof response !== "object" ||
                !response.quests ||
                typeof response.quests !==
                    "object"
            ) {
                return null;
            }

            const id =
                this._int(questId);
            const fieldKey =
                this._int(x) +
                "_" +
                this._int(y);
            const raw =
                response.quests[
                    fieldKey
                ];

            const entries =
                Array.isArray(raw)
                    ? raw
                    : (
                        raw &&
                        typeof raw ===
                            "object"
                            ? [raw]
                            : []
                    );

            const quest =
                entries.find(
                    (entry) =>
                        this._int(
                            entry?.qb_id
                        ) === id
                ) ||
                entries.find(
                    (entry) =>
                        this._int(
                            entry?.qb_id
                        ) > 0 &&
                        String(
                            entry?.name || ""
                        )
                            .toLowerCase()
                            .includes(
                                "moc zodiaku"
                            )
                ) ||
                null;

            if (!quest) {
                return null;
            }

            return {
                quest,
                qbId:
                    this._int(
                        quest.qb_id
                    ),
                x:
                    this._int(x),
                y:
                    this._int(y),
                source:
                    "a:3.quests"
            };
        }

        async loadTestZodiacQuestFromMap(
            questId,
            x,
            y
        ) {
            const id =
                this._int(questId);

            const response =
                await this.sendAndWait(
                    {
                        a: 3,
                        vo: [1, 1, 0]
                    },
                    [3, 999],
                    (event) => {
                        if (
                            this._int(
                                event.e
                            ) !== 0
                        ) {
                            return true;
                        }

                        if (
                            this._int(
                                event.a
                            ) !== 3
                        ) {
                            return false;
                        }

                        return Boolean(
                            this.testZodiacQuestFromMapResponse(
                                event,
                                {
                                    questId:
                                        id,
                                    x,
                                    y
                                }
                            )
                        );
                    },
                    10000
                );

            if (
                this._int(
                    response.e
                ) !== 0
            ) {
                throw new Error(
                    "TEST: serwer odrzucił pobranie mapy questa."
                );
            }

            const found =
                this.testZodiacQuestFromMapResponse(
                    response,
                    {
                        questId:
                            id,
                        x,
                        y
                    }
                );

            if (
                !found ||
                found.qbId <= 0
            ) {
                throw new Error(
                    "TEST: a:3 nie zawiera Moc Zodiaku na polu " +
                    this._int(x) +
                    "|" +
                    this._int(y) +
                    "."
                );
            }

            toolConsole(
                "info",
                "[SW Tool][TEST] Moc Zodiaku znaleziona jak w Roninie — z a:3.quests.",
                {
                    qbId:
                        found.qbId,
                    x:
                        found.x,
                    y:
                        found.y,
                    name:
                        String(
                            found.quest?.name ||
                            ""
                        )
                }
            );

            return found;
        }

        async runTestZodiacQuestDialog(
            questId,
            phase = "start"
        ) {
            const id =
                this._int(questId);

            const opened =
                await this.openTestDailyQuestStep(
                    id
                );

            if (opened.ended) {
                return {
                    ended: true,
                    opened,
                    advanced: null
                };
            }

            if (!opened.step) {
                throw new Error(
                    "TEST: Moc Zodiaku nie zwróciło q_step przy otwarciu okna."
                );
            }

            toolConsole(
                "info",
                "[SW Tool][TEST] Moc Zodiaku — okno otwarte socketowo jak w Roninie.",
                {
                    phase,
                    qbId:
                        this._int(
                            opened.step?.qb_id
                        ),
                    button:
                        String(
                            opened.step
                                ?.buttton1 ||
                            opened.step
                                ?.button1 ||
                            ""
                        ),
                    wantType:
                        this._int(
                            opened.step
                                ?.want?.type
                        ),
                    isMet:
                        Boolean(
                            opened.step
                                ?.want?.is_met
                        )
                }
            );

            const advanced =
                await this.advanceTestDailyQuest(
                    id
                );

            toolConsole(
                "info",
                "[SW Tool][TEST] Moc Zodiaku — Dalej/JASNE wykonane socketowo jak w Roninie.",
                {
                    phase,
                    qbId:
                        id,
                    questEnd:
                        this._int(
                            advanced
                                ?.quest_end
                        ),
                    nextStepId:
                        this._int(
                            advanced
                                ?.q_step
                                ?.qb_id
                        )
                }
            );

            return {
                ended:
                    this._int(
                        advanced
                            ?.quest_end
                    ) === id,
                opened,
                advanced
            };
        }

        async openTestDailyQuestStep(
            questId
        ) {
            const id = this._int(questId);
            if (id <= 0) {
                throw new Error(
                    "TEST: nieprawidłowe ID questa."
                );
            }

            const response =
                await this.sendAndWait(
                    {
                        a: 22,
                        type: 1,
                        id
                    },
                    [22, 999],
                    (event) =>
                        this._int(event.e) !== 0 ||
                        (
                            this._int(event.a) === 22 &&
                            (
                                this._int(
                                    event?.q_step?.qb_id
                                ) === id ||
                                this._int(
                                    event?.quest_end
                                ) === id
                            )
                        ),
                    10000
                );

            if (this._int(response.e) !== 0) {
                throw new Error(
                    "TEST: serwer odrzucił otwarcie questa."
                );
            }

            return {
                response,
                step:
                    response?.q_step &&
                    typeof response.q_step ===
                        "object"
                        ? response.q_step
                        : null,
                ended:
                    this._int(
                        response?.quest_end
                    ) === id
            };
        }

        async advanceTestDailyQuest(
            questId
        ) {
            const id = this._int(questId);

            const response =
                await this.sendAndWait(
                    {
                        a: 22,
                        type: 2,
                        button: 1,
                        id
                    },
                    [22, 999],
                    (event) => {
                        if (
                            this._int(
                                event.e
                            ) !== 0
                        ) {
                            return true;
                        }

                        if (
                            this._int(
                                event.a
                            ) !== 22
                        ) {
                            return false;
                        }

                        if (
                            this._int(
                                event?.quest_end
                            ) === id
                        ) {
                            return true;
                        }

                        if (
                            event.q_step &&
                            typeof event.q_step ===
                                "object"
                        ) {
                            return (
                                this._int(
                                    event.q_step.qb_id
                                ) === id
                            );
                        }

                        if (
                            event.quest_move &&
                            typeof event.quest_move ===
                                "object"
                        ) {
                            return (
                                this._int(
                                    event.quest_move
                                        .qb_id
                                ) === id
                            );
                        }

                        const lists = [
                            event.track,
                            event.tracked
                        ].filter(
                            Array.isArray
                        );

                        return lists.some(
                            (list) =>
                                list.some(
                                    (entry) =>
                                        this._int(
                                            entry
                                                ?.qb_id ||
                                            entry
                                                ?.qbid ||
                                            entry
                                                ?.id
                                        ) === id
                                )
                        );
                    },
                    10000
                );

            if (this._int(response.e) !== 0) {
                throw new Error(
                    "TEST: serwer odrzucił przejście questa."
                );
            }

            return response;
        }

        async prepareTestZodiacQuest(
            questId
        ) {
            const id = this._int(questId);

            for (
                let transition = 0;
                transition < 4;
                transition++
            ) {
                let step;

                if (transition === 0) {
                    step =
                        await this.startOrOpenTestDailyQuest(
                            id
                        );
                } else {
                    const opened =
                        await this.openTestDailyQuestStep(
                            id
                        );

                    if (opened.ended) {
                        return {
                            done: true,
                            step: null
                        };
                    }

                    step = opened.step;
                }

                const want = step?.want;

                if (
                    want &&
                    typeof want === "object"
                ) {
                    const type =
                        this._int(want.type);
                    const isMet =
                        Boolean(want.is_met) ||
                        (
                            this._int(want.maxv) >
                                0 &&
                            this._int(want.count) >=
                                this._int(
                                    want.maxv
                                )
                        );

                    if (type === 5) {
                        return {
                            done: false,
                            step,
                            itemReady: isMet
                        };
                    }

                    if (!isMet) {
                        throw new Error(
                            "TEST: Moc Zodiaku ma nieoczekiwany niezakończony warunek type " +
                            type +
                            "."
                        );
                    }
                }

                const advanced =
                    await this.advanceTestDailyQuest(
                        id
                    );

                if (
                    this._int(
                        advanced?.quest_end
                    ) === id
                ) {
                    return {
                        done: true,
                        step: null
                    };
                }

                await this.sleep(250);
            }

            throw new Error(
                "TEST: nie udało się doprowadzić Moc Zodiaku do etapu zdobycia kryształu."
            );
        }

        async finishTestZodiacQuest(
            questId
        ) {
            const id =
                this._int(questId);
            const questX = 13;
            const questY = 4;

            // Tak jak w działającym Roninie po etapie mobów:
            // najpierw odświeżamy klientowe okno przez X. Nie wystarcza
            // samo a:22/type:1, bo ono nie zawsze przebudowuje UI klienta.
            const field =
                await this.waitForQuestKillField(
                    questX,
                    questY,
                    3000
                );

            if (!field) {
                throw new Error(
                    "TEST: po powrocie na 13|4 klient nie przygotował pola questa (brak a:602)."
                );
            }

            this.currentQuestStep = null;

            this.setQuickPanelStatus(
                "TEST: Moc Zodiaku — otwieram końcowe okno przez X..."
            );

            this.roninPressKey("x");

            const action =
                await this.waitForSingleQuestAction(
                    5000,
                    {
                        failOnMultiple: true
                    }
                );

            if (!action) {
                throw new Error(
                    "TEST: po X na 13|4 nie pojawiło się końcowe okno Moc Zodiaku."
                );
            }

            const actionType =
                this.questActionType(
                    action
                );
            const actionText =
                String(
                    action.textContent ||
                    ""
                ).trim();

            if (
                actionType !== "next"
            ) {
                throw new Error(
                    "TEST: końcowe okno nie ma akcji Dalej/JASNE (znaleziono: " +
                    actionText +
                    ")."
                );
            }

            toolConsole(
                "info",
                "[SW Tool][TEST] Końcowe okno Moc Zodiaku otwarte.",
                {
                    text:
                        actionText,
                    type:
                        actionType,
                    x:
                        questX,
                    y:
                        questY
                }
            );

            // Po fizycznym otwarciu okna pobieramy świeży stan serwerowy.
            const opened =
                await this.openTestDailyQuestStep(
                    id
                );

            if (opened.ended) {
                return true;
            }

            const want =
                opened.step?.want;
            const count =
                Math.max(
                    0,
                    this._int(
                        want?.count
                    )
                );
            const max =
                Math.max(
                    0,
                    this._int(
                        want?.maxv
                    ),
                    this._int(
                        want?.amount
                    )
                );
            const isMet =
                Boolean(
                    want?.is_met
                ) ||
                (
                    max > 0 &&
                    count >= max
                );

            if (
                want &&
                typeof want ===
                    "object" &&
                this._int(
                    want.type
                ) === 5 &&
                !isMet
            ) {
                throw new Error(
                    "TEST: końcowe okno pokazuje niezakończony warunek Moc Zodiaku (" +
                    count +
                    "/" +
                    max +
                    ")."
                );
            }

            this.setQuickPanelStatus(
                "TEST: Moc Zodiaku — końcowe Dalej..."
            );

            // Końcowe potwierdzenie czeka już wyłącznie na quest_end
            // dla dokładnie tego qb_id, żeby nie złapać pobocznego a:22.
            const response =
                await this.sendAndWait(
                    {
                        a: 22,
                        type: 2,
                        button: 1,
                        id
                    },
                    [22, 999],
                    (event) =>
                        this._int(
                            event.e
                        ) !== 0 ||
                        (
                            this._int(
                                event.a
                            ) === 22 &&
                            this._int(
                                event
                                    ?.quest_end
                            ) === id
                        ),
                    10000
                );

            if (
                this._int(
                    response.e
                ) !== 0
            ) {
                throw new Error(
                    "TEST: serwer odrzucił końcowe Dalej Moc Zodiaku."
                );
            }

            if (
                this._int(
                    response
                        ?.quest_end
                ) !== id
            ) {
                throw new Error(
                    "TEST: brak quest_end po końcowym Dalej Moc Zodiaku."
                );
            }

            toolConsole(
                "info",
                "[SW Tool][TEST] Moc Zodiaku — końcowe Dalej potwierdzone quest_end.",
                {
                    questId:
                        id
                }
            );

            return true;
        }

        async runTestZodiacExpSweep(
            initialStep,
            {
                respawnWaitMs =
                    3 * 60 * 1000
            } = {}
        ) {
            const map =
                this.mapSolver?.map;

            if (
                !map ||
                this._int(
                    map.locationId
                ) <= 0 ||
                this._int(map.x) <= 0 ||
                this._int(map.y) <= 0
            ) {
                throw new Error(
                    "TEST: brak gotowej mapy Terenu Zachodniego."
                );
            }

            const parsed =
                this.questKillWantState(
                    initialStep?.want,
                    initialStep?.qb_id,
                    [5]
                );

            if (!parsed) {
                throw new Error(
                    "TEST: brak konfiguracji celu Nienasyconego Kryształu."
                );
            }

            const state = {
                questId:
                    parsed.questId,
                stepId:
                    this._int(
                        initialStep?.qb_id
                    ),
                wantType:
                    parsed.wantType,
                allowedWantTypes:
                    [5],
                targetId:
                    parsed.targetId,
                targetName:
                    parsed.targetName,
                count:
                    parsed.count,
                max:
                    parsed.max,
                rounds: 0,
                moves: 0,
                visited: 0,
                fights: 0,
                singleFights: 0,
                removed: 0
            };

            this.pveActionPointsExhausted =
                false;
            this.questKillRunning =
                true;
            this.questKillState =
                state;
            this.startQuestKillDomObserver();
            this.syncPveModeButtons();

            try {
                while (
                    state.count <
                        state.max &&
                    !this.pveActionPointsExhausted
                ) {
                    state.rounds++;

                    const currentMap =
                        this.mapSolver?.map;

                    const plan =
                        this.expSweepSegmentPlan(
                            currentMap,
                            this._int(
                                currentMap?.x
                            ),
                            this._int(
                                currentMap?.y
                            )
                        );

                    if (
                        !plan ||
                        !plan.firstSegment
                    ) {
                        throw new Error(
                            "TEST: Expiarka nie zbudowała planu sweepu Terenu Zachodniego."
                        );
                    }

                    const visited =
                        new Set();
                    const visitedSegments =
                        new Set();

                    const visitField =
                        async (
                            point
                        ) => {
                            const key =
                                this._int(
                                    point.x
                                ) +
                                "_" +
                                this._int(
                                    point.y
                                );

                            if (
                                visited.has(
                                    key
                                )
                            ) {
                                return;
                            }

                            visited.add(key);
                            state.visited++;

                            const cleared =
                                await this.questKillClearCurrentField(
                                    state,
                                    {
                                        x:
                                            this._int(
                                                point.x
                                            ),
                                        y:
                                            this._int(
                                                point.y
                                            )
                                    }
                                );

                            state.fights +=
                                this._int(
                                    cleared?.fights
                                );
                            state.singleFights +=
                                this._int(
                                    cleared
                                        ?.singleFights
                                );
                            state.removed +=
                                this._int(
                                    cleared?.removed
                                );
                        };

                    const moveOne =
                        async (
                            target,
                            source =
                                "test-zodiac-exp-segment"
                        ) => {
                            if (
                                state.count >=
                                state.max
                            ) {
                                return false;
                            }

                            const moved =
                                await this.mapSolver
                                    .navigateTo(
                                        target.x,
                                        target.y,
                                        {
                                            source,
                                            allowBusy:
                                                true
                                        }
                                    );

                            if (!moved?.ok) {
                                throw new Error(
                                    "TEST: ruch sweepu Expiarki nie powiódł się."
                                );
                            }

                            state.moves++;

                            await visitField({
                                x:
                                    this._int(
                                        this.mapSolver
                                            ?.map?.x
                                    ),
                                y:
                                    this._int(
                                        this.mapSolver
                                            ?.map?.y
                                    )
                            });

                            return (
                                state.count <
                                state.max
                            );
                        };

                    const moveTo =
                        async (
                            target,
                            bridge = false
                        ) => {
                            while (
                                state.count <
                                    state.max &&
                                !this
                                    .pveActionPointsExhausted
                            ) {
                                const current = {
                                    x:
                                        this._int(
                                            this
                                                .mapSolver
                                                ?.map?.x
                                        ),
                                    y:
                                        this._int(
                                            this
                                                .mapSolver
                                                ?.map?.y
                                        )
                                };

                                if (
                                    current.x ===
                                        target.x &&
                                    current.y ===
                                        target.y
                                ) {
                                    return true;
                                }

                                const path =
                                    this.mapSolver
                                        .findShortestPath(
                                            currentMap,
                                            current,
                                            target
                                        );

                                if (
                                    !path ||
                                    path.length ===
                                        0
                                ) {
                                    return false;
                                }

                                if (
                                    !await moveOne(
                                        path[0],
                                        bridge
                                            ? "test-zodiac-exp-bridge"
                                            : "test-zodiac-exp-segment"
                                    )
                                ) {
                                    return false;
                                }
                            }

                            return false;
                        };

                    this.setQuickPanelStatus(
                        "TEST: Moc Zodiaku — sweep Expiarki " +
                        state.rounds +
                        " • " +
                        plan.orientation +
                        " • segmenty " +
                        plan.segments.length +
                        "."
                    );

                    await visitField({
                        x:
                            this._int(
                                currentMap?.x
                            ),
                        y:
                            this._int(
                                currentMap?.y
                            )
                    });

                    let currentSegment =
                        plan.firstSegment;
                    let previousSegment =
                        null;
                    let laneDirection = 1;

                    while (
                        state.count <
                            state.max &&
                        visitedSegments.size <
                            plan.segments.length &&
                        !this
                            .pveActionPointsExhausted
                    ) {
                        if (
                            visitedSegments.has(
                                currentSegment.id
                            )
                        ) {
                            const currentPoint = {
                                x:
                                    this._int(
                                        this
                                            .mapSolver
                                            ?.map?.x
                                    ),
                                y:
                                    this._int(
                                        this
                                            .mapSolver
                                            ?.map?.y
                                    )
                            };
                            const fallback =
                                this.expNearestUnvisitedSegment(
                                    plan,
                                    currentPoint,
                                    visitedSegments
                                );

                            if (!fallback) {
                                break;
                            }

                            currentSegment =
                                fallback.segment;

                            if (
                                !await moveTo(
                                    this.expSegmentEndpoint(
                                        currentSegment,
                                        fallback.side
                                    ),
                                    true
                                )
                            ) {
                                break;
                            }
                        }

                        const currentPoint = {
                            x:
                                this._int(
                                    this.mapSolver
                                        ?.map?.x
                                ),
                            y:
                                this._int(
                                    this.mapSolver
                                        ?.map?.y
                                )
                        };
                        const entrySide =
                            this.expSegmentNearestEnd(
                                currentSegment,
                                currentPoint
                            );
                        const exitSide =
                            entrySide === "min"
                                ? "max"
                                : "min";
                        const entry =
                            this.expSegmentEndpoint(
                                currentSegment,
                                entrySide
                            );

                        if (
                            currentPoint.x !==
                                entry.x ||
                            currentPoint.y !==
                                entry.y
                        ) {
                            if (
                                !await moveTo(
                                    entry,
                                    true
                                )
                            ) {
                                break;
                            }
                        }

                        const orderedCells =
                            entrySide === "min"
                                ? currentSegment
                                      .cells
                                : [
                                    ...currentSegment
                                        .cells
                                ].reverse();

                        for (
                            const cell of
                            orderedCells
                        ) {
                            if (
                                state.count >=
                                    state.max ||
                                this
                                    .pveActionPointsExhausted
                            ) {
                                break;
                            }

                            const x =
                                this._int(
                                    this.mapSolver
                                        ?.map?.x
                                );
                            const y =
                                this._int(
                                    this.mapSolver
                                        ?.map?.y
                                );

                            if (
                                x === cell.x &&
                                y === cell.y
                            ) {
                                await visitField(
                                    cell
                                );
                                continue;
                            }

                            if (
                                !await moveOne(
                                    cell
                                )
                            ) {
                                break;
                            }
                        }

                        if (
                            state.count >=
                                state.max
                        ) {
                            break;
                        }

                        visitedSegments.add(
                            currentSegment.id
                        );

                        const exitPoint =
                            this.expSegmentEndpoint(
                                currentSegment,
                                exitSide
                            );

                        let nextSegment =
                            this.expSelectNextSegment(
                                plan,
                                currentSegment,
                                previousSegment,
                                exitPoint,
                                visitedSegments,
                                laneDirection
                            );

                        if (nextSegment) {
                            const newDirection =
                                Math.sign(
                                    nextSegment.lane -
                                    currentSegment.lane
                                );

                            previousSegment =
                                currentSegment;
                            currentSegment =
                                nextSegment;

                            if (
                                newDirection !==
                                0
                            ) {
                                laneDirection =
                                    newDirection;
                            }
                        } else {
                            const fallback =
                                this.expNearestUnvisitedSegment(
                                    plan,
                                    exitPoint,
                                    visitedSegments
                                );

                            if (!fallback) {
                                break;
                            }

                            previousSegment =
                                currentSegment;
                            currentSegment =
                                fallback.segment;

                            if (
                                !await moveTo(
                                    this.expSegmentEndpoint(
                                        currentSegment,
                                        fallback.side
                                    ),
                                    true
                                )
                            ) {
                                break;
                            }

                            const delta =
                                currentSegment.lane -
                                previousSegment.lane;

                            if (delta !== 0) {
                                laneDirection =
                                    Math.sign(
                                        delta
                                    );
                            }
                        }
                    }

                    if (
                        state.count >=
                        state.max
                    ) {
                        break;
                    }

                    if (
                        this
                            .pveActionPointsExhausted
                    ) {
                        break;
                    }

                    const waitMs =
                        Math.max(
                            0,
                            this._int(
                                respawnWaitMs
                            )
                        );

                    this.setQuickPanelStatus(
                        "TEST: brak dropu po sweepie " +
                        state.rounds +
                        " — czekam 3 min na resp mobów."
                    );

                    if (waitMs > 0) {
                        await this.sleep(
                            waitMs
                        );
                    }
                }
            } finally {
                this.stopQuestKillDomObserver();
                this.questKillRunning =
                    false;
                this.questKillState =
                    null;
                this.syncPveModeButtons();
            }

            if (
                this.pveActionPointsExhausted
            ) {
                return {
                    ...state,
                    done: false,
                    stopped: true,
                    reason:
                        "no-action-points"
                };
            }

            return {
                ...state,
                done:
                    state.count >=
                    state.max
            };
        }

        async runTestDailyMissions({
            allowAccountOperation = false
        } = {}) {
            if (
                this.quickActionRunning ||
                (
                    this.accountOperationRunning &&
                    !allowAccountOperation
                ) ||
                this.questKillRunning ||
                this.pickupQuestRunning ||
                this.respawnRunning ||
                this.expRunning ||
                this.dailyRewardClaimStage !== 0 ||
                this.characterSwitch ||
                this.responseWaiter ||
                this.mapSolver?.active
            ) {
                throw new Error(
                    "TEST: poczekaj na zakończenie bieżącej operacji."
                );
            }

            if (!this.mapSolver) {
                throw new Error(
                    "TEST: solver mapy nie jest dostępny."
                );
            }

            const HIDDEN_VILLAGE = 2;
            const WESTERN_AREA = 11;
            const ZODIAC_QUEST = 1359249;
            const QUEST_X = 13;
            const QUEST_Y = 4;

            this.quickActionRunning = true;
            this.setQuickPanelBusy(true);

            try {
                if (!this.mapSolver.map) {
                    this.setQuickPanelStatus(
                        "TEST: pobieram aktualną mapę..."
                    );
                    await this.mapSolver.refreshMap();
                }

                this.setQuickPanelStatus(
                    "TEST: Moc Zodiaku — idę do Ukrytej Wioski 13|4..."
                );

                await this.mapSolver.navigateToLocation(
                    HIDDEN_VILLAGE,
                    QUEST_X,
                    QUEST_Y,
                    {
                        source:
                            "test-zodiac-start"
                    }
                );

                this.setQuickPanelStatus(
                    "TEST: Moc Zodiaku — pobieram quest z mapy jak Ronin..."
                );

                const mapQuest =
                    await this.loadTestZodiacQuestFromMap(
                        ZODIAC_QUEST,
                        QUEST_X,
                        QUEST_Y
                    );

                this.setQuickPanelStatus(
                    "TEST: Moc Zodiaku — otwieram okno socketowo..."
                );

                await this.runTestZodiacQuestDialog(
                    mapQuest.qbId,
                    "start"
                );

                this.setQuickPanelStatus(
                    "TEST: Moc Zodiaku — JASNE! zaakceptowane przez serwer, idę na Teren Zachodni i biję do dropu..."
                );

                await this.mapSolver.navigateToLocation(
                    WESTERN_AREA,
                    18,
                    8,
                    {
                        source:
                            "test-zodiac-west"
                    }
                );

                // To nie jest potwierdzenie stanu questa — wyłącznie lokalna
                // konfiguracja nasłuchu dla istniejącego patrolu Quest Kille.
                // Koniec farmienia nastąpi dopiero, gdy serwer wyśle progres
                // trackera 1359249 do 1/1.
                const zodiacStep = {
                    qb_id:
                        ZODIAC_QUEST,
                    header:
                        "Moc Zodiaku",
                    want: {
                        qbid:
                            ZODIAC_QUEST,
                        type: 5,
                        id: 31,
                        amount: 1,
                        is_met: false,
                        tl: 0,
                        name:
                            "Nienasycony Kryształ",
                        name2:
                            "Obcy Ninja",
                        count: 0,
                        maxv: 1,
                        trackable: 1
                    }
                };

                const farm =
                    await this.runTestZodiacExpSweep(
                        zodiacStep,
                        {
                            respawnWaitMs:
                                3 * 60 * 1000
                        }
                    );

                if (!farm?.done) {
                    throw new Error(
                        "TEST: farmienie zakończyło się bez serwerowego potwierdzenia dropu Nienasyconego Kryształu."
                    );
                }

                toolConsole(
                    "info",
                    "[SW Tool][TEST] Moc Zodiaku — serwer potwierdził drop.",
                    {
                        questId:
                            ZODIAC_QUEST,
                        count:
                            this._int(
                                farm.count
                            ),
                        max:
                            this._int(
                                farm.max
                            ),
                        rounds:
                            this._int(
                                farm.rounds
                            )
                    }
                );

                this.setQuickPanelStatus(
                    "TEST: Moc Zodiaku — wracam do Ukrytej Wioski 13|4..."
                );

                await this.mapSolver.navigateToLocation(
                    HIDDEN_VILLAGE,
                    QUEST_X,
                    QUEST_Y,
                    {
                        source:
                            "test-zodiac-return"
                    }
                );

                this.setQuickPanelStatus(
                    "TEST: Moc Zodiaku — otwieram końcowe okno i robię Dalej..."
                );

                await this.finishTestZodiacQuest(
                    ZODIAC_QUEST
                );

                this.setQuickPanelStatus(
                    "TEST: Moc Zodiaku zakończone ✓",
                    "success"
                );

                toolConsole(
                    "info",
                    "[SW Tool][TEST] Moc Zodiaku zakończone.",
                    {
                        questId:
                            ZODIAC_QUEST,
                        locationId:
                            this._int(
                                this.mapSolver?.map
                                    ?.locationId
                            ),
                        x:
                            this._int(
                                this.mapSolver?.map?.x
                            ),
                        y:
                            this._int(
                                this.mapSolver?.map?.y
                            )
                    }
                );

                return {
                    status: "done",
                    questId:
                        ZODIAC_QUEST
                };
            } finally {
                this.quickActionRunning = false;

                if (!allowAccountOperation) {
                    this.setQuickPanelBusy(false);
                }
            }
        }

        async runQuickAction(action) {
            if (
                this.quickActionRunning ||
                this.accountOperationRunning ||
                this.questKillRunning ||
                this.pickupQuestRunning ||
                this.respawnRunning ||
                this.expRunning ||
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
            this.quickActionName = action;
            this.quickActionRunning = true;
            this.setQuickPanelBusy(true);

            try {
                if (action === "all") {
                    const result =
                        await this.runQuickAllForCurrentCharacter(
                            label
                        );

                    this.setQuickPanelStatus(
                        result.summary.join(" • "),
                        result.warnings.length > 0
                            ? ""
                            : "success"
                    );
                    return;
                }

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

                    if (result.status === "skipped") {
                        this.setQuickPanelStatus(
                            "Ronin pominięty: " +
                            result.reason +
                            "."
                        );
                    } else {
                        this.setQuickPanelStatus(
                            "Ronin wykonany " +
                            result.attempts +
                            "x (" +
                            result.used +
                            "/" +
                            result.limit +
                            ").",
                            "success"
                        );
                    }
                    return;
                }

                throw new Error(
                    "Nieznana szybka akcja: " + String(action)
                );
            } catch (error) {
                toolConsole("error", 
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
                this.quickActionName = null;
                this.setQuickPanelBusy(false);
            }
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

            toolConsole("info", "[SW Tool][ACCOUNT] RX GR:", {
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

                    toolConsole("info", "[SW Tool][ACCOUNT] TX GA:", safeOrder);

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
            forceRefresh = false,
            retryAttempt = 0
        ) {
            const targetId = Number(charId);
            if (targetId <= 0) {
                throw new Error("Nieprawidłowe ID postaci.");
            }

            if (
                !forceRefresh &&
                Number(
                    GAME.char_id ||
                    this.currentCharacterId ||
                    0
                ) === targetId &&
                this.currentCharacterSnapshot?.char_data
            ) {
                return this.currentCharacterSnapshot;
            }

            const maxAttempts = 3;
            const attempt = Math.max(
                0,
                this._int(retryAttempt)
            ) + 1;

            this.setQuickPanelStatus(
                "Zmiana postaci: " +
                targetId +
                " — próba " +
                attempt +
                "/" +
                maxAttempts +
                "..."
            );

            // Operacje całego konta naśladują synchronizację z APP:
            // a:5 -> lista a:1 -> wybór a:2 -> pełne char_data.
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
                throw new Error(
                    "Serwer nie zwrócił listy postaci."
                );
            }

            const targetExists = listResponse.chars.some(
                (char) =>
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

            let response;

            try {
                response = await this.sendAndWait(
                    { a: 2, char_id: targetId },
                    [2, 999],
                    (event) =>
                        this._int(event.e) !== 0 ||
                        (
                            this._int(event.a) === 2 &&
                            this._int(
                                event.char_id || targetId
                            ) === targetId &&
                            event.char_data &&
                            typeof event.char_data ===
                                "object"
                        ),
                    10000
                );
            } catch (error) {
                const activeId = Number(
                    GAME.char_id ||
                    this.currentCharacterId ||
                    0
                );
                const snapshotId = this._int(
                    this.currentCharacterSnapshot?.char_id ||
                    this.currentCharacterSnapshot
                        ?.char_data?.id
                );

                // Odpowiedź a:2 mogła dotrzeć tuż przy granicy timeoutu.
                // Jeżeli klient i snapshot już wskazują właściwą postać,
                // uznajemy przełączenie za zakończone zamiast dublować a:2.
                if (
                    activeId === targetId &&
                    snapshotId === targetId &&
                    this.currentCharacterSnapshot?.char_data
                ) {
                    response =
                        this.currentCharacterSnapshot;

                    toolConsole("info", 
                        "[SW Tool][ACCOUNT] a:2 potwierdzone stanem klienta po timeout.",
                        {
                            char_id: targetId,
                            attempt
                        }
                    );
                } else if (attempt < maxAttempts) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : String(error);

                    toolConsole("warn", 
                        "[SW Tool][ACCOUNT] Zmiana postaci nie została potwierdzona — ponawiam synchronizację.",
                        {
                            char_id: targetId,
                            attempt,
                            error: message
                        }
                    );

                    this.setQuickPanelStatus(
                        "Zmiana postaci " +
                        targetId +
                        ": brak odpowiedzi, ponawiam...",
                        "error"
                    );

                    await this.sleep(300);

                    return this.switchCharacterForAccountAction(
                        targetId,
                        settleMs,
                        true,
                        attempt
                    );
                } else {
                    throw new Error(
                        "Nie udało się przełączyć na postać " +
                        targetId +
                        " po " +
                        maxAttempts +
                        " próbach. Ostatni błąd: " +
                        (
                            error instanceof Error
                                ? error.message
                                : String(error)
                        )
                    );
                }
            }

            if (this._int(response.e) !== 0) {
                throw new Error(
                    "Serwer odrzucił zmianę postaci."
                );
            }

            if (
                !response.char_data ||
                typeof response.char_data !== "object"
            ) {
                throw new Error(
                    "Serwer nie zwrócił pełnych danych postaci."
                );
            }

            this.currentCharacterSnapshot = response;
            this.lastCharacterId = targetId;
            this.currentCharacterId = targetId;
            this.currentCharacterIndex =
                this.chars.findIndex(
                    (char) =>
                        Number(char.id) === targetId
                );

            await this.waitForCharacterSettled(
                targetId,
                3000,
                settleMs
            );

            toolConsole("info", 
                "[SW Tool][ACCOUNT] Postać gotowa:",
                {
                    char_id: targetId,
                    attempt
                }
            );

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
                toolConsole("info", 
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

                toolConsole("info", 
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

                toolConsole("warn", 
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

        preferenceForCurrentCharacter() {
            const id = Number(GAME.char_id || this.currentCharacterId || 0);
            if (!Number.isSafeInteger(id) || id <= 0) return null;
            return this.characterPreferences[String(id)] || null;
        }

        preferredAfterAll() {
            const mode = this.preferenceForCurrentCharacter()?.afterAll;
            // Brak indywidualnej preferencji zawsze oznacza trening,
            // niezależnie od ustawienia sprzed usunięcia opcji z pulpitu.
            return mode !== "mission";
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

            // Preferencja jest przypisana do ID postaci, a nie do sesji.
            // Dla niedostępnej umiejętności pozostaje stary wybór automatyczny.
            const selected = Number(this.preferenceForCurrentCharacter()?.trainingSkill || 0);
            const field = skills.find(([id]) => id === selected)?.[1];
            if (field && this._int(character[field]) > 0) return selected;

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
                toolConsole("warn", "[SW Tool][ACCOUNT] Przywrócenie postaci:", error);
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

                    toolConsole("info", "[SW Tool][ACCOUNT] Turnieje " + (i + 1) + "/" + characters.length + ": " + label);

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
                        toolConsole("warn", "[SW Tool][ACCOUNT] Turnieje — " + label + ":", error);
                    }
                }
            } finally {
                await this.restoreAccountCharacter(originalId);
            }

            toolConsole("info", "[SW Tool][ACCOUNT] Turnieje zakończone:", {
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
                        toolConsole("info", 
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

            toolConsole("info", "[SW Tool][ACCOUNT] Sprawdzenie Turnstile:", {
                character: characterName,
                required: captchaRequired
            });

            if (captchaRequired) {
                toolConsole("info", 
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
                    toolConsole("info", "[SW Tool][ACCOUNT] Treningi " + (i + 1) + "/" + characters.length + ": " + label);

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
                        toolConsole("warn", "[SW Tool][ACCOUNT] Treningi — " + label + ":", error);
                    } finally {
                        // Nie przechodzimy od razu do kolejnego a:5/a:2.
                        await this.sleep(200);
                    }
                }
            } finally {
                await this.restoreAccountCharacter(originalId);
            }

            toolConsole("info", "[SW Tool][ACCOUNT] Treningi zakończone:", {
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
                    toolConsole("warn", 
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
                    toolConsole("info", "[SW Tool][ACCOUNT] Arena PvP " + (i + 1) + "/" + characters.length + ": " + label);

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
                        toolConsole("warn", "[SW Tool][ACCOUNT] Arena PvP — " + label + ":", error);
                    } finally {
                        // Zostawiamy 200 ms po zakończeniu pracy na postaci,
                        // zanim rozpocznie się kolejne a:5/a:2.
                        await this.sleep(200);
                    }
                }
            } finally {
                await this.restoreAccountCharacter(originalId);
            }

            toolConsole("info", "[SW Tool][ACCOUNT] Arena PvP zakończona:", {
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
                    toolConsole("info", "[SW Tool][ACCOUNT] Otchłań " + (i + 1) + "/" + characters.length + ": " + label);

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
                        toolConsole("warn", "[SW Tool][ACCOUNT] Otchłań — " + label + ":", error);
                    } finally {
                        // 200 ms przed kolejną zmianą postaci.
                        await this.sleep(200);
                    }
                }
            } finally {
                await this.restoreAccountCharacter(originalId);
            }

            toolConsole("info", "[SW Tool][ACCOUNT] Otchłań zakończona:", {
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

                    toolConsole("info", 
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
                            toolConsole("info", 
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

                            toolConsole("info", 
                                "[SW Tool][ACCOUNT] Misje — " +
                                label +
                                ": " +
                                result.message
                            );
                        } else {
                            skipped++;

                            toolConsole("info", 
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
                        toolConsole("warn", 
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

            toolConsole("info", "[SW Tool][ACCOUNT] Misje zakończone:", {
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
            let levelSkipped = 0;
            let failed = 0;
            let dailyClaimed = 0;

            const runsByCharacter =
                new Map(
                    characters.map(
                        (char) => [
                            Number(char.id),
                            0
                        ]
                    )
                );

            const dailyUsageByCharacter =
                new Map(
                    characters.map(
                        (char) => [
                            Number(char.id),
                            null
                        ]
                    )
                );

            const roninAccountReasons = new Map();

            try {
                for (let i = 0; i < characters.length; i++) {
                    const char = characters[i];
                    const id = Number(char.id);
                    const label =
                        char.name || ("#" + id);

                    toolConsole("info", 
                        "[SW Tool][ACCOUNT] Ronin " +
                        (i + 1) +
                        "/" +
                        characters.length +
                        ": " +
                        label
                    );

                    try {
                        // Wymuszamy świeże a:5 -> a:2 także dla już
                        // aktywnej postaci. Dzięki temu icd_5 uwzględnia
                        // ewentualny reset dzienny o 00:00.
                        await this.switchCharacterForAccountAction(
                            id,
                            0,
                            true
                        );

                        if (
                            await this.claimDailyRewardForAccountAction(label)
                        ) {
                            dailyClaimed++;
                        }

                        const level = this._int(
                            this.currentCharacterSnapshot?.char_data?.level
                        );
                        const requiredLevel = this.roninRequiredLevel();
                        let used =
                            this.roninDailyUsage();

                        dailyUsageByCharacter.set(
                            id,
                            used
                        );

                        if (level < requiredLevel) {
                            skipped++;
                            levelSkipped++;
                            roninAccountReasons.set(
                                id,
                                "poziom " + level + "/" + requiredLevel
                            );
                            toolConsole("info", 
                                "[SW Tool][ACCOUNT] Ronin — " +
                                label +
                                ": pominięto, poziom " +
                                level +
                                "/" +
                                requiredLevel +
                                "."
                            );
                            continue;
                        }

                        if (used >= dailyLimit) {
                            skipped++;
                            roninAccountReasons.set(id, "limit wykorzystany");
                            toolConsole("info", 
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

                        const initialUsed = used;
                        const plannedAttempts = Math.max(
                            0,
                            dailyLimit - initialUsed
                        );
                        let attemptsForCharacter = 0;

                        for (
                            let attemptIndex = 0;
                            attemptIndex <
                                plannedAttempts;
                            attemptIndex++
                        ) {
                            const attempt =
                                initialUsed +
                                attemptIndex +
                                1;

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

                            toolConsole("info", 
                                "[SW Tool][ACCOUNT] Ronin — " +
                                label +
                                ": start próby " +
                                attempt +
                                "/" +
                                dailyLimit +
                                "."
                            );

                            await this.runSingleRoninAttempt();
                            completed++;
                            attemptsForCharacter++;

                            runsByCharacter.set(
                                id,
                                (
                                    runsByCharacter.get(
                                        id
                                    ) || 0
                                ) + 1
                            );

                            const expectedUsed =
                                Math.min(
                                    dailyLimit,
                                    initialUsed +
                                        attemptsForCharacter
                                );

                            // Po a:777 najpierw potwierdzamy wyjście z
                            // instancji; dopiero potem odczytujemy icd_5.
                            await this.ensureRoninReturned(id);

                            try {
                                used =
                                    await this.confirmRoninDailyUsage(
                                        id,
                                        expectedUsed
                                    );
                                dailyUsageByCharacter.set(id, used);
                            } catch (error) {
                                const message =
                                    error instanceof Error
                                        ? error.message
                                        : String(error);
                                if (
                                    !message.includes(
                                        "serwer nie potwierdził zwiększenia licznika dziennego"
                                    )
                                ) {
                                    throw error;
                                }

                                used = this.roninDailyUsage();
                                dailyUsageByCharacter.set(id, used);
                                roninAccountReasons.set(
                                    id,
                                    "niepotwierdzony icd_5 po zakończonym Roninie"
                                );
                                toolConsole(
                                    "warn",
                                    "[SW Tool][ACCOUNT] Ronin: a:777 potwierdzone, icd_5 opóźnione.",
                                    { label, id, expectedUsed, used }
                                );
                            }

                            if (
                                used > expectedUsed &&
                                attemptsForCharacter <
                                    plannedAttempts
                            ) {
                                toolConsole(
                                    "warn",
                                    "[SW Tool][ACCOUNT] Ronin — icd_5 przeskoczył przed końcem zaplanowanych prób; wykonuję pozostałe wejścia.",
                                    {
                                        character: label,
                                        charId: id,
                                        initialUsed,
                                        expectedUsed,
                                        reportedUsed: used,
                                        plannedAttempts,
                                        attemptsForCharacter
                                    }
                                );
                            }

                            // Kolejna próba dopiero po potwierdzonym powrocie.
                            toolConsole("info", 
                                "[SW Tool][ACCOUNT] Ronin — " +
                                label +
                                ": próba zakończona, serwer raportuje " +
                                used +
                                "/" +
                                dailyLimit +
                                ", plan " +
                                attemptsForCharacter +
                                "/" +
                                plannedAttempts +
                                "."
                            );
                        }
                    } catch (error) {
                        if (
                            this.isFatalAccountError(error) ||
                            error?.swToolUnsafeRoninReturn
                        ) {
                            toolConsole(
                                "error",
                                "[SW Tool][ACCOUNT] Zatrzymuję konto: Ronin nie wrócił bezpiecznie.",
                                error
                            );
                            throw error;
                        }

                        failed++;
                        const reason =
                            error instanceof Error
                                ? error.message
                                : String(error);
                        roninAccountReasons.set(id, "BŁĄD: " + reason);
                        toolConsole("warn",
                            "[SW Tool][ACCOUNT] Ronin — " +
                            label + ": " + reason,
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
                const sync = this.roninReturnSync;
                if (
                    sync?.enteredMap &&
                    !sync.confirmed
                ) {
                    toolConsole(
                        "warn",
                        "[SW Tool][ACCOUNT] Nie przywracam postaci — powrót z Ronina nie został potwierdzony.",
                        {
                            characterId: sync.characterId,
                            originLocationId: sync.originLocationId,
                            finishedAt: sync.finishedAt
                        }
                    );
                } else {
                    await this.restoreAccountCharacter(originalId);
                }
            }

            const characterSummary =
                characters.map(
                    (char) => {
                        const id =
                            Number(char.id);
                        const label =
                            char.name ||
                            ("#" + id);
                        const runs =
                            runsByCharacter.get(
                                id
                            ) || 0;
                        const used = dailyUsageByCharacter.get(id);
                        const note = roninAccountReasons.get(id) || "";

                        return {
                            id,
                            label,
                            runs,
                            used,
                            limit: dailyLimit,
                            note,
                            text:
                                label + " - " +
                                runs + "x - " +
                                (used === null ? "?" : used) +
                                "/" + dailyLimit +
                                (note ? " - " + note : "")
                        };
                    }
                );

            this.setQuickPanelStatus(
                "Ronin konto — podsumowanie obiegów:",
                failed > 0
                    ? ""
                    : "success"
            );

            for (
                const item of
                characterSummary
            ) {
                this.addQuickLog(
                    item.text,
                    item.runs > 0
                        ? "success"
                        : ""
                );
            }

            toolConsole(
                "info",
                "[SW Tool][ACCOUNT] Ronin zakończony:",
                {
                    completed,
                    skipped,
                    levelSkipped,
                    failed,
                    dailyClaimed,
                    dailyLimit,
                    characters:
                        characterSummary
                }
            );

            return {
                completed,
                skipped,
                levelSkipped,
                failed,
                dailyClaimed,
                dailyLimit,
                characters:
                    characterSummary
            };
        }

        async runAccountAll() {
            const characters = [...this.chars];
            const originalId = Number(
                GAME.char_id ||
                this.lastCharacterId ||
                this.currentCharacterId ||
                0
            );

            let completed = 0;
            let failed = 0;
            let dailyClaimed = 0;

            toolConsole("info", 
                "[SW Tool][ACCOUNT ALL] Start.",
                {
                    characters: characters.length,
                    preferred: "per-character (default: training)"
                }
            );

            try {
                for (let i = 0; i < characters.length; i++) {
                    const char = characters[i];
                    const id = this._int(char?.id);
                    const label =
                        String(char?.name || "").trim() ||
                        ("#" + id);

                    try {
                        this.setQuickPanelStatus(
                            "ALL konto: " +
                            (i + 1) +
                            "/" +
                            characters.length +
                            " — " +
                            label +
                            "..."
                        );

                        await this.switchCharacterForAccountAction(
                            id,
                            0,
                            true
                        );

                        if (
                            await this.claimDailyRewardForAccountAction(
                                label
                            )
                        ) {
                            dailyClaimed++;
                        }

                        const result =
                            await this.runQuickAllForCurrentCharacter(
                                label
                            );

                        completed++;

                        this.setQuickPanelStatus(
                            "ALL konto: " +
                            label +
                            " — " +
                            result.summary.join(" • "),
                            result.warnings.length > 0
                                ? ""
                                : "success"
                        );
                    } catch (error) {
                        if (this.isFatalAccountError(error)) {
                            throw error;
                        }

                        failed++;
                        toolConsole("warn", 
                            "[SW Tool][ACCOUNT ALL] " +
                            label +
                            ":",
                            error
                        );

                        this.setQuickPanelStatus(
                            "ALL konto: " +
                            label +
                            " — błąd: " +
                            (
                                error instanceof Error
                                    ? error.message
                                    : String(error)
                            ),
                            "error"
                        );
                    } finally {
                        this.stopNavigation(
                            "koniec ALL dla bieżącej postaci"
                        );

                        // Po Treningu/Misji oficjalny klient potrafi jeszcze
                        // przebudowywać stan postaci. Nie wysyłamy kolejnego
                        // a:5/a:2 w tej samej chwili.
                        await this.sleep(250);
                    }
                }
            } finally {
                this.stopNavigation(
                    "koniec operacji ALL konta"
                );
                await this.restoreAccountCharacter(
                    originalId
                );
            }

            this.setQuickPanelStatus(
                "ALL konto zakończone: " +
                completed +
                " OK, " +
                failed +
                " błędów.",
                failed > 0 ? "" : "success"
            );

            toolConsole("info", 
                "[SW Tool][ACCOUNT ALL] Zakończone.",
                {
                    completed,
                    failed,
                    dailyClaimed,
                    preferred: "per-character (default: training)"
                }
            );
        }

        async runAccountTestDailyMissions() {
            const characters =
                [...this.chars];
            const originalId =
                Number(
                    GAME.char_id ||
                    this.lastCharacterId ||
                    this.currentCharacterId ||
                    0
                );

            let completed = 0;
            let failed = 0;

            this.setQuickPanelBusy(true);

            try {
                for (
                    let i = 0;
                    i < characters.length;
                    i++
                ) {
                    const char =
                        characters[i];
                    const id =
                        Number(char.id);
                    const label =
                        char.name ||
                        ("#" + id);

                    this.setQuickPanelStatus(
                        "TEST 2: " +
                        (i + 1) +
                        "/" +
                        characters.length +
                        " • " +
                        label +
                        "..."
                    );

                    toolConsole(
                        "info",
                        "[SW Tool][TEST 2] Start postaci.",
                        {
                            index:
                                i + 1,
                            total:
                                characters.length,
                            charId:
                                id,
                            label
                        }
                    );

                    try {
                        this.stopNavigation(
                            "TEST 2 — zmiana postaci"
                        );

                        await this.switchCharacterForAccountAction(
                            id,
                            0
                        );

                        // Po zmianie postaci mapSolver może nadal trzymać
                        // mapę poprzedniej postaci. Świeże a:3 daje dokładny
                        // stan lokalizacji przed uruchomieniem wspólnego TEST.
                        await this.mapSolver
                            .refreshMap();

                        const result =
                            await this.runTestDailyMissions({
                                allowAccountOperation:
                                    true
                            });

                        if (
                            result?.status ===
                            "done"
                        ) {
                            completed++;
                        } else {
                            failed++;
                        }

                        toolConsole(
                            "info",
                            "[SW Tool][TEST 2] Koniec postaci.",
                            {
                                charId:
                                    id,
                                label,
                                result
                            }
                        );
                    } catch (error) {
                        if (
                            this.isFatalAccountError(
                                error
                            )
                        ) {
                            throw error;
                        }

                        failed++;

                        const message =
                            error instanceof Error
                                ? error.message
                                : String(error);

                        toolConsole(
                            "warn",
                            "[SW Tool][TEST 2] Błąd postaci " +
                                label +
                                ":",
                            error
                        );

                        this.setQuickPanelStatus(
                            "TEST 2: " +
                            label +
                            " — " +
                            message,
                            "error"
                        );
                    } finally {
                        this.stopNavigation(
                            "TEST 2 — koniec postaci"
                        );
                    }
                }
            } finally {
                this.stopNavigation(
                    "TEST 2 — koniec całego konta"
                );

                await this.restoreAccountCharacter(
                    originalId
                );

                this.setQuickPanelBusy(
                    false
                );
            }

            this.setQuickPanelStatus(
                "TEST 2 zakończone: " +
                completed +
                " OK, " +
                failed +
                " błędów.",
                failed > 0
                    ? ""
                    : "success"
            );

            toolConsole(
                "info",
                "[SW Tool][TEST 2] Całe konto zakończone.",
                {
                    completed,
                    failed,
                    characters:
                        characters.length
                }
            );

            return {
                completed,
                failed,
                characters:
                    characters.length
            };
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
            if (
                this.quickActionRunning ||
                this.questKillRunning ||
                this.pickupQuestRunning ||
                this.respawnRunning ||
                this.expRunning ||
                this.mapSolver?.active
            ) {
                throw new Error(
                    "Trwa szybka akcja, operacja PVE lub nawigacja."
                );
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
                accountRonin: () => this.runAccountRonin(),
                accountTestDaily: () => this.runAccountTestDailyMissions(),
                accountAll: () => this.runAccountAll()
            };
            const runner = runners[action];
            if (!runner) {
                throw new Error("Nieznana operacja konta: " + String(action));
            }

            this.accountOperationAction = action;
            this.accountOperationRunning = true;
            Promise.resolve()
                .then(runner)
                .catch((error) => {
                    toolConsole("error", "[SW Tool][ACCOUNT] Operacja nie powiodła się:", action, error);
                    this.setQuickPanelStatus(
                        "Błąd operacji konta: " +
                        (error instanceof Error ? error.message : String(error)),
                        "error"
                    );
                })
                .finally(() => {
                    if (this.trainingCaptchaWaiter?.cancel) {
                        this.trainingCaptchaWaiter.cancel();
                    }

                    this.accountOperationRunning = false;
                    this.accountOperationAction = null;
                });

            return {
                started: true,
                action,
                characters: this.chars.length
            };
        }
    }

    const createSocketCapture = () => {
        let active = false;
        let originalEmit = null;
        let incomingHandler = null;
        let entries = [];

        const cloneSafe = (value) => {
            try {
                return JSON.parse(
                    JSON.stringify(value)
                );
            } catch {
                return value;
            }
        };

        const push = (
            direction,
            event,
            payload
        ) => {
            if (!active) {
                return;
            }

            const entry = {
                ts:
                    Date.now(),
                direction,
                event:
                    String(event || ""),
                payload:
                    cloneSafe(payload)
            };

            entries.push(entry);

            if (entries.length > 300) {
                entries =
                    entries.slice(-300);
            }

            toolConsole("info", 
                "[SW Tool][SOCKET CAPTURE][" +
                direction +
                "]",
                event,
                entry.payload
            );
        };

        const start = () => {
            if (active) {
                return {
                    active: true,
                    entries:
                        entries.length
                };
            }

            const socket =
                window.GAME?.socket;

            if (!socket) {
                throw new Error(
                    "Socket GAME nie jest gotowy."
                );
            }

            active = true;
            entries = [];

            originalEmit =
                socket.emit;

            socket.emit = function (
                event,
                ...args
            ) {
                if (
                    active &&
                    (
                        event === "ga" ||
                        event === "gr"
                    )
                ) {
                    push(
                        "TX",
                        event,
                        args.length <= 1
                            ? args[0]
                            : args
                    );
                }

                return originalEmit.apply(
                    this,
                    [
                        event,
                        ...args
                    ]
                );
            };

            incomingHandler = (
                response
            ) => {
                push(
                    "RX",
                    "gr",
                    response
                );
            };

            socket.on(
                "gr",
                incomingHandler
            );

            toolConsole("info", 
                "[SW Tool][SOCKET CAPTURE] START — wykonaj ręcznie walkę z championem, elitą i bossem."
            );

            return {
                active: true,
                entries: 0
            };
        };

        const stop = () => {
            const socket =
                window.GAME?.socket;

            if (
                socket &&
                originalEmit
            ) {
                socket.emit =
                    originalEmit;
            }

            if (
                socket &&
                incomingHandler
            ) {
                socket.off(
                    "gr",
                    incomingHandler
                );
            }

            active = false;
            originalEmit = null;
            incomingHandler = null;

            toolConsole("info", 
                "[SW Tool][SOCKET CAPTURE] STOP — wpisz SW_TOOL_SOCKET_CAPTURE.export()"
            );

            return {
                active: false,
                entries:
                    entries.length
            };
        };

        const clear = () => {
            entries = [];
            return true;
        };

        const get = () =>
            entries.map(
                (entry) => ({
                    ...entry
                })
            );

        const exportData = () =>
            JSON.stringify(
                entries,
                null,
                2
            );

        return {
            start,
            stop,
            clear,
            get,
            export:
                exportData,
            state:
                () => ({
                    active,
                    entries:
                        entries.length
                })
        };
    };

    const initTool = async () => {
        await waitForGame();

        storageCheck();

        BOT = new TOOL();
        BOT.applyConfig(pendingConfig);
        BOT.getLocalData();
        BOT.updateID();
        BOT.addQuickLog("Gotowy.", "success");

        if (
            !window.SW_TOOL_SOCKET_CAPTURE
        ) {
            window.SW_TOOL_SOCKET_CAPTURE =
                createSocketCapture();
        }

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
            all: () => BOT.runQuickAction("all"),
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

            // Inputy w Shadow DOM dashboardu są retargetowane na host.
            if (event.composedPath?.().some(
                (node) => node?.id === "sw-tool-dashboard-host"
            )) return;

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
                    BOT.runImprovedXFromUserKey(event).catch(
                        (error) => {
                            toolConsole("error", 
                                "[SW Tool][X] Obsługa X nie powiodła się:",
                                error
                            );
                            BOT.improvedXPending = false;
                            BOT.acceleratedHPending = false;
                        }
                    );
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
            if (event.originalEvent?.composedPath?.().some(
                (node) => node?.id === "sw-tool-dashboard-host"
            )) return;
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

        toolConsole("info", "[SW Tool][PAGE] TOOL gotowy.");
        return BOT;
    };

    const toolReadyPromise = initTool().catch((error) => {
        toolConsole("error", "[SW Tool][PAGE] Inicjalizacja TOOL nie powiodła się.", error);
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

            if (
                data.action === "socketCapture.start" ||
                data.action === "socketCapture.stop" ||
                data.action === "socketCapture.state" ||
                data.action === "socketCapture.export"
            ) {
                await toolReadyPromise;

                const capture =
                    window.SW_TOOL_SOCKET_CAPTURE;

                if (!capture) {
                    throw new Error(
                        "Logger socketów nie jest dostępny."
                    );
                }

                let payload = null;

                if (
                    data.action ===
                    "socketCapture.start"
                ) {
                    payload =
                        capture.start();
                } else if (
                    data.action ===
                    "socketCapture.stop"
                ) {
                    payload =
                        capture.stop();
                } else if (
                    data.action ===
                    "socketCapture.export"
                ) {
                    payload = {
                        ...capture.state(),
                        entries:
                            capture.get()
                    };
                } else {
                    payload =
                        capture.state();
                }

                sendBridgeResponse(
                    data.requestId,
                    true,
                    payload
                );
                return;
            }

            // Dashboard żyje w isolated world. Nie udostępniamy mu
            // GAME ani BOT; przez bridge przekazujemy tylko prosty status
            // i jawnie dozwolone akcje istniejących automatów.
            if (data.action === "dashboard.characters.refresh") {
                const tool = await toolReadyPromise;
                if (tool.accountOperationRunning || tool.quickActionRunning ||
                    tool.questKillRunning || tool.expRunning || tool.respawnRunning ||
                    tool.roninRunning || tool.characterSwitch || tool.responseWaiter) {
                    throw new Error("Nie można pobierać listy postaci podczas automatyzacji.");
                }
                // Akcja a:1 zwraca listę postaci aktualnie zalogowanego konta.
                const result = await tool.sendAndWait(
                    { a: 1 },
                    1,
                    event => Array.isArray(event.chars) || Number(event.e || 0) !== 0,
                    15000
                );
                if (Number(result.e || 0) !== 0 || !Array.isArray(result.chars)) {
                    throw new Error("Serwer nie zwrócił prawidłowej listy postaci.");
                }
                tool.syncCharactersFromResponse(result);
                sendBridgeResponse(data.requestId, true, {
                    characters: tool.chars.map(char => ({
                        id: Number(char.id || 0),
                        name: String(char.name || ""),
                        level: Number(char.level || 0)
                    }))
                });
                return;
            }

            if (data.action === "dashboard.preferences") {
                const tool = await toolReadyPromise;
                const preferences = data.payload?.characters;
                if (!preferences || typeof preferences !== "object" ||
                    Array.isArray(preferences)) {
                    throw new Error("Brak poprawnej mapy preferencji postaci.");
                }
                const validSkills = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
                const normalized = {};
                for (const [rawId, config] of Object.entries(preferences).slice(0, 100)) {
                    const id = Number(rawId);
                    if (!Number.isSafeInteger(id) || id <= 0 || !config ||
                        typeof config !== "object") continue;
                    const skill = Number(config.trainingSkill || 0);
                    normalized[String(id)] = {
                        afterAll: config.afterAll === "training" || config.afterAll === "mission"
                            ? config.afterAll : "default",
                        trainingSkill: validSkills.has(skill) ? skill : 0
                    };
                }
                tool.characterPreferences = normalized;
                sendBridgeResponse(data.requestId, true, { count: Object.keys(normalized).length });
                return;
            }

            if (data.action === "dashboard.state") {
                const tool = await toolReadyPromise;
                const charId = Number(
                    window.GAME?.char_id || tool.currentCharacterId || 0
                );
                const logs = Array.isArray(tool.quickLogEntries)
                    ? tool.quickLogEntries : [];
                const accountNames = {
                    accountTournaments: "Turnieje",
                    accountSoulAbyss: "Otchłań",
                    accountArenaPvp: "Arena PvP",
                    accountTrainings: "Treningi",
                    accountMissions: "Misje",
                    accountRonin: "Ronin",
                    accountTestDaily: "Misje testowe",
                    accountAll: "Quick ALL"
                };
                const quickNames = {
                    all: "Quick ALL",
                    training: "Trening",
                    arena: "Arena PvP",
                    abyss: "Otchłań",
                    mission: "Misje",
                    ronin: "Ronin"
                };
                const automationLabel =
                    tool.pickupQuestRunning ? "Pickup Quest" :
                    tool.expRunning ? "Expiarka" :
                    tool.respawnRunning ? "Respiarka" :
                    tool.questKillRunning ? "Quest Kille" :
                    tool.roninRunning ? "Ronin" :
                    tool.quickActionRunning ? (quickNames[tool.quickActionName] || "Quick") :
                    tool.accountOperationRunning ? (accountNames[tool.accountOperationAction] || "Operacja konta") :
                    "";
                sendBridgeResponse(data.requestId, true, {
                    characterId: charId,
                    character: charId > 0 ? tool.currentCharacterLabel() : "",
                    characters: Array.isArray(tool.chars) ? tool.chars.length : 0,
                    charactersFresh: tool.charactersFromServer === true,
                    characterList: Array.isArray(tool.chars)
                        ? tool.chars.map(char => ({
                            id: Number(char.id || 0),
                            name: String(char.name || ""),
                            level: Number(char.level || 0)
                        })).filter(char => char.id > 0)
                        : [],
                    accountRunning: tool.accountOperationRunning === true,
                    quickRunning: tool.quickActionRunning === true,
                    roninRunning: tool.roninRunning === true,
                    questRunning: tool.questKillRunning === true,
                    pickupRunning: tool.pickupQuestRunning === true,
                    expRunning: tool.expRunning === true,
                    respawnRunning: tool.respawnRunning === true,
                    automationLabel,
                    latestLog: logs.length ? logs[logs.length - 1].message : "",
                    logCount: logs.length,
                    logs: logs.slice(-45)
                });
                return;
            }

            if (data.action === "dashboard.command") {
                const tool = await toolReadyPromise;
                const kind = String(data.payload?.kind || "");
                const action = String(data.payload?.action || "");

                if (kind === "account") {
                    const result = tool.startAccountOperation(action);
                    sendBridgeResponse(data.requestId, true, result);
                    return;
                }

                const handlers = {
                    quick: {
                        all: () => tool.runQuickAction("all"),
                        training: () => tool.runQuickAction("training"),
                        arena: () => tool.runQuickAction("arena"),
                        abyss: () => tool.runQuickAction("abyss"),
                        mission: () => tool.runQuickAction("mission"),
                        ronin: () => tool.runQuickAction("ronin")
                    },
                    pve: {
                        quest: () => tool.runQuestKills(),
                        pickup: () => tool.togglePickupQuest(),
                        exp: () => tool.toggleExpiarka(),
                        respawn: () => {
                            tool.respawnPaLimit = Math.max(0, Math.floor(
                                Number(data.payload?.respawnLimit || 0) || 0
                            ));
                            return tool.toggleRespawner();
                        }
                    }
                };
                const handler = handlers[kind]?.[action];
                if (!handler) {
                    throw new Error("Nieznana akcja dashboardu: " + kind + "/" + action);
                }
                // Akcje są długotrwałe; nie blokuj bridge podczas walki/instancji.
                Promise.resolve().then(handler).catch((error) => {
                    tool.setQuickPanelStatus(
                        "Dashboard: " +
                        (error instanceof Error ? error.message : String(error)),
                        "error"
                    );
                    toolConsole("warn", "[SW Tool][DASHBOARD] Akcja:", kind, action, error);
                });
                sendBridgeResponse(data.requestId, true, {
                    started: true, kind, action
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
            toolConsole("error", "[SW Tool][PAGE]", error);

            sendBridgeResponse(
                data.requestId,
                false,
                {},
                error instanceof Error ? error.message : String(error)
            );
        }
    });

    toolConsole("info", "[SW Tool][PAGE] Bridge zarejestrowany.");
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