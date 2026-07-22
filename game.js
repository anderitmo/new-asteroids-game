/**
 * ASTEROIDS: NEON VOID - CORE GAME ENGINE
 *
 * Este arquivo gerencia o motor de jogo completo, o loop principal, o desenho de elementos no Canvas,
 * física vetorial de asteroides e tiros, detecção de colisões, suporte a controles de Xbox,
 * inteligência artificial das naves inimigas e drone auxiliar, sistema de upgrades e salvamento.
 *
 * Versão Final Consolidada e 100% Funcional (Sem Truncamento).
 */

// ==========================================================================
// CONFIGURAÇÕES GERAIS E ESTADO DO JOGO
// ==========================================================================
const GAME_CONFIG = {
    version: "1.8.0",
    totalSectors: 12,
    baseScrapGain: 15,
    maxUpgrades: 5,
    canvasWidth: 1920,
    canvasHeight: 1080
};

// Dados de Progresso Padrão do Piloto (Salvos no LocalStorage)
let pilotData = {
    name: "GUEST PILOT",
    signatureColor: "#00ffcc",
    maxUnlockedSector: 1,
    currentSector: 1,
    totalScore: 0,
    accumulatedScrap: 0,
    completedSectors: [],
    upgrades: {
        weapon: 1,
        shield: 1,
        engine: 1,
        drone: 0,
        chassis: 1
    }
};

// Estado da Sessão Atual de Jogo
let gameState = {
    score: 0,
    scrapsInSector: 0,
    lives: 3,
    active: false,
    paused: false,
    warping: false,
    bossSpawned: false,
    currentWave: 1,
    totalWaves: 2,
    keys: {},
    screenShake: 0,
    gamepadConnected: false,
    gamepadIndex: null,
    lastTime: 0,
    universeSpeedMultiplier: 1.0,
    bgTime: 0,
    openedUpgradesFromPause: false
};

// Listas de Objetos Ativos no Jogo
let entities = {
    player: null,
    drone: null,
    asteroids: [],
    bullets: [],
    enemyBullets: [],
    enemies: [],
    scraps: [],
    particles: [],
    anomalies: [],
    boss: null,
    powerups: []
};

// Referências de Elementos do DOM
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const uiOverlay = document.getElementById("ui-overlay");
const hudOverlay = document.getElementById("hud-overlay");
const mobileControls = document.getElementById("mobile-controls");

// Elementos de Telas de Menu
const screenMenu = document.getElementById("menu-screen");
const screenPilot = document.getElementById("pilot-screen");
const screenSector = document.getElementById("sector-screen");
const screenInstructions = document.getElementById("instructions-screen");
const screenUpgrades = document.getElementById("upgrades-screen");
const screenPause = document.getElementById("pause-screen");
const screenWarp = document.getElementById("warp-screen");
const screenVictory = document.getElementById("victory-screen");
const screenGameOver = document.getElementById("gameover-screen");

// ==========================================================================
// INICIALIZAÇÃO E EVENTOS
// ==========================================================================
window.addEventListener("DOMContentLoaded", () => {
    loadProgress();
    resizeCanvas();
    setupMenuNavigation();
    setupInputListeners();
    setupGamepadListeners();
    setupUniverseSpeedSelector();
    setupVolumeSelectors();
    generateSectorGrid();
    updateMenuPilotBadge();

    // Novo Mecanismo de Pulo de Fase via URL GET (?pula-fase=X)
    const urlParams = new URLSearchParams(window.location.search);
    const pulaFaseVal = urlParams.get("pula-fase");
    if (pulaFaseVal) {
        const targetPhase = parseInt(pulaFaseVal);
        if (targetPhase >= 1 && targetPhase <= GAME_CONFIG.totalSectors) {
            pilotData.maxUnlockedSector = Math.max(pilotData.maxUnlockedSector, targetPhase);
            pilotData.currentSector = targetPhase;
            saveProgress();

            setTimeout(() => {
                startSector(targetPhase);
            }, 300);
        }
    }

    requestAnimationFrame(gameLoop);
});

window.addEventListener("resize", resizeCanvas);

function resizeCanvas() {
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
        mobileControls.style.display = "flex";
    } else {
        mobileControls.style.display = "none";
    }
}

function getScaleFactor() {
    return Math.min(canvas.width / GAME_CONFIG.canvasWidth, canvas.height / GAME_CONFIG.canvasHeight);
}

function setupUniverseSpeedSelector() {
    const range = document.getElementById("speed-range");
    if (range) {
        const savedSpeed = localStorage.getItem("asteroids_neonvoid_speed_mult");
        if (savedSpeed) {
            gameState.universeSpeedMultiplier = parseFloat(savedSpeed);
            range.value = savedSpeed;
            updateSpeedLabel(gameState.universeSpeedMultiplier);
        }
        range.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            gameState.universeSpeedMultiplier = val;
            localStorage.setItem("asteroids_neonvoid_speed_mult", val);
            updateSpeedLabel(val);
        });
    }
}

function updateSpeedLabel(val) {
    const label = document.getElementById("speed-label-text");
    if (!label) return;
    if (val === 1.0) {
        label.textContent = "1.0x (Normal)";
        label.style.color = "#00ffcc";
    } else if (val < 1.0) {
        label.textContent = `${val.toFixed(2)}x (Lento)`;
        label.style.color = "#0099ff";
    } else if (val > 1.5) {
        label.textContent = `${val.toFixed(2)}x (EXTREMO!)`;
        label.style.color = "#ff0055";
    } else {
        label.textContent = `${val.toFixed(2)}x (Rápido)`;
        label.style.color = "#ffcc00";
    }
}

function setupVolumeSelectors() {
    const musicRange = document.getElementById("volume-music");
    const musicLabel = document.getElementById("volume-music-label");
    const sfxRange = document.getElementById("volume-sfx");
    const sfxLabel = document.getElementById("volume-sfx-label");

    if (musicRange && musicLabel) {
        const savedMusicVol = localStorage.getItem("asteroids_neonvoid_vol_music");
        if (savedMusicVol !== null) {
            const vol = parseFloat(savedMusicVol);
            SFX.musicVolumeVal = vol;
            musicRange.value = vol;
            musicLabel.textContent = `${Math.round(vol * 100)}%`;
        }
        musicRange.addEventListener("input", (e) => {
            const vol = parseFloat(e.target.value);
            SFX.setMusicVolume(vol);
            localStorage.setItem("asteroids_neonvoid_vol_music", vol);
            musicLabel.textContent = `${Math.round(vol * 100)}%`;
        });
    }

    if (sfxRange && sfxLabel) {
        const savedSfxVol = localStorage.getItem("asteroids_neonvoid_vol_sfx");
        if (savedSfxVol !== null) {
            const vol = parseFloat(savedSfxVol);
            SFX.sfxVolumeVal = vol;
            sfxRange.value = vol;
            sfxLabel.textContent = `${Math.round(vol * 100)}%`;
        }
        sfxRange.addEventListener("input", (e) => {
            const vol = parseFloat(e.target.value);
            SFX.setSfxVolume(vol);
            localStorage.setItem("asteroids_neonvoid_vol_sfx", vol);
            sfxLabel.textContent = `${Math.round(vol * 100)}%`;
        });
    }
}

// ==========================================================================
// PERSISTÊNCIA
// ==========================================================================
function saveProgress() {
    localStorage.setItem("asteroids_neonvoid_pilot", JSON.stringify(pilotData));
    updateMenuPilotBadge();
}

function loadProgress() {
    const saved = localStorage.getItem("asteroids_neonvoid_pilot");
    if (saved) {
        try {
            pilotData = JSON.parse(saved);
            if (pilotData.upgrades.chassis === undefined) {
                pilotData.upgrades.chassis = 1;
            }
        } catch (e) {
            console.error("Erro ao ler LocalStorage", e);
        }
    }
}

function updateMenuPilotBadge() {
    const badge = document.getElementById("active-pilot-badge");
    if (pilotData && pilotData.name !== "GUEST PILOT") {
        badge.style.display = "block";
        document.getElementById("display-pilot-name").textContent = pilotData.name;
        document.getElementById("display-pilot-name").style.color = pilotData.signatureColor;
        document.getElementById("display-pilot-phase").textContent = `Setor ${pilotData.maxUnlockedSector}`;
        document.getElementById("display-pilot-score").textContent = pilotData.totalScore.toLocaleString();
    } else {
        badge.style.display = "none";
    }
}

// ==========================================================================
// ENTRADAS (INPUTS)
// ==========================================================================
function setupInputListeners() {
    window.addEventListener("keydown", (e) => {
        gameState.keys[e.key.toLowerCase()] = true;
        gameState.keys[e.code.toLowerCase()] = true;
        if (e.key === "Escape" || e.key === "p") {
            if (gameState.active && !gameState.warping) {
                togglePause();
            }
        }
    });

    window.addEventListener("keyup", (e) => {
        gameState.keys[e.key.toLowerCase()] = false;
        gameState.keys[e.code.toLowerCase()] = false;
    });

    const setupTouchBtn = (id, keyName) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener("touchstart", (e) => {
            e.preventDefault();
            gameState.keys[keyName] = true;
        });
        btn.addEventListener("touchend", (e) => {
            e.preventDefault();
            gameState.keys[keyName] = false;
        });
    };

    setupTouchBtn("touch-left", "a");
    setupTouchBtn("touch-right", "d");
    setupTouchBtn("touch-thrust", "w");
    setupTouchBtn("touch-fire", "space");
    setupTouchBtn("touch-special", "shift");

    const touchPauseBtn = document.getElementById("touch-pause");
    if (touchPauseBtn) {
        touchPauseBtn.addEventListener("touchstart", (e) => {
            e.preventDefault();
            if (gameState.active) togglePause();
        });
    }
}

