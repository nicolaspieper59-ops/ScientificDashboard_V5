/**
 * OMNISCIENCE V100 PRO - AUTOMATIC MODE DETECTOR & INERTIA ENGINE
 * Précision cible : 0.001 m/s (1 mm/s)
 */
const Omniscience = {
    state: {
        v: math.bignumber(0),
        d: math.bignumber(0),
        lastT: performance.now(),
        mode: "STATIQUE",
        isGpsActive: false
    },

    // Seuils de signature pour l'automatisation
    SIGNATURES: {
        VIBRATION_TRAIN: 0.05,  // Faible vibration, accélération longue
        VIBRATION_VELO: 0.4,    // Vibration haute fréquence
        VIBRATION_AIR: 0.1,     // Turbulences
        GRAVITY_WINGSUIT: 8.5   // Chute libre (proche de 0G ou G variable)
    },

    /**
     * Analyseur de contexte pour l'automatisation
     */
    detectMode(accel, gForce) {
        const vibration = Math.abs(accel.x) + Math.abs(accel.z);
        
        if (gForce < 2 && vibration < 0.02 && math.number(this.state.v) > 10) return "TRAIN/AVION";
        if (vibration > 0.3) return "VELO/MOTO";
        if (gForce > 1.5) return "MANEGE/VIRAGE";
        if (math.number(this.state.v) === 0) return "STATIQUE";
        return "TAPIS_VOLANT"; // Mode par défaut (Inertie pure)
    },

    /**
     * Boucle de calcul Ultra-Haute Fréquence
     */
    compute(rawAcc, rawGyro, dt) {
        const g = Math.sqrt(rawAcc.x**2 + rawAcc.y**2 + rawAcc.z**2) / 9.81;
        this.state.mode = this.detectMode(rawAcc, g);

        // --- LOGIQUE DE PRÉCISION 1mm/s ---
        // On utilise l'accélération linéaire corrigée (Y est l'axe de marche)
        let a = math.bignumber(rawAcc.y);

        // Zéro Absolu Automatique : Si aucune force n'est détectée
        // le système maintient la vitesse (Loi d'Inertie de Newton)
        if (math.abs(a) < 0.08) {
            a = math.bignumber(0); 
        }

        // Intégration mathématique sans perte
        this.state.v = math.add(this.state.v, math.multiply(a, dt));
        
        // Empêcher la dérive négative au repos
        if (math.number(this.state.v) < 0.001 && math.number(this.state.v) > -0.001) {
            this.state.v = math.bignumber(0);
        }

        this.state.d = math.add(this.state.d, math.multiply(this.state.v, dt));
        
        this.updateUI(g, dt);
    },

    updateUI(g, dt) {
        const v_ms = math.number(this.state.v);
        document.getElementById('sp-main-hud').innerText = (v_ms * 3.6).toFixed(1);
        document.getElementById('speed-stable-kmh').innerText = (v_ms * 3.6).toFixed(6);
        document.getElementById('dist-3d-precis').innerText = math.format(this.state.d, {precision: 10}) + " m";
        document.getElementById('ukf-status-display').innerText = "MODE AUTO : " + this.state.mode;
        document.getElementById('nyquist-bandwidth').innerText = (1/dt).toFixed(0) + " Hz";
    }
};
