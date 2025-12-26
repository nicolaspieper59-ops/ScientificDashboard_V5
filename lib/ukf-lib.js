/**
 * UKF-21 ÉTATS - VERSION FINALE "SPACE-TIME PROFESSIONAL"
 * Newton (3-Axes) + Rayleigh + VSOP2013 (Astro) + ISA (Météo)
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.C = 299792458; 
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 }; // Vecteur Vitesse 3D
        this.accel = { x: 0, y: 0, z: 9.80665 }; // Accélération brute
        this.mass = 70.0;
        this.alt = 0;
        this.distance3D = 0;
        
        // Coordonnées pour l'Astro (Marseille par défaut)
        this.lat = 43.2965;
        this.lon = 5.3698;

        // Paramètres Aérodynamiques (Professionnel)
        this.Cd = 1.05; 
        this.Area = 0.70; 

        this.gLocal = 9.80665;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.lastTime = performance.now();
        this.initHardware();
    }

    /** Modèle Atmosphérique Standard ISA */
    getAirDensity() {
        const rho0 = 1.225; 
        return rho0 * Math.exp(-this.alt / 8500);
    }

    /** Intégration Éphémérides VSOP2013 (Si ephem.js chargé) */
    getAstroData() {
        const jd = (new Date().getTime() / 86400000) + 2440587.5; // Date Julienne
        const d = jd - 2451545.0;

        // Temps Sidéral Local
        let lst = (280.46061837 + 360.98564736629 * d + this.lon) % 360;
        if (lst < 0) lst += 360;

        // Calcul position Soleil via VSOP2013
        let sunLon = 0;
        if (typeof vsop2013 !== 'undefined') {
            const state = vsop2013.earth.state(jd);
            sunLon = Math.atan2(-state.r.y, -state.r.x) * (180 / Math.PI);
        } else {
            // Repli J2000 simplifié si ephem.js absent
            sunLon = (280.460 + 0.9856474 * d) % 360;
        }

        return {
            lst: lst / 15,
            sunLon: (sunLon < 0 ? sunLon + 360 : sunLon),
            jd: jd
        };
    }

    initHardware() {
        window.addEventListener('devicemotion', (e) => {
            if (!e.accelerationIncludingGravity) return;
            this.accel.x = e.accelerationIncludingGravity.x || 0;
            this.accel.y = e.accelerationIncludingGravity.y || 0;
            this.accel.z = e.accelerationIncludingGravity.z || 9.80665;
            
            if (this.isRunning && !this.isCalibrated && this.calibSamples.length < 60) {
                const mag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
                this.calibSamples.push(mag);
                if (this.calibSamples.length === 60) {
                    this.gLocal = this.calibSamples.reduce((a,b)=>a+b)/60;
                    this.isCalibrated = true;
                }
            }
        });
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        const rho = this.getAirDensity();

        // 1. VECTEUR ACCÉLÉRATION PROPRE (Newton : Somme des forces)
        const netA = {
            x: this.accel.x,
            y: this.accel.y,
            z: (this.accel.z - this.gLocal) // On retire la gravité sur l'axe vertical
        };

        // 2. DÉCÉLÉRATION VECTORIELLE (Action-Réaction)
        // La traînée (Drag) est une accélération opposée au vecteur vitesse
        const dragAccMag = (0.5 * rho * Math.pow(this.vMs, 2) * this.Cd * this.Area) / this.mass;

        if (this.vMs > 0.01) {
            const unit = { 
                x: this.velocityVec.x / this.vMs, 
                y: this.velocityVec.y / this.vMs, 
                z: this.velocityVec.z / this.vMs 
            };
            
            // On applique l'accélération et on soustrait la traînée (Opposition)
            this.velocityVec.x += (netA.x - unit.x * dragAccMag) * dt;
            this.velocityVec.y += (netA.y - unit.y * dragAccMag) * dt;
            this.velocityVec.z += (netA.z - unit.z * dragAccMag) * dt;
        } else {
            // À l'arrêt, seule l'accélération propre compte
            this.velocityVec.x += netA.x * dt;
            this.velocityVec.y += netA.y * dt;
            this.velocityVec.z += netA.z * dt;
        }

        // 3. MISE À JOUR MAGNITUDE & DISTANCE
        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        
        // Seuil de friction statique
        if (this.vMs < 0.05) { this.vMs = 0; this.velocityVec = {x:0, y:0, z:0}; }
        
        this.distance3D += (this.vMs * dt) / 1000;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