function setupGamepadListeners() {
    window.addEventListener("gamepadconnected", (e) => {
        gameState.gamepadConnected = true;
        gameState.gamepadIndex = e.gamepad.index;
        const ind = document.getElementById("menu-gamepad-indicator");
        if (ind) {
            ind.innerHTML = `<span class="icon" style="color: #00ffcc;">🎮</span> Gamepad Conectado`;
            ind.classList.add("connected");
        }
    });

    window.addEventListener("gamepaddisconnected", () => {
        gameState.gamepadConnected = false;
        gameState.gamepadIndex = null;
        const ind = document.getElementById("menu-gamepad-indicator");
        if (ind) {
            ind.innerHTML = `<span class="icon">🎮</span> Gamepad Desconectado`;
            ind.classList.remove("connected");
        }
    });
}

function pollGamepad() {
    if (!gameState.gamepadConnected || gameState.gamepadIndex === null) return;
    const gp = navigator.getGamepads()[gameState.gamepadIndex];
    if (!gp) return;

    gameState.keys["gamepad_up"] = false;
    gameState.keys["gamepad_down"] = false;
    gameState.keys["gamepad_left"] = false;
    gameState.keys["gamepad_right"] = false;
    gameState.keys["gamepad_fire"] = false;
    gameState.keys["gamepad_special"] = false;

    const axisX = gp.axes[0];
    const axisY = gp.axes[1];
    const threshold = 0.25;

    if (axisX < -threshold || gp.buttons[14].pressed) gameState.keys["gamepad_left"] = true;
    if (axisX > threshold || gp.buttons[15].pressed) gameState.keys["gamepad_right"] = true;
    if (axisY < -threshold || gp.buttons[12].pressed) gameState.keys["gamepad_up"] = true;
    if (axisY > threshold || gp.buttons[13].pressed) gameState.keys["gamepad_down"] = true;

    if (gp.buttons[0].pressed || gp.buttons[7].pressed || gp.buttons[5].pressed) {
        gameState.keys["gamepad_up"] = true;
    }
    if (gp.buttons[2].pressed || gp.buttons[6].pressed) {
        gameState.keys["gamepad_fire"] = true;
    }
    if (gp.buttons[1].pressed || gp.buttons[3].pressed) {
        gameState.keys["gamepad_special"] = true;
    }
    if (gp.buttons[9].pressed) {
        if (gameState.active && !gameState.warping && !gameState.paused) {
            togglePause();
        }
    }
}

function triggerGamepadVibration(duration = 200, strong = 0.5, weak = 0.5) {
    if (!gameState.gamepadConnected || gameState.gamepadIndex === null) return;
    const gp = navigator.getGamepads()[gameState.gamepadIndex];
    if (gp && gp.vibrationActuator) {
        gp.vibrationActuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration: duration,
            weakMagnitude: weak,
            strongMagnitude: strong
        }).catch(() => {});
    }
}

// ==========================================================================
// NAVEGAÇÃO DOS MENUS
// ==========================================================================
function setupMenuNavigation() {
    const showScreen = (activeScreen) => {
        SFX.resume();
        const cards = document.querySelectorAll(".menu-card");
        cards.forEach(card => card.classList.remove("active"));
        activeScreen.classList.add("active");
        uiOverlay.style.display = "flex";
    };

    document.getElementById("btn-play").addEventListener("click", () => {
        generateSectorGrid();
        showScreen(screenSector);
    });

    document.getElementById("btn-pilot-setup").addEventListener("click", () => {
        document.getElementById("pilot-name").value = pilotData.name === "GUEST PILOT" ? "" : pilotData.name;
        showScreen(screenPilot);
    });

    document.getElementById("pilot-form").addEventListener("submit", () => {
        const nameVal = document.getElementById("pilot-name").value.trim();
        if (nameVal) {
            pilotData.name = nameVal.toUpperCase();
            const activeColorOpt = document.querySelector(".color-option.active");
            if (activeColorOpt) {
                pilotData.signatureColor = activeColorOpt.getAttribute("data-color");
            }
            saveProgress();
            SFX.playUpgradeSuccess();
            showScreen(screenMenu);
        }
    });

    document.getElementById("btn-back-pilot").addEventListener("click", () => {
        showScreen(screenMenu);
    });

    const colorOpts = document.querySelectorAll(".color-option");
    colorOpts.forEach(opt => {
        opt.addEventListener("click", () => {
            colorOpts.forEach(o => o.classList.remove("active"));
            opt.classList.add("active");
        });
    });

    document.getElementById("btn-back-sectors").addEventListener("click", () => {
        showScreen(screenMenu);
    });

    document.getElementById("btn-instructions").addEventListener("click", () => {
        showScreen(screenInstructions);
    });
    document.getElementById("btn-back-instructions").addEventListener("click", () => {
        showScreen(screenMenu);
    });

    document.getElementById("btn-upgrades").addEventListener("click", () => {
        gameState.openedUpgradesFromPause = false;
        openUpgradesScreen();
    });

    document.getElementById("btn-back-upgrades").addEventListener("click", () => {
        if (gameState.openedUpgradesFromPause) {
            showScreen(screenPause);
        } else {
            showScreen(screenMenu);
        }
    });

    document.getElementById("btn-reset-upgrades").addEventListener("click", () => {
        if (confirm("Deseja realmente resetar todos os upgrades? Toda a sucata acumulada será devolvida.")) {
            resetAllUpgrades();
        }
    });

    document.getElementById("btn-resume").addEventListener("click", () => {
        togglePause();
    });

    document.getElementById("btn-pause-upgrades").addEventListener("click", () => {
        gameState.openedUpgradesFromPause = true;
        openUpgradesScreen();
    });

    document.getElementById("btn-restart").addEventListener("click", () => {
        togglePause();
        startSector(pilotData.currentSector);
    });
    document.getElementById("btn-quit").addEventListener("click", () => {
        quitToMenu();
    });

    document.getElementById("btn-retry").addEventListener("click", () => {
        startSector(pilotData.currentSector);
    });
    document.getElementById("btn-gameover-upgrades").addEventListener("click", () => {
        gameState.openedUpgradesFromPause = false;
        openUpgradesScreen();
    });
    document.getElementById("btn-gameover-menu").addEventListener("click", () => {
        quitToMenu();
    });

    document.getElementById("btn-victory-continue").addEventListener("click", () => {
        quitToMenu();
    });
}

function generateSectorGrid() {
    const grid = document.getElementById("sectors-grid");
    grid.innerHTML = "";

    for (let i = 1; i <= GAME_CONFIG.totalSectors; i++) {
        const node = document.createElement("div");
        node.className = "sector-node";

        const isLocked = i > pilotData.maxUnlockedSector;
        const isCompleted = pilotData.completedSectors.includes(i);

        if (isLocked) {
            node.classList.add("locked");
        } else {
            if (isCompleted) node.classList.add("completed");

            node.addEventListener("click", () => {
                pilotData.currentSector = i;
                saveProgress();
                startSector(i);
            });
        }

        let sectorName = "Cinturão";
        if (i % 3 === 0) sectorName = "SISTEMA BOSS";
        else if (i === 4 || i === 8) sectorName = "Anomalia Vazio";
        else if (i === 11) sectorName = "Fronteira Final";

        node.innerHTML = `
            <span class="num">${String(i).padStart(2, '0')}</span>
            <span class="label">${sectorName}</span>
        `;
        grid.appendChild(node);
    }
}

