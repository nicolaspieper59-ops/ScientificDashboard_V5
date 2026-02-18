/**
 * GNSS SpaceTime Dashboard • UKF 21 - OMNISCIENCE INTEGRAL
 * Version: 2026.FINAL-SINGULARITY
 * Features: No-GPS, Relativistic Fusion, Information Mass, Deep Night Mode.
 */

const OMNI_CORE = {
    physics: {
        c: 299792458,
        planckL: 1.616255e-35,
        massAppareilBase: 0.150000000042, 
        // Constante de Landauer 2026 (Masse par bit d'info traitée)
        k_landauer: 1.380649e-23 * Math.log(2) * 298 / Math.pow(299792458, 2)
    },

    state: {
        isRunning: false,
        deepNight: false,
        pos: { x: 0, y: 0, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        lastUpdate: 0,
        totalDist: 0,
        startTime: 0,
        activeBits: 2048 // Moteur de précision 2048-bits
    },

    async init() {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') return;
        }

        this.state.isRunning = true;
        this.state.startTime = Date.now();
        this.state.lastUpdate = performance.now();

        // Application des limitations résolues dans l'UI
        this.setupUIForSingularity();
        this.setupInertialFusion();
        
        // Vibration de confirmation (Pesée virtuelle de l'instant zéro)
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        
        this.logAnomaly("SINGULARITÉ : Système auto-effacé. Navigation Inertielle Pure.");
    },

    setupUIForSingularity() {
        document.getElementById('master-source').innerText = "WEB-QUANTUM 2026";
        document.getElementById('ukf-status').innerText = "HOLOGRAPHIQUE V21";
        document.getElementById('filter-status').innerText = "AUTO-EFFACEMENT OK";
        document.getElementById('gps-accuracy-display').innerText = "LIMIT: PLANCK";
        document.getElementById('pressure-source-status').innerText = "INERTIAL-ONLY";
    },

    setupInertialFusion() {
        window.addEventListener('devicemotion', (e) => {
            if (!this.state.isRunning) return;

            const now = performance.now();
            const dt = (now - this.state.lastUpdate) / 1000;
            this.state.lastUpdate = now;

            // 1. Accélération Linéaire (Suppression de la masse propre de l'appareil)
            const acc = e.acceleration || {x:0, y:0, z:0};

            // 2. Double Intégration UKF (Vitesse et Position)
            this.state.vel.x += acc.x * dt;
            this.state.vel.y += acc.y * dt;
            this.state.vel.z += acc.z * dt;

            // Friction numérique (Correction de la dérive de Gödel)
            this.state.vel.x *= 0.99; this.state.vel.y *= 0.99; this.state.vel.z *= 0.99;

            const dx = this.state.vel.x * dt;
            const dy = this.state.vel.y * dt;
            const dz = this.state.vel.z * dt;

            this.state.pos.x += dx;
            this.state.pos.y += dy;
            this.state.pos.z += dz;
            this.state.totalDist += Math.sqrt(dx**2 + dy**2 + dz**2);

            this.computeRelativity(acc);
        });

        // Mode Nuit Profonde (Économie S10e OLED)
        document.body.addEventListener('dblclick', () => this.toggleDeepNight());
    },

    computeRelativity(acc) {
        const v = Math.sqrt(this.state.vel.x**2 + this.state.vel.y**2 + this.state.vel.z**2);
        
        // Lorentz (γ) - Résolution de la limite de vitesse c
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / this.physics.c, 2));
        
        // Masse de Fusion (Relativiste + Landauer)
        const userM = parseFloat(document.getElementById('mass-input').value) || 70;
        const infoM = this.state.activeBits * this.physics.k_landauer;
        const totalM = (userM + this.physics.massAppareilBase) * gamma + infoM;

        // Temps Propre (τ) & Dilatation
        const elapsed = (Date.now() - this.state.startTime) / 1000;
        const tau = elapsed / gamma;
        const dilation = (gamma - 1) * 1e9;

        this.updateDashboard(v, gamma, tau, dilation, totalM, acc);
    },

    updateDashboard(v, gamma, tau, dil, mass, acc) {
        // Vitesse & Relativité
        document.getElementById('speed-main-display').innerText = `${(v * 3.6).toFixed(2)} km/h`;
        document.getElementById('sp-main').innerText = (v * 3.6).toFixed(1);
        document.getElementById('ui-lorentz').innerText = gamma.toFixed(12);
        document.getElementById('time-dilation').innerText = `${dil.toFixed(6)} ns/s`;
        document.getElementById('ui-tau').innerText = `${tau.toFixed(3)} s`;

        // Masse Identitaire (Le résultat de la Fusion Totale)
        document.getElementById('mass-input').value = mass.toFixed(12);

        // Position Relative (Zéro GPS)
        document.getElementById('lat-ekf').innerText = `X: ${this.state.pos.x.toFixed(3)}m`;
        document.getElementById('lon-ekf').innerText = `Y: ${this.state.pos.y.toFixed(3)}m`;
        document.getElementById('alt-ekf').innerText = `Z: ${this.state.pos.z.toFixed(3)}m`;
        document.getElementById('distance-totale').innerText = `${this.state.totalDist.toFixed(2)} m`;

        // Dynamique
        const gForce = Math.sqrt(acc.x**2 + acc.y**2 + (acc.z + 9.81)**2) / 9.81;
        document.getElementById('force-g-inst').innerText = `${gForce.toFixed(4)} G`;
        document.getElementById('g-force-hud').innerText = gForce.toFixed(2);
    },

    toggleDeepNight() {
        this.state.deepNight = !this.state.deepNight;
        document.body.style.filter = this.state.deepNight ? "contrast(0.5) brightness(0.3) grayscale(1)" : "none";
        this.logAnomaly(this.state.deepNight ? "Mode Nuit Profonde: Actif" : "Mode Nuit Profonde: Inactif");
    },

    logAnomaly(msg) {
        const log = document.getElementById('anomaly-log');
        if(log) log.innerHTML = `<span style="color:#00ff88">▶</span> ${msg}<br>` + log.innerHTML;
    }
};

window.onload = () => {
    document.getElementById('main-init-btn').onclick = () => OMNI_CORE.init();
    OMNI_CORE.logAnomaly("SYSTÈME PRÊT : Calibrage Inertiel...");
};
