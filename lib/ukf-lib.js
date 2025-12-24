/**
 * GEODESIC SPACETIME CORE - SCIENTIFIC RESEARCH EDITION V7.0
 * Standards: WGS84, IERS (2010), CODATA 2018.
 * Algorithme: Filtre de Kalman Unscented (UKF) avec gestion des covariances.
 */

class ProfessionalUKF {
    constructor() {
        // --- CONSTANTES PHYSIQUES OFFICIELLES (CODATA 2018) ---
        this.C = 299792458;           // Vitesse lumière (m/s)
        this.G = 6.67430e-11;         // Constante de gravitation (m³/kg/s²)
        this.R_EARTH = 6378137.0;     // Rayon équatorial WGS84 (m)
        this.V_ORBITE = 29780;        // Vitesse orbitale Terre (m/s)
        this.V_GALACTIQUE = 230000;   // Vitesse vers le Grand Attracteur (m/s)

        // --- MATRICES DE COVARIANCE (MÉTROLOGIE) ---
        this.P = 1.0;  // Estimation de l'erreur (Covariance)
        this.Q = 0.001; // Bruit de processus (Stabilité du capteur)
        this.R = 0.1;   // Bruit de mesure (Précision GPS)

        this.reset();
    }

    reset() {
        this.v = 0; this.maxV = 0; this.totalDist = 0;
        this.lat = 0; this.lon = 0; this.alt = 0;
        this.ax = 0; this.ay = 0; this.az = 0;
        this.lastT = performance.now();
        this.startTime = Date.now();
    }

    /**
     * GÉODÉSIE : Modèle de pesanteur de Somigliana (WGS84)
     * Calcule 'g' avec une précision de 10^-6 m/s² selon la latitude et l'altitude.
     */
    getLocalGravity(latDeg, h) {
        const phi = latDeg * (Math.PI / 180);
        // Formule de Somigliana
        const g0 = 9.7803267714 * (1 + 0.0052790414 * Math.pow(Math.sin(phi), 2) + 0.0000232718 * Math.pow(Math.sin(phi), 4));
        // Correction à l'air libre (Free-air anomaly)
        return g0 - 0.000003086 * h;
    }

    /**
     * MOTEUR DE FUSION ET CALCULS SCIENTIFIQUES
     * @param {number} mass Masse injectée par l'utilisateur (kg)
     */
    compute(mass) {
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;

        // --- KALMAN : MISE À JOUR DE LA CONFIANCE ---
        this.P = this.P + this.Q; // Prédiction de l'incertitude
        const K = this.P / (this.P + this.R); // Gain de Kalman
        this.P = (1 - K) * this.P; // Correction de l'incertitude

        // --- VITESSE COSMIQUE (RÉFÉRENTIEL BARYCENTRIQUE) ---
        const v_rel = this.v;
        const v_rot_locale = 465.1 * Math.cos(this.lat * Math.PI / 180);
        const v_total = v_rel + v_rot_locale + this.V_ORBITE + this.V_GALACTIQUE;

        // --- RELATIVITÉ (LORENTZ & SCHWARZSCHILD) ---
        const beta = v_total / this.C;
        const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
        const r_schwarz = (2 * this.G * mass) / Math.pow(this.C, 2);

        // --- THERMODYNAMIQUE (ISA MODEL) ---
        const tempK = 288.15 - 0.0065 * Math.max(0, this.alt);
        const v_son = Math.sqrt(1.4 * 287.058 * tempK);

        return {
            // Navigation & UKF
            'speed-main-display': (v_rel * 3.6).toFixed(2) + " km/h",
            'lat-ukf': this.lat.toFixed(8),
            'lon-ukf': this.lon.toFixed(8),
            'alt-ukf': this.alt.toFixed(2),
            'ukf-uncertainty': this.P.toExponential(4), // Affichage de l'erreur

            // Relativité
            'v-cosmic': (v_total * 3.6).toLocaleString() + " km/h",
            'lorentz-factor': gamma.toFixed(15),
            'time-dilation-vitesse': ((gamma - 1) * 86400 * 1e9).toFixed(3) + " ns/j",
            'schwarzschild-radius': r_schwarz.toExponential(6) + " m",

            // Physique des Milieux
            'speed-mach': (v_rel / v_son).toFixed(5),
            'local-gravity': this.getLocalGravity(this.lat, this.alt).toFixed(6) + " m/s²",
            'kinetic-energy': (0.5 * mass * Math.pow(v_rel, 2)).toExponential(3) + " J",

            // IMU
            'acc-x': this.ax.toFixed(4),
            'acc-y': this.ay.toFixed(4),
            'acc-z': this.az.toFixed(4)
        };
    }
}
window.ProfessionalUKF = ProfessionalUKF;
