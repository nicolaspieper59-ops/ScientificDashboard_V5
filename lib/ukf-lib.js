/**
 * UKF LIB FUSION v11 - HYBRIDE (GPS + INERTIE)
 * Corrige la dérive inertielle par la vérité GPS.
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        
        // État Physique
        this.vMs = 0;           // Vitesse scalaire (m/s)
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.accel = { x: 0, y: 0, z: 0 };
        this.distance3D = 0;
        
        // État GPS (Vérité Terrain)
        this.lat = 0;
        this.lon = 0;
        this.altitude = 0;
        this.gpsSpeed = 0;      // Vitesse réelle GPS
        this.gpsAccuracy = 0;

        // Calibration
        this.gLocal = 9.80665;
        this.isCalibrated = false;
        this.calibSamples = [];
        
        this.lastTime = performance.now();
        this.mass = 70.0;
        
        this.initHardware();
    }

    initHardware() {
        // 1. Accéléromètre (Haute Fréquence ~60Hz)
        window.addEventListener('devicemotion', (e) => {
            if (!e.accelerationIncludingGravity) return;
            const raw = e.accelerationIncludingGravity;
            
            // Calibration au démarrage
            if (this.isRunning && !this.isCalibrated && this.calibSamples.length < 60) {
                const mag = Math.sqrt(raw.x**2 + raw.y**2 + raw.z**2);
                this.calibSamples.push(mag);
                if (this.calibSamples.length === 60) {
                    this.gLocal = this.calibSamples.reduce((a,b)=>a+b)/60;
                    this.isCalibrated = true;
                }
            }

            // Stockage pour l'affichage
            this.accel.x = raw.x || 0;
            this.accel.y = raw.y || 0;
            this.accel.z = raw.z || 0;
        });
    }

    /**
     * FUSION : Appelé par le script principal quand le GPS change
     */
    observeGPS(lat, lon, alt, speed, acc) {
        this.lat = lat;
        this.lon = lon;
        this.altitude = alt;
        this.gpsSpeed = speed; // m/s
        this.gpsAccuracy = acc;

        // CORRECTION DE DÉRIVE (Le Secret de la Fusion)
        // Si le GPS dit qu'on avance, on force l'inertie à s'aligner
        if (speed !== null && acc < 20) {
            // Facteur de fusion (0.1 = on fait confiance à 10% au GPS à chaque update)
            // Cela lisse les sauts du GPS tout en corrigeant la dérive IMU
            const fusionFactor = 0.5; 
            this.vMs = (this.vMs * (1 - fusionFactor)) + (speed * fusionFactor);
        }
    }

    update() {
        if (!this.isRunning) return;
        
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        // --- PHYSIQUE INERTIELLE (Prédiction à court terme) ---
        // On calcule l'accélération nette (sans gravité)
        const totalMag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        const netAccel = Math.abs(totalMag - this.gLocal);

        if (this.isCalibrated) {
            // Si forte accélération, on l'ajoute à la vitesse
            if (netAccel > 0.8) {
                // v = v + a * t
                this.vMs += (netAccel * 0.5) * dt; // 0.5 est un gain empirique
            } 
            // Si on ne bouge pas (et pas de GPS), la friction ralentit
            else if (this.gpsSpeed < 0.5 && netAccel < 0.3) {
                this.vMs *= 0.98; // Friction simulée
                if(this.vMs < 0.1) this.vMs = 0;
            }
        }

        // Mise à jour distance
        this.distance3D += this.vMs * dt / 1000; // km
    }
}
window.ProfessionalUKF = ProfessionalUKF;
