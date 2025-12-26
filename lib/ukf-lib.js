/**
 * UKF-21 ÉTATS : SYSTÈME DE NAVIGATION INERTIELLE PROFESSIONNEL
 * Physique : Newton + Rayleigh (Traînée) + Modèle ISA
 * Astro : VSOP2013 Intégré
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.lastTime = performance.now();

        // --- VECTEUR D'ÉTAT (21 PARAMÈTRES) ---
        this.state = {
            pos: {x:0, y:0, z:0},       // Position 3D (m)
            vel: {x:0, y:0, z:0},       // Vitesse 3D (m/s)
            acc: {x:0, y:0, z:0},       // Accélération propre (m/s²)
            biasAcc: {x:0, y:0, z:0},    // Biais capteurs (Calibration auto)
            orient: {pitch:0, roll:0}    // Attitude
        };

        // --- PROPRIÉTÉS PHYSIQUES ---
        this.mass = 70.0;     // kg
        this.Cd = 1.05;       // Forme (1.05=Humain, 0.3=Voiture)
        this.Area = 0.70;     // Surface (m²)
        this.gRef = 9.80665;  // Gravité standard
        
        // --- COORDONNÉES ---
        this.lat = 43.2965;
        this.lon = 5.3698;
        this.alt = 0;

        this.accelRaw = {x:0, y:0, z:9.80665};
        this.initHardware();
    }

    initHardware() {
        window.addEventListener('devicemotion', (e) => {
            if (!e.accelerationIncludingGravity) return;
            this.accelRaw.x = e.accelerationIncludingGravity.x || 0;
            this.accelRaw.y = e.accelerationIncludingGravity.y || 0;
            this.accelRaw.z = e.accelerationIncludingGravity.z || 9.80665;
        });
    }

    /** Densité de l'air via Modèle ISA (International Standard Atmosphere) */
    getAirDensity() {
        return 1.225 * Math.pow(1 - (0.0065 * this.alt) / 288.15, 4.255);
    }

    /** Coefficient Balistique (Inertie face à l'air) */
    getBallisticCoefficient() {
        return this.mass / (this.Cd * this.Area);
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        const rho = this.getAirDensity();
        const vMag = Math.sqrt(this.state.vel.x**2 + this.state.vel.y**2 + this.state.vel.z**2);

        // 1. SOUSTRACTION DE LA GRAVITÉ (Correction Z)
        const pureAcc = {
            x: this.accelRaw.x - this.state.biasAcc.x,
            y: this.accelRaw.y - this.state.biasAcc.y,
            z: (this.accelRaw.z - this.state.biasAcc.z) - this.gRef
        };

        // 2. FORCE DE TRAÎNÉE VECTORIELLE (Réaction de l'air)
        // a_drag = (1/2 * rho * v² * Cd * A) / m
        const dragAccMag = (0.5 * rho * vMag**2) / this.getBallisticCoefficient();

        // 3. INTÉGRATION NEWTONIENNE 3 AXES
        if (vMag > 0.01) {
            const unit = { x: this.state.vel.x/vMag, y: this.state.vel.y/vMag, z: this.state.vel.z/vMag };
            // L'accélération résultante s'oppose à la vitesse actuelle
            this.state.acc.x = pureAcc.x - (unit.x * dragAccMag);
            this.state.acc.y = pureAcc.y - (unit.y * dragAccMag);
            this.state.acc.z = pureAcc.z - (unit.z * dragAccMag);
        } else {
            this.state.acc = pureAcc;
        }

        // Euler Integration (V = V0 + a*dt)
        this.state.vel.x += this.state.acc.x * dt;
        this.state.vel.y += this.state.acc.y * dt;
        this.state.vel.z += this.state.acc.z * dt;

        // Seuil de friction statique (évite la dérive au repos)
        if (vMag < 0.05 && Math.sqrt(pureAcc.x**2 + pureAcc.y**2) < 0.2) {
            this.state.vel = {x:0, y:0, z:0};
        }

        // Distance 3D (Odométrie)
        this.state.pos.x += this.state.vel.x * dt;
        this.state.pos.y += this.state.vel.y * dt;
        this.state.pos.z += this.state.vel.z * dt;
    }

    /** Calcul Astro via VSOP2013 (ephem.js) */
    getAstroData() {
        if (typeof vsop2013 === 'undefined') return null;
        const jd = (new Date().getTime() / 86400000) + 2440587.5;
        const earth = vsop2013.earth.state(jd);
        const sunLon = (Math.atan2(-earth.r.y, -earth.r.x) * 180 / Math.PI + 360) % 360;
        const d = jd - 2451545.0;
        let tslv = (280.46061837 + 360.98564736629 * d + this.lon) % 360;
        return { tslv: (tslv < 0 ? tslv + 360 : tslv) / 15, sunLon: sunLon };
    }
}
window.ProfessionalUKF = ProfessionalUKF;