// ==========================================================================
// CENTRAL DE UPGRADES DA LOJA
// ==========================================================================
function openUpgradesScreen() {
    const currentAvailableScraps = pilotData.accumulatedScrap + (gameState.active ? gameState.scrapsInSector : 0);
    document.getElementById("scraps-total").textContent = currentAvailableScraps;

    const updateItemUI = (key) => {
        const lvl = pilotData.upgrades[key];
        const isMax = lvl >= (key === 'chassis' ? 3 : GAME_CONFIG.maxUpgrades);
        const cost = isMax ? "MAX" : (lvl * 100 + (key === 'drone' ? 100 : 0));

        document.getElementById(`level-${key}`).textContent = (lvl === 0 && key === 'drone') ? "BLOQUEADO" : `NÍV ${lvl}`;
        const btn = document.getElementById(`btn-upgrade-${key}`);

        if (isMax) {
            btn.innerHTML = "MÁXIMO";
            btn.disabled = true;
        } else {
            btn.innerHTML = `UPGRADE <br><span class="cost">${cost}</span> ⚡`;
            btn.disabled = currentAvailableScraps < cost;
        }
    };

    updateItemUI("weapon");
    updateItemUI("shield");
    updateItemUI("engine");
    updateItemUI("drone");
    updateItemUI("chassis");

    const setupUpgradeClick = (key) => {
        const btn = document.getElementById(`btn-upgrade-${key}`);
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener("click", () => {
            const lvl = pilotData.upgrades[key];
            const cost = lvl * 100 + (key === 'drone' ? 100 : 0);

            const totalScraps = pilotData.accumulatedScrap + (gameState.active ? gameState.scrapsInSector : 0);
            if (totalScraps >= cost) {
                if (gameState.active) {
                    if (gameState.scrapsInSector >= cost) {
                        gameState.scrapsInSector -= cost;
                    } else {
                        const remainder = cost - gameState.scrapsInSector;
                        gameState.scrapsInSector = 0;
                        pilotData.accumulatedScrap -= remainder;
                    }
                } else {
                    pilotData.accumulatedScrap -= cost;
                }

                pilotData.upgrades[key]++;

                if (gameState.active && entities.player) {
                    const currentHpRatio = entities.player.shield / entities.player.maxShield;

                    entities.player.chassisLevel = pilotData.upgrades.chassis;
                    entities.player.radius = 18 + (entities.player.chassisLevel - 1) * 6;
                    entities.player.maxShield = 100 + (pilotData.upgrades.shield - 1) * 20 + (entities.player.chassisLevel - 1) * 30;
                    entities.player.shield = entities.player.maxShield * currentHpRatio;

                    if (key === 'drone' && !entities.drone && pilotData.upgrades.drone > 0) {
                        entities.drone = new DroneNPC(entities.player);
                    }
                }

                saveProgress();
                SFX.playUpgradeSuccess();
                openUpgradesScreen();
                updateHUD();
                checkAvailableUpgradesRealtime();
            }
        });
    };

    setupUpgradeClick("weapon");
    setupUpgradeClick("shield");
    setupUpgradeClick("engine");
    setupUpgradeClick("drone");
    setupUpgradeClick("chassis");

    const cards = document.querySelectorAll(".menu-card");
    cards.forEach(card => card.classList.remove("active"));
    screenUpgrades.classList.add("active");
    uiOverlay.style.display = "flex";
}

function resetAllUpgrades() {
    let returnedScrap = 0;
    const calcCost = (key, lvl) => {
        let total = 0;
        const startLvl = (key === 'drone') ? 0 : 1;
        for (let l = startLvl; l < lvl; l++) {
            total += l * 100 + (key === 'drone' ? 100 : 0);
        }
        return total;
    };

    for (let key in pilotData.upgrades) {
        returnedScrap += calcCost(key, pilotData.upgrades[key]);
        pilotData.upgrades[key] = (key === 'drone') ? 0 : 1;
    }

    if (gameState.active) {
        gameState.scrapsInSector += returnedScrap;
    } else {
        pilotData.accumulatedScrap += returnedScrap;
    }

    saveProgress();
    SFX.playExplosion("large");
    openUpgradesScreen();
    updateHUD();
}

function checkAvailableUpgradesRealtime() {
    const toast = document.getElementById("upgrade-alert-toast");
    if (!toast) return;

    if (!gameState.active) {
        toast.style.display = "none";
        return;
    }

    const currentTotalScraps = pilotData.accumulatedScrap + gameState.scrapsInSector;
    let canAffordAny = false;

    for (let key in pilotData.upgrades) {
        const lvl = pilotData.upgrades[key];
        const isMax = lvl >= (key === 'chassis' ? 3 : GAME_CONFIG.maxUpgrades);
        if (!isMax) {
            const cost = lvl * 100 + (key === 'drone' ? 100 : 0);
            if (currentTotalScraps >= cost) {
                canAffordAny = true;
                break;
            }
        }
    }

    if (canAffordAny) {
        toast.style.display = "block";
    } else {
        toast.style.display = "none";
    }
}

// ==========================================================================
// INICIALIZAÇÃO DE FASE
// ==========================================================================
function startSector(sectorNum) {
    uiOverlay.style.display = "none";
    hudOverlay.style.display = "flex";

    gameState.active = true;
    gameState.paused = false;
    gameState.warping = false;
    gameState.bossSpawned = false;
    gameState.score = 0;
    gameState.scrapsInSector = 0;
    gameState.lives = 3;
    gameState.currentWave = 1;
    gameState.screenShake = 0;
    gameState.bgTime = 0;

    entities.player = new Player(GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2);
    entities.drone = null;
    entities.asteroids = [];
    entities.bullets = [];
    entities.enemyBullets = [];
    entities.enemies = [];
    entities.scraps = [];
    entities.particles = [];
    entities.anomalies = [];
    entities.boss = null;
    entities.powerups = [];

    if (pilotData.upgrades.drone > 0) {
        entities.drone = new DroneNPC(entities.player);
    }

    setupSectorLayout(sectorNum);

    SFX.stopAmbientMusic();
    SFX.startAmbientMusic(sectorNum);

    updateHUD();
    checkAvailableUpgradesRealtime();
}

function setupSectorLayout(sectorNum) {
    const numAsteroids = 2 + Math.floor(sectorNum * 0.4);

    for (let i = 0; i < numAsteroids; i++) {
        let x, y;
        do {
            x = Math.random() * GAME_CONFIG.canvasWidth;
            y = Math.random() * GAME_CONFIG.canvasHeight;
        } while (Math.hypot(x - GAME_CONFIG.canvasWidth / 2, y - GAME_CONFIG.canvasHeight / 2) < 250);

        entities.asteroids.push(new Asteroid(x, y, 60 + Math.random() * 30));
    }

    if (sectorNum === 4 || sectorNum === 8 || sectorNum === 11 || sectorNum === 12) {
        entities.anomalies.push(new BlackHole(GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2));
    }

    if (sectorNum >= 2) {
        spawnEnemyShip();
    }

    if (sectorNum % 3 === 0) {
        gameState.totalWaves = 1;
    } else {
        gameState.totalWaves = 2;
    }
}

function togglePause() {
    if (!gameState.active || gameState.warping) return;

    gameState.paused = !gameState.paused;
    if (gameState.paused) {
        SFX.stopAmbientMusic();
        uiOverlay.style.display = "flex";
        const cards = document.querySelectorAll(".menu-card");
        cards.forEach(card => card.classList.remove("active"));
        screenPause.classList.add("active");
    } else {
        uiOverlay.style.display = "none";
        SFX.startAmbientMusic(pilotData.currentSector);
    }
}

// ==========================================================================
// LOOP DE JOGO E FÍSICA
// ==========================================================================
function gameLoop(timestamp) {
    if (!gameState.lastTime) gameState.lastTime = timestamp;
    const dt = (timestamp - gameState.lastTime) / 1000;
    gameState.lastTime = timestamp;

    pollGamepad();

    if (gameState.active && !gameState.paused) {
        const universeDt = dt * gameState.universeSpeedMultiplier;
        gameState.bgTime += dt;
        update(universeDt);
    } else {
        gameState.bgTime += dt * 0.5;
    }

    draw();
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (gameState.screenShake > 0) {
        gameState.screenShake -= dt * 15;
        if (gameState.screenShake < 0) gameState.screenShake = 0;
    }

    if (entities.player) {
        entities.player.update(dt);
    }
    if (entities.drone) {
        entities.drone.update(dt);
    }

    for (let i = entities.bullets.length - 1; i >= 0; i--) {
        const b = entities.bullets[i];
        b.update(dt);
        if (b.life <= 0) {
            entities.bullets.splice(i, 1);
        }
    }

    for (let i = entities.enemyBullets.length - 1; i >= 0; i--) {
        const eb = entities.enemyBullets[i];
        eb.update(dt);
        if (eb.life <= 0) {
            entities.enemyBullets.splice(i, 1);
        }
    }

    entities.asteroids.forEach(ast => ast.update(dt));

    for (let i = entities.enemies.length - 1; i >= 0; i--) {
        const enemy = entities.enemies[i];
        enemy.update(dt);
        if (enemy.destroyed) {
            entities.enemies.splice(i, 1);
        }
    }

    entities.anomalies.forEach(anom => {
        anom.update(dt);
        if (entities.player) {
            applyGravity(anom, entities.player, dt);
        }

        for (let i = entities.asteroids.length - 1; i >= 0; i--) {
            const ast = entities.asteroids[i];
            applyGravity(anom, ast, dt);

            if (Math.hypot(anom.x - ast.x, anom.y - ast.y) < anom.radius + 5) {
                for (let j = 0; j < 12; j++) {
                    entities.particles.push(new Particle(ast.x, ast.y, "#cc00ff", "spark"));
                }
                SFX.playExplosion("small");
                entities.asteroids.splice(i, 1);
            }
        }

        for (let i = entities.enemies.length - 1; i >= 0; i--) {
            const en = entities.enemies[i];
            applyGravity(anom, en, dt);

            if (Math.hypot(anom.x - en.x, anom.y - en.y) < anom.radius + 5) {
                for (let j = 0; j < 15; j++) {
                    entities.particles.push(new Particle(en.x, en.y, "#cc00ff", "spark"));
                }
                SFX.playExplosion("large");
                entities.enemies.splice(i, 1);
            }
        }
    });

    for (let i = entities.scraps.length - 1; i >= 0; i--) {
        const scr = entities.scraps[i];
        scr.update(dt);

        if (entities.player) {
            const dist = Math.hypot(entities.player.x - scr.x, entities.player.y - scr.y);
            if (dist < 200) {
                const angle = Math.atan2(entities.player.y - scr.y, entities.player.x - scr.x);
                scr.vx += Math.cos(angle) * 500 * dt;
                scr.vy += Math.sin(angle) * 500 * dt;
            }

            if (dist < entities.player.radius + scr.radius) {
                gameState.scrapsInSector += scr.value;
                SFX.playCollect();
                entities.scraps.splice(i, 1);
                updateHUD();
                checkAvailableUpgradesRealtime();
                continue;
            }
        }

        if (scr.life <= 0) {
            entities.scraps.splice(i, 1);
        }
    }

    for (let i = entities.powerups.length - 1; i >= 0; i--) {
        const pu = entities.powerups[i];
        pu.update(dt);

        if (entities.player) {
            const dist = Math.hypot(entities.player.x - pu.x, entities.player.y - pu.y);
            if (dist < entities.player.radius + pu.radius) {
                entities.player.activateTemporaryOverdrive();
                SFX.playShieldActive();
                entities.powerups.splice(i, 1);
                continue;
            }
        }

        if (pu.life <= 0) {
            entities.powerups.splice(i, 1);
        }
    }

    if (entities.boss) {
        entities.boss.update(dt);
        if (entities.boss.destroyed) {
            entities.boss = null;
        }
    }

    for (let i = entities.particles.length - 1; i >= 0; i--) {
        const p = entities.particles[i];
        p.update(dt);
        if (p.life <= 0) {
            entities.particles.splice(i, 1);
        }
    }

    checkCollisions();
    checkWaveProgression();
}

