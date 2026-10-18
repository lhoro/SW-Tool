/* SW Tool — eksperymentalny analizator questa (bez zewnętrznego AI).
 * Instalowany w klasie TOOL przed uruchomieniem gry.
 * Nie wybiera na ślepo spośród kilku odpowiedzi/dialogów. */
(() => {
    "use strict";
    window.SW_TOOL_INSTALL_AUTO_QUEST = function installAutoQuest(TOOL) {
        Object.assign(TOOL.prototype, {
            autoQuestLog(message, type = "") {
                this.autoQuestStatus = String(message);
                this.setQuickPanelStatus("Auto Quest: " + message, type);
            },

            autoQuestAssertActive() {
                if (this.autoQuestStop || !this.autoQuestRunning) {
                    throw new Error("Auto Quest zatrzymany przez użytkownika.");
                }
                if (this._int(GAME.char_id || this.currentCharacterId) !==
                    this.autoQuestCharacterId) {
                    throw new Error("Postać została zmieniona — zatrzymuję Auto Quest.");
                }
                if (!GAME.socket?.connected) {
                    throw new Error("Utracono połączenie z serwerem gry.");
                }
            },

            async autoQuestWait(ms) {
                const until = Date.now() + Math.max(0, ms);
                while (Date.now() < until) {
                    this.autoQuestAssertActive();
                    await this.sleep(Math.min(100, until - Date.now()));
                }
                this.autoQuestAssertActive();
            },

            autoQuestFieldIds() {
                const map = this.mapSolver?.map;
                const key = String(map?.x || 0) + "_" + String(map?.y || 0);
                const quests = map?.pickupQuests?.[key];
                return [...new Set((Array.isArray(quests) ? quests : [])
                    .map(q => this._int(q?.qb_id))
                    .filter(id => id > 0))];
            },

            stopAutoQuest() {
                if (!this.autoQuestRunning) return { stopped: true };
                this.autoQuestStop = true;
                this.questKillStopRequested = true;
                this.pickupQuestStop = true;
                // Przerwij własną trasę, nie inicjuj już żadnego kolejnego TX.
                if (this.mapSolver?.active) {
                    this.mapSolver.stop("Auto Quest STOP");
                }
                this.autoQuestLog("STOP — przerywam aktywny etap...");
                return { stopping: true };
            },

            startAutoQuest() {
                if (this.autoQuestRunning) return this.stopAutoQuest();
                if (this.accountOperationRunning || this.quickActionRunning ||
                    this.roninRunning || this.questKillRunning || this.pickupQuestRunning ||
                    this.expRunning || this.respawnRunning || this.characterSwitch ||
                    this.responseWaiter || this.mapSolver?.active ||
                    this.dailyRewardClaimStage !== 0) {
                    throw new Error("Auto Quest: zakończ najpierw inną automatyzację.");
                }
                const characterId = this._int(GAME.char_id || this.currentCharacterId);
                const map = this.mapSolver?.map;
                if (!characterId || !map?.cells || !map.x || !map.y) {
                    throw new Error("Auto Quest: wybierz postać i poczekaj na mapę.");
                }
                const ids = this.autoQuestFieldIds();
                if (ids.length > 1) {
                    throw new Error("Na tym polu jest kilka questów. Wybierz quest ręcznie.");
                }
                if (!ids.length && !this.improvedXQuestWindowOpen()) {
                    throw new Error("Brak jednoznacznego questa na tym polu. Stań przy zadaniu albo otwórz jego dialog.");
                }
                this.autoQuestRunning = true;
                this.autoQuestStop = false;
                this.questKillStopRequested = false;
                this.pickupQuestStop = false;
                this.autoQuestCompleted = false;
                this.autoQuestQuestId = ids[0] || 0;
                this.autoQuestCharacterId = characterId;
                this.autoQuestPhase = "Rozpoznawanie";
                this.autoQuestLog("analizuję quest na polu " + map.x + "|" + map.y + "...");
                Promise.resolve().then(() => this.autoQuestExecute()).catch(error => {
                    if (!this.autoQuestStop) {
                        this.autoQuestLog(error instanceof Error ? error.message : String(error), "error");
                    }
                }).finally(() => {
                    const wasStopped = this.autoQuestStop;
                    this.autoQuestRunning = false;
                    this.autoQuestStop = false;
                    this.questKillStopRequested = false;
                    this.pickupQuestStop = false;
                    this.autoQuestPhase = wasStopped ? "Zatrzymany" :
                        (this.autoQuestCompleted ? "Ukończony" : "Wstrzymany");
                    if (wasStopped) this.autoQuestLog("zatrzymany.");
                });
                return { started: true };
            },

            async autoQuestOpenStep() {
                this.autoQuestAssertActive();
                const questId = this.autoQuestQuestId;
                const current = this.currentQuestStep;
                if (questId && this._int(current?.qb_id) === questId) return current;

                const previous = current;
                // X otwiera natywny dialog na polu questa.
                if (!this.improvedXQuestActions().length) {
                    this.roninPressKey("x");
                    await this.autoQuestWait(500);
                }
                let step = this.currentQuestStep;
                if (step && (!questId || this._int(step.qb_id) === questId) &&
                    (step !== previous || this.improvedXQuestWindowOpen())) {
                    return step;
                }
                const actions = this.improvedXQuestActions();
                if (actions.length > 1) {
                    throw new Error("Kilka akcji w dialogu — nie wybieram losowo.");
                }
                if (actions.length === 1 && this.questActionType(actions[0]) === "next") {
                    this.autoQuestLog("rozpoczynam jednoznaczny dialog...");
                    const result = await this.clickQuestActionAndWaitForSocket(actions[0], {
                        label: "Auto Quest — rozpoczęcie", timeoutMs: 10000
                    });
                    this.autoQuestAssertActive();
                    if (this.autoQuestQuestId &&
                        this._int(result.response?.quest_end) === this.autoQuestQuestId) {
                        this.autoQuestCompleted = true;
                        return null;
                    }
                    await this.autoQuestWait(250);
                    step = this.currentQuestStep;
                    if (step && (!questId || this._int(step.qb_id) === questId)) return step;
                }
                if (questId) {
                    // Serwerowy odczyt tylko dla konkretnego questa z bieżącego pola.
                    const result = await this.sendAndWait(
                        { a: 22, type: 1, id: questId }, [22, 999],
                        event => this._int(event.e) !== 0 ||
                            (this._int(event.a) === 22 &&
                             this._int(event.q_step?.qb_id) === questId),
                        8000
                    );
                    this.autoQuestAssertActive();
                    if (this._int(result.e) !== 0) {
                        throw new Error("Serwer odrzucił otwarcie questa ID " + questId);
                    }
                    if (result.q_step) return result.q_step;
                }
                throw new Error("Nie udało się odczytać q_step ani rozpoznać dialogu.");
            },

            async autoQuestRefreshStep() {
                this.autoQuestAssertActive();
                const id = this.autoQuestQuestId;
                const response = await this.sendAndWait(
                    { a: 22, type: 1, id }, [22, 999],
                    event => this._int(event.e) !== 0 ||
                        (this._int(event.a) === 22 &&
                         (this._int(event.q_step?.qb_id) === id ||
                          this._int(event.quest_end) === id)),
                    9000
                );
                this.autoQuestAssertActive();
                if (this._int(response.e) !== 0) {
                    throw new Error("Serwer odrzucił odczyt etapu questa.");
                }
                if (this._int(response.quest_end) === id) {
                    this.autoQuestCompleted = true;
                    return null;
                }
                return response.q_step || null;
            },

            async autoQuestNext(step) {
                this.autoQuestAssertActive();
                const id = this.autoQuestQuestId;
                const actions = this.improvedXQuestActions();
                if (actions.length > 1) {
                    throw new Error("Dialog zawiera kilka przycisków — wymaga decyzji gracza.");
                }
                if (actions.length === 1) {
                    if (this.questActionType(actions[0]) !== "next") {
                        throw new Error("Nieznany przycisk zadania — nie klikam.");
                    }
                    const { response } = await this.clickQuestActionAndWaitForSocket(actions[0], {
                        label: "Auto Quest — Dalej", timeoutMs: 12000
                    });
                    this.autoQuestAssertActive();
                    if (this._int(response?.quest_end) === id) this.autoQuestCompleted = true;
                    return;
                }
                // Fallback socketowy tylko przy jawnie zaliczonym wymaganiu.
                if (!step?.want || !step.want.is_met) {
                    throw new Error("Brak jednoznacznego przycisku Dalej.");
                }
                const response = await this.sendAndWait(
                    { a: 22, type: 2, button: 1, id }, [22, 999],
                    event => this._int(event.e) !== 0 ||
                        (this._int(event.a) === 22 &&
                         (this._int(event.quest_end) === id ||
                          this._int(event.q_step?.qb_id) === id ||
                          this._int(event.quest_move?.qb_id) === id)),
                    10000
                );
                this.autoQuestAssertActive();
                if (this._int(response.e) !== 0) {
                    throw new Error("Serwer odrzucił przejście Dalej.");
                }
                if (this._int(response.quest_end) === id) this.autoQuestCompleted = true;
            },

            async autoQuestExecute() {
                let step = await this.autoQuestOpenStep();
                if (this.autoQuestCompleted) {
                    this.autoQuestLog("quest zakończony!", "success");
                    return;
                }
                if (!step) throw new Error("Brak danych bieżącego etapu.");
                const id = this._int(step.qb_id);
                if (!id || (this.autoQuestQuestId && this.autoQuestQuestId !== id)) {
                    throw new Error("Otrzymano inny quest niż wskazany na polu.");
                }
                this.autoQuestQuestId = id;
                let repeat = 0;
                let lastSignature = "";
                for (let turn = 0; turn < 40; turn++) {
                    this.autoQuestAssertActive();
                    if (this.autoQuestCompleted) break;
                    if (!step) throw new Error("Serwer nie zwrócił następnego etapu.");
                    if (this._int(step.qb_id) !== id) {
                        throw new Error("Serwer przełączył na inny quest — zatrzymuję.");
                    }
                    if (this.improvedXQuestActions().length > 1) {
                        throw new Error("Kilka możliwych akcji w dialogu — zatrzymuję dla bezpieczeństwa.");
                    }
                    const want = step.want && typeof step.want === "object" ? step.want : null;
                    const type = this._int(want?.type);
                    const met = Boolean(want?.is_met) ||
                        (this._int(want?.maxv) > 0 &&
                         this._int(want?.count) >= this._int(want?.maxv));
                    const signature = JSON.stringify({
                        type, met, want: want || null,
                        step: step.step ?? step.id ?? null,
                        header: step.header ?? null
                    });
                    repeat = signature === lastSignature ? repeat + 1 : 0;
                    if (repeat >= 3) {
                        throw new Error("Etap nie zmienia się po akcjach — zatrzymuję, aby nie zapętlić questa.");
                    }
                    lastSignature = signature;
                    this.autoQuestPhase = "Etap " + (turn + 1) + " • typ " + (type || "dialog");
                    this.autoQuestLog(this.autoQuestPhase +
                        (want ? " • " + this._int(want.count) + "/" +
                            Math.max(this._int(want.maxv), this._int(want.amount)) : ""));
                    if (want && !met && type === 1) {
                        const kill = await this.runQuestKills({
                            initialStep: step, requireQuestWindow: false,
                            allowAutoQuest: true,
                            allowedWantTypes: [1]
                        });
                        this.autoQuestAssertActive();
                        if (!kill?.done) {
                            throw new Error("Nie udało się zakończyć etapu walki na obecnej mapie.");
                        }
                    } else if (want && !met && type === 22) {
                        this.pickupQuestRunning = true;
                        this.pickupQuestStop = false;
                        try {
                            await this.runPickupQuest();
                        } finally {
                            this.pickupQuestRunning = false;
                            this.pickupQuestState = null;
                        }
                        this.autoQuestAssertActive();
                    } else if (want && !met && type === 7) {
                        const response = await this.sendAndWait(
                            { a: 22, type: 6, id }, [22, 999],
                            event => this._int(event.e) !== 0 ||
                                (this._int(event.a) === 22 &&
                                 this._int(event.q_step?.qb_id) === id &&
                                 Boolean(event.q_step?.want?.is_met)),
                            15000
                        );
                        this.autoQuestAssertActive();
                        if (this._int(response.e) !== 0) {
                            throw new Error("Serwer odrzucił walkę questową.");
                        }
                    } else if (want && !met) {
                        throw new Error("Nieznany lub niespełniony warunek want.type=" + type +
                            ". Potrzebna nowa reguła rozpoznawania.");
                    } else {
                        await this.autoQuestNext(step);
                        this.autoQuestAssertActive();
                        if (this.autoQuestCompleted) break;
                    }
                    await this.autoQuestWait(300);
                    step = await this.autoQuestRefreshStep();
                    if (!step && !this.autoQuestCompleted) {
                        throw new Error("Nie udało się potwierdzić kolejnego etapu.");
                    }
                }
                this.autoQuestAssertActive();
                if (!this.autoQuestCompleted) {
                    throw new Error("Osiągnięto limit etapów bez potwierdzenia quest_end.");
                }
                this.autoQuestLog("ukończony! Serwer potwierdził quest_end.", "success");
            }
        });
    };
})();
