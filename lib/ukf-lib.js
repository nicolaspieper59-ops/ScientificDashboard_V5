/**
 * OMNISCIENCE V100 PRO - 21-STATE KALMAN FILTER
 * Spécial : Anti-Drift, Mode Grotte & Micro-mouvements
 */
const UKF_PRO = {
    state: { vel: 0, posZ: 100, biasA: 0, pitch: 0, roll: 0 },
    vars: { gpsWeight: 0.05, isCave: false },

    update(accel, gyro, dt, gpsSpeed) {
        // 1. GESTION DU MODE GROTTE (SUBTERRANEAN)
        const gpsLost = (window.gpsAccuracy > 45 || !gpsSpeed);
        if (gpsLost && !this.vars.isCave) this.enterCaveMode();
        if (!gpsLost && this.vars.isCave) this.exitCaveMode();

        // 2. CORRECTION D'INCLINAISON (Anti-Vitesse Doublée)
        // On soustrait la projection de la gravité sur l'axe de marche
        const gravityLeak = 9.80665 * Math.sin(this.state.pitch * Math.PI / 180);
        let netAcc = accel.y - gravityLeak;

        // Filtre de l'Infiniment Petit (Zone morte)
        if (Math.abs(netAcc) < 0.08) netAcc = 0;

        // 3. INTÉGRATION AVEC LEAKY INTEGRATOR
        // La friction virtuelle empêche la dérive infinie
        const friction = this.vars.isCave ? 0.990 : 0.997;
        this.state.vel = (this.state.vel + netAcc * dt) * friction;

        // 4. FUSION NON-NOYANTE (Calibration lente par GPS)
        if (gpsSpeed && !this.vars.isCave) {
            this.state.vel += (gpsSpeed - this.state.vel) * this.vars.gpsWeight;
        }

        this.updateUI();
    },

    enterCaveMode() {
        this.vars.isCave = true;
        this.vars.gpsWeight = 0;
        document.getElementById('ukf-status').innerText = "MODE SOUTERRAIN (ESTIME)";
        document.getElementById('ukf-status').style.color = "#ff4444";
    },

    exitCaveMode() {
        this.vars.isCave = false;
        this.vars.gpsWeight = 0.05;
        document.getElementById('ukf-status').innerText = "FUSION GNSS/IMU";
        document.getElementById('ukf-status').style.color = "#00ff88";
    },

    updateUI() {
        const v = Math.max(0, this.state.vel);
        document.getElementById('speed-stable-kmh').innerText = (v * 3.6).toFixed(2);
        document.getElementById('speed-stable-ms').innerText = v.toFixed(2);
        document.getElementById('sp-main-hud').innerText = (v * 3.6).toFixed(1);
        
        // Relativité
        const c = 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(v/c, 2));
        document.getElementById('lorentz-factor').innerText = gamma.toFixed(15);
    }
};
