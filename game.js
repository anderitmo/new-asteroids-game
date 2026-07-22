/**
 * ASTEROIDS: NEON VOID - CORE GAME ENGINE
 *
 * Este arquivo gerencia o motor de jogo completo, o loop principal, o desenho de elementos no Canvas,
 * física vetorial de asteroides e tiros, detecção de colisões, suporte a controles de Xbox,
 * inteligência artificial das naves inimigas e drone auxiliar, sistema de upgrades e salvamento.
 *
 * Refinamento: Adicionado plano de fundo cósmico procedimental para cada fase.
 * Adicionado pulo de fase via GET pula-fase.
 * Adicionado upgrade permanente de chassi e canhões (Duplo, Triplo, Quádruplo em leque).
 * Adicionados Power-ups temporários ("OVERDRIVE" com chassi gigante dourado e tiro quíntuplo).
 * Balanceamento: Fases encurtadas (menos ondas de inimigos e menos asteroides iniciais para maior dinamismo).
 */

// ==========================================================================
// CONFIGURAÇÕES GERAIS E ESTADO DO JOGO
// ==========================================================================
const GAME_CONFIG = {
    version: "1.5.0", // Versão com Fases Rápidas e Dinâmicas
    totalSectors: 12,
    baseScrapGain: 15,
    maxUpgrades: 5,
    canvasWidth: 1920, // Resolução interna virtual para proporção ideal em qualquer tela
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
        drone: 0, // 0 significa bloqueado
        chassis: 1 // Permanente: Nível 1 (Cunha), Nível 2 (Cruzador pesado), Nível 3+ (Encouraçado)
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
    totalWaves: 2, // Reduzido de 3 para 2 nas fases normais para encurtar!
    keys: {},
    screenShake: 0,
    gamepadConnected: false,
    gamepadIndex: null,
    lastTime: 0,
    universeSpeedMultiplier: 1.0, // Multiplicador de velocidade inicial ajustável pelo jogador!
    bgTime: 0 // Variável de tempo para animar auroras e nébulas sutilmente
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
    powerups: [] // Lista de power-ups temporários flutuantes
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
            // Destravar setores até o alvo para permitir navegação tática livre
            pilotData.maxUnlockedSector = Math.max(pilotData.maxUnlockedSector, targetPhase);
            pilotData.currentSector = targetPhase;
            saveProgress();

            // Iniciar a partida imediatamente na fase pulada sem passar pelo menu principal
            setTimeout(() => {
                startSector(targetPhase);
            }, 300); // Delay sutil de segurança para sincronia de canvas e som
        }
    }

    // Iniciar loop de renderização (em pausa inicial)
    requestAnimationFrame(gameLoop);
});

window.addEventListener("resize", resizeCanvas);

function resizeCanvas() {
    // Redimensiona o canvas para preencher a janela, mantendo a responsividade
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    canvas.width = containerWidth;
    canvas.height = containerHeight;

    // Detectar dispositivo móvel para habilitar controles virtuais
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
        mobileControls.style.display = "flex";
    } else {
        mobileControls.style.display = "none";
    }
}

// Obter escala de escala para converter coordenadas virtuais (1920x1080) em coordenadas reais
function getScaleFactor() {
    return Math.min(canvas.width / GAME_CONFIG.canvasWidth, canvas.height / GAME_CONFIG.canvasHeight);
}

