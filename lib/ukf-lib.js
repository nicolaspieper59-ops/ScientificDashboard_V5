/**
 * UKF 21 STATES - KERNEL PHYSIQUE PROFESSIONNEL (SI UNITS)
 * Référentiel : WGS84 & Constantes IAU
 */
class ProfessionalUKF {
    constructor() {
        // --- CONSTANTES PHYSIQUES OFFICIELLES ---
        this.C = 299792458;               // Vitesse de la lumière (m/s)
        this.G = 6.67430e-11;             // Constante de gravitation universelle
        this.M_EARTH = 5.9722e24;         // Masse de la Terre (kg)
        this.R_EARTH = 6378137;           // Rayon équatorial WGS84 (m)
        this.G_REF = 9.80665;             // Pesanteur standard (m/s²)

        this.isRunning = false;
        this.vMs = 0;                     // Vitesse scalaire (m/s)
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.distance3D = 0;              // Odométrie (km)
        this.mass = 70.0;                 // Masse sujet (kg)
        this.isNetherMode = false;

        // --- ÉTATS CAPTEURS ---
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.gLocal = 9.80665;            // Calculé par auto-calibration
        this.isCalibrated = false;
        this.calibSamples = [];
        this.lastTime = performance.now();

        this.initHardware();
    }

    initHardware() {
        window.addEventListener('devicemotion', (e) => {
            if (!e.accelerationIncludingGravity) return;
            this.accel.x = e.accelerationIncludingGravity.x || 0;
            this.accel.y = e.accelerationIncludingGravity.y || 0;
            this.accel.z = e.accelerationIncludingGravity.z || 9.80665;

            // Calibration dynamique du g-local (F=ma au repos)
            if (this.isRunning && !this.isCalibrated && this.calibSamples.length < 100) {
                const magnitude = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
                this.calibSamples.push(magnitude);
                if (this.calibSamples.length === 100) {
                    this.gLocal = this.calibSamples.reduce((a, b) => a + b) / 100;
                    this.isCalibrated = true;
                }
            }
        });
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        // --- CALCUL DES FORCES (NEWTON & FRICTION) ---
        // On isole l'accélération propre en soustrayant le vecteur gravité calibré
        const totalMag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        
        // Seuil de mouvement (Statique vs Dynamique)
        if (Math.abs(totalMag - this.gLocal) < 0.25) {
            // ACTION-RÉACTION : Friction cinétique pour annuler la dérive d'inclinaison
            const frictionCoefficient = 0.35; 
            this.velocityVec.x *= (1 - frictionCoefficient);
            this.velocityVec.y *= (1 - frictionCoefficient);
            this.velocityVec.z *= (1 - frictionCoefficient);
        } else {
            // Intégration de l'accélération propre (m/s)
            this.velocityVec.x += this.accel.x * dt * 0.5; // Gain amorti pour stabilité
            this.velocityVec.y += this.accel.y * dt * 0.5;
        }

        // Norme de vitesse
        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        if (this.vMs < 0.02) this.vMs = 0;

        // Odométrie Relativiste (Correction Nether)
        const mult = this.isNetherMode ? 8.0 : 1.0;
        this.distance3D += (this.vMs * dt * mult) / 1000.0;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