function checkWaveProgression() {
    if (entities.asteroids.length === 0 && entities.enemies.length === 0 && !entities.boss) {
        const isBossSector = pilotData.currentSector % 3 === 0;

        if (isBossSector && gameState.currentWave === gameState.totalWaves && !gameState.bossSpawned) {
            spawnSectorBoss();
        } else if (gameState.currentWave < gameState.totalWaves) {
            gameState.currentWave++;
            spawnNextWave();
        } else if (!gameState.warping) {
            triggerWarpSequence();
        }
    }
}

function spawnNextWave() {
    const mult = gameState.currentWave;
    const numToSpawn = 1 + Math.floor(mult * 0.5);
    for (let i = 0; i < numToSpawn; i++) {
        let x, y;
        do {
            x = Math.random() * GAME_CONFIG.canvasWidth;
            y = Math.random() * GAME_CONFIG.canvasHeight;
        } while (entities.player && Math.hypot(x - entities.player.x, y - entities.player.y) < 250);

        entities.asteroids.push(new Asteroid(x, y, 50 + Math.random() * 25));
    }

    if (pilotData.currentSector >= 2) {
        for (let i = 0; i < Math.floor(pilotData.currentSector / 4) + 1; i++) {
            spawnEnemyShip();
        }
    }
}

function spawnEnemyShip() {
    let type = "fighter";
    const rand = Math.random();
    if (pilotData.currentSector >= 5 && rand > 0.6) {
        type = "bomber";
    } else if (pilotData.currentSector >= 8 && rand > 0.4) {
        type = "defender";
    }

    let x, y;
    if (Math.random() > 0.5) {
        x = Math.random() > 0.5 ? 0 : GAME_CONFIG.canvasWidth;
        y = Math.random() * GAME_CONFIG.canvasHeight;
    } else {
        x = Math.random() * GAME_CONFIG.canvasWidth;
        y = Math.random() > 0.5 ? 0 : GAME_CONFIG.canvasHeight;
    }

    entities.enemies.push(new EnemyShip(x, y, type));
}

function spawnSectorBoss() {
    gameState.bossSpawned = true;
    SFX.playBossAlert();
    triggerGamepadVibration(1000, 0.8, 0.8);
    gameState.screenShake = 15;

    let bossType = 1;
    if (pilotData.currentSector === 3) bossType = 1;
    else if (pilotData.currentSector === 6) bossType = 2;
    else if (pilotData.currentSector === 9) bossType = 3;
    else if (pilotData.currentSector === 12) bossType = 4;

    entities.boss = new SectorBoss(GAME_CONFIG.canvasWidth / 2, -150, bossType);

    const bHud = document.getElementById("boss-hud-container");
    bHud.style.display = "block";
    document.getElementById("boss-name-text").textContent = entities.boss.name;
    document.getElementById("hud-boss-bar").style.width = "100%";
}

function applyGravity(source, target, dt) {
    const dist = Math.hypot(source.x - target.x, source.y - target.y);
    if (dist < source.gravityRadius && dist > 10) {
        const force = (source.gravityForce * (1 - dist / source.gravityRadius)) * 300;
        const angle = Math.atan2(source.y - target.y, source.x - target.x);
        target.vx += Math.cos(angle) * force * dt;
        target.vy += Math.sin(angle) * force * dt;
    }
}

function checkCollisions() {
    // Tiros do player acertando asteroides
    for (let bIdx = entities.bullets.length - 1; bIdx >= 0; bIdx--) {
        const b = entities.bullets[bIdx];
        for (let aIdx = entities.asteroids.length - 1; aIdx >= 0; aIdx--) {
            const ast = entities.asteroids[aIdx];
            if (Math.hypot(b.x - ast.x, b.y - ast.y) < ast.radius) {
                spawnHitParticles(b.x, b.y, "#00ffcc");
                ast.damage(25);
                entities.bullets.splice(bIdx, 1);
                break;
            }
        }
    }

    // Tiros do player acertando inimigos
    for (let bIdx = entities.bullets.length - 1; bIdx >= 0; bIdx--) {
        const b = entities.bullets[bIdx];
        for (let eIdx = entities.enemies.length - 1; eIdx >= 0; eIdx--) {
            const en = entities.enemies[eIdx];
            if (Math.hypot(b.x - en.x, b.y - en.y) < en.radius) {
                spawnHitParticles(b.x, b.y, "#ff0055");
                en.damage(34);
                entities.bullets.splice(bIdx, 1);
                break;
            }
        }
    }

    // Tiros do player acertando Boss
    if (entities.boss) {
        for (let bIdx = entities.bullets.length - 1; bIdx >= 0; bIdx--) {
            const b = entities.bullets[bIdx];
            if (Math.hypot(b.x - entities.boss.x, b.y - entities.boss.y) < entities.boss.radius) {
                spawnHitParticles(b.x, b.y, "#ffcc00");
                entities.boss.damage(10);
                entities.bullets.splice(bIdx, 1);
            }
        }
    }

    // Ameaças acertando o jogador
    if (entities.player && !entities.player.invulnerable) {
        entities.asteroids.forEach(ast => {
            if (Math.hypot(entities.player.x - ast.x, entities.player.y - ast.y) < entities.player.radius + ast.radius) {
                entities.player.hit(30);
                const angle = Math.atan2(entities.player.y - ast.y, entities.player.x - ast.x);
                entities.player.vx += Math.cos(angle) * 150;
                entities.player.vy += Math.sin(angle) * 150;
            }
        });

        entities.enemies.forEach(en => {
            if (Math.hypot(entities.player.x - en.x, entities.player.y - en.y) < entities.player.radius + en.radius) {
                entities.player.hit(25);
                en.damage(50);
            }
        });

        for (let ebIdx = entities.enemyBullets.length - 1; ebIdx >= 0; ebIdx--) {
            const eb = entities.enemyBullets[ebIdx];
            if (Math.hypot(entities.player.x - eb.x, entities.player.y - eb.y) < entities.player.radius) {
                entities.player.hit(15);
                spawnHitParticles(eb.x, eb.y, "#ff0055");
                entities.enemyBullets.splice(ebIdx, 1);
            }
        }

        if (entities.boss && Math.hypot(entities.player.x - entities.boss.x, entities.player.y - entities.boss.y) < entities.player.radius + entities.boss.radius) {
            entities.player.hit(50);
        }

        entities.anomalies.forEach(anom => {
            const distToAnom = Math.hypot(entities.player.x - anom.x, entities.player.y - anom.y);
            if (distToAnom < anom.radius + 5) {
                entities.player.hit(20);
                const escapeAngle = Math.atan2(entities.player.y - anom.y, entities.player.x - anom.x) + (Math.random() - 0.5) * 0.5;
                entities.player.vx = Math.cos(escapeAngle) * 550;
                entities.player.vy = Math.sin(escapeAngle) * 550;
                entities.player.invulnerable = true;
                entities.player.invulnerableTimer = 1.0;

                for (let j = 0; j < 25; j++) {
                    entities.particles.push(new Particle(entities.player.x, entities.player.y, "#cc00ff", "spark"));
                }
                gameState.screenShake = 12;
                SFX.playShieldHit();
            }
        });
    }
}

function spawnHitParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
        entities.particles.push(new Particle(x, y, color, "spark"));
    }
}

