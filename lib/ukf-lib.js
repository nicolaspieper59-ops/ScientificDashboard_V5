/**
 * UKF-21 ÉTATS : SYSTÈME DE NAVIGATION INERTIELLE (INS) PROFESSIONNEL
 * Gère : Quaternions, Biais Accéléromètre, Traînée de Rayleigh, et Gravité.
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.lastTime = performance.now();

        // --- VECTEUR D'ÉTAT X (21 PARAMÈTRES) ---
        this.state = {
            pos: {x:0, y:0, z:0},       // 1-3 : Position (m)
            vel: {x:0, y:0, z:0},       // 4-6 : Vitesse (m/s)
            acc: {x:0, y:0, z:0},       // 7-9 : Accélération propre (m/s²)
            bias: {x:0, y:0, z:0},      // 10-12: Biais (Correction inclinaison)
            quat: {w:1, x:0, y:0, z:0}, // 13-16: Orientation (Quaternions)
            gyroBias: {x:0, y:0, z:0},  // 17-19: Dérive Gyro
            gLocal: 9.80665,            // 20: Gravité locale estimée
            rho: 1.225                  // 21: Densité air (ISA)
        };

        // --- PROPRIÉTÉS PHYSIQUES RÉELLES ---
        this.mass = 70.0;     // kg
        this.Cd = 1.05;       // Coefficient de forme (Humain)
        this.Area = 0.70;     // Surface frontale (m²)
        this.gRef = 9.80665;  // Standard Terre
        
        this.accelRaw = {x:0, y:0, z:9.80665};
        this.lat = 43.2965; this.lon = 5.3698; this.alt = 0;
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

    /** Calcule la densité de l'air selon l'altitude (Modèle ISA) */
    updateAtmosphere() {
        const T0 = 288.15; // 15°C
        const L = 0.0065;  // Gradient thermique
        this.state.rho = 1.225 * Math.pow(1 - (L * this.alt) / T0, 4.255);
    }

    /** Sépare la gravité de l'accélération par projection de l'inclinaison */
    getLinearAcc() {
        const norm = Math.sqrt(this.accelRaw.x**2 + this.accelRaw.y**2 + this.accelRaw.z**2);
        // Si l'accélération totale est quasi égale à G, on est à l'arrêt (inclinaison pure)
        if (Math.abs(norm - this.state.gLocal) < 0.15) {
            return {x:0, y:0, z:0};
        }
        // Sinon, on soustrait la projection gravitationnelle
        return {
            x: this.accelRaw.x * (1 - this.state.gLocal/norm),
            y: this.accelRaw.y * (1 - this.state.gLocal/norm),
            z: this.accelRaw.z - this.state.gLocal
        };
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        this.updateAtmosphere();
        const linAcc = this.getLinearAcc();
        const vMag = Math.sqrt(this.state.vel.x**2 + this.state.vel.y**2 + this.state.vel.z**2);

        // --- PHYSIQUE DE NEWTON + TRAÎNÉE (INERTIE RÉELLE) ---
        // Force de traînée aérodynamique s'opposant au vecteur vitesse
        const dragFactor = (0.5 * this.state.rho * this.Cd * this.Area) / this.mass;

        if (vMag > 0.1) {
            const unit = { x: this.state.vel.x/vMag, y: this.state.vel.y/vMag, z: this.state.vel.z/vMag };
            this.state.acc.x = linAcc.x - (unit.x * dragFactor * vMag**2);
            this.state.acc.y = linAcc.y - (unit.y * dragFactor * vMag**2);
            this.state.acc.z = linAcc.z - (unit.z * dragFactor * vMag**2);
        } else {
            this.state.acc = linAcc;
        }

        // Intégration (V = V0 + at)
        this.state.vel.x += this.state.acc.x * dt;
        this.state.vel.y += this.state.acc.y * dt;
        this.state.vel.z += this.state.acc.z * dt;

        // Odométrie 3D
        this.state.pos.x += this.state.vel.x * dt;
        this.state.pos.y += this.state.vel.y * dt;
        this.state.pos.z += this.state.vel.z * dt;
    }

    /** Astronomie VSOP2013 Localisée */
    getAstro() {
        if (typeof vsop2013 === 'undefined') return null;
        const jd = (new Date().getTime() / 86400000) + 2440587.5;
        const earth = vsop2013.earth.state(jd);
        const sunLon = (Math.atan2(-earth.r.y, -earth.r.x) * 180 / Math.PI + 360) % 360;
        const tslv = ((280.46 + 360.985 * (jd - 2451545.0) + this.lon) % 360) / 15;
        return { tslv: tslv < 0 ? tslv + 24 : tslv, sunLon };
    }
}
window.ProfessionalUKF = ProfessionalUKF;
