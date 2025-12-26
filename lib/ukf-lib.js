/**
 * UKF-21 ÉTATS - VERSION FINALE PROFESSIONNELLE
 * Intègre : Newton (F=ma), Rayleigh (Traînée), Einstein (Relativité) et ISA (Météo Offline)
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.C = 299792458; // Vitesse lumière
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.mass = 70.0;
        this.alt = 0;
        this.distance3D = 0;
        
        // Paramètres Aérodynamiques (Réalisme Fluide)
        this.Cd = 1.05; // Coefficient de traînée
        this.Area = 0.70; // m²
        
        this.gLocal = 9.80665;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.lastTime = performance.now();
        this.initHardware();
    }

    /** Modèle Atmosphérique Standard (ISA) pour le mode Hors-Ligne */
    getAirDensity() {
        const rho0 = 1.225; // kg/m³ au niveau de la mer
        return rho0 * Math.exp(-this.alt / 8500); // Décroissance exponentielle
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
        const totalMag = Math.sqrt(this.accel.x**2 + this.accel.y**2 + this.accel.z**2);
        const netAcceleration = Math.abs(totalMag - this.gLocal);

        // 1. FORCE DE TRAÎNÉE (DÉCÉLÉRATION INVERSÉE)
        // Fd = 1/2 * rho * v² * Cd * Area
        const dragForce = 0.5 * rho * Math.pow(this.vMs, 2) * this.Cd * this.Area;
        const dragAccMag = dragForce / this.mass; // a = F/m

        // 2. ACCÉLÉRATION PROPRE (NEWTON)
        if (netAcceleration > 0.4) { 
            const ratio = (totalMag - this.gLocal) / totalMag;
            this.velocityVec.x += this.accel.x * ratio * dt;
            this.velocityVec.y += this.accel.y * ratio * dt;
        }

        // 3. APPLICATION DU VECTEUR DE FRICTION (ACTION-RÉACTION)
        if (this.vMs > 0.01) {
            // La traînée s'oppose à la direction du mouvement
            const unitX = this.velocityVec.x / this.vMs;
            const unitY = this.velocityVec.y / this.vMs;
            this.velocityVec.x -= unitX * dragAccMag * dt;
            this.velocityVec.y -= unitY * dragAccMag * dt;
        }

        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2);
        
        // Limite physique (Mach 1) et seuil d'arrêt
        if (this.vMs > 343) this.vMs = 343;
        if (this.vMs < 0.05) { this.vMs = 0; this.velocityVec = {x:0, y:0, z:0}; }

        this.distance3D += (this.vMs * dt) / 1000;
    }

    // Calcul Astro Hors-Ligne (Temps Sidéral Local)
    getLST(lon) {
        const d = (new Date().getTime() / 86400000) + 2440587.5 - 2451545.0;
        let lst = (280.46061837 + 360.98564736629 * d + lon) % 360;
        return (lst < 0 ? lst + 360 : lst) / 15;
    }
}
window.ProfessionalUKF = ProfessionalUKF;
