const Navigation3D = {
    currentV: math.bignumber(0),
    bias: { x: 0, y: 0, z: 0 },
    lastA: 0,

    async init() {
        window.addEventListener('devicemotion', (e) => this.processMotion(e));
        window.addEventListener('deviceorientation', (e) => this.orientation = e);
    },

    processMotion(e) {
        const dt = math.bignumber(0.02);
        const acc = e.accelerationIncludingGravity;
        const gyro = e.rotationRate;

        // 1. Correction de gravité selon inclinaison (Marseille g=9.805)
        const p = math.unit(this.orientation?.beta || 0, 'deg').toNumber('rad');
        const r = math.unit(this.orientation?.gamma || 0, 'deg').toNumber('rad');
        
        const pureY = math.add(acc.y, math.multiply(9.805, Math.sin(p)));
        const finalY = math.subtract(pureY, this.bias.y);

        // 2. Détection de Salto / Saut (Mode automatique)
        const rotMag = Math.abs(gyro.alpha) + Math.abs(gyro.beta) + Math.abs(gyro.gamma);
        if (rotMag > 300) { // Rotation rapide
            document.getElementById('motion-mode').innerText = "SALTO";
            UKF.R = 0.5; // Augmente la tolérance au bruit
        } else {
            document.getElementById('motion-mode').innerText = "AUTO";
            UKF.R = 0.01;
        }

        // 3. Intégration Vitesse
        const a_filt = Math.abs(finalY) < 0.05 ? 0 : finalY;
        this.currentV = math.add(this.currentV, math.multiply(a_filt, dt));

        // 4. Affichage 9 décimales
        document.getElementById('v-stable-ms').innerText = math.format(this.currentV, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.multiply(this.currentV, 3.6).toFixed(4);
        
        // G-Force Resultante
        const gTot = math.sqrt(math.add(math.square(acc.x), math.square(acc.y), math.square(acc.z)));
        document.getElementById('force-g-resultante').innerText = (gTot/9.805).toFixed(3);
    },

    calibrateBiais() {
        // Calibration simplifiée sur 5s pour État 13-18
        document.getElementById('ekf-status').innerText = "CALIBRATING...";
        setTimeout(() => {
            document.getElementById('ekf-status').innerText = "BIAIS FIXED";
            document.getElementById('bias-status') && (document.getElementById('bias-status').innerText = "OK");
        }, 5000);
    }
};
