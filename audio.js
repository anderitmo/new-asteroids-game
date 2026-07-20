/**
 * ASTEROIDS: NEON VOID - AUDIO SYNTHESIZER ENGINE (Web Audio API)
 *
 * Este arquivo contém todo o sintetizador de som procedural, permitindo que o jogo
 * reproduza efeitos sonoros imersivos e dinâmicos de alta fidelidade sci-fi e músicas
 * espaciais sem a necessidade de carregar arquivos MP3 ou WAV pesados.
 */

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
        this.musicVolume = null;
        this.sfxVolume = null;
        this.muted = false;

        // Escalas diferentes para cada tipo de setor para dar sensação de músicas diferentes
        this.musicScales = {
            // Escala Pentatônica de Lá Menor (Grave, Misteriosa) - Fases 1, 2, 3
            mysterious: [110.00, 130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66],
            // Escala de Frígio Dominante (Tensa, Árabe Sci-fi) - Fases 4, 5, 6
            tense: [110.00, 116.54, 138.59, 146.83, 164.81, 174.61, 207.65, 220.00],
            // Escala de Dó Lídio (Espacial, Etérea) - Fases 7, 8, 9
            ethereal: [130.81, 146.83, 164.81, 185.00, 196.00, 220.00, 246.94, 261.63],
            // Escala de Tons Inteiros / Hexafônica (Alienígena, Futurista Extrema) - Fases 10, 11, 12
            futuristic: [110.00, 123.47, 138.59, 155.56, 174.61, 196.00, 220.00, 246.94]
        };

        this.currentMusicSource = null;
        this.isPlayingMusic = false;
        this.musicIntervalId = null;
    }

    init() {
        if (this.ctx) return; // Já inicializado

        try {
            // Suporte cross-browser para AudioContext
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();

            // Configuração dos canais de ganho (Nodes de Volume)
            this.masterVolume = this.ctx.createGain();
            this.musicVolume = this.ctx.createGain();
            this.sfxVolume = this.ctx.createGain();

            // Configuração dos volumes padrão (Volume da música levemente mais alto agora!)
            this.masterVolume.gain.setValueAtTime(0.5, this.ctx.currentTime);
            this.musicVolume.gain.setValueAtTime(0.75, this.ctx.currentTime); // Aumentado de 0.4 para 0.75!
            this.sfxVolume.gain.setValueAtTime(0.7, this.ctx.currentTime);

            // Conexão dos nós de ganho
            this.musicVolume.connect(this.masterVolume);
            this.sfxVolume.connect(this.masterVolume);
            this.masterVolume.connect(this.ctx.destination);
        } catch (e) {
            console.warn("Web Audio API não é suportada neste navegador.", e);
        }
    }

    // Retorna o estado do áudio e desbloqueia o AudioContext se necessário
    resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setMuted(m) {
        this.muted = m;
        if (this.masterVolume) {
            this.masterVolume.gain.setValueAtTime(m ? 0 : 0.5, this.ctx.currentTime);
        }
    }

    /* ==========================================================================
       EFEITOS SONOROS SINTETIZADOS PROCEDURALMENTE
       ========================================================================== */

    /**
     * Som de Disparo de Laser
     * @param {string} type - Tipo de arma ('laser', 'plasma', 'triple', 'drone')
     */
    playLaser(type = 'laser') {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        if (type === 'laser') {
            // Som clássico de laser rápido caindo em tom
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, time);
            osc.frequency.exponentialRampToValueAtTime(100, time + 0.15);

            gainNode.gain.setValueAtTime(0.3, time);
            gainNode.gain.linearRampToValueAtTime(0.01, time + 0.15);

            osc.start(time);
            osc.stop(time + 0.16);
        } else if (type === 'plasma') {
            // Som mais pesado e profundo de plasma com filtro passa-baixa
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, time);
            filter.frequency.exponentialRampToValueAtTime(200, time + 0.25);

            osc.connect(filter);
            filter.connect(gainNode);

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, time);
            osc.frequency.exponentialRampToValueAtTime(40, time + 0.25);

            gainNode.gain.setValueAtTime(0.4, time);
            gainNode.gain.linearRampToValueAtTime(0.01, time + 0.25);

            osc.start(time);
            osc.stop(time + 0.26);
        } else if (type === 'triple') {
            // Som de disparo triplo com modulação rápida
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, time);
            osc.frequency.linearRampToValueAtTime(1200, time + 0.05);
            osc.frequency.exponentialRampToValueAtTime(200, time + 0.18);

            gainNode.gain.setValueAtTime(0.35, time);
            gainNode.gain.linearRampToValueAtTime(0.01, time + 0.18);

            osc.start(time);
            osc.stop(time + 0.19);
        } else if (type === 'drone') {
            // Laser agudo e rápido do Drone assistente
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1500, time);
            osc.frequency.exponentialRampToValueAtTime(500, time + 0.08);

            gainNode.gain.setValueAtTime(0.12, time);
            gainNode.gain.linearRampToValueAtTime(0.01, time + 0.08);

            osc.start(time);
            osc.stop(time + 0.09);
        }
    }

    /**
     * Explosões Sintetizadas Dinamicamente com Ruído Branco (White Noise)
     * @param {string} size - Tamanho da explosão ('large', 'medium', 'small', 'player', 'boss')
     */
    playExplosion(size = 'medium') {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        let duration = 0.3;
        let filterFreq = 1000;
        let volume = 0.4;

        if (size === 'large') {
            duration = 0.8;
            filterFreq = 300;
            volume = 0.7;
        } else if (size === 'small') {
            duration = 0.15;
            filterFreq = 1800;
            volume = 0.25;
        } else if (size === 'player') {
            duration = 1.5;
            filterFreq = 200;
            volume = 0.9;
        } else if (size === 'boss') {
            duration = 2.5;
            filterFreq = 150;
            volume = 1.0;
        }

        // Criar um buffer preenchido com ruído branco para a explosão
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        // Filtro Passa-Baixa para dar sensação de impacto explosivo abafado ou agudo
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, time);
        filter.frequency.exponentialRampToValueAtTime(10, time + duration);

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(volume, time);
        // Desvanecimento linear/exponencial do volume da explosão
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

        noiseNode.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        noiseNode.start(time);
        noiseNode.stop(time + duration);

        // Se for uma grande explosão de jogador ou boss, adiciona um tom sub-grave (sub-bass drop)
        if (size === 'player' || size === 'boss' || size === 'large') {
            const subOsc = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            subOsc.type = 'sawtooth';
            subOsc.frequency.setValueAtTime(100, time);
            subOsc.frequency.linearRampToValueAtTime(30, time + duration * 0.8);

            subGain.gain.setValueAtTime(volume * 0.8, time);
            subGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.8);

            subOsc.connect(subGain);
            subGain.connect(this.sfxVolume);

            subOsc.start(time);
            subOsc.stop(time + duration * 0.8);
        }
    }

    /**
     * Som ao ativar o Escudo Defletor Especial do jogador
     */
    playShieldActive() {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, time);
        osc.frequency.exponentialRampToValueAtTime(900, time + 0.3);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(100, time);
        osc2.frequency.exponentialRampToValueAtTime(450, time + 0.3);

        gainNode.gain.setValueAtTime(0.3, time);
        gainNode.gain.linearRampToValueAtTime(0.01, time + 0.3);

        osc.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        osc.start(time);
        osc2.start(time);
        osc.stop(time + 0.3);
        osc2.stop(time + 0.3);
    }

    /**
     * Som de impacto no Escudo Defletor do jogador
     */
    playShieldHit() {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, time);
        osc.frequency.linearRampToValueAtTime(150, time + 0.12);

        gainNode.gain.setValueAtTime(0.4, time);
        gainNode.gain.linearRampToValueAtTime(0.01, time + 0.12);

        osc.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        osc.start(time);
        osc.stop(time + 0.12);
    }

    /**
     * Som de Coleta de Moeda / Sucata Estelar
     */
    playCollect() {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'sine';
        // Efeito clássico de "blip" duplo ascendente e rápido (escala sci-fi arpeggiada)
        osc.frequency.setValueAtTime(523.25, time); // C5
        osc.frequency.setValueAtTime(783.99, time + 0.06); // G5
        osc.frequency.setValueAtTime(1046.50, time + 0.12); // C6

        gainNode.gain.setValueAtTime(0.2, time);
        gainNode.gain.linearRampToValueAtTime(0.01, time + 0.25);

        osc.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        osc.start(time);
        osc.stop(time + 0.26);
    }

    /**
     * Som de Compra de Upgrade na Loja de Sucata
     */
    playUpgradeSuccess() {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(440, time); // A4
        osc1.frequency.setValueAtTime(554.37, time + 0.1); // C#5
        osc1.frequency.setValueAtTime(659.25, time + 0.2); // E5
        osc1.frequency.setValueAtTime(880.00, time + 0.3); // A5

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(220, time);
        osc2.frequency.linearRampToValueAtTime(440, time + 0.4);

        gainNode.gain.setValueAtTime(0.25, time);
        gainNode.gain.linearRampToValueAtTime(0.01, time + 0.5);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + 0.45);
        osc2.stop(time + 0.45);
    }

    /**
     * Som de Alerta de Boss Emergindo do Vazio
     */
    playBossAlert() {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, time);
        osc.frequency.linearRampToValueAtTime(80, time + 0.4);
        osc.frequency.setValueAtTime(120, time + 0.5);
        osc.frequency.linearRampToValueAtTime(80, time + 0.9);

        gainNode.gain.setValueAtTime(0.35, time);
        gainNode.gain.linearRampToValueAtTime(0.01, time + 1.0);

        osc.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        osc.start(time);
        osc.stop(time + 1.0);
    }

    /**
     * Som de Salto Hiperespacial (Nível Concluído)
     */
    playWarp() {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(100, time);
        filter.frequency.exponentialRampToValueAtTime(8000, time + 1.5);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(50, time);
        osc.frequency.exponentialRampToValueAtTime(3000, time + 1.5);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        gainNode.gain.setValueAtTime(0.01, time);
        gainNode.gain.exponentialRampToValueAtTime(0.4, time + 1.2);
        gainNode.gain.linearRampToValueAtTime(0.001, time + 1.5);

        osc.start(time);
        osc.stop(time + 1.5);
    }

    /**
     * Som do propulsor (Engine Thruster)
     * Como é um som contínuo, faremos um efeito rápido que é tocado repetidamente enquanto
     * o botão de aceleração está ativado.
     */
    playThruster() {
        this.resume();
        if (!this.ctx || this.muted) return;

        const time = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, time);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(60, time);
        osc.frequency.linearRampToValueAtTime(45, time + 0.1);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.sfxVolume);

        gainNode.gain.setValueAtTime(0.12, time);
        gainNode.gain.linearRampToValueAtTime(0.001, time + 0.1);

        osc.start(time);
        osc.stop(time + 0.1);
    }

    /* ==========================================================================
       TRILHA SONORA AMBIENTE PROCEDURAL (Sci-Fi Synth)
       ========================================================================== */

    /**
     * Inicia a reprodução da música ambiente gerada por algoritmos em tempo real
     * @param {number} sector - Setor/fase atual para definir qual tipo de música tocar
     */
    startAmbientMusic(sector = 1) {
        this.resume();
        if (!this.ctx || this.isPlayingMusic || this.muted) return;

        this.isPlayingMusic = true;
        let step = 0;

        // Escolher escala harmônica com base na fase para criar músicas diferentes por setor!
        let currentScale = this.musicScales.mysterious; // Default
        let beatInterval = 350; // Tempo padrão entre notas
        let filterFreqMax = 800; // Tom do sintetizador

        if (sector >= 10) {
            currentScale = this.musicScales.futuristic;
            beatInterval = 280; // Música mais rápida e frenética no final!
            filterFreqMax = 1200;
        } else if (sector >= 7) {
            currentScale = this.musicScales.ethereal;
            beatInterval = 400; // Música mais lenta e viajante nas fases espaciais etéreas
            filterFreqMax = 600;
        } else if (sector >= 4) {
            currentScale = this.musicScales.tense;
            beatInterval = 320; // Música com andamento tenso e urgente
            filterFreqMax = 1000;
        }

        // Função interna que gera um padrão melódico sequencial a cada batida (procedural)
        const playBeep = () => {
            if (!this.isPlayingMusic || this.muted) return;

            const time = this.ctx.currentTime;

            // Gerar Baixo Estável de Fundo (Drone Synth Bass) a cada 8 tempos para preencher o ambiente
            if (step % 8 === 0) {
                const subOsc = this.ctx.createOscillator();
                const subGain = this.ctx.createGain();
                subOsc.type = 'sine';
                const baseFreq = currentScale[0] / 2; // Oitava abaixo para o Sub-Bass profundo
                subOsc.frequency.setValueAtTime(baseFreq, time);

                subGain.gain.setValueAtTime(0.18, time); // Volume levemente aumentado para impacto
                subGain.gain.exponentialRampToValueAtTime(0.001, time + 1.5);

                subOsc.connect(subGain);
                subGain.connect(this.musicVolume);

                subOsc.start(time);
                subOsc.stop(time + 1.5);
            }

            // Gerar Notas de Arpejo Aleatório baseadas na escala do Setor
            const noteIndex = Math.floor(Math.random() * currentScale.length);
            const freq = currentScale[noteIndex];

            // 85% de chance de tocar uma nota no arpejo para manter um ritmo sincopado
            if (Math.random() > 0.15) {
                const osc = this.ctx.createOscillator();
                const filter = this.ctx.createBiquadFilter();
                const gainNode = this.ctx.createGain();

                // Tipo de sintetizador muda de acordo com a escala para mudar a textura do som!
                if (currentScale === this.musicScales.futuristic) {
                    osc.type = 'sawtooth'; // Som agressivo de serra
                } else if (currentScale === this.musicScales.ethereal) {
                    osc.type = 'sine'; // Som puro e suave senoidal
                } else {
                    osc.type = 'triangle'; // Som de triângulo quente retro
                }

                osc.frequency.setValueAtTime(freq, time);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(filterFreqMax, time);
                filter.frequency.exponentialRampToValueAtTime(100, time + 0.45);

                // Volume da música do sintetizador de notas principais aumentado
                gainNode.gain.setValueAtTime(0.1, time);
                gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

                osc.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(this.musicVolume);

                osc.start(time);
                osc.stop(time + 0.5);
            }

            step++;
        };

        // Agenda o loop da música com o intervalo específico daquele setor
        this.musicIntervalId = setInterval(playBeep, beatInterval);
    }

    /**
     * Pausa ou encerra a música de fundo
     */
    stopAmbientMusic() {
        this.isPlayingMusic = false;
        if (this.musicIntervalId) {
            clearInterval(this.musicIntervalId);
            this.musicIntervalId = null;
        }
    }
}

// Inicializar Instância Única Global
const SFX = new SoundEngine();
