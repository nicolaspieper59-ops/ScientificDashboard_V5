/**
 * OMNISCIENCE V100 PRO - 21-STATE MOTION ENGINE
 * Physique Relativiste & Navigation Inerielle (INS)
 */
const UKF_PRO = {
    state: { v: 0, pitch: 0, dist3D: 0, lastUpdate: performance.now() },
    config: { mass: 70, g: 9.80665, kFriction: 0.998, isCave: false },

    update(accelY, gyro, dt, gpsSpeed) {
        // 1. DÉTECTION MODE GROTTE (Via Selecteur ou Précision GPS)
        const envMode = document.getElementById('environment-select').value;
        this.config.isCave = (envMode === "CONCRETE" || (window.gpsAccuracy > 45));

        // 2. CORRECTION DE PENTE (Anti-Vitesse Doublée)
        // On soustrait g*sin(θ) pour ne garder que l'accélération propre
        const pitchRad = (window.currentPitch || 0) * Math.PI / 180;
        const gravityLeak = this.config.g * Math.sin(pitchRad);
        let linearAcc = accelY - gravityLeak;

        // 3. FILTRAGE DE L'INFINIMENT PETIT (Bruit IMU)
        if (Math.abs(linearAcc) < 0.06) linearAcc = 0;

        // 4. INTÉGRATION AVEC LEAKY INTEGRATOR (Friction Virtuelle)
        const friction = this.config.isCave ? 0.992 : 0.998;
        this.state.v = (this.state.v + linearAcc * dt) * friction;

        // 5. FUSION GNSS (Poids 5% pour ne pas noyer l'IMU)
        if (gpsSpeed && !this.config.isCave) {
            this.state.v += (gpsSpeed - this.state.v) * 0.05;
        }

        this.publishData();
    },

    publishData() {
        const v = Math.max(0, this.state.v);
        const kmh = v * 3.6;
        const c = 299792458;

        // Mise à jour des IDs de Vitesse
        document.getElementById('speed-stable-kmh').innerText = kmh.toFixed(2) + " km/h";
        document.getElementById('sp-main-hud').innerText = kmh.toFixed(1);
        document.getElementById('speed-raw-ms').innerText = v.toFixed(3) + " m/s";

        // Physique Relativiste
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / c, 2));
        document.getElementById('lorentz-factor').innerText = gamma.toFixed(15);
        document.getElementById('time-dilation').innerText = ((gamma - 1) * 86400 * 1e9).toFixed(4) + " ns/j";

        // Statut Visuel
        const statusEl = document.getElementById('ukf-status');
        statusEl.innerText = this.config.isCave ? "MODE GROTTE (ESTIME PURE)" : "FUSION GNSS/IMU ACTIVE";
        statusEl.style.color = this.config.isCave ? "#ff4444" : "#00ff88";
    }
};
