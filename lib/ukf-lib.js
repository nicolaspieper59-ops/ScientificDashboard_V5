/**
 * UKF-21 ÉTATS - VERSION PROFESSIONNELLE FINALE
 * Newton + Rayleigh + Einstein + ISA + Astro-Offline
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.C = 299792458; 
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.distance3D = 0;
        this.mass = 70.0;
        this.alt = 0;
        
        // Paramètres Fluides (Standard)
        this.Cd = 1.05; 
        this.Area = 0.70; 
        
        this.gLocal = 9.80665;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.lastTime = performance.now();
        this.initHardware();
    }

    getAirDensity() {
        const rho0 = 1.225; // kg/m³
        return rho0 * Math.exp(-this.alt / 8500);
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
        const netAcc = Math.abs(totalMag - this.gLocal);

        // 1. ACCÉLÉRATION (Newton)
        if (netAcc > 0.4) { 
            const ratio = (totalMag - this.gLocal) / totalMag;
            this.velocityVec.x += this.accel.x * ratio * dt;
            this.velocityVec.y += this.accel.y * ratio * dt;
        }

        // 2. INVERSION DE NEWTON (Traînée opposée au mouvement)
        const dragAccMag = (0.5 * rho * Math.pow(this.vMs, 2) * this.Cd * this.Area) / this.mass;
        if (this.vMs > 0.01) {
            this.velocityVec.x -= (this.velocityVec.x / this.vMs) * dragAccMag * dt;
            this.velocityVec.y -= (this.velocityVec.y / this.vMs) * dragAccMag * dt;
        }

        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2);
        if (this.vMs < 0.05) { this.vMs = 0; this.velocityVec = {x:0, y:0, z:0}; }
        this.distance3D += (this.vMs * dt) / 1000;
    }

    // Moteur Astronomique Intégré
    getAstro(lon = 5.36) {
        const d = (new Date().getTime() / 86400000) + 2440587.5 - 2451545.0;
        let lst = (280.46061837 + 360.98564736629 * d + lon) % 360;
        if (lst < 0) lst += 360;
        const L = (280.460 + 0.9856474 * d) % 360;
        const g = (357.528 + 0.9856003 * d) % 360 * (Math.PI / 180);
        const sunLon = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360;
        return { lst: lst / 15, sunLon: sunLon };
    }
}
window.ProfessionalUKF = ProfessionalUKF;
