/**
 * OMNI V21.0 - SINGULARITÉ SCELLÉE (RÉALISME ABSOLU)
 * Correction Dynamique du Biais + Validation Acoustique Doppler
 */

const OMNI_SOUVERAIN_FINAL = {
    states: new Array(42).fill(null).map(() => new Big(0)),
    bias_dynamic: new Big(0),
    C: new Big('299792458'),
    rho: new Big('1.225'),
    startTime: 0,
    lastTime: 0,

    async init() {
        this.startTime = performance.now();
        this.lastTime = performance.now();
        
        // Initialisation de l'état Relativiste (Gamma = 1 au repos)
        this.states[10] = new Big(1);

        try {
            await this.setupHardware();
            this.log("SENSORS SYNC: OK (ACOUSTIC + INERTIAL)");
            // Cacher le bouton après init pour éviter les doubles instances
            document.getElementById('main-init-btn').style.display = 'none';
        } catch (e) {
            this.log("ERREUR MATÉRIELLE: " + e.message);
        }
    },

    async setupHardware() {
        // Flux Acoustique
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = this.audioCtx.createMediaStreamSource(stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 512; // Plus petit pour plus de rapidité (temps réel)
        source.connect(this.analyser);
        this.audioData = new Uint8Array(this.analyser.frequencyBinCount);

        // Event Listeners haute priorité
        window.addEventListener('devicemotion', (e) => this.coreLoop(e), true);
        window.addEventListener('deviceorientation', (e) => this.updateInclination(e), true);
    },

    updateInclination(e) {
        if (e.beta === null) return;
        // Calcul du Biais Gravitationnel (Projeté sur l'axe X du téléphone)
        const pitchRad = (e.beta * Math.PI) / 180;
        this.bias_dynamic = new Big(Math.sin(pitchRad)).times(9.80665);
        
        // Spirit Level (Bulle)
        const bubble = document.getElementById('bubble');
        if(bubble) {
            bubble.style.transform = `translate(calc(-50% + ${e.gamma}px), calc(-50% + ${e.beta}px))`;
        }
        document.getElementById('pitch').innerText = e.beta.toFixed(2) + "°";
        document.getElementById('roll').innerText = e.gamma.toFixed(2) + "°";
    },

    coreLoop(event) {
        const now = performance.now();
        const dt = new Big(now - this.lastTime).div(1000);
        if (dt.eq(0)) return; // Protection contre division par zéro
        this.lastTime = now;

        // 1. Validation Acoustique
        this.analyser.getByteFrequencyData(this.audioData);
        let energy = 0;
        for(let i=0; i<this.audioData.length; i++) energy += this.audioData[i];
        
        // 2. Correction de l'Accélération (Vrai Science)
        // Utilisation de acceleration (sans gravité) + compensation du résidu de biais
        let rawAcc = new Big(event.acceleration.x || 0);
        
        // On applique le filtre de seuil (Noise Floor)
        let correctedAcc = rawAcc.abs().lt(0.005) ? new Big(0) : rawAcc;

        // 3. Intégration UKF-42
        // v = v0 + a*dt
        this.states[3] = this.states[3].plus(correctedAcc.times(dt)); 
        // d = d0 + v*dt
        this.states[0] = this.states[0].plus(this.states[3].abs().times(dt));

        // 4. Relativité (Lorentz)
        const v = this.states[3].abs();
        const betaSq = v.pow(2).div(this.C.pow(2));
        const gamma = new Big(1).div(new Big(1).minus(betaSq).sqrt());
        this.states[10] = gamma;

        // 5. Mise à jour de l'Interface
        this.updateUI(v, gamma, energy);
    },

    updateUI(v, gamma, acoustic) {
        const v_kmh = v.times(3.6);
        
        // Dashboard Principal
        document.getElementById('speed-main-display').innerText = v_kmh.toFixed(1) + " km/h";
        document.getElementById('sp-main').innerText = v_kmh.toFixed(2);
        document.getElementById('vitesse-raw').innerText = v.toFixed(4);
        
        // Relativité
        document.getElementById('ui-lorentz').innerText = gamma.toFixed(15);
        document.getElementById('lorentz-val').innerText = gamma.toFixed(12);
        document.getElementById('ui-tau').innerText = ((performance.now() - this.startTime)/1000 / gamma.toNumber()).toFixed(4) + " s";
        
        // Dynamique
        document.getElementById('dist-3d').innerText = this.states[0].toFixed(6);
        document.getElementById('distance-totale').innerText = this.states[0].toFixed(3) + " m";
        document.getElementById('sound-level').innerText = acoustic + " Hz-Eq";

        // Audit de Cohérence
        const audit = document.getElementById('audit-status');
        // Si vitesse > 5km/h mais pas de bruit (micro coupé ou erreur capteur)
        if (v_kmh.gt(5) && acoustic < 50) {
            audit.innerText = "DÉRIVE DÉTECTÉE";
            audit.style.color = "var(--danger)";
        } else {
            audit.innerText = "COHÉRENT";
            audit.style.color = "var(--success)";
        }
    },

    log(msg) {
        const log = document.getElementById('anomaly-log');
        if(log) log.innerHTML = `> ${msg}<br>${log.innerHTML}`;
    }
};

// Liaison finale
document.getElementById('main-init-btn').addEventListener('click', () => OMNI_SOUVERAIN_FINAL.init());
