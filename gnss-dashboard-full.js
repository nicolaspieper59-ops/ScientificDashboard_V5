/**
 * OMNI-CORE SOUVERAIN V2026 - SYSTÈME DE NAVIGATION CONTINENTALE
 * Synthèse Finale : Physique des fluides, Identité Matérielle et Recalage Stellaire
 */

const OMNI_SOUVERAIN = {
    // --- ÉTAT DU SYSTÈME ---
    state: {
        lastV: 0,
        dist: 0,
        temp: 25,
        rho: 1.225,
        integrity: 1.0,
        lastTick: performance.now(),
        coords: { lat: 48.8566, lon: 2.3522 }, // Défaut: Paris
        mode: "STATIQUE",
        isSaturated: false
    },

    // --- IDENTITÉ IA (Coefficients de dérive appris) ---
    identity: {
        k2: 0.12, // Stochastique (Atomes)
        k3: 0.08, // Relaxation (Structure Alu)
        k4: 0.05, // Scintillation (Électronique)
        lastStarFix: performance.now()
    },

    // --- 1. INITIALISATION ---
    async initialize(lat, lon) {
        this.state.coords = { lat, lon };
        this.state.temp = (await Sensor.getTemp()) || 25;
        this.state.rho = this.calculateRho(101325, this.state.temp); // Pression mer par défaut
        
        // Initialisation des modules visuels et auditifs
        ATOMIC_VISUALIZER.init();
        ACOUSTIC_STABILIZER.startPulse(20000); 
        
        console.log("OMNI-CORE: Souveraineté activée.");
        this.startLoop();
    },

    calculateRho(p, t) { return p / (287.058 * (t + 273.15)); },

    // --- 2. MOTEUR D'ADAPTATION (MARCHE / VÉLO) ---
    adaptTerrain() {
        const acc = Sensor.getAccel();
        const speed = this.state.lastV;
        
        if (speed > 2.5) { // Env 9 km/h
            this.state.mode = "VELO";
            this.identity.k2 = 0.6; this.identity.k3 = 0.2; this.identity.k4 = 0.2;
        } else if (acc.mag > 1.2) {
            this.state.mode = "MARCHE";
            this.identity.k2 = 0.2; this.identity.k3 = 0.7; this.identity.k4 = 0.1;
        } else {
            this.state.mode = "STATIQUE";
            this.identity.k4 = 0.8;
        }
    },

    // --- 3. CALCUL DE LA DÉRIVE MULTI-RACINES ---
    getCombinedDrift(dt_sec) {
        const d2 = this.identity.k2 * Math.sqrt(dt_sec);
        const d3 = this.identity.k3 * Math.pow(dt_sec, 1/3);
        const d4 = this.identity.k4 * Math.pow(dt_sec, 1/4);
        return (d2 + d3 + d4) / 3;
    },

    // --- 4. BOUCLE DE RÉALITÉ (CORE LOOP) ---
    process() {
        const now = performance.now();
        const dt = (now - this.state.lastTick) / 1000;
        this.state.lastTick = now;

        this.adaptTerrain();

        // Lecture Capteurs
        const rawAcc = Sensor.getAccel().mag;
        const matStress = MATTER_SINGULARITY.computeStress(this.state.temp);

        // Détection de Saturation (Inertie vs Flux)
        if (rawAcc > 15.8 || this.state.mode === "VELO") {
            this.state.isSaturated = true;
            // Loi de Bernoulli : v = sqrt(2*deltaP / rho)
            const v_pression = Math.sqrt((2 * Sensor.getDeltaP()) / this.state.rho);
            this.state.lastV = (v_pression * 0.8) + (ACOUSTIC_STABILIZER.getDoppler() * 0.2);
        } else {
            this.state.isSaturated = false;
            const driftCorrection = 1 - this.getCombinedDrift(dt);
            this.state.lastV += (rawAcc * matStress) * dt * driftCorrection;
        }

        this.updateGeodesic(this.state.lastV * dt);

        // Recalage Stellaire automatique (Toutes les 30 min)
        if (now - this.identity.lastStarFix > 1800000) {
            this.celestialFix();
        }

        this.refreshUI();
    },

    // --- 5. NAVIGATION GÉODÉSIQUE (COURBURE TERRE) ---
    updateGeodesic(dist_m) {
        const R = 6371000; // Rayon Terre
        const brng = Sensor.getCompass() * (Math.PI / 180);
        
        const lat1 = this.state.coords.lat * (Math.PI / 180);
        const lon1 = this.state.coords.lon * (Math.PI / 180);

        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist_m/R) +
                     Math.cos(lat1) * Math.sin(dist_m/R) * Math.cos(brng));
        const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(dist_m/R) * Math.cos(lat1),
                     Math.cos(dist_m/R) - Math.sin(lat1) * Math.sin(lat2));

        this.state.coords.lat = lat2 * (180 / Math.PI);
        this.state.coords.lon = lon2 * (180 / Math.PI);
        this.state.dist += Math.abs(dist_m);
    },

    // --- 6. RECALAGE STELLAIRE ---
    async celestialFix() {
        const fix = await CELESTIAL_SYNC.capture();
        if (fix.success) {
            const error = this.calculateGap(this.state.coords, fix.coords);
            // Apprentissage IA des coefficients
            IDENTITY_LEARNER.optimize(error, 1800);
            this.state.coords = fix.coords;
            this.identity.lastStarFix = performance.now();
        }
    },

    refreshUI() {
        document.getElementById('speed-val').innerText = (this.state.lastV * 3.6).toFixed(2);
        document.getElementById('dist-val').innerText = (this.state.dist / 1000).toFixed(3) + " KM";
        document.getElementById('transport-mode').innerText = this.state.mode;
        document.getElementById('lat-val').innerText = this.state.coords.lat.toFixed(5);
        document.getElementById('lon-val').innerText = this.state.coords.lon.toFixed(5);
        
        // Mise à jour des barres d'identité
        document.getElementById('bar-k2').style.width = (this.identity.k2 * 100) + "%";
        document.getElementById('bar-k3').style.width = (this.identity.k3 * 100) + "%";
        document.getElementById('bar-k4').style.width = (this.identity.k4 * 100) + "%";
        
        ATOMIC_VISUALIZER.render(this.state.integrity);
    },

    startLoop() { setInterval(() => this.process(), 100); }
};