function triggerWarpSequence() {
    gameState.warping = true;
    SFX.playWarp();
    triggerGamepadVibration(1200, 0.4, 0.9);

    document.getElementById("boss-hud-container").style.display = "none";
    document.getElementById("upgrade-alert-toast").style.display = "none";

    for (let i = 0; i < 150; i++) {
        entities.particles.push(new Particle(GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2, "#00ffcc", "warp"));
    }

    const currentFinished = pilotData.currentSector;
    if (!pilotData.completedSectors.includes(currentFinished)) {
        pilotData.completedSectors.push(currentFinished);
    }

    pilotData.accumulatedScrap += gameState.scrapsInSector;
    pilotData.totalScore += gameState.score;

    if (currentFinished === pilotData.maxUnlockedSector && pilotData.maxUnlockedSector < GAME_CONFIG.totalSectors) {
        pilotData.maxUnlockedSector++;
    }

    saveProgress();

    setTimeout(() => {
        uiOverlay.style.display = "flex";
        const cards = document.querySelectorAll(".menu-card");
        cards.forEach(card => card.classList.remove("active"));
        screenWarp.classList.add("active");

        const nextNum = currentFinished + 1;
        document.getElementById("warp-next-sector").textContent = nextNum <= GAME_CONFIG.totalSectors ? `SETOR ${String(nextNum).padStart(2, '0')}` : "MISSÃO CONCLUÍDA!";
        document.getElementById("warp-scraps-gain").textContent = gameState.scrapsInSector;

        gameState.scrapsInSector = 0;

        let prog = 0;
        const fill = document.getElementById("warp-progress");
        const interval = setInterval(() => {
            prog += 3;
            if (fill) fill.style.width = `${Math.min(prog, 100)}%`;
            if (prog >= 100) {
                clearInterval(interval);
                if (currentFinished === GAME_CONFIG.totalSectors) {
                    showVictoryScreen();
                } else {
                    pilotData.currentSector = currentFinished + 1;
                    saveProgress();
                    startSector(pilotData.currentSector);
                }
            }
        }, 80);

    }, 1500);
}

function showVictoryScreen() {
    SFX.stopAmbientMusic();
    uiOverlay.style.display = "flex";
    const cards = document.querySelectorAll(".menu-card");
    cards.forEach(card => card.classList.remove("active"));
    screenVictory.classList.add("active");

    document.getElementById("victory-pilot-name").textContent = pilotData.name;
    document.getElementById("victory-score").textContent = pilotData.totalScore.toLocaleString();
    document.getElementById("victory-scraps").textContent = pilotData.accumulatedScrap;
}

function triggerPlayerExplosion() {
    SFX.playExplosion("player");
    triggerGamepadVibration(1500, 1.0, 1.0);
    gameState.screenShake = 25;
    document.getElementById("upgrade-alert-toast").style.display = "none";

    for (let i = 0; i < 120; i++) {
        entities.particles.push(new Particle(entities.player.x, entities.player.y, pilotData.signatureColor, "spark"));
        entities.particles.push(new Particle(entities.player.x, entities.player.y, "#ff0055", "smoke"));
    }

    gameState.lives--;
    updateHUD();

    if (gameState.lives > 0) {
        setTimeout(() => {
            if (gameState.active) {
                entities.player = new Player(GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2);
                if (entities.drone) entities.drone.parent = entities.player;
                checkAvailableUpgradesRealtime();
            }
        }, 1800);
    } else {
        setTimeout(() => {
            SFX.stopAmbientMusic();
            uiOverlay.style.display = "flex";
            const cards = document.querySelectorAll(".menu-card");
            cards.forEach(card => card.classList.remove("active"));
            screenGameOver.classList.add("active");

            document.getElementById("gameover-sector").textContent = `Setor ${pilotData.currentSector}`;
            document.getElementById("gameover-score").textContent = gameState.score.toLocaleString();
        }, 2000);
    }
}

// ==========================================================================
// RENDERIZAÇÃO DO CENÁRIO CÓSMICO E ESTRELAS
// ==========================================================================
function draw() {
    ctx.fillStyle = "rgba(3, 3, 12, 0.22)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    const scale = getScaleFactor();
    const offsetX = (canvas.width - GAME_CONFIG.canvasWidth * scale) / 2;
    const offsetY = (canvas.height - GAME_CONFIG.canvasHeight * scale) / 2;

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (gameState.screenShake > 0) {
        const dx = (Math.random() - 0.5) * gameState.screenShake;
        const dy = (Math.random() - 0.5) * gameState.screenShake;
        ctx.translate(dx, dy);
    }

    drawStarfield();
    if (gameState.active) {
        drawCosmicBackground(pilotData.currentSector);
    } else {
        drawCosmicBackground(1);
    }

    entities.anomalies.forEach(anom => anom.draw());
    entities.scraps.forEach(scr => scr.draw());
    entities.powerups.forEach(pu => pu.draw());
    entities.bullets.forEach(b => b.draw());
    entities.enemyBullets.forEach(eb => eb.draw());
    entities.asteroids.forEach(ast => ast.draw());
    entities.enemies.forEach(en => en.draw());

    if (entities.boss) {
        entities.boss.draw();
    }
    if (entities.drone) {
        entities.drone.draw();
    }
    entities.particles.forEach(p => p.draw());

    if (entities.player && !entities.player.destroyed) {
        entities.player.draw();
    }

    ctx.strokeStyle = "rgba(0, 255, 204, 0.04)";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);

    ctx.restore();
}

function drawStarfield() {
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    for (let i = 1; i <= 80; i++) {
        const sx = (i * 317) % GAME_CONFIG.canvasWidth;
        const sy = (i * 743) % GAME_CONFIG.canvasHeight;
        const size = (i % 3 === 0) ? 2.0 : 1.0;
        ctx.fillRect(sx, sy, size, size);
    }
}

