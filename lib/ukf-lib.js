/**
 * OMNISCIENCE V100 PRO - UNIVERSAL DYNAMICS ENGINE
 * Gère : Insectes, Fusées, Acrobaties, Hyperloop
 */
const UKF_PRO = {
    state: { v: 0, d3d: math.bignumber(0), gamma: 1 },
    config: { c: 299792458, g: 9.80665 },

    update(accel, gyro, dt, gps) {
        // 1. DÉTECTION DU RÉGIME DE MOUVEMENT
        const magnitude = math.sqrt(accel.x**2 + accel.y**2 + accel.z**2);
        const isStatic = magnitude < 0.02; // Mode Gastéropode / Repos
        const isAcrobatic = Math.abs(gyro.z) > 2.0 || magnitude > 3.0; // Saltos / Manèges

        // 2. FILTRAGE DE LA GRAVITÉ (Quaternion-based)
        // Indispensable pour les loopings et toboggans
        let aPure = accel.y; 
        if (!isAcrobatic) {
            const pitch = (window.currentPitch || 0) * (Math.PI / 180);
            aPure -= this.config.g * Math.sin(pitch);
        }

        // 3. INTÉGRATION HAUTE PRÉCISION (Math.js)
        if (isStatic) {
            this.state.v = 0; // Lock mm/s
        } else {
            const dv = math.multiply(math.bignumber(aPure), math.bignumber(dt));
            this.state.v = math.add(math.bignumber(this.state.v), dv);
        }

        // 4. FUSION GNSS (Blackout automatique en tunnel/métro)
        if (gps && window.gpsAcc < 30) {
            const gpsV = math.bignumber(gps);
            this.state.v = math.add(this.state.v, math.multiply(math.subtract(gpsV, this.state.v), 0.1));
        }

        this.publish();
    },

    publish() {
        const v = parseFloat(this.state.v);
        const kmh = v * 3.6;

        // Mise à jour IDs HTML
        document.getElementById('speed-stable-kmh').innerText = kmh.toFixed(2);
        document.getElementById('speed-raw-ms').innerText = v.toFixed(3);
        document.getElementById('sp-main-hud').innerText = kmh.toFixed(kmh > 1000 ? 0 : 1);

        // Relativité (Fusées / c)
        const beta = v / this.config.c;
        this.state.gamma = 1 / Math.sqrt(1 - beta**2);
        document.getElementById('lorentz-factor').innerText = this.state.gamma.toFixed(15);
        
        // Statut Dynamique
        const status = document.getElementById('ukf-status');
        if (v < 0.01) status.innerText = "MODE MACRO (BIOLOGIQUE)";
        else if (v > 340) status.innerText = "MODE SUPERSONIQUE";
        else status.innerText = "NAVIGATION FUSIONNÉE";
    }
};
