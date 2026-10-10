(() => {
    const LOG = "[SW Tool][PATH]";
    const LOGICAL_VIEWPORT = 520;
    const TILE_SIZE = 40;
    const STEP_DELAY_MS = 100;

    class SWMapClickSolver {
        constructor(tool) {
            this.tool = tool;
            this.map = null;
            this.active = false;
            this.target = null;
            this.path = [];
            this.source = "";
            this.runId = 0;

            this.onMapClick = this.onMapClick.bind(this);
            document.addEventListener("click", this.onMapClick, false);
        }

        _int(value) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        _key(x, y) {
            return x + "_" + y;
        }

        handleResponse(response) {
            if (!response || typeof response !== "object") return;

            const action = this._int(response.a);
            const error = this._int(response.e);

            if (action === 3 && error === 0) {
                this.applyMapResponse(response);
                return;
            }

            if (action === 4 && error === 0) {
                this.applyMovementResponse(response);
                return;
            }

            if (action === 2 && error === 0) {
                this.stop("zmiana postaci");
                this.map = null;
            }
        }

        applyMapResponse(response) {
            const rawMap = response.map;
            const rawLoc = response.loc;
            if (
                !rawMap ||
                typeof rawMap !== "object" ||
                !rawLoc ||
                typeof rawLoc !== "object"
            ) {
                return;
            }

            const cells = new Map();
            let maxX = 0;
            let maxY = 0;

            for (const [key, raw] of Object.entries(rawMap)) {
                if (!raw || typeof raw !== "object") continue;

                const match = /^(\d+)_(\d+)$/.exec(String(key));
                if (!match) continue;

                const x = this._int(match[1]);
                const y = this._int(match[2]);
                if (x <= 0 || y <= 0) continue;

                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                cells.set(this._key(x, y), {
                    x,
                    y,
                    movable: this._int(raw.m) !== 0
                });
            }

            const charId = this._int(
                GAME.char_id || this.tool.currentCharacterId || 0
            );
            let player = null;

            if (Array.isArray(response.players)) {
                const rawPlayer = response.players.find((item) =>
                    item &&
                    typeof item === "object" &&
                    this._int(item.id || item.char_id) === charId
                );

                if (rawPlayer) {
                    player = {
                        x: this._int(rawPlayer.x),
                        y: this._int(rawPlayer.y)
                    };
                }
            }

            if (!player || player.x <= 0 || player.y <= 0) {
                const character = this.tool.currentCharacterSnapshot?.char_data;
                if (character && typeof character === "object") {
                    player = {
                        x: this._int(character.x),
                        y: this._int(character.y)
                    };
                }
            }

            this.map = {
                locationId: this._int(rawLoc.id),
                locationName: String(rawLoc.pl || rawLoc.en || rawLoc.name || ""),
                cells,
                maxX,
                maxY,
                charId,
                x: player?.x || 0,
                y: player?.y || 0
            };

            if (this.active) {
                this.stop("odświeżenie mapy podczas aktywnej trasy");
            }

            console.info(LOG, "Mapa gotowa dla solvera:", {
                locationId: this.map.locationId,
                locationName: this.map.locationName,
                maxX,
                maxY,
                x: this.map.x,
                y: this.map.y
            });
        }

        applyMovementResponse(response) {
            const map = this.map;
            if (!map) return;

            const charId = this._int(
                response.char_id || GAME.char_id || this.tool.currentCharacterId
            );
            if (charId <= 0 || charId !== this._int(map.charId)) return;

            const x = this._int(response.x);
            const y = this._int(response.y);
            if (x <= 0 || y <= 0) return;

            map.x = x;
            map.y = y;

            const character = this.tool.currentCharacterSnapshot?.char_data;
            if (character && typeof character === "object") {
                character.x = x;
                character.y = y;
            }
        }

        isBusy() {
            return Boolean(
                this.tool.accountOperationRunning ||
                this.tool.dailyRewardClaimStage !== 0 ||
                this.tool.characterSwitch ||
                this.tool.trainingCaptchaWaiter
            );
        }

        stop(reason = "") {
            const wasActive = this.active;
            this.runId++;
            this.active = false;
            this.target = null;
            this.path = [];
            this.source = "";

            if (wasActive && reason) {
                console.info(LOG, "Trasa zatrzymana:", reason);
            }
        }

        async navigateTo(x, y, options = {}) {
            const targetX = this._int(x);
            const targetY = this._int(y);
            const source = String(options.source || "manual");
            const allowBusy = options.allowBusy === true;

            if (!allowBusy && this.isBusy()) {
                throw new Error("Trwa inna operacja EXT.");
            }

            if (this.tool.responseWaiter) {
                throw new Error("Trwa oczekiwanie na odpowiedź poprzedniego zapytania.");
            }

            const map = this.map;
            if (!map) {
                throw new Error(
                    "Brak danych mapy. Otwórz mapę gry i poczekaj na odpowiedź a=3."
                );
            }

            if (
                targetX < 1 ||
                targetY < 1 ||
                targetX > map.maxX ||
                targetY > map.maxY
            ) {
                throw new Error("Cel znajduje się poza aktualną mapą.");
            }

            const targetCell = map.cells.get(this._key(targetX, targetY));
            if (!targetCell || !targetCell.movable) {
                throw new Error("Wybrane pole jest niedostępne.");
            }

            if (map.x <= 0 || map.y <= 0) {
                throw new Error("Nie znam aktualnej pozycji postaci.");
            }

            this.stop();
            const myRunId = ++this.runId;
            this.active = true;
            this.target = { x: targetX, y: targetY };
            this.source = source;

            console.info(LOG, "Start trasy:", {
                locationId: map.locationId,
                from: { x: map.x, y: map.y },
                to: this.target,
                source
            });

            try {
                while (
                    this.active &&
                    this.runId === myRunId &&
                    (map.x !== targetX || map.y !== targetY)
                ) {
                    if (!allowBusy && this.isBusy()) {
                        throw new Error("Trasę przerwała inna operacja EXT.");
                    }

                    const path = this.findShortestPath(
                        map,
                        { x: map.x, y: map.y },
                        { x: targetX, y: targetY }
                    );

                    if (!path) {
                        throw new Error("Nie znaleziono dostępnej trasy do celu.");
                    }
                    if (path.length === 0) break;

                    this.path = path;
                    const next = path[0];
                    const dir = this.directionForStep(
                        { x: map.x, y: map.y },
                        next
                    );

                    if (!dir) {
                        throw new Error("Nie udało się wyznaczyć kolejnego kroku.");
                    }

                    const expectedX = next.x;
                    const expectedY = next.y;
                    const currentCharId = this._int(
                        GAME.char_id || this.tool.currentCharacterId || 0
                    );

                    const response = await this.tool.sendAndWait(
                        {
                            a: 4,
                            dir,
                            vo: [1, 1, 0]
                        },
                        [4, 999],
                        (event) =>
                            this._int(event.e) !== 0 ||
                            (
                                this._int(event.a) === 4 &&
                                this._int(
                                    event.char_id ||
                                    currentCharId
                                ) === currentCharId &&
                                this._int(event.x) > 0 &&
                                this._int(event.y) > 0
                            ),
                        5000
                    );

                    if (this._int(response.e) !== 0) {
                        throw new Error(
                            "Serwer odrzucił ruch (e=" +
                            this._int(response.e) +
                            ")."
                        );
                    }

                    if (
                        map.x !== expectedX ||
                        map.y !== expectedY
                    ) {
                        console.info(LOG, "Pozycja różni się od planu, przeliczam trasę:", {
                            expected: { x: expectedX, y: expectedY },
                            actual: { x: map.x, y: map.y }
                        });
                    }

                    await this.tool.sleep(STEP_DELAY_MS);
                }

                if (
                    this.active &&
                    this.runId === myRunId &&
                    map.x === targetX &&
                    map.y === targetY
                ) {
                    console.info(LOG, "Cel osiągnięty:", {
                        locationId: map.locationId,
                        x: targetX,
                        y: targetY,
                        source
                    });
                    this.active = false;
                    this.path = [];
                    return {
                        ok: true,
                        locationId: map.locationId,
                        x: targetX,
                        y: targetY
                    };
                }

                return {
                    ok: false,
                    cancelled: true
                };
            } catch (error) {
                if (this.runId === myRunId) {
                    this.active = false;
                    this.path = [];
                }

                console.warn(LOG, "Błąd trasy:", error);
                throw error;
            }
        }

        directionForStep(from, to) {
            const dx = this._int(to.x) - this._int(from.x);
            const dy = this._int(to.y) - this._int(from.y);

            const directions = {
                "0,1": 1,
                "0,-1": 2,
                "1,1": 3,
                "-1,1": 4,
                "1,-1": 5,
                "-1,-1": 6,
                "1,0": 7,
                "-1,0": 8
            };

            return directions[dx + "," + dy] || null;
        }

        findShortestPath(map, start, target) {
            if (start.x === target.x && start.y === target.y) return [];

            const baseDirections = [
                { x: 0, y: 1 },
                { x: 0, y: -1 },
                { x: 1, y: 1 },
                { x: -1, y: 1 },
                { x: 1, y: -1 },
                { x: -1, y: -1 },
                { x: 1, y: 0 },
                { x: -1, y: 0 }
            ];

            const keyOf = (point) => this._key(point.x, point.y);
            const heuristic = (point) =>
                Math.max(
                    Math.abs(point.x - target.x),
                    Math.abs(point.y - target.y)
                );

            const naturalPenalty = (from, to, delta) => {
                const beforeDx = Math.abs(target.x - from.x);
                const beforeDy = Math.abs(target.y - from.y);
                const afterDx = Math.abs(target.x - to.x);
                const afterDy = Math.abs(target.y - to.y);

                let penalty = 0;
                if (afterDx > beforeDx) penalty += 4;
                if (afterDy > beforeDy) penalty += 4;

                const diagonal = delta.x !== 0 && delta.y !== 0;
                if (diagonal && beforeDx !== beforeDy) penalty += 1;

                return penalty;
            };

            const orderedDirections = (point) => {
                const dx = target.x - point.x;
                const dy = target.y - point.y;
                const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
                const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
                const preferred = [];

                const add = (delta) => {
                    if (
                        (delta.x === 0 && delta.y === 0) ||
                        preferred.some((item) =>
                            item.x === delta.x && item.y === delta.y
                        )
                    ) {
                        return;
                    }
                    preferred.push(delta);
                };

                if (Math.abs(dx) >= Math.abs(dy)) {
                    if (sx !== 0) add({ x: sx, y: 0 });
                    if (sx !== 0 && sy !== 0) add({ x: sx, y: sy });
                    if (sy !== 0) add({ x: 0, y: sy });
                } else {
                    if (sy !== 0) add({ x: 0, y: sy });
                    if (sx !== 0 && sy !== 0) add({ x: sx, y: sy });
                    if (sx !== 0) add({ x: sx, y: 0 });
                }

                for (const delta of baseDirections) add(delta);
                return preferred;
            };

            const startKey = keyOf(start);
            const open = [{
                point: { ...start },
                g: 0,
                f: heuristic(start),
                penalty: 0,
                serial: 0
            }];
            const bestSteps = new Map([[startKey, 0]]);
            const bestPenalty = new Map([[startKey, 0]]);
            const parent = new Map();
            const coords = new Map([[startKey, { ...start }]]);
            let serial = 1;

            while (open.length > 0) {
                open.sort((left, right) =>
                    (left.f - right.f) ||
                    (left.penalty - right.penalty) ||
                    (left.g - right.g) ||
                    (left.serial - right.serial)
                );

                const current = open.shift();
                const currentKey = keyOf(current.point);

                if (
                    bestSteps.get(currentKey) !== current.g ||
                    bestPenalty.get(currentKey) !== current.penalty
                ) {
                    continue;
                }

                if (
                    current.point.x === target.x &&
                    current.point.y === target.y
                ) {
                    const reversed = [];
                    let cursorKey = currentKey;

                    while (cursorKey !== startKey) {
                        const point = coords.get(cursorKey);
                        if (!point) return null;
                        reversed.push(point);

                        const previous = parent.get(cursorKey);
                        if (!previous) return null;
                        cursorKey = previous;
                    }

                    return reversed.reverse();
                }

                for (const delta of orderedDirections(current.point)) {
                    const next = {
                        x: current.point.x + delta.x,
                        y: current.point.y + delta.y
                    };

                    if (
                        next.x < 1 ||
                        next.y < 1 ||
                        next.x > map.maxX ||
                        next.y > map.maxY
                    ) {
                        continue;
                    }

                    const nextKey = keyOf(next);
                    const cell = map.cells.get(nextKey);
                    if (!cell || !cell.movable) continue;

                    const nextG = current.g + 1;
                    const nextPenalty =
                        current.penalty +
                        naturalPenalty(current.point, next, delta);
                    const previousSteps = bestSteps.get(nextKey);
                    const previousPenalty = bestPenalty.get(nextKey);

                    if (
                        previousSteps !== undefined &&
                        (
                            previousSteps < nextG ||
                            (
                                previousSteps === nextG &&
                                previousPenalty !== undefined &&
                                previousPenalty <= nextPenalty
                            )
                        )
                    ) {
                        continue;
                    }

                    bestSteps.set(nextKey, nextG);
                    bestPenalty.set(nextKey, nextPenalty);
                    parent.set(nextKey, currentKey);
                    coords.set(nextKey, next);
                    open.push({
                        point: next,
                        g: nextG,
                        f: nextG + heuristic(next),
                        penalty: nextPenalty,
                        serial: serial++
                    });
                }
            }

            return null;
        }

        onMapClick(event) {
            if (event.button !== 0 || event.defaultPrevented) return;
            if (this.active || this.isBusy() || this.tool.responseWaiter) return;

            const target = event.target;
            if (!(target instanceof Element)) return;

            const root = target.closest("#page_game_map");
            if (!root) return;

            const style = getComputedStyle(root);
            if (
                style.display === "none" ||
                style.visibility === "hidden"
            ) {
                return;
            }

            if (
                target.closest(
                    "button,a,input,textarea,select,[data-option]," +
                    ".map_bicon,.right_btns,.newBtn,.gold_button"
                )
            ) {
                return;
            }

            const point =
                this.coordinatesFromElement(target, root) ||
                this.coordinatesFromGeometry(event, root);

            if (!point) return;

            const cell = this.map?.cells.get(this._key(point.x, point.y));
            if (!cell || !cell.movable) return;

            console.info(LOG, "Klik mapy:", {
                locationId: this.map?.locationId || 0,
                x: point.x,
                y: point.y,
                method: point.method
            });

            this.navigateTo(point.x, point.y, {
                source: "map-click"
            }).catch((error) => {
                console.warn(LOG, "Kliknięcie nie uruchomiło trasy:", error);
            });
        }

        coordinatesFromElement(target, root) {
            let element = target;

            while (element && element instanceof Element) {
                const x = this._int(
                    element.dataset?.x ||
                    element.getAttribute("data-x") ||
                    element.getAttribute("x")
                );
                const y = this._int(
                    element.dataset?.y ||
                    element.getAttribute("data-y") ||
                    element.getAttribute("y")
                );

                if (x > 0 && y > 0) {
                    return { x, y, method: "dom" };
                }

                const compact = [
                    element.dataset?.xy,
                    element.dataset?.pos,
                    element.dataset?.coord,
                    element.id
                ];

                for (const raw of compact) {
                    const match = /(?:^|[^\d])(\d+)[_,:x-](\d+)(?:[^\d]|$)/i.exec(
                        String(raw || "")
                    );
                    if (!match) continue;

                    const parsedX = this._int(match[1]);
                    const parsedY = this._int(match[2]);
                    if (parsedX > 0 && parsedY > 0) {
                        return {
                            x: parsedX,
                            y: parsedY,
                            method: "dom-pattern"
                        };
                    }
                }

                if (element === root) break;
                element = element.parentElement;
            }

            return null;
        }

        coordinatesFromGeometry(event, root) {
            const map = this.map;
            if (!map || map.x <= 0 || map.y <= 0) return null;

            const viewport = this.findViewportAtPoint(
                root,
                event.clientX,
                event.clientY
            );
            if (!viewport) return null;

            const rect = viewport.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;

            const playerPxX = (map.x - 1) * TILE_SIZE;
            const playerPxY = (map.y - 1) * TILE_SIZE;
            const maxCameraX =
                map.maxX * TILE_SIZE - LOGICAL_VIEWPORT;
            const maxCameraY =
                map.maxY * TILE_SIZE - LOGICAL_VIEWPORT;

            let cameraX =
                playerPxX -
                LOGICAL_VIEWPORT / 2 +
                TILE_SIZE / 2;
            let cameraY =
                playerPxY -
                LOGICAL_VIEWPORT / 2 +
                TILE_SIZE / 2;

            cameraX = maxCameraX <= 0
                ? maxCameraX / 2
                : Math.max(0, Math.min(cameraX, maxCameraX));
            cameraY = maxCameraY <= 0
                ? maxCameraY / 2
                : Math.max(0, Math.min(cameraY, maxCameraY));

            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;
            const worldX =
                localX / (rect.width / LOGICAL_VIEWPORT) + cameraX;
            const worldY =
                localY / (rect.height / LOGICAL_VIEWPORT) + cameraY;

            const x = Math.floor(worldX / TILE_SIZE) + 1;
            const y = Math.floor(worldY / TILE_SIZE) + 1;

            if (
                x < 1 ||
                y < 1 ||
                x > map.maxX ||
                y > map.maxY
            ) {
                return null;
            }

            return { x, y, method: "geometry" };
        }

        findViewportAtPoint(root, clientX, clientY) {
            const candidates = [
                ...root.querySelectorAll(
                    "canvas,[class*='map'],[id*='map']"
                ),
                root
            ];

            let best = null;
            let bestScore = Infinity;

            for (const element of candidates) {
                if (!(element instanceof Element)) continue;

                const rect = element.getBoundingClientRect();
                if (
                    rect.width < 300 ||
                    rect.height < 300 ||
                    clientX < rect.left ||
                    clientX > rect.right ||
                    clientY < rect.top ||
                    clientY > rect.bottom
                ) {
                    continue;
                }

                const ratio =
                    Math.max(rect.width, rect.height) /
                    Math.min(rect.width, rect.height);
                if (ratio > 1.25) continue;

                const score =
                    Math.abs(rect.width - rect.height) * 4 +
                    Math.abs(
                        Math.min(rect.width, rect.height) -
                        LOGICAL_VIEWPORT
                    );

                if (score < bestScore) {
                    best = element;
                    bestScore = score;
                }
            }

            return best;
        }

        debugState() {
            return {
                active: this.active,
                source: this.source,
                target: this.target ? { ...this.target } : null,
                position: this.map
                    ? { x: this.map.x, y: this.map.y }
                    : null,
                locationId: this.map?.locationId || 0,
                locationName: this.map?.locationName || "",
                mapSize: this.map
                    ? { x: this.map.maxX, y: this.map.maxY }
                    : null,
                pathLength: this.path.length
            };
        }
    }

    window.SWMapClickSolver = SWMapClickSolver;
})();
