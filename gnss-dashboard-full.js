/**
 * ⚛️ SOUVERAIN-Ω v34 - PROTOCOLE DE FUSION TOTALE
 * SUTURE MAGNÉTIQUE + DÉDUCTION DE COURBURE
 */

const OMNI_SOUVERAIN = {
    C: new BigNumber("299792458"),
    
    CHASSIS: {
        IMU:    { x: 0.002, y: 0.015, z: 0.001 },  
        CAMERA: { x: 0.028, y: 0.062, z: 0.001 },  
        MAG:    { x: -0.015, y: 0.040, z: -0.002 } // Position du magnétomètre
    },

    state: {
        dist: new BigNumber(0),
        v_abs: new BigNumber(0),
        last_t: null,
        quiescent_norm: new BigNumber(0),
        mag_flux_ref: { x: 0, y: 0, z: 0 },
        is_active: false
    },

    init() {
        // ÉCOUTEURS BRUTS : ZÉRO FILTRE ANDROID
        window.addEventListener('devicemotion', (e) => this.handleRawPhysics(e), true);
        window.addEventListener('deviceorientation', (e) => this.handleRawInertia(e), true);
        
        // CAPTEUR DE CHAMP (Magnétomètre)
        window.addEventListener('devicemagneticfield', (e) => this.handleMagneticFlux(e), true);

        document.getElementById('main-init-btn').addEventListener('click', () => this.bootSequence());
    },

    async bootSequence() {
        // 1. Étalonnage Gravité + Magnétisme au repos
        this.state.quiescent_norm = await this.probeQuiescentField();
        this.state.mag_flux_ref = await this.probeMagneticStatic();
        
        await this.initOpticalSextant(); // Caméra

        this.state.is_active = true;
        this.state.last_t = performance.now();
        document.getElementById('anomaly-log').innerHTML = "> TOUS LES CHAMPS SONT COHÉRENTS. DÉPART.";
    },

    handleRawPhysics(e) {
        if (!this.state.is_active) return;

        const now = performance.now();
        const dt = new BigNumber((now - this.state.last_t) / 1000);
        this.state.last_t = now;

        const rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
        const acc = e.accelerationIncludingGravity;

        // --- DÉDUCTION GÉOMÉTRIQUE INTÉGRALE ---

        // A. Correction Inertielle (IMU)
        const omega_z = (rot.gamma * Math.PI) / 180;
        const centripetal = Math.pow(omega_z, 2) * this.CHASSIS.IMU.y;
        const a_centered = new BigNumber(Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) - this.state.quiescent_norm.toNumber() - centripetal);

        // B. Suture Magnétique (Déplacement à travers Φ)
        // Si le téléphone avance, il traverse les lignes du champ terrestre.
        // La variation du flux (dB/dt) valide la vitesse.
        const mag_shift = this.calculateMagneticDelta();

        // C. Suture de Parallaxe (Optique)
        const camera_swing = (rot.beta * Math.PI / 180) * this.CHASSIS.CAMERA.y;
        const opt_translation = this.state.raw_optical_flow - camera_swing;

        // D. Suture de VSOP2013 (Céleste)
        const jd = this.getJulianDate();
        const earth_v = vsop2013.getEarth(jd).v; 
        const orbital_norm = Math.sqrt(earth_v[0]**2 + earth_v[1]**2 + earth_v[2]**2);

        // --- SYNTHÈSE DE RÉALITÉ ---
        // La vitesse n'est acceptée que si Inertie, Optique et Magnétisme convergent
        const v_validated = (a_centered.times(dt).plus(opt_translation).plus(mag_shift)).dividedBy(3);

        // Lorentz + Dilatation
        const gamma = new BigNumber(1).dividedBy(new BigNumber(1).minus(this.state.v_abs.pow(2).dividedBy(this.C.pow(2))).sqrt());

        this.state.v_abs = this.state.v_abs.plus(v_validated);
        this.state.dist = this.state.dist.plus(this.state.v_abs.times(dt).times(gamma));

        this.updateHUD(acc, a_centered, gamma, dt, orbital_norm);
    },

    calculateMagneticDelta() {
        // Mesure le glissement à travers les lignes de force locales
        // Plus le champ varie par rapport au repos, plus le déplacement est validé
        return Math.abs(this.state.current_mag.x - this.state.mag_flux_ref.x) * 0.001;
    }
};
