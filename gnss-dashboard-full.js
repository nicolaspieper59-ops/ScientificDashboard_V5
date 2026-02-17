/**
 * SOUVERAIN-OS MASTER INTEGRATION - V4.2
 * Liaison totale avec GNSS SpaceTime Dashboard UKF 21
 */

const BigNumber = require('bignumber.js');
BigNumber.config({ DECIMAL_PLACES: 155, ROUNDING_MODE: 4 });

const OMNI_V17 = {
    state: {
        dist: new BigNumber(0),
        vLast: new BigNumber(0),
        timeStart: performance.now(),
        isInit: false
    },

    // 1. MAPPING COMPLET DES ID HTML
    dom: {
        // Système
        sampling: document.getElementById('ui-sampling-rate'),
        clock: document.getElementById('ui-clock'),
        thermal: document.getElementById('status-thermal'),
        // Vitesse & Relativité
        spMain: document.getElementById('sp-main'), // HUD
        spMainDisplay: document.getElementById('speed-main-display'), // Colonne 2
        vRaw: document.getElementById('vitesse-raw'),
        lorentz: document.getElementById('ui-lorentz'),
        lorentzHud: document.getElementById('lorentz-val'),
        tau: document.getElementById('ui-tau'),
        // Dynamique
        gForce: document.getElementById('force-g-inst'),
        gHud: document.getElementById('g-force-hud'),
        airDen: document.getElementById('air-density'),
        // Distance
        distTot: document.getElementById('distance-totale'),
        distHud: document.getElementById('dist-3d')
    },

    // 2. MOTEUR DE CALCUL (SANS TRICHERIE)
    update() {
        const now = performance.now();
        const dt = new BigNumber(now - this.state.timeStart).dividedBy(1000);
        
        // ACQUISITION BRUTE DU S10e
        const sensors = KernelInterface.getS10Sensors(); // Pression, Accel, Temp
        const temp = sensors.temp; 

        // CALCUL DE LA RÉFRACTION (CIDDOR)
        const n = new BigNumber(1).plus(new BigNumber('0.000273').times(sensors.press.dividedBy(1013.25)));
        
        // CALCUL VITESSE ET SOUSTRACTION DÉRIVE THERMIQUE (ALU)
        // La vitesse est calculée au nanomètre par seconde (nm/s)
        const v_nms = sensors.accelZ.times(dt).times(1e9).minus(temp.times(0.004 * 23e-6 * 1e9));

        // 3. LOGIQUE D'AFFICHAGE "LOGIQUE"
        let speedDisplay;
        if (v_nms.abs().gt(1000000)) { // Mode MACRO (Vélo, Train, Avion)
            speedDisplay = v_nms.dividedBy(277777.778); // en KM/H
            this.dom.spMain.innerText = speedDisplay.toFixed(2);
            this.dom.spMainDisplay.innerText = speedDisplay.toFixed(2) + " km/h";
        } else { // Mode NANO (Escargot, Sismographe, Statique)
            this.dom.spMain.innerText = v_nms.toFixed(0);
            this.dom.spMainDisplay.innerText = v_nms.toFixed(0) + " nm/s";
        }

        // RELATIVITÉ : Lorentz et Temps Propre
        const v_ms = v_nms.dividedBy(1e9);
        const beta2 = v_ms.pow(2).dividedBy(new BigNumber(299792458).pow(2));
        const gamma = new BigNumber(1).dividedBy(new BigNumber(1).minus(beta2).squareRoot());
        
        // MISE À JOUR DES IDS
        this.dom.lorentz.innerText = gamma.toFixed(15);
        this.dom.lorentzHud.innerText = gamma.toFixed(15);
        this.dom.tau.innerText = dt.times(gamma).toFixed(9);
        this.dom.airDen.innerText = n.toFixed(6);
        this.dom.gForce.innerText = sensors.accelZ.dividedBy(9.81).toFixed(3) + " G";
        this.dom.gHud.innerText = sensors.accelZ.dividedBy(9.81).toFixed(2);

        // DISTANCE INTÉGRÉE
        this.state.dist = this.state.dist.plus(v_ms.abs().times(dt));
        this.dom.distTot.innerText = this.state.dist.toFixed(6) + " m";
        this.dom.distHud.innerText = this.state.dist.toFixed(4);

        this.state.timeStart = now;
        requestAnimationFrame(() => this.update());
    }
};
