/**
 * OMNISCIENCE V100 PRO - NEWTONIAN & SYMMETRIC ENGINE
 * Physique : Inertie, Stiction (Seuil) et Décélération Inversée
 */
const UKF_PRO = {
    state: { v: 0, d3d: 0, lastAcc: 0 },
    config: {
        c: 299792458,
        stiction: 0.18,      // Seuil de force pour bouger (m/s²)
        brakeForce: 1.5,     // Puissance de la décélération (m/s²)
        vLimit: 0.005        // Seuil d'arrêt complet (5mm/s)
    },

    update(accelY, pitch, dt, gpsSpeed) {
        // 1. Correction Gravité (Pente)
        const g = 9.80665;
        const radPitch = (pitch || 0) * (Math.PI / 180);
        let a_pure = accelY - (g * Math.sin(radPitch));

        // 2. Seuil de Réalisme (Suppression du bruit à 1mm/s)
        if (Math.abs(a_pure) < this.config.stiction) a_pure = 0;

        // 3. Dynamique Symétrique
        if (a_pure === 0 && Math.abs(this.state.v) > 0) {
            // Mode Décélération (Newton Inversé)
            const direction = -Math.sign(this.state.v);
            const friction = this.config.brakeForce * dt;
            
            if (Math.abs(this.state.v) > friction) {
                this.state.v += direction * friction;
            } else {
                this.state.v = 0;
            }
        } else {
            // Mode Accélération Active
            this.state.v += a_pure * dt;
        }

        // 4. Fusion GPS
        if (gpsSpeed !== null && window.gpsAcc < 20) {
            this.state.v = this.state.v * 0.9 + gpsSpeed * 0.1;
        }

        this.publish();
    },

    publish() {
        const v = this.state.v;
        const kmh = v * 3.6;
        
        // Mise à jour HTML
        document.getElementById('speed-stable-kmh').innerText = kmh.toFixed(2);
        document.getElementById('speed-raw-ms').innerText = Math.abs(v) < 0.001 ? "0.000" : v.toFixed(3);
        document.getElementById('sp-main-hud').innerText = Math.abs(kmh).toFixed(1);

        // Relativité avec Math.js
        if (typeof math !== 'undefined') {
            const vB = math.bignumber(Math.abs(v));
            const cB = math.bignumber(this.config.c);
            const beta = math.divide(vB, cB);
            const gamma = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
            document.getElementById('lorentz-factor').innerText = math.format(gamma, {notation: 'fixed', precision: 15});
        }
    }
};
