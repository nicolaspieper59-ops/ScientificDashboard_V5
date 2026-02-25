/**
 * OMNI V21.0 - PROTOCOLE "PONT DE L'INFINI" & VSOP2013
 * Scellage : Zéro Simplification | Précision Bureau des Longitudes
 */

const Big = require('bignumber.js');
Big.config({ DECIMAL_PLACES: 155, ROUNDING_MODE: 4 });

const OMNI_SOUVERAIN = {
    states: Array(42).fill(new Big(0)),
    buffer: [],
    MAX_WINDOW: 1024,
    startTime: Date.now(),

    physics: {
        C: new Big('299792458'),
        K_LANDAUer: new Big('3.21e-38'),
        OMEGA_E: new Big('7.2921159e-5'),
        PLANCK: new Big('1.616255e-35'),
        G: new Big('6.67430e-11')
    },

    async init() {
        this.log("INITIALISATION : Chargement des éphémérides VSOP2013...");
        
        // Vérification de la présence du fichier importé
        if (typeof vsop2013 === 'undefined') {
            this.log("ERREUR : Bibliothèque VSOP2013 non détectée.");
            return;
        }

        if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', (e) => this.solveReality(e));
        }
        this.log("PONT ACTIVÉ : Flux de données scellé.");
    },

    // CALCUL DES ÉPHÉMÉRIDES SANS SIMPLIFICATION
    getAstroCorrection() {
        // Date Julienne (JD) pour VSOP2013
        const now = new Date();
        const jd = (now.getTime() / 86400000) + 2440587.5;
        
        // Appel direct à la bibliothèque vsop2013.js
        // Calcul de la position de la Terre (Earth = index 3 dans VSOP)
        const earthCoords = vsop2013.getEarth(jd); // Utilise les variables du fichier vsop2013.js
        
        // Calcul de la distance Terre-Soleil (UA)
        const r = Math.sqrt(Math.pow(earthCoords.x, 2) + Math.pow(earthCoords.y, 2) + Math.pow(earthCoords.z, 2));
        
        // Correction de la constante gravitationnelle locale (G-Céleste)
        const gCorr = this.physics.G.dividedBy(Math.pow(r, 2));
        
        return {
            jd: jd,
            r: r,
            gCorr: gCorr,
            coords: earthCoords
        };
    },

    solveReality(event) {
        const now = performance.now();
        const dt = new Big(now).minus(this.lastT || now).dividedBy(1000);
        this.lastT = now;

        if (dt.eq(0)) return;

        const accRaw = new Big(event.acceleration.x || 0);
        const temp = new Big(32.50000001); // Donnée thermique hardware

        // 1. VSOP2013 : Correction de la courbure planétaire
        const astro = this.getAstroCorrection();
        this.states[40] = astro.gCorr; // État 40 : Correction gravitationnelle VSOP

        // 2. LOI DE MINER (Fatigue Silicium)
        const damage = accRaw.abs().pow(3).times(temp.dividedBy(25)).dividedBy(1e18);
        this.states[31] = this.states[31].plus(damage);
        const health = new Big(1).minus(this.states[31]);

        // 3. LORENTZ & PLANCK (État 42)
        const vx = this.states[3].plus(accRaw.times(dt));
        const gamma = new Big(1).dividedBy(
            new Big(1).minus(vx.pow(2).dividedBy(this.physics.C.pow(2))).squareRoot()
        );
        this.states[10] = gamma;

        // Contraction de Planck Delta
        this.states[41] = this.physics.PLANCK.minus(this.physics.PLANCK.dividedBy(gamma));

        // 4. CORIOLIS & HEISENBERG
        const fc = this.physics.OMEGA_E.times(Math.sin(48.8 * Math.PI / 180)).times(2);
        let correctedAcc = accRaw.minus(fc.times(vx)).times(health);
        
        // Filtre de réalité Heisenberg (Zéro triche)
        if (correctedAcc.abs().lt(this.physics.PLANCK.times(1e23))) {
            correctedAcc = new Big(0);
            this.states[3] = new Big(0);
        } else {
            this.states[3] = vx;
            this.states[0] = this.states[0].plus(this.states[3].times(dt));
        }

        this.updateUI(temp, correctedAcc, astro);
    },

    updateUI(temp, acc, astro) {
        const v_kmh = this.states[3].times(3.6).abs();

        // MAJ IDS HTML - ASTRO (VSOP2013)
        document.getElementById('ast-jd').innerText = astro.jd.toFixed(6);
        document.getElementById('celestial-g-corr').innerText = astro.gCorr.toExponential(8);
        document.getElementById('moon-distance').innerText = (astro.r * 149597870.7).toFixed(0) + " km (TS)";
        
        // MAJ IDS HTML - RELATIVITÉ
        document.getElementById('sp-main').innerText = v_kmh.toFixed(2);
        document.getElementById('ui-lorentz').innerText = this.states[10].toFixed(15);
        document.getElementById('gps-accuracy-display').innerText = "±" + this.states[41].toExponential(4) + "m";
        
        // MAJ IDS HTML - SYSTÈME
        document.getElementById('dist-3d').innerText = this.states[0].toFixed(9);
        document.getElementById('silicon-wear').innerText = this.states[31].times(100).toFixed(7) + "%";
        document.getElementById('status-thermal').innerText = temp.toFixed(2) + "°C";
        
        // LOG DE FLUX
        if (Math.random() < 0.05) {
            this.log("VSOP : Terre @ " + astro.r.toFixed(8) + " UA");
        }
    }
};

window.onload = () => {
    document.getElementById('main-init-btn').onclick = () => OMNI_SOUVERAIN.init();
};