// Configurar seletor de velocidade inicial
function setupUniverseSpeedSelector() {
    const range = document.getElementById("speed-range");
    const label = document.getElementById("speed-label-text");
    if (range && label) {
        // Carregar valor salvo se houver
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

// Configurar controladores de volume interativos
function setupVolumeSelectors() {
    const musicRange = document.getElementById("volume-music");
    const musicLabel = document.getElementById("volume-music-label");
    const sfxRange = document.getElementById("volume-sfx");
    const sfxLabel = document.getElementById("volume-sfx-label");

    // Música de fundo volume
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

    // Efeitos sonoros volume
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
// PERSISTÊNCIA (LOCALSTORAGE)
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
            // Garantir que novas chaves existam ao carregar saves antigos
            if (pilotData.upgrades.chassis === undefined) {
                pilotData.upgrades.chassis = 1;
            }
        } catch (e) {
            console.error("Erro ao ler LocalStorage, reiniciando dados.", e);
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
// CONTROLES E INPUT (TECLADO, GAMEPAD, MOUSE, TOUCH)
// ==========================================================================
function setupInputListeners() {
    // Teclado
    window.addEventListener("keydown", (e) => {
        gameState.keys[e.key.toLowerCase()] = true;
        gameState.keys[e.code.toLowerCase()] = true; // Capturar códigos precisos como Space

        // Teclas de atalho para ações imediatas
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

    // Toque Móvel Virtuais
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
            ind.innerHTML = `<span class="icon" style="color: #00ffcc;">🎮</span> Gamepad ${e.gamepad.id.substring(0, 15)} Conectado`;
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

    // Reset de inputs virtuais baseados em Gamepad
    gameState.keys["gamepad_up"] = false;
    gameState.keys["gamepad_down"] = false;
    gameState.keys["gamepad_left"] = false;
    gameState.keys["gamepad_right"] = false;
    gameState.keys["gamepad_fire"] = false;
    gameState.keys["gamepad_special"] = false;

    // Analógico Esquerdo & D-Pad (Rotação e Propulsão)
    const axisX = gp.axes[0];
    const axisY = gp.axes[1];
    const threshold = 0.25;

    if (axisX < -threshold || gp.buttons[14].pressed) gameState.keys["gamepad_left"] = true;
    if (axisX > threshold || gp.buttons[15].pressed) gameState.keys["gamepad_right"] = true;
    if (axisY < -threshold || gp.buttons[12].pressed) gameState.keys["gamepad_up"] = true;
    if (axisY > threshold || gp.buttons[13].pressed) gameState.keys["gamepad_down"] = true;

    // Gatilhos e Botões de Ação
    // Botão A (Índice 0), Gatilho Direito RT (Índice 7) -> Propulsão ou Disparo
    if (gp.buttons[0].pressed || gp.buttons[7].pressed || gp.buttons[5].pressed) {
        gameState.keys["gamepad_up"] = true; // Propulsor
    }

    // Botão X (Índice 2), Gatilho Esquerdo LT (Índice 6) -> Disparo
    if (gp.buttons[2].pressed || gp.buttons[6].pressed) {
        gameState.keys["gamepad_fire"] = true;
    }

    // Botão B (Índice 1), Botão Y (Índice 3) -> Escudo Especial
    if (gp.buttons[1].pressed || gp.buttons[3].pressed) {
        gameState.keys["gamepad_special"] = true;
    }

    // Botão START (Índice 9) -> Pausar
    if (gp.buttons[9].pressed) {
        if (gameState.active && !gameState.warping && !gameState.paused) {
            togglePause();
        }
    }
}

// Efeito de vibração no controle (se houver suporte)
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
// SELETOR DE MENUS & NAVEGAÇÃO
// ==========================================================================
function setupMenuNavigation() {
    const showScreen = (activeScreen) => {
        SFX.resume();
        const cards = document.querySelectorAll(".menu-card");
        cards.forEach(card => card.classList.remove("active"));
        activeScreen.classList.add("active");
        uiOverlay.style.display = "flex";
    };

    // Botão Iniciar Missão (Leva para Seletor de Setores)
    document.getElementById("btn-play").addEventListener("click", () => {
        generateSectorGrid();
        showScreen(screenSector);
    });

    // Configurar Piloto
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

    // Escolha de cor do Piloto
    const colorOpts = document.querySelectorAll(".color-option");
    colorOpts.forEach(opt => {
        opt.addEventListener("click", () => {
            colorOpts.forEach(o => o.classList.remove("active"));
            opt.classList.add("active");
        });
    });

    // Seletor de Fases
    document.getElementById("btn-back-sectors").addEventListener("click", () => {
        showScreen(screenMenu);
    });

    // Manual de Instruções
    document.getElementById("btn-instructions").addEventListener("click", () => {
        showScreen(screenInstructions);
    });
    document.getElementById("btn-back-instructions").addEventListener("click", () => {
        showScreen(screenMenu);
    });

    // Central de Upgrades
    document.getElementById("btn-upgrades").addEventListener("click", () => {
        openUpgradesScreen();
    });
    document.getElementById("btn-back-upgrades").addEventListener("click", () => {
        showScreen(screenMenu);
    });
    document.getElementById("btn-reset-upgrades").addEventListener("click", () => {
        if (confirm("Deseja realmente resetar todos os upgrades? Toda a sucata acumulada será devolvida.")) {
            resetAllUpgrades();
        }
    });

    // Botões de Pause
    document.getElementById("btn-resume").addEventListener("click", () => {
        togglePause();
    });
    document.getElementById("btn-restart").addEventListener("click", () => {
        togglePause();
        startSector(pilotData.currentSector);
    });
    document.getElementById("btn-quit").addEventListener("click", () => {
        quitToMenu();
    });

    // Botão de GameOver
    document.getElementById("btn-retry").addEventListener("click", () => {
        startSector(pilotData.currentSector);
    });
    document.getElementById("btn-gameover-upgrades").addEventListener("click", () => {
        openUpgradesScreen();
    });
    document.getElementById("btn-gameover-menu").addEventListener("click", () => {
        quitToMenu();
    });

    // Botão de Vitória Final
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

        // Definir nome temático de acordo com o setor
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

function quitToMenu() {
    SFX.stopAmbientMusic();
    gameState.active = false;
    gameState.paused = false;
    hudOverlay.style.display = "none";
    const cards = document.querySelectorAll(".menu-card");
    cards.forEach(card => card.classList.remove("active"));
    screenMenu.classList.add("active");
    uiOverlay.style.display = "flex";
}

// ==========================================================================
// CENTRAL DE UPGRADES
// ==========================================================================
function openUpgradesScreen() {
    document.getElementById("scraps-total").textContent = pilotData.accumulatedScrap;

    const updateItemUI = (key) => {
        const lvl = pilotData.upgrades[key];
        const isMax = lvl >= GAME_CONFIG.maxUpgrades;
        const cost = isMax ? "MAX" : (lvl * 100 + (key === 'drone' ? 100 : 0));

        document.getElementById(`level-${key}`).textContent = (lvl === 0 && key === 'drone') ? "BLOQUEADO" : `NÍV ${lvl}`;
        const btn = document.getElementById(`btn-upgrade-${key}`);

        if (isMax) {
            btn.innerHTML = "MÁXIMO";
            btn.disabled = true;
        } else {
            btn.innerHTML = `UPGRADE <br><span class="cost">${cost}</span> ⚡`;
            // Desabilitar se não tiver sucata suficiente
            btn.disabled = pilotData.accumulatedScrap < cost;
        }
    };

    updateItemUI("weapon");
    updateItemUI("shield");
    updateItemUI("engine");
    updateItemUI("drone");
    updateItemUI("chassis");

    // Adicionar escuta para clique de compra
    const setupUpgradeClick = (key) => {
        const btn = document.getElementById(`btn-upgrade-${key}`);
        // Clonar para evitar múltiplos listeners acumulados
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener("click", () => {
            const lvl = pilotData.upgrades[key];
            const cost = lvl * 100 + (key === 'drone' ? 100 : 0);
            if (pilotData.accumulatedScrap >= cost) {
                pilotData.accumulatedScrap -= cost;
                pilotData.upgrades[key]++;
                saveProgress();
                SFX.playUpgradeSuccess();
                openUpgradesScreen(); // Recarregar UI
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

    // Calcular custos gastos
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

    pilotData.accumulatedScrap += returnedScrap;
    saveProgress();
    SFX.playExplosion("large");
    openUpgradesScreen();
}

// ==========================================================================
// FÍSICA E LOOP DE JOGO PRINCIPAL
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
    gameState.bgTime = 0; // Resetar contador de tempo para animações sutis do fundo

    // Reset de entidades
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

    // Inicializar Drone Assistente (NPC) se tiver upgrade ativo
    if (pilotData.upgrades.drone > 0) {
        entities.drone = new DroneNPC(entities.player);
    }

    // Gerar elementos com base na fase específica
    setupSectorLayout(sectorNum);

    // Reiniciar música ambiente carregando com base na fase atual!
    SFX.stopAmbientMusic();
    SFX.startAmbientMusic(sectorNum);

    updateHUD();
}

function setupSectorLayout(sectorNum) {
    // Balanceamento: Reduzida a quantidade inicial de asteroides para fases mais curtas e dinâmicas
    const numAsteroids = 2 + Math.floor(sectorNum * 0.4);

    // Inserir Asteroides Iniciais na Wave 1 longe da posição inicial do player (centro)
    for (let i = 0; i < numAsteroids; i++) {
        let x, y;
        do {
            x = Math.random() * GAME_CONFIG.canvasWidth;
            y = Math.random() * GAME_CONFIG.canvasHeight;
        } while (Math.hypot(x - GAME_CONFIG.canvasWidth / 2, y - GAME_CONFIG.canvasHeight / 2) < 250);

        entities.asteroids.push(new Asteroid(x, y, 60 + Math.random() * 30));
    }

    // Adicionar anomalias estelares em fases específicas (como Buracos Negros)
    if (sectorNum === 4 || sectorNum === 8 || sectorNum === 11 || sectorNum === 12) {
        entities.anomalies.push(new BlackHole(GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2));
    }

    // Naves inimigas surgem logo na wave 1
    if (sectorNum >= 2) {
        spawnEnemyShip();
    }

    // Se a fase for de Boss (a cada 3 fases: 3, 6, 9, 12), preparamos o surgimento do boss na wave final
    if (sectorNum % 3 === 0) {
        gameState.totalWaves = 1; // Boss spawna direto após limpar a Wave 1 rápida!
    } else {
        gameState.totalWaves = 2; // Apenas 2 Waves nas fases normais (reduzido de 3)
    }
}

function togglePause() {
    if (!gameState.active || gameState.warping) return;

    gameState.paused = !gameState.paused;
    if (gameState.paused) {
        SFX.stopAmbientMusic();
        uiOverlay.style.display = "flex";
        // Desativar todas as outras telas
        const cards = document.querySelectorAll(".menu-card");
        cards.forEach(card => card.classList.remove("active"));
        screenPause.classList.add("active");
    } else {
        uiOverlay.style.display = "none";
        SFX.startAmbientMusic(pilotData.currentSector);
    }
}

// ==========================================================================
// LOOP DE ATUALIZAÇÃO E DESENHO
// ==========================================================================
function gameLoop(timestamp) {
    // Delta Time para velocidade constante independente de taxa de quadros
    if (!gameState.lastTime) gameState.lastTime = timestamp;
    const dt = (timestamp - gameState.lastTime) / 1000;
    gameState.lastTime = timestamp;

    // Processar Gamepad se conectado
    pollGamepad();

    if (gameState.active && !gameState.paused) {
        // Multiplicador de velocidade inicial do universo aplicado ao dt!
        const universeDt = dt * gameState.universeSpeedMultiplier;
        gameState.bgTime += dt; // Tempo contínuo e sutil do fundo, sem acelerar com a velocidade do jogo
        update(universeDt);
    } else {
        gameState.bgTime += dt * 0.5; // Continuar animando sutilmente mesmo em menu ou pausa
    }

    draw();

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    // Decréscimo do Screen Shake
    if (gameState.screenShake > 0) {
        gameState.screenShake -= dt * 15;
        if (gameState.screenShake < 0) gameState.screenShake = 0;
    }

    // 1. Atualizar Jogador e Drone NPC
    if (entities.player) {
        entities.player.update(dt);
    }
    if (entities.drone) {
        entities.drone.update(dt);
    }

    // 2. Atualizar Tiros do Jogador
    for (let i = entities.bullets.length - 1; i >= 0; i--) {
        const b = entities.bullets[i];
        b.update(dt);
        if (b.life <= 0) {
            entities.bullets.splice(i, 1);
        }
    }

    // 3. Atualizar Tiros dos Inimigos
    for (let i = entities.enemyBullets.length - 1; i >= 0; i--) {
        const eb = entities.enemyBullets[i];
        eb.update(dt);
        if (eb.life <= 0) {
            entities.enemyBullets.splice(i, 1);
        }
    }

    // 4. Atualizar Asteroides
    entities.asteroids.forEach(ast => ast.update(dt));

    // 5. Atualizar Inimigos Inteligentes
    for (let i = entities.enemies.length - 1; i >= 0; i--) {
        const enemy = entities.enemies[i];
        enemy.update(dt);
        if (enemy.destroyed) {
            entities.enemies.splice(i, 1);
        }
    }

    // 6. Atualizar Anomalias (Ex: Gravidade de Buracos Negros)
    entities.anomalies.forEach(anom => {
        anom.update(dt);
        // Puxar entidades ao redor
        if (entities.player && !entities.player.invulnerable) {
            applyGravity(anom, entities.player, dt);
        }
        entities.asteroids.forEach(ast => applyGravity(anom, ast, dt));
        entities.enemies.forEach(en => applyGravity(anom, en, dt));
    });

    // 7. Atualizar Sucata Estelar Coletável
    for (let i = entities.scraps.length - 1; i >= 0; i--) {
        const scr = entities.scraps[i];
        scr.update(dt);

        // Atração magnética pelo jogador se estiver perto
        if (entities.player) {
            const dist = Math.hypot(entities.player.x - scr.x, entities.player.y - scr.y);
            if (dist < 200) {
                const angle = Math.atan2(entities.player.y - scr.y, entities.player.x - scr.x);
                scr.vx += Math.cos(angle) * 500 * dt;
                scr.vy += Math.sin(angle) * 500 * dt;
            }

            // Coleta
            if (dist < entities.player.radius + scr.radius) {
                gameState.scrapsInSector += scr.value;
                SFX.playCollect();
                entities.scraps.splice(i, 1);
                updateHUD();
                continue;
            }
        }

        if (scr.life <= 0) {
            entities.scraps.splice(i, 1);
        }
    }

    // 8. Atualizar Power-ups Temporários Flutuantes
    for (let i = entities.powerups.length - 1; i >= 0; i--) {
        const pu = entities.powerups[i];
        pu.update(dt);

        if (entities.player) {
            const dist = Math.hypot(entities.player.x - pu.x, entities.player.y - pu.y);
            // Coleta do Power-up
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

    // 9. Atualizar Chefão Ativo
    if (entities.boss) {
        entities.boss.update(dt);
        if (entities.boss.destroyed) {
            entities.boss = null;
        }
    }

    // 10. Atualizar Efeitos Visuais / Partículas
    for (let i = entities.particles.length - 1; i >= 0; i--) {
        const p = entities.particles[i];
        p.update(dt);
        if (p.life <= 0) {
            entities.particles.splice(i, 1);
        }
    }

    // 11. Processamento de Colisões
    checkCollisions();

    // 12. Controle das Waves e Avanço de Fases
    checkWaveProgression();
}

function checkWaveProgression() {
    // Se não houver mais asteroides e naves inimigas na tela
    if (entities.asteroids.length === 0 && entities.enemies.length === 0 && !entities.boss) {

        // Fase de Boss?
        const isBossSector = pilotData.currentSector % 3 === 0;

        if (isBossSector && gameState.currentWave === gameState.totalWaves && !gameState.bossSpawned) {
            spawnSectorBoss();
        } else if (gameState.currentWave < gameState.totalWaves) {
            // Avançar para a próxima wave da fase regular
            gameState.currentWave++;
            spawnNextWave();
        } else if (!gameState.warping) {
            // Fase completamente limpa, iniciar salto hiperespacial pronto
            triggerWarpSequence();
        }
    }
}

function spawnNextWave() {
    const mult = gameState.currentWave;
    // Spawn de novos asteroides rápidos na nova onda (reduzido para encurtar as ondas!)
    const numToSpawn = 1 + Math.floor(mult * 0.5);
    for (let i = 0; i < numToSpawn; i++) {
        let x, y;
        do {
            x = Math.random() * GAME_CONFIG.canvasWidth;
            y = Math.random() * GAME_CONFIG.canvasHeight;
        } while (entities.player && Math.hypot(x - entities.player.x, y - entities.player.y) < 250);

        entities.asteroids.push(new Asteroid(x, y, 50 + Math.random() * 25));
    }

    // Spawn de naves inimigas adicionais
    if (pilotData.currentSector >= 2) {
        for (let i = 0; i < Math.floor(pilotData.currentSector / 4) + 1; i++) {
            spawnEnemyShip();
        }
    }
}

function spawnEnemyShip() {
    // Escolher tipo baseado no setor de forma inteligente
    let type = "fighter"; // Rápida e frágil
    const rand = Math.random();
    if (pilotData.currentSector >= 5 && rand > 0.6) {
        type = "bomber"; // Solta minas que explodem
    } else if (pilotData.currentSector >= 8 && rand > 0.4) {
        type = "defender"; // Escudo extra defletor
    }

    // Surgir nas bordas da tela
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

    // Identificar qual boss de acordo com a fase
    let bossType = 1;
    if (pilotData.currentSector === 3) bossType = 1; // Leviatã do Vazio
    else if (pilotData.currentSector === 6) bossType = 2; // Encouraçado Aegis
    else if (pilotData.currentSector === 9) bossType = 3; // Singularidade Negra
    else if (pilotData.currentSector === 12) bossType = 4; // IA Suprema 'Omega Prime'

    entities.boss = new SectorBoss(GAME_CONFIG.canvasWidth / 2, -150, bossType);

    // Atualizar barra de HP do boss
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

// ==========================================================================
// TRATAMENTO DE COLISÕES
// ==========================================================================
function checkCollisions() {
    // 1. Tiros do Player acertando Asteroides
    for (let bIdx = entities.bullets.length - 1; bIdx >= 0; bIdx--) {
        const b = entities.bullets[bIdx];
        for (let aIdx = entities.asteroids.length - 1; aIdx >= 0; aIdx--) {
            const ast = entities.asteroids[aIdx];
            if (Math.hypot(b.x - ast.x, b.y - ast.y) < ast.radius) {
                // Impacto!
                spawnHitParticles(b.x, b.y, "#00ffcc");
                ast.damage(25);
                entities.bullets.splice(bIdx, 1);
                break;
            }
        }
    }

    // 2. Tiros do Player acertando Inimigos Normais
    for (let bIdx = entities.bullets.length - 1; bIdx >= 0; bIdx--) {
        const b = entities.bullets[bIdx];
        for (let eIdx = entities.enemies.length - 1; eIdx >= 0; eIdx--) {
            const en = entities.enemies[eIdx];
            if (Math.hypot(b.x - en.x, b.y - en.y) < en.radius) {
                spawnHitParticles(b.x, b.y, "#ff0055");
                en.damage(34); // ~3 tiros para destruir
                entities.bullets.splice(bIdx, 1);
                break;
            }
        }
    }

    // 3. Tiros do Player acertando o Boss
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

    // 4. Asteroides e Inimigos Colidindo com o Jogador (Com Escudo Defletor ativo ou não)
    if (entities.player && !entities.player.invulnerable) {
        // Colisão com Asteroides
        entities.asteroids.forEach(ast => {
            if (Math.hypot(entities.player.x - ast.x, entities.player.y - ast.y) < entities.player.radius + ast.radius) {
                entities.player.hit(30); // 30% dano de impacto
                // Empurrão físico reverso
                const angle = Math.atan2(entities.player.y - ast.y, entities.player.x - ast.x);
                entities.player.vx += Math.cos(angle) * 150;
                entities.player.vy += Math.sin(angle) * 150;
            }
        });

        // Colisão com Inimigos Físicos
        entities.enemies.forEach(en => {
            if (Math.hypot(entities.player.x - en.x, entities.player.y - en.y) < entities.player.radius + en.radius) {
                entities.player.hit(25);
                en.damage(50);
            }
        });

        // Colisão com Tiros Inimigos
        for (let ebIdx = entities.enemyBullets.length - 1; ebIdx >= 0; ebIdx--) {
            const eb = entities.enemyBullets[ebIdx];
            if (Math.hypot(entities.player.x - eb.x, entities.player.y - eb.y) < entities.player.radius) {
                entities.player.hit(15);
                spawnHitParticles(eb.x, eb.y, "#ff0055");
                entities.enemyBullets.splice(ebIdx, 1);
            }
        }

        // Se o Boss estiver ativo, ele pode colidir fisicamente também
        if (entities.boss && Math.hypot(entities.player.x - entities.boss.x, entities.player.y - entities.boss.y) < entities.player.radius + entities.boss.radius) {
            entities.player.hit(50); // Dano massivo do boss
        }
    }
}

function spawnHitParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
        entities.particles.push(new Particle(x, y, color, "spark"));
    }
}

// ==========================================================================
// TRANSIÇÃO DE SALTO HIPERESPACIAL (WARP SEQUENCE)
// ==========================================================================
function triggerWarpSequence() {
    gameState.warping = true;
    SFX.playWarp();
    triggerGamepadVibration(1200, 0.4, 0.9);

    // Ocultar HUD Boss
    document.getElementById("boss-hud-container").style.display = "none";

    // Criar super anel de partículas hipersônicas
    for (let i = 0; i < 150; i++) {
        entities.particles.push(new Particle(GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2, "#00ffcc", "warp"));
    }

    // Salvar progresso
    const currentFinished = pilotData.currentSector;
    if (!pilotData.completedSectors.includes(currentFinished)) {
        pilotData.completedSectors.push(currentFinished);
    }

    // Distribuir sucata obtida nesta fase
    pilotData.accumulatedScrap += gameState.scrapsInSector;
    pilotData.totalScore += gameState.score;

    // Liberar próximo setor se for o caso
    if (currentFinished === pilotData.maxUnlockedSector && pilotData.maxUnlockedSector < GAME_CONFIG.totalSectors) {
        pilotData.maxUnlockedSector++;
    }

    saveProgress();

    // Mostrar Tela de Transição Hiperespacial
    setTimeout(() => {
        uiOverlay.style.display = "flex";
        const cards = document.querySelectorAll(".menu-card");
        cards.forEach(card => card.classList.remove("active"));
        screenWarp.classList.add("active");

        const nextNum = currentFinished + 1;
        document.getElementById("warp-next-sector").textContent = nextNum <= GAME_CONFIG.totalSectors ? `SETOR ${String(nextNum).padStart(2, '0')}` : "MISSÃO CONCLUÍDA!";
        document.getElementById("warp-scraps-gain").textContent = gameState.scrapsInSector;

        // Barra de progresso animada simulando cálculo hiperespacial
        let prog = 0;
        const fill = document.getElementById("warp-progress");
        const interval = setInterval(() => {
            prog += 3;
            if (fill) fill.style.width = `${Math.min(prog, 100)}%`;
            if (prog >= 100) {
                clearInterval(interval);

                // Avançar ou ganhar jogo total
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

    // Gerar centenas de faíscas
    for (let i = 0; i < 120; i++) {
        entities.particles.push(new Particle(entities.player.x, entities.player.y, pilotData.signatureColor, "spark"));
        entities.particles.push(new Particle(entities.player.x, entities.player.y, "#ff0055", "smoke"));
    }

    gameState.lives--;
    updateHUD();

    if (gameState.lives > 0) {
        // Renascer jogador no centro de forma segura
        setTimeout(() => {
            if (gameState.active) {
                entities.player = new Player(GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2);
                if (entities.drone) entities.drone.parent = entities.player;
            }
        }, 1800);
    } else {
        // Fim de Jogo!
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
// RENDERIZAÇÃO (DRAWING CANVAS)
// ==========================================================================
function draw() {
    // 1. Limpar tela com fade sutil para efeito de "Motion Blur" neon espacial
    ctx.fillStyle = "rgba(3, 3, 12, 0.22)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // Escala e ajuste de tela responsivo
    const scale = getScaleFactor();
    const offsetX = (canvas.width - GAME_CONFIG.canvasWidth * scale) / 2;
    const offsetY = (canvas.height - GAME_CONFIG.canvasHeight * scale) / 2;

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Efeito Screen Shake (Distorção de impacto espacial)
    if (gameState.screenShake > 0) {
        const dx = (Math.random() - 0.5) * gameState.screenShake;
        const dy = (Math.random() - 0.5) * gameState.screenShake;
        ctx.translate(dx, dy);
    }

    // Desenhar Fundo de Estrelas Estático e o Fundo Cósmico procedimental da fase!
    drawStarfield();
    if (gameState.active) {
        drawCosmicBackground(pilotData.currentSector);
    } else {
        // Desenha o fundo da fase 1 no menu por estética
        drawCosmicBackground(1);
    }

    // 2. Desenhar Anomalias
    entities.anomalies.forEach(anom => anom.draw());

    // 3. Desenhar Sucatas Coletáveis
    entities.scraps.forEach(scr => scr.draw());

    // 4. Desenhar Power-ups Temporários
    entities.powerups.forEach(pu => pu.draw());

    // 5. Desenhar Tiros
    entities.bullets.forEach(b => b.draw());
    entities.enemyBullets.forEach(eb => eb.draw());

    // 6. Desenhar Asteroides
    entities.asteroids.forEach(ast => ast.draw());

    // 7. Desenhar Inimigos Inteligentes
    entities.enemies.forEach(en => en.draw());

    // 8. Desenhar Boss
    if (entities.boss) {
        entities.boss.draw();
    }

    // 9. Desenhar Drone Assistente
    if (entities.drone) {
        entities.drone.draw();
    }

    // 10. Desenhar Partículas e Explosões
    entities.particles.forEach(p => p.draw());

    // 11. Desenhar Jogador Principal
    if (entities.player && !entities.player.destroyed) {
        entities.player.draw();
    }

    // Desenhar Borda Limite Física da Arena virtual se necessário
    ctx.strokeStyle = "rgba(0, 255, 204, 0.04)";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);

    ctx.restore();
}

// Estrelas procedimentais em posições fixas sem precisar de array complexo
function drawStarfield() {
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    // Gerar pequenos pontos baseados em lógica pseudo-aleatória constante
    for (let i = 1; i <= 80; i++) {
        const sx = (i * 317) % GAME_CONFIG.canvasWidth;
        const sy = (i * 743) % GAME_CONFIG.canvasHeight;
        const size = (i % 3 === 0) ? 2.0 : 1.0;
        ctx.fillRect(sx, sy, size, size);
    }
}

/**
 * DESENHA O PLANO DE FUNDO CÓSMICO CUSTOMIZADO DE CADA FASE
 * Importante: A opacidade é mantida extremamente sutil (0.02 - 0.06) para que o fundo nunca
 * atrapalhe a visualização dos asteroides cinzas e das naves com lasers brilhantes.
 */
function drawCosmicBackground(sector) {
    ctx.save();

    // Variável para animações baseadas no tempo
    const t = gameState.bgTime;

    // FASES 1, 2, 3: Nébulas e Galáxia de Gás Violeta/Azul no fundo
    if (sector <= 3) {
        // Galáxia Espiral sutil gerada por gradientes radiais sobrepostos
        const gradX = GAME_CONFIG.canvasWidth * 0.3 + Math.sin(t * 0.05) * 50;
        const gradY = GAME_CONFIG.canvasHeight * 0.4 + Math.cos(t * 0.04) * 40;

        const nebula = ctx.createRadialGradient(gradX, gradY, 50, gradX, gradY, 600);
        nebula.addColorStop(0, "rgba(76, 29, 149, 0.06)"); // Roxo profundo muito sutil
        nebula.addColorStop(0.5, "rgba(30, 58, 138, 0.03)"); // Azul muito sutil
        nebula.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = nebula;
        ctx.beginPath();
        ctx.arc(gradX, gradY, 800, 0, Math.PI * 2);
        ctx.fill();
    }

    // FASES 4, 5, 6: Planeta Gigante Gasoso com Sombreamento Realista e Anéis
    if (sector >= 4 && sector <= 6) {
        ctx.save();
        const planetX = GAME_CONFIG.canvasWidth * 0.75;
        const planetY = GAME_CONFIG.canvasHeight * 0.3;
        const radius = 120;

        // Desenhar os anéis do planeta com inclinação elíptica (Desenhar primeiro para ficar atrás do hemisfério traseiro ou por cima de forma sutil)
        ctx.strokeStyle = "rgba(147, 197, 253, 0.025)";
        ctx.lineWidth = 15;
        ctx.save();
        ctx.translate(planetX, planetY);
        ctx.rotate(-Math.PI / 6); // Inclinação dos anéis
        ctx.scale(2.2, 0.45); // Forma elíptica do anel
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Corpo do Planeta
        // Gradiente radial para simular iluminação solar 3D realista (Luz vindo do canto superior esquerdo e sombra no canto inferior direito)
        const lightX = planetX - radius * 0.4;
        const lightY = planetY - radius * 0.4;
        const planetGrad = ctx.createRadialGradient(lightX, lightY, radius * 0.1, planetX, planetY, radius);
        planetGrad.addColorStop(0, "rgba(147, 197, 253, 0.05)"); // Azul claro iluminado
        planetGrad.addColorStop(0.7, "rgba(30, 58, 138, 0.03)"); // Azul escuro
        planetGrad.addColorStop(0.95, "rgba(3, 3, 15, 0.05)"); // Sombra espacial preta profunda

        ctx.fillStyle = planetGrad;
        ctx.beginPath();
        ctx.arc(planetX, planetY, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // FASES 7, 8, 9: Aurora Boreal ondulante e etérea por curvas matemáticas
    if (sector >= 7 && sector <= 9) {
        ctx.save();
        ctx.lineWidth = 60;
        // Desenhar 3 ondas senoidais sobrepostas com opacidade ultra baixa e cores verde/azul neon
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

        ctx.restore();
    }

    // FASES 10, 11, 12: Super Galáxia de Singularidade e Vórtice Dimensional Roxo/Vermelho
    if (sector >= 10) {
        ctx.save();
        const centerX = GAME_CONFIG.canvasWidth / 2;
        const centerY = GAME_CONFIG.canvasHeight / 2;

        // Vórtice elíptico central gerado com gradiente radial sutilmente rotacionado
        ctx.translate(centerX, centerY);
        ctx.rotate(t * 0.015); // Rotação sutil da galáxia ao longo do tempo

        const vortex = ctx.createRadialGradient(0, 0, 10, 0, 0, 500);
        vortex.addColorStop(0, "rgba(220, 38, 38, 0.05)"); // Vermelho brilhante
        vortex.addColorStop(0.3, "rgba(124, 58, 237, 0.03)"); // Violeta profundo
        vortex.addColorStop(0.7, "rgba(30, 27, 75, 0.015)"); // Roxo espacial escuro
        vortex.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = vortex;
        ctx.beginPath();
        ctx.ellipse(0, 0, 800, 350, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    ctx.restore();
}

function updateHUD() {
    document.getElementById("hud-pilot-name").textContent = pilotData.name;
    document.getElementById("hud-pilot-name").style.color = pilotData.signatureColor;
    document.getElementById("hud-score").textContent = String(gameState.score).padStart(6, '0');
    document.getElementById("hud-sector").textContent = `${String(pilotData.currentSector).padStart(2, '0')} / 12`;
    document.getElementById("hud-scraps").textContent = gameState.scrapsInSector;

    // Vidas
    const livesContainer = document.getElementById("hud-lives");
    livesContainer.innerHTML = "";
    for (let i = 0; i < gameState.lives; i++) {
        livesContainer.innerHTML += "💖 ";
    }
    if (gameState.lives === 0) livesContainer.innerHTML = "CRÍTICO";

    // Drone HUD
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
// CLASSES DO JOGO (PLAYER, DRONE, ASTEROID, BULLET, ENEMY, PARTICLES)
// ==========================================================================

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;

        // Chassi Permanente: O tamanho e blindagem aumentam de acordo com o upgrade de Chassi
        this.chassisLevel = pilotData.upgrades.chassis || 1;
        this.radius = 18 + (this.chassisLevel - 1) * 6; // Nave maior fisicamente de acordo com o upgrade de Chassi!

        this.angle = -Math.PI / 2; // Apontando para cima inicialmente
        this.vx = 0;
        this.vy = 0;
        this.destroyed = false;

        // Upgrade Temporário: Overdrive (Nave dourada, invulnerável, tiro de plasma quíntuplo de grande abertura)
        this.overdriveActive = false;
        this.overdriveTimer = 0;

        // Atributos de Combate / Resistência
        this.maxShield = 100 + (pilotData.upgrades.shield - 1) * 20 + (this.chassisLevel - 1) * 30; // Chassi aumenta shield total
        this.shield = this.maxShield;
        this.energy = 100; // Recarga de Especial
        this.invulnerable = true;
        this.invulnerableTimer = 2.0; // 2 segundos iniciais de escudo de renascimento

        // Parâmetros Físicos Dinâmicos baseados em Motor
        const engineLvl = pilotData.upgrades.engine;
        this.acceleration = (180 + engineLvl * 35) * (1 - (this.chassisLevel - 1) * 0.05); // Chassis maiores são levemente mais pesados
        this.friction = 0.985;
        this.rotationSpeed = (4.0 + engineLvl * 0.4) * (1 - (this.chassisLevel - 1) * 0.05);

        // Controle de Tiros
        this.shootCooldown = 0;
        const weaponLvl = pilotData.upgrades.weapon;
        this.shootRate = Math.max(0.12, 0.28 - weaponLvl * 0.03); // Mais rápido conforme upa
    }

    update(dt) {
        // Controlar Power-up temporário "Overdrive"
        if (this.overdriveActive) {
            this.overdriveTimer -= dt;
            if (this.overdriveTimer <= 0) {
                this.overdriveActive = false;
                document.getElementById("hud-weapon-name").textContent = "LASER";
                document.getElementById("hud-weapon-name").style.color = "#ff9900";
            }
        }

        // Invulnerabilidade temporária
        if (this.invulnerable && !this.overdriveActive) {
            this.invulnerableTimer -= dt;
            if (this.invulnerableTimer <= 0) {
                this.invulnerable = false;
            }
        }

        // Recuperar Energia do Especial lentamente
        if (this.energy < 100) {
            this.energy += dt * (10 + pilotData.upgrades.shield * 2);
            if (this.energy > 100) this.energy = 100;
        }

        // Cooldown do tiro principal
        if (this.shootCooldown > 0) this.shootCooldown -= dt;

        // Processamento de Input (Teclado ou Gamepad Virtual)
        const rotLeft = gameState.keys["a"] || gameState.keys["arrowleft"] || gameState.keys["gamepad_left"];
        const rotRight = gameState.keys["d"] || gameState.keys["arrowright"] || gameState.keys["gamepad_right"];
        const thrust = gameState.keys["w"] || gameState.keys["arrowup"] || gameState.keys["gamepad_up"];
        const fire = gameState.keys["space"] || gameState.keys["gamepad_fire"];
        const special = gameState.keys["shift"] || gameState.keys["gamepad_special"];

        // Rotação
        if (rotLeft) this.angle -= this.rotationSpeed * dt;
        if (rotRight) this.angle += this.rotationSpeed * dt;

        // Propulsão / Aceleração por Força Iônica
        if (thrust) {
            this.vx += Math.cos(this.angle) * this.acceleration * dt;
            this.vy += Math.sin(this.angle) * this.acceleration * dt;

            // Tocar som de propulsor de forma ritmada
            if (Math.random() > 0.6) {
                SFX.playThruster();
            }

            // Partículas de fumaça azul/dourada neon saindo do motor da nave
            const exhaustX = this.x - Math.cos(this.angle) * this.radius;
            const exhaustY = this.y - Math.sin(this.angle) * this.radius;
            const thrustCol = this.overdriveActive ? "#ffcc00" : pilotData.signatureColor;
            entities.particles.push(new Particle(exhaustX, exhaustY, thrustCol, "smoke"));
        }

        // Aplicar Atrito no Vazio (Para sensação clássica de Asteroids, mas controlada e moderna)
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Atualizar Posição por Vetores Físicos
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Wrap-Around (Bordas infinitas no espaço sideral)
        const margin = this.radius;
        if (this.x < -margin) this.x = GAME_CONFIG.canvasWidth + margin;
        if (this.x > GAME_CONFIG.canvasWidth + margin) this.x = -margin;
        if (this.y < -margin) this.y = GAME_CONFIG.canvasHeight + margin;
        if (this.y > GAME_CONFIG.canvasHeight + margin) this.y = -margin;

        // Disparo de canhão
        if (fire) {
            this.shoot();
        }

        // Ativar Habilidade Especial de Escudo Máximo Temporário
        if (special && this.energy >= 100) {
            this.activateSpecialShield();
        }

        // Sincronizar HUD barras constantemente
        const sBar = document.getElementById("hud-shield-bar");
        if (sBar) sBar.style.width = `${(this.shield / this.maxShield) * 100}%`;
        const eBar = document.getElementById("hud-energy-bar");
        if (eBar) eBar.style.width = `${this.energy}%`;
    }

    shoot() {
        if (this.shootCooldown > 0) return;

        const weaponLvl = pilotData.upgrades.weapon;
        this.shootCooldown = this.overdriveActive ? this.shootRate * 0.75 : this.shootRate;

        // Desenhar vetor do bico da nave
        const noseX = this.x + Math.cos(this.angle) * this.radius;
        const noseY = this.y + Math.sin(this.angle) * this.radius;

        // Multiplicador de dano do Chassi Permanente
        const bulletDamageMult = 1.0 + (this.chassisLevel - 1) * 0.25;

        // Se Overdrive (Upgrade Temporário) estiver ativo: Super Canhão de Plasma Quíntuplo Devastador!
        if (this.overdriveActive) {
            const spreadAngles = [-0.3, -0.15, 0, 0.15, 0.3];
            spreadAngles.forEach(ang => {
                const b = new Bullet(noseX, noseY, this.angle + ang, 650);
                b.color = "#ffcc00"; // Dourado
                b.radius = 5.5; // Balas gigantes
                b.damage = 40 * bulletDamageMult;
                entities.bullets.push(b);
            });
            SFX.playLaser('triple');
            return;
        }

        // Configuração de Armas Estendidas (Permanentes) por nível de upgrade
        if (weaponLvl >= 4) {
            // Nível 4: Disparo Quádruplo em leque muito aberto
            const spreadAngles = [-0.25, -0.08, 0.08, 0.25];
            spreadAngles.forEach(ang => {
                const b = new Bullet(noseX, noseY, this.angle + ang, 540);
                b.damage = 18 * bulletDamageMult;
                entities.bullets.push(b);
            });
            SFX.playLaser('triple');
        } else if (weaponLvl === 3) {
            // Nível 3: Disparo Triplo em ângulo aberto
            const spreadAngles = [-0.18, 0, 0.18];
            spreadAngles.forEach(ang => {
                const b = new Bullet(noseX, noseY, this.angle + ang, 520);
                b.damage = 22 * bulletDamageMult;
                entities.bullets.push(b);
            });
            SFX.playLaser('triple');
        } else if (weaponLvl === 2) {
            // Nível 2: Disparo Duplo Frontal
            const sideOffsetL = this.angle - Math.PI/2;
            const sideOffsetR = this.angle + Math.PI/2;
            const b1 = new Bullet(this.x + Math.cos(sideOffsetL)*8, this.y + Math.sin(sideOffsetL)*8, this.angle, 520);
            const b2 = new Bullet(this.x + Math.cos(sideOffsetR)*8, this.y + Math.sin(sideOffsetR)*8, this.angle, 520);
            b1.damage = 25 * bulletDamageMult;
            b2.damage = 25 * bulletDamageMult;
            entities.bullets.push(b1, b2);
            SFX.playLaser('plasma');
        } else {
            // Nível 1: Disparo Clássico Básico Único
            const b = new Bullet(noseX, noseY, this.angle, 480);
            b.damage = 30 * bulletDamageMult;
            entities.bullets.push(b);
            SFX.playLaser('laser');
        }
    }

    activateTemporaryOverdrive() {
        this.overdriveActive = true;
        this.overdriveTimer = 10.0; // 10 segundos de fúria dourada!
        this.shield = this.maxShield; // Recuperar escudo instantaneamente
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

// ==========================================================================
// DRONE ASSISTENTE NPC (IA AUTÔNOMA)
// ==========================================================================
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

// ==========================================================================
// TIRO (BULLET)
// ==========================================================================
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

// ==========================================================================
// POWER-UP TEMPORÁRIO (POWER UP)
// ==========================================================================
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

// ==========================================================================
// ASTEROIDE VETORIAL GEOMÉTRICO (ASTEROID)
// ==========================================================================
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

// ==========================================================================
// INIMIGO INTELIGENTE (ENEMY SHIP)
// ==========================================================================
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

// ==========================================================================
// CHEFÃO ICÔNICO DE SECTOR (SECTOR BOSS)
// ==========================================================================
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

// ==========================================================================
// ANOMALIA GRAVITACIONAL (BLACK HOLE)
// ==========================================================================
class BlackHole {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 25;
        this.gravityRadius = 400;
        this.gravityForce = 12;
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

// ==========================================================================
// SUCATA DE UPGRADE COLETÁVEL (SCRAP)
// ==========================================================================
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

// ==========================================================================
// EFEITO DE PARTÍCULA (PARTICLE)
// ==========================================================================
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
