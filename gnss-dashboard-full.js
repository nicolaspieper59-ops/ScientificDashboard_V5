/**
 * OMNISCIENCE V100 PRO - MASTER ENGINE
 * Connecteur Final : Capteurs -> UKF -> Astronomie -> Dashboard
 */

const MainEngine = {
    isStarted: false,
    ukf: new UKF_Master(), // Utilise ta lib ukf-lib.js
    
    init() {
        document.getElementById('start-btn-final').addEventListener('click', () => this.startSystem());
        console.log("Système Omniscience en attente d'initialisation...");
    },

    async startSystem() {
        if (this.isStarted) return;

        // 1. Demande de permissions pour iOS/Android
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') {
                alert("Permission refusée. Le record ne pourra pas être validé.");
                return;
            }
        }

        this.isStarted = true;
        document.getElementById('start-btn-final').style.display = 'none';
        document.getElementById('ukf-status-display').innerText = "FUSION ACTIVE (UKF)";
        
        // 2. Synchronisation Horloge Atomique Hors-Ligne
        NTPMaster.sync();

        // 3. Boucle d'écoute des capteurs (100Hz)
        window.addEventListener('devicemotion', (e) => this.processMotion(e));
        
        // 4. Boucle de mise à jour de l'interface (10Hz)
        setInterval(() => this.updateUI(), 100);
    },

    processMotion(e) {
        const dt = 0.01; // Pas de temps 10ms
        const acc = e.accelerationIncludingGravity;
        const gyro = e.rotationRate;

        // Correction Gravité Marseille (9.80512 m/s²)
        const g_marseille = 9.80512;
        const az_pure = (acc.z || 0) - g_marseille;

        // Prédiction UKF (Mouvement)
        this.ukf.predict(dt);
        
        // Mise à jour de l'état avec fusion capteurs
        // On envoie : [Acc_X, Acc_Y, Acc_Z_Corrigée]
        this.ukf.update(math.matrix([[acc.x || 0], [acc.y || 0], [az_pure]]));

        // Navigation 3D (Mode Grotte / Dead Reckoning)
        Navigation3D.updateDeadReckoning(
            this.ukf.state.get([3, 0]), // vx
            this.ukf.state.get([4, 0]), // vy
            this.ukf.state.get([5, 0]), // vz
            dt
        );
    },

    updateUI() {
        // --- 1. VITESSE & HUD ---
        const vx = this.ukf.state.get([3, 0]);
        const vy = this.ukf.state.get([4, 0]);
        const v_ms = Math.sqrt(vx*vx + vy*vy);
        const v_kmh = v_ms * 3.6;

        document.getElementById('sp-main-hud').innerText = v_kmh.toFixed(1);
        document.getElementById('speed-main-display').innerText = v_kmh.toFixed(4) + " km/h";

        // --- 2. ASTRONOMIE & COSMOS ---
        const cosmicData = AstroPhysics.getUniversalSpeed(v_kmh);
        document.getElementById('v-cosmic').innerText = Number(cosmicData.total_kmh).toLocaleString() + " km/h";
        
        // --- 3. RELATIVITÉ ---
        const c = 299792458;
        const beta = v_ms / c;
        const lorentz = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        document.getElementById('lorentz-factor').innerText = lorentz.toFixed(15);
        document.getElementById('time-dilation').innerText = ((lorentz - 1) * 1e9).toFixed(6) + " ns/s";

        // --- 4. NAVIGATION & GROTTE ---
        const pos = Navigation3D.currentPos;
        document.getElementById('coord-x').innerText = pos.x.toFixed(3) + " m";
        document.getElementById('coord-y').innerText = pos.y.toFixed(3) + " m";
        document.getElementById('coord-z').innerText = pos.z.toFixed(3) + " m";
        document.getElementById('dist-3d').innerText = Math.sqrt(pos.x**2 + pos.y**2 + pos.z**2).toFixed(3) + " m";

        // --- 5. SYSTÈME & TEMPS ---
        document.getElementById('utc-datetime').innerText = new Date().toUTCString();
        document.getElementById('elapsed-time').innerText = ((performance.now() - NTPMaster.startTime)/1000).toFixed(2) + " s";
    }
};

// Lancement au chargement du DOM
document.addEventListener('DOMContentLoaded', () => MainEngine.init());
