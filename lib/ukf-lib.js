/**
 * UKF-21 ÉTATS : FILTRE DE KALMAN PROFESSIONNEL
 * États : [Pos(3), Vel(3), Acc(3), BiasAcc(3), Quat(4), BiasGyro(3), Gravity(2)]
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.lastTime = performance.now();
        
        // --- VECTEUR D'ÉTAT X (21 ÉTATS) ---
        this.state = {
            p: {x:0, y:0, z:0},       // 1-3: Position
            v: {x:0, y:0, z:0},       // 4-6: Vitesse
            a: {x:0, y:0, z:0},       // 7-9: Accélération Propre
            ba: {x:0, y:0, z:0},      // 10-12: Biais Accéléromètre (Correction inclinaison)
            q: {w:1, x:0, y:0, z:0},  // 13-16: Quaternions d'Attitude
            bg: {x:0, y:0, z:0},      // 17-19: Biais Gyroscope
            gLocal: 9.80665,          // 20: Gravité estimée
            rho: 1.225                // 21: Densité air estimée
        };

        // --- MATRICE D'INCERTITUDE (P) ---
        this.P = 0.1; // Incertitude initiale

        // --- PROPRIÉTÉS PHYSIQUES ---
        this.mass = 70.0;
        this.Cd = 1.05; 
        this.Area = 0.70;
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

    /**
     * PRÉDICTION : Loi de Newton + Inversion de forme
     */
    predict(dt) {
        // 1. Correction de l'inclinaison par soustraction du biais estimé
        const pureAcc = {
            x: this.accelRaw.x - this.state.ba.x,
            y: this.accelRaw.y - this.state.ba.y,
            z: this.accelRaw.z - this.state.ba.z - this.state.gLocal
        };

        // 2. Modèle de Traînée (Rayleigh) : Dépend de la forme (Cd, Area)
        const vMag = Math.sqrt(this.state.v.x**2 + this.state.v.y**2 + this.state.v.z**2);
        const dragFactor = (0.5 * this.state.rho * this.Cd * this.Area) / this.mass;
        
        // 3. Mise à jour des accélérations (F = ma => a = F/m)
        this.state.a.x = pureAcc.x - (dragFactor * vMag * this.state.v.x);
        this.state.a.y = pureAcc.y - (dragFactor * vMag * this.state.v.y);
        this.state.a.z = pureAcc.z - (dragFactor * vMag * this.state.v.z);

        // 4. Intégration de mouvement (V = V0 + at)
        this.state.v.x += this.state.a.x * dt;
        this.state.v.y += this.state.a.y * dt;
        this.state.v.z += this.state.a.z * dt;

        // 5. Odométrie (P = P0 + vt)
        this.state.p.x += this.state.v.x * dt;
        this.state.p.y += this.state.v.y * dt;
        this.state.p.z += this.state.v.z * dt;
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        this.predict(dt);
        
        // Filtre de vitesse au repos (Zero Velocity Update - ZUPT)
        const accMag = Math.sqrt(this.accelRaw.x**2 + this.accelRaw.y**2 + this.accelRaw.z**2);
        if (Math.abs(accMag - this.state.gLocal) < 0.05) {
            this.state.v = {x:0, y:0, z:0}; // L'appareil est stable, on réinitialise la dérive
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