function drawCosmicBackground(sector) {
    ctx.save();
    const t = gameState.bgTime;

    if (sector <= 3) {
        const gradX = GAME_CONFIG.canvasWidth * 0.3 + Math.sin(t * 0.05) * 50;
        const gradY = GAME_CONFIG.canvasHeight * 0.4 + Math.cos(t * 0.04) * 40;
        const nebula = ctx.createRadialGradient(gradX, gradY, 50, gradX, gradY, 600);
        nebula.addColorStop(0, "rgba(76, 29, 149, 0.06)");
        nebula.addColorStop(0.5, "rgba(30, 58, 138, 0.03)");
        nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = nebula;
        ctx.beginPath();
        ctx.arc(gradX, gradY, 800, 0, Math.PI * 2);
        ctx.fill();
    }

    if (sector >= 4 && sector <= 6) {
        const planetX = GAME_CONFIG.canvasWidth * 0.75;
        const planetY = GAME_CONFIG.canvasHeight * 0.3;
        const radius = 120;

        ctx.strokeStyle = "rgba(147, 197, 253, 0.025)";
        ctx.lineWidth = 15;
        ctx.save();
        ctx.translate(planetX, planetY);
        ctx.rotate(-Math.PI / 6);
        ctx.scale(2.2, 0.45);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const lightX = planetX - radius * 0.4;
        const lightY = planetY - radius * 0.4;
        const planetGrad = ctx.createRadialGradient(lightX, lightY, radius * 0.1, planetX, planetY, radius);
        planetGrad.addColorStop(0, "rgba(147, 197, 253, 0.05)");
        planetGrad.addColorStop(0.7, "rgba(30, 58, 138, 0.03)");
        planetGrad.addColorStop(0.95, "rgba(3, 3, 15, 0.05)");
        ctx.fillStyle = planetGrad;
        ctx.beginPath();
        ctx.arc(planetX, planetY, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    if (sector >= 7 && sector <= 9) {
        ctx.lineWidth = 60;
        const colors = ["rgba(16, 185, 129, 0.015)", "rgba(6, 182, 212, 0.012)", "rgba(59, 130, 246, 0.008)"];
        colors.forEach((col, index) => {
            ctx.strokeStyle = col;
            ctx.beginPath();
            const offsetPhase = t * 0.2 + index * Math.PI * 0.3;
            for (let x = 0; x <= GAME_CONFIG.canvasWidth; x += 50) {
                const y = GAME_CONFIG.canvasHeight * 0.5 + Math.sin(x * 0.0025 + offsetPhase) * 120 + Math.cos(x * 0.001 - offsetPhase * 0.5) * 60;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        });
    }

    if (sector >= 10) {
        const centerX = GAME_CONFIG.canvasWidth / 2;
        const centerY = GAME_CONFIG.canvasHeight / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(t * 0.015);
        const vortex = ctx.createRadialGradient(0, 0, 10, 0, 0, 500);
        vortex.addColorStop(0, "rgba(220, 38, 38, 0.05)");
        vortex.addColorStop(0.3, "rgba(124, 58, 237, 0.03)");
        vortex.addColorStop(0.7, "rgba(30, 27, 75, 0.015)");
        vortex.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = vortex;
        ctx.beginPath();
        ctx.ellipse(0, 0, 800, 350, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function updateHUD() {
    document.getElementById("hud-pilot-name").textContent = pilotData.name;
    document.getElementById("hud-pilot-name").style.color = pilotData.signatureColor;
    document.getElementById("hud-score").textContent = String(gameState.score).padStart(6, '0');
    document.getElementById("hud-sector").textContent = `${String(pilotData.currentSector).padStart(2, '0')} / 12`;
    document.getElementById("hud-scraps").textContent = gameState.scrapsInSector;

    const livesContainer = document.getElementById("hud-lives");
    livesContainer.innerHTML = "";
    for (let i = 0; i < gameState.lives; i++) {
        livesContainer.innerHTML += "💖 ";
    }
    if (gameState.lives === 0) livesContainer.innerHTML = "CRÍTICO";

    const dStatus = document.getElementById("hud-drone-status");
    if (pilotData.upgrades.drone > 0) {
        dStatus.style.opacity = "1";
        document.getElementById("hud-drone-text").textContent = `ATIVO NÍV ${pilotData.upgrades.drone}`;
        document.getElementById("hud-drone-text").style.color = "#00ffcc";
    } else {
        dStatus.style.opacity = "0.5";
        document.getElementById("hud-drone-text").textContent = "BLOQUEADO";
        document.getElementById("hud-drone-text").style.color = "#718096";
    }
}

// ==========================================================================
// CLASSES COMPLETAS DO JOGO
// ==========================================================================

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.chassisLevel = pilotData.upgrades.chassis || 1;
        this.radius = 18 + (this.chassisLevel - 1) * 6;
        this.angle = -Math.PI / 2;
        this.vx = 0;
        this.vy = 0;
        this.destroyed = false;
        this.overdriveActive = false;
        this.overdriveTimer = 0;

        this.maxShield = 100 + (pilotData.upgrades.shield - 1) * 20 + (this.chassisLevel - 1) * 30;
        this.shield = this.maxShield;
        this.energy = 100;
        this.invulnerable = true;
        this.invulnerableTimer = 2.0;

        const engineLvl = pilotData.upgrades.engine;
        this.acceleration = (180 + engineLvl * 35) * (1 - (this.chassisLevel - 1) * 0.05);
        this.friction = 0.985;
        this.rotationSpeed = (4.0 + engineLvl * 0.4) * (1 - (this.chassisLevel - 1) * 0.05);

        this.shootCooldown = 0;
        const weaponLvl = pilotData.upgrades.weapon;
        this.shootRate = Math.max(0.12, 0.28 - weaponLvl * 0.03);
    }

    update(dt) {
        if (this.overdriveActive) {
            this.overdriveTimer -= dt;
            if (this.overdriveTimer <= 0) {
                this.overdriveActive = false;
                document.getElementById("hud-weapon-name").textContent = "LASER";
                document.getElementById("hud-weapon-name").style.color = "#ff9900";
            }
        }

        if (this.invulnerable && !this.overdriveActive) {
            this.invulnerableTimer -= dt;
            if (this.invulnerableTimer <= 0) {
                this.invulnerable = false;
            }
        }

        if (this.energy < 100) {
            this.energy += dt * (10 + pilotData.upgrades.shield * 2);
            if (this.energy > 100) this.energy = 100;
        }

        if (this.shootCooldown > 0) this.shootCooldown -= dt;

        const rotLeft = gameState.keys["a"] || gameState.keys["arrowleft"] || gameState.keys["gamepad_left"];
        const rotRight = gameState.keys["d"] || gameState.keys["arrowright"] || gameState.keys["gamepad_right"];
        const thrust = gameState.keys["w"] || gameState.keys["arrowup"] || gameState.keys["gamepad_up"];
        const fire = gameState.keys["space"] || gameState.keys["gamepad_fire"];
        const special = gameState.keys["shift"] || gameState.keys["gamepad_special"];

        if (rotLeft) this.angle -= this.rotationSpeed * dt;
        if (rotRight) this.angle += this.rotationSpeed * dt;

        if (thrust) {
            this.vx += Math.cos(this.angle) * this.acceleration * dt;
            this.vy += Math.sin(this.angle) * this.acceleration * dt;

            if (Math.random() > 0.6) {
                SFX.playThruster();
            }

            const exhaustX = this.x - Math.cos(this.angle) * this.radius;
            const exhaustY = this.y - Math.sin(this.angle) * this.radius;
            const thrustCol = this.overdriveActive ? "#ffcc00" : pilotData.signatureColor;
            entities.particles.push(new Particle(exhaustX, exhaustY, thrustCol, "smoke"));
        }

        this.vx *= this.friction;
        this.vy *= this.friction;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        const margin = this.radius;
        if (this.x < -margin) this.x = GAME_CONFIG.canvasWidth + margin;
        if (this.x > GAME_CONFIG.canvasWidth + margin) this.x = -margin;
        if (this.y < -margin) this.y = GAME_CONFIG.canvasHeight + margin;
        if (this.y > GAME_CONFIG.canvasHeight + margin) this.y = -margin;

        if (fire) {
            this.shoot();
        }

        if (special && this.energy >= 100) {
            this.activateSpecialShield();
        }

        const sBar = document.getElementById("hud-shield-bar");
        if (sBar) sBar.style.width = `${(this.shield / this.maxShield) * 100}%`;
        const eBar = document.getElementById("hud-energy-bar");
        if (eBar) eBar.style.width = `${this.energy}%`;
    }

    shoot() {
        if (this.shootCooldown > 0) return;

        const weaponLvl = pilotData.upgrades.weapon;
        this.shootCooldown = this.overdriveActive ? this.shootRate * 0.75 : this.shootRate;

        const noseX = this.x + Math.cos(this.angle) * this.radius;
        const noseY = this.y + Math.sin(this.angle) * this.radius;
        const bulletDamageMult = 1.0 + (this.chassisLevel - 1) * 0.25;

        if (this.overdriveActive) {
            const spreadAngles = [-0.3, -0.15, 0, 0.15, 0.3];
            spreadAngles.forEach(ang => {
                const b = new Bullet(noseX, noseY, this.angle + ang, 650);
                b.color = "#ffcc00";
                b.radius = 5.5;
                b.damage = 40 * bulletDamageMult;
                entities.bullets.push(b);
            });
            SFX.playLaser('triple');
            return;
        }

        if (weaponLvl >= 4) {
            const spreadAngles = [-0.25, -0.08, 0.08, 0.25];
            spreadAngles.forEach(ang => {
                const b = new Bullet(noseX, noseY, this.angle + ang, 540);
                b.damage = 18 * bulletDamageMult;
                entities.bullets.push(b);
            });
            SFX.playLaser('triple');
        } else if (weaponLvl === 3) {
            const spreadAngles = [-0.18, 0, 0.18];
            spreadAngles.forEach(ang => {
                const b = new Bullet(noseX, noseY, this.angle + ang, 520);
                b.damage = 22 * bulletDamageMult;
                entities.bullets.push(b);
            });
            SFX.playLaser('triple');
        } else if (weaponLvl === 2) {
            const sideOffsetL = this.angle - Math.PI/2;
            const sideOffsetR = this.angle + Math.PI/2;
            const b1 = new Bullet(this.x + Math.cos(sideOffsetL)*8, this.y + Math.sin(sideOffsetL)*8, this.angle, 520);
            const b2 = new Bullet(this.x + Math.cos(sideOffsetR)*8, this.y + Math.sin(sideOffsetR)*8, this.angle, 520);
            b1.damage = 25 * bulletDamageMult;
            b2.damage = 25 * bulletDamageMult;
            entities.bullets.push(b1, b2);
            SFX.playLaser('plasma');
        } else {
            const b = new Bullet(noseX, noseY, this.angle, 480);
            b.damage = 30 * bulletDamageMult;
            entities.bullets.push(b);
            SFX.playLaser('laser');
        }
    }

    activateTemporaryOverdrive() {
        this.overdriveActive = true;
        this.overdriveTimer = 10.0;
        this.shield = this.maxShield;
        document.getElementById("hud-weapon-name").textContent = "PLASMA GOLD (OVERDRIVE)";
        document.getElementById("hud-weapon-name").style.color = "#ffcc00";

        for (let i = 0; i < 50; i++) {
            entities.particles.push(new Particle(this.x, this.y, "#ffcc00", "spark"));
        }
    }

    activateSpecialShield() {
        this.energy = 0;
        this.invulnerable = true;
        this.invulnerableTimer = 4.0;
        this.shield = this.maxShield;
        SFX.playShieldActive();

        for (let i = 0; i < 40; i++) {
            entities.particles.push(new Particle(this.x, this.y, "#00ffff", "spark"));
        }
    }

    hit(damageAmount) {
        if (this.invulnerable || this.overdriveActive || this.destroyed) return;

        this.shield -= damageAmount;
        SFX.playShieldHit();
        gameState.screenShake = 6;
        triggerGamepadVibration(200, 0.4, 0.3);

        for (let i = 0; i < 5; i++) {
            entities.particles.push(new Particle(this.x, this.y, "#ffffff", "spark"));
        }

        if (this.shield <= 0) {
            this.destroyed = true;
            triggerPlayerExplosion();
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        let mainColor = pilotData.signatureColor;
        let glowColor = pilotData.signatureColor;

        if (this.overdriveActive) {
            mainColor = "#ffffff";
            glowColor = "#ffcc00";
        }

        ctx.shadowBlur = this.overdriveActive ? 30 : 15;
        ctx.shadowColor = glowColor;

        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2.5;
        ctx.fillStyle = "rgba(4, 4, 15, 0.85)";

        ctx.beginPath();

        if (this.chassisLevel === 1) {
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(-this.radius, -this.radius * 0.8);
            ctx.lineTo(-this.radius * 0.5, 0);
            ctx.lineTo(-this.radius, this.radius * 0.8);
        } else if (this.chassisLevel === 2) {
            ctx.moveTo(this.radius * 1.1, 0);
            ctx.lineTo(-this.radius * 0.5, -this.radius * 0.6);
            ctx.lineTo(-this.radius, -this.radius);
            ctx.lineTo(-this.radius * 0.6, -this.radius * 0.2);
            ctx.lineTo(-this.radius * 0.6, this.radius * 0.2);
            ctx.lineTo(-this.radius, this.radius);
            ctx.lineTo(-this.radius * 0.5, this.radius * 0.6);
        } else {
            ctx.moveTo(this.radius * 1.2, 0);
            ctx.lineTo(this.radius * 0.4, -this.radius * 0.5);
            ctx.lineTo(-this.radius * 0.2, -this.radius * 1.1);
            ctx.lineTo(-this.radius * 0.5, -this.radius * 0.7);
            ctx.lineTo(-this.radius, -this.radius * 0.7);
            ctx.lineTo(-this.radius * 0.6, 0);
            ctx.lineTo(-this.radius, this.radius * 0.7);
            ctx.lineTo(-this.radius * 0.5, this.radius * 0.7);
            ctx.lineTo(-this.radius * 0.2, this.radius * 1.1);
            ctx.lineTo(this.radius * 0.4, this.radius * 0.5);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(this.radius * 0.1, 0, 4 + (this.chassisLevel - 1) * 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        if (this.invulnerable || this.overdriveActive) {
            ctx.save();
            ctx.shadowBlur = 25;
            ctx.shadowColor = this.overdriveActive ? "#ffcc00" : "#00ffff";
            ctx.strokeStyle = this.overdriveActive ? "rgba(255, 204, 0, 0.7)" : "rgba(0, 255, 255, 0.7)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}

class DroneNPC {
    constructor(parentPlayer) {
        this.parent = parentPlayer;
        this.x = parentPlayer.x - 40;
        this.y = parentPlayer.y - 40;
        this.radius = 8;
        this.angle = 0;
        this.orbitRadius = 55;
        this.orbitSpeed = 1.8;
        this.shootCooldown = 0;

        const droneLvl = pilotData.upgrades.drone;
        this.shootRate = Math.max(0.3, 0.8 - droneLvl * 0.12);
    }

    update(dt) {
        if (!this.parent || this.parent.destroyed) return;

        this.angle += this.orbitSpeed * dt;
        const targetX = this.parent.x + Math.cos(this.angle) * this.orbitRadius;
        const targetY = this.parent.y + Math.sin(this.angle) * this.orbitRadius;

        this.x += (targetX - this.x) * 8 * dt;
        this.y += (targetY - this.y) * 8 * dt;

        if (this.shootCooldown > 0) this.shootCooldown -= dt;

        if (this.shootCooldown <= 0) {
            let target = this.findNearestTarget();
            if (target) {
                this.shootAt(target);
            }
        }
    }

    findNearestTarget() {
        let nearest = null;
        let minDist = 350;

        entities.asteroids.forEach(ast => {
            const d = Math.hypot(ast.x - this.x, ast.y - this.y);
            if (d < minDist) {
                minDist = d;
                nearest = ast;
            }
        });

        entities.enemies.forEach(en => {
            const d = Math.hypot(en.x - this.x, en.y - this.y);
            if (d < minDist) {
                minDist = d;
                nearest = en;
            }
        });

        if (entities.boss) {
            const d = Math.hypot(entities.boss.x - this.x, entities.boss.y - this.y);
            if (d < minDist) nearest = entities.boss;
        }

        return nearest;
    }

    shootAt(target) {
        this.shootCooldown = this.shootRate;
        const fireAngle = Math.atan2(target.y - this.y, target.x - this.x);

        const b = new Bullet(this.x, this.y, fireAngle, 450);
        b.color = "#00ffcc";
        b.radius = 2.5;
        entities.bullets.push(b);
        SFX.playLaser('drone');
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.shadowBlur = 10;
        ctx.shadowColor = "#00ffff";
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 1.8;
        ctx.fillStyle = "#03030c";

        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(-this.radius * 0.7, -this.radius * 0.7);
        ctx.lineTo(-this.radius * 0.7, this.radius * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, angle, speed) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = 3.5;
        this.color = "#00ffcc";
        this.life = 1.2;
        this.damage = 30;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;

        if (this.x < 0 || this.x > GAME_CONFIG.canvasWidth || this.y < 0 || this.y > GAME_CONFIG.canvasHeight) {
            this.life = 0;
        }
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class PowerUp {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 12;
        this.life = 8.0;
        this.angle = 0;
        this.pulse = 0;

        const dirAngle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(dirAngle) * 35;
        this.vy = Math.sin(dirAngle) * 35;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        this.angle += dt * 3;
        this.pulse += dt * 6;

        this.vx *= 0.985;
        this.vy *= 0.985;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.shadowBlur = 15 + Math.sin(this.pulse) * 5;
        ctx.shadowColor = "#ffcc00";
        ctx.strokeStyle = "#ffcc00";
        ctx.lineWidth = 2;
        ctx.fillStyle = "rgba(255, 204, 0, 0.4)";

        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const px = Math.cos(ang) * this.radius;
            const py = Math.sin(ang) * this.radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

class Asteroid {
    constructor(x, y, radius, level = 3) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.level = level;
        this.hp = level * 20;

        const speed = 40 + (4 - level) * 20 + Math.random() * 20;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 1.5;

        this.numOffsets = 10 + Math.floor(Math.random() * 5);
        this.offsets = [];
        for (let i = 0; i < this.numOffsets; i++) {
            this.offsets.push(0.8 + Math.random() * 0.4);
        }
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.rotation += this.rotationSpeed * dt;

        const margin = this.radius;
        if (this.x < -margin) this.x = GAME_CONFIG.canvasWidth + margin;
        if (this.x > GAME_CONFIG.canvasWidth + margin) this.x = -margin;
        if (this.y < -margin) this.y = GAME_CONFIG.canvasHeight + margin;
        if (this.y > GAME_CONFIG.canvasHeight + margin) this.y = -margin;
    }

    damage(amount) {
        this.hp -= amount;
        SFX.playExplosion("small");
        if (this.hp <= 0) {
            this.destroy();
        }
    }

    destroy() {
        const sizeTag = this.level === 3 ? "large" : (this.level === 2 ? "medium" : "small");
        SFX.playExplosion(sizeTag);

        gameState.score += this.level * 100;
        updateHUD();

        if (Math.random() < 0.35) {
            entities.scraps.push(new Scrap(this.x, this.y));
        }

        if (this.level === 3 && Math.random() < 0.3) {
            entities.powerups.push(new PowerUp(this.x, this.y));
        }

        if (this.level > 1) {
            const nextLvl = this.level - 1;
            const nextRadius = this.radius * 0.55;
            entities.asteroids.push(new Asteroid(this.x, this.y, nextRadius, nextLvl));
            entities.asteroids.push(new Asteroid(this.x, this.y, nextRadius, nextLvl));
        }

        for (let i = 0; i < this.level * 8; i++) {
            entities.particles.push(new Particle(this.x, this.y, "#94a3b8", "spark"));
        }

        const idx = entities.asteroids.indexOf(this);
        if (idx !== -1) {
            entities.asteroids.splice(idx, 1);
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        ctx.shadowBlur = 6;
        ctx.shadowColor = "rgba(148, 163, 184, 0.3)";
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1.8;
        ctx.fillStyle = "rgba(10, 10, 20, 0.9)";

        ctx.beginPath();
        for (let i = 0; i < this.numOffsets; i++) {
            const angle = (i / this.numOffsets) * Math.PI * 2;
            const r = this.radius * this.offsets[i];
            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

class EnemyShip {
    constructor(x, y, type = "fighter") {
        this.x = x;
        this.y = y;
        this.type = type;
        this.destroyed = false;

        this.radius = type === "fighter" ? 14 : (type === "bomber" ? 22 : 18);
        this.hp = type === "fighter" ? 30 : (type === "bomber" ? 70 : 100);

        this.vx = 0;
        this.vy = 0;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = type === "fighter" ? 120 : (type === "bomber" ? 70 : 90);
        this.shootCooldown = 1.0 + Math.random();
    }

    update(dt) {
        if (!entities.player || entities.player.destroyed) return;

        const angleToPlayer = Math.atan2(entities.player.y - this.y, entities.player.x - this.x);
        this.angle += (angleToPlayer - this.angle) * 3 * dt;

        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.type === "bomber") {
            this.shootCooldown -= dt;
            if (this.shootCooldown <= 0) {
                this.shootCooldown = 3.5;
                entities.asteroids.push(new Asteroid(this.x, this.y, 14, 1));
            }
        } else {
            this.shootCooldown -= dt;
            if (this.shootCooldown <= 0) {
                this.shootCooldown = 2.0 + Math.random();
                this.shoot();
            }
        }
    }

    shoot() {
        const angleToPlayer = Math.atan2(entities.player.y - this.y, entities.player.x - this.x);
        const eb = new Bullet(this.x, this.y, angleToPlayer, 350);
        eb.color = "#ff0055";
        entities.enemyBullets.push(eb);
        SFX.playLaser('laser');
    }

    damage(amount) {
        this.hp -= amount;
        SFX.playShieldHit();
        if (this.hp <= 0) {
            this.destroy();
        }
    }

    destroy() {
        this.destroyed = true;
        SFX.playExplosion("large");
        gameState.score += 250;
        updateHUD();

        if (Math.random() < 0.5) {
            entities.scraps.push(new Scrap(this.x, this.y));
        }

        if (Math.random() < 0.25) {
            entities.powerups.push(new PowerUp(this.x, this.y));
        }

        for (let i = 0; i < 20; i++) {
            entities.particles.push(new Particle(this.x, this.y, "#ff0055", "spark"));
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.shadowBlur = 12;
        ctx.shadowColor = "#ff0055";
        ctx.strokeStyle = "#ff0055";
        ctx.lineWidth = 2;
        ctx.fillStyle = "rgba(20, 4, 10, 0.9)";

        ctx.beginPath();
        if (this.type === "fighter") {
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(-this.radius, -this.radius * 0.8);
            ctx.lineTo(-this.radius * 0.4, 0);
            ctx.lineTo(-this.radius, this.radius * 0.8);
        } else if (this.type === "bomber") {
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(this.radius * 0.3, -this.radius);
            ctx.lineTo(-this.radius, -this.radius * 0.6);
            ctx.lineTo(-this.radius, this.radius * 0.6);
            ctx.lineTo(this.radius * 0.3, this.radius);
        } else {
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(-this.radius * 0.2, -this.radius);
            ctx.lineTo(-this.radius, -this.radius * 0.5);
            ctx.lineTo(-this.radius, this.radius * 0.5);
            ctx.lineTo(-this.radius * 0.2, this.radius);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

class SectorBoss {
    constructor(x, y, bossType = 1) {
        this.x = x;
        this.y = y;
        this.bossType = bossType;
        this.destroyed = false;

        this.radius = 80;
        this.maxHp = 500 + bossType * 250;
        this.hp = this.maxHp;

        const names = [
            "LEVIATÃ DO VAZIO CLASSE S",
            "ENCOURAÇADO ENERGÉTICO 'AEGIS'",
            "NÚCLEO DE SINGULARIDADE S-9",
            "IA SUPREMA AUTÔNOMA 'OMEGA PRIME'"
        ];
        this.name = names[bossType - 1];

        this.targetY = 220;
        this.vx = 80;
        this.shootCooldown = 2.0;
        this.specialCooldown = 5.0;
    }

    update(dt) {
        if (this.y < this.targetY) {
            this.y += 100 * dt;
            return;
        }

        this.x += this.vx * dt;
        if (this.x < 150 || this.x > GAME_CONFIG.canvasWidth - 150) {
            this.vx *= -1;
        }

        if (this.shootCooldown > 0) this.shootCooldown -= dt;
        if (this.specialCooldown > 0) this.specialCooldown -= dt;

        if (this.shootCooldown <= 0) {
            this.fireStandardBarrage();
        }

        if (this.specialCooldown <= 0) {
            this.fireSpecialAttack();
        }
    }

    fireStandardBarrage() {
        this.shootCooldown = 1.6 - this.bossType * 0.15;
        const numLasers = 6 + this.bossType * 2;
        for (let i = 0; i < numLasers; i++) {
            const angle = (i / numLasers) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
            const eb = new Bullet(this.x, this.y, angle, 280);
            eb.color = "#ff3300";
            eb.radius = 4.5;
            entities.enemyBullets.push(eb);
        }
        SFX.playLaser('triple');
    }

    fireSpecialAttack() {
        this.specialCooldown = 6.0;

        if (this.bossType === 1) {
            for (let i = 0; i < 3; i++) {
                entities.enemies.push(new EnemyShip(this.x + (i - 1) * 80, this.y + 40, "fighter"));
            }
        } else if (this.bossType === 2) {
            if (entities.player) {
                const angle = Math.atan2(entities.player.y - this.y, entities.player.x - this.x);
                for (let j = -2; j <= 2; j++) {
                    const b = new Bullet(this.x, this.y, angle + j * 0.15, 420);
                    b.color = "#ffcc00";
                    b.radius = 5;
                    entities.enemyBullets.push(b);
                }
            }
        } else if (this.bossType === 3) {
            if (entities.anomalies.length === 0) {
                entities.anomalies.push(new BlackHole(GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2));
            }
        } else if (this.bossType === 4) {
            for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
                const b = new Bullet(this.x, this.y, angle, 320);
                b.color = "#cc00ff";
                b.radius = 4;
                entities.enemyBullets.push(b);
            }
        }
    }

    damage(amount) {
        this.hp -= amount;
        SFX.playShieldHit();

        const fill = document.getElementById("hud-boss-bar");
        if (fill) fill.style.width = `${(this.hp / this.maxHp) * 100}%`;

        gameState.screenShake = 4.5;

        if (this.hp <= 0) {
            this.destroy();
        }
    }

    destroy() {
        this.destroyed = true;
        SFX.playExplosion("boss");
        gameState.screenShake = 35;
        triggerGamepadVibration(2500, 1.0, 1.0);

        document.getElementById("boss-hud-container").style.display = "none";

        gameState.score += 5000;
        pilotData.accumulatedScrap += 150 * this.bossType;
        saveProgress();
        updateHUD();

        for (let i = 0; i < 25; i++) {
            entities.scraps.push(new Scrap(this.x + (Math.random() - 0.5) * 80, this.y + (Math.random() - 0.5) * 80));
        }

        for (let i = 0; i < 2; i++) {
            entities.powerups.push(new PowerUp(this.x + (Math.random()-0.5)*100, this.y + (Math.random()-0.5)*100));
        }

        for (let i = 0; i < 80; i++) {
            entities.particles.push(new Particle(this.x, this.y, "#ffcc00", "spark"));
            entities.particles.push(new Particle(this.x, this.y, "#ff0055", "smoke"));
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.shadowBlur = 25;
        ctx.shadowColor = this.bossType === 4 ? "#cc00ff" : (this.bossType === 3 ? "#00ffff" : "#ff3300");
        ctx.strokeStyle = this.bossType === 4 ? "#cc00ff" : (this.bossType === 3 ? "#00ffff" : "#ff3300");
        ctx.lineWidth = 4;
        ctx.fillStyle = "rgba(5, 5, 15, 0.95)";

        ctx.beginPath();
        if (this.bossType === 1) {
            ctx.moveTo(0, -this.radius);
            ctx.lineTo(this.radius, -this.radius * 0.4);
            ctx.lineTo(this.radius * 0.7, this.radius);
            ctx.lineTo(-this.radius * 0.7, this.radius);
            ctx.lineTo(-this.radius, -this.radius * 0.4);
        } else if (this.bossType === 2) {
            ctx.moveTo(0, -this.radius * 1.2);
            ctx.lineTo(this.radius * 0.9, 0);
            ctx.lineTo(this.radius * 0.4, this.radius * 0.8);
            ctx.lineTo(-this.radius * 0.4, this.radius * 0.8);
            ctx.lineTo(-this.radius * 0.9, 0);
        } else if (this.bossType === 3) {
            const rTime = Date.now() * 0.002;
            ctx.arc(0, 0, this.radius * 0.9, rTime, rTime + Math.PI * 1.5);
        } else {
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const r = this.radius * (i % 2 === 0 ? 1.0 : 0.6);
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

class BlackHole {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 25;
        this.gravityRadius = 280; // Balanceado: Reduzido de 400 para 280 para ampla zona segura
        this.gravityForce = 4; // Balanceado: Reduzido de 12 para 4 para pull suave
        this.pulse = 0;
    }

    update(dt) {
        this.pulse += dt * 3.5;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        const gradient = ctx.createRadialGradient(0, 0, this.radius * 0.5, 0, 0, this.gravityRadius * 0.6);
        gradient.addColorStop(0, "rgba(20, 0, 40, 0.45)");
        gradient.addColorStop(0.3, "rgba(0, 255, 204, 0.1)");
        gradient.addColorStop(1, "rgba(3, 3, 12, 0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.gravityRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 30 + Math.sin(this.pulse) * 10;
        ctx.shadowColor = "#cc00ff";
        ctx.strokeStyle = "#cc00ff";
        ctx.lineWidth = 3 + Math.sin(this.pulse) * 1.2;

        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

class Scrap {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 8;
        this.value = GAME_CONFIG.baseScrapGain;
        this.life = 10.0;

        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 20;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.pulse = Math.random() * 10;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        this.pulse += dt * 5;

        this.vx *= 0.98;
        this.vy *= 0.98;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.shadowBlur = 12 + Math.sin(this.pulse) * 4;
        ctx.shadowColor = "#ffaa00";
        ctx.strokeStyle = "#ffaa00";
        ctx.fillStyle = "rgba(255, 170, 0, 0.35)";
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius * 0.6, -this.radius * 0.2);
        ctx.lineTo(this.radius * 0.2, 0);
        ctx.lineTo(this.radius * 0.7, this.radius * 0.8);
        ctx.lineTo(-this.radius * 0.2, this.radius * 0.2);
        ctx.lineTo(-this.radius * 0.6, this.radius * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color, type = "spark") {
        this.x = x;
        this.y = y;
        this.color = color;
        this.type = type;

        const angle = Math.random() * Math.PI * 2;

        if (type === "spark") {
            const speed = 50 + Math.random() * 200;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.radius = 1.5 + Math.random() * 2;
            this.life = 0.4 + Math.random() * 0.5;
            this.maxLife = this.life;
        } else if (type === "smoke") {
            const speed = 10 + Math.random() * 40;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.radius = 4 + Math.random() * 6;
            this.life = 0.6 + Math.random() * 0.8;
            this.maxLife = this.life;
        } else if (type === "warp") {
            const speed = 300 + Math.random() * 600;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.radius = 1 + Math.random() * 2;
            this.life = 1.0;
            this.maxLife = this.life;
        }
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;

        if (this.type === "smoke") {
            this.radius += dt * 15;
            this.vx *= 0.95;
            this.vy *= 0.95;
        }
    }

    draw() {
        ctx.save();
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;

        ctx.beginPath();
        if (this.type === "spark" || this.type === "warp") {
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === "smoke") {
            ctx.fillStyle = "rgba(40, 40, 60, 0.4)";
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}
