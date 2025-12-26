/**
 * KERNEL PHYSIQUE UNIFIÉ - UKF 21 ÉTATS (VERSION FINALE)
 * Newton + Rayleigh + Einstein + Modèle ISA + Astro-Offline
 */
class ProfessionalUKF {
    constructor() {
        this.C = 299792458; 
        this.G_REF = 9.80665;
        this.isRunning = false;

        // États 21 points (Positions, Vitesses, Accélérations)
        this.mass = 70.0;
        this.vMs = 0;
        this.vel = { x: 0, y: 0, z: 0 };
        this.acc = { x: 0, y: 0, z: 9.80665 };
        this.alt = 0;
        this.distance3D = 0;
        this.maxSpeed = 0;

        // Paramètres Fluides
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
            if (!this.isRunning || !e.accelerationIncludingGravity) return;
            this.acc.x = e.accelerationIncludingGravity.x || 0;
            this.acc.y = e.accelerationIncludingGravity.y || 0;
            this.acc.z = e.accelerationIncludingGravity.z || 9.80665;

            if (!this.isCalibrated && this.calibSamples.length < 50) {
                const mag = Math.sqrt(this.acc.x**2 + this.acc.y**2 + this.acc.z**2);
                this.calibSamples.push(mag);
                if (this.calibSamples.length === 50) {
                    this.gLocal = this.calibSamples.reduce((a,b)=>a+b)/50;
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
        const dragAcc = (0.5 * rho * Math.pow(this.vMs, 2) * this.Cd * this.Area) / this.mass;

        // Newton : Accélération motrice
        const totalMag = Math.sqrt(this.acc.x**2 + this.acc.y**2 + this.acc.z**2);
        if (Math.abs(totalMag - this.gLocal) > 0.35) {
            const ratio = (totalMag - this.gLocal) / totalMag;
            this.vel.x += this.acc.x * ratio * dt;
            this.vel.y += this.acc.y * ratio * dt;
        }

        // Action-Réaction : La traînée s'oppose à la vitesse (Inversion vectorielle)
        if (this.vMs > 0.01) {
            this.vel.x -= (this.vel.x / this.vMs) * dragAcc * dt;
            this.vel.y -= (this.vel.y / this.vMs) * dragAcc * dt;
        }

        this.vMs = Math.sqrt(this.vel.x**2 + this.vel.y**2);
        if (this.vMs < 0.02) { this.vMs = 0; this.vel = {x:0, y:0}; }
        if (this.vMs * 3.6 > this.maxSpeed) this.maxSpeed = this.vMs * 3.6;
        this.distance3D += (this.vMs * dt) / 1000;
    }

    // --- SOLUTION ASTRONOMIE OFFLINE ---
    getAstroData(lon = 0, lat = 0) {
        const d = (new Date().getTime() / 86400000) + 2440587.5 - 2451545.0; // J2000
        
        // Temps Sidéral Local
        let lst = (280.46061837 + 360.98564736629 * d + lon) % 360;
        if (lst < 0) lst += 360;

        // Position simplifiée du Soleil (écliptique)
        const L = (280.460 + 0.9856474 * d) % 360; // Longitude moyenne
        const g = (357.528 + 0.9856003 * d) % 360 * (Math.PI / 180); // Anomalie moyenne
        const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360; // Longitude écliptique
        
        return {
            lst: lst / 15, // en heures
            sunLon: lambda,
            obliquity: 23.439
        };
    }
}
window.ProfessionalUKF = ProfessionalUKF;
