// Configuration Math.js pour la précision 64 bits
math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        // 21 États : Pos(3), Vel(3), Acc(3), Att(3), BiaisA(3), BiaisG(3), Scale(3)
        this.X = math.zeros(21, 1);
        this.P = math.multiply(math.identity(21), 0.1);
        this.lastAccY = math.bignumber(0);
        this.jumpCount = 0;
    }

    update(accRaw, gyro, dt) {
        const d = math.bignumber(dt);
        const currentV = this.X.get([4, 0]);

        // 1. DÉTECTION SISMOGRAPHE (Si vitesse quasi nulle)
        const jerk = math.divide(math.subtract(accRaw.y, this.lastAccY), d);
        if (math.smaller(math.abs(currentV), 0.01) && math.greater(math.abs(jerk), 0.2)) {
            this.triggerSeismicEvent(accRaw.y, jerk);
        }

        // 2. FILTRE ANTI-SALTO (Basé sur le Gyroscope)
        const rotationMagnitude = Math.abs(gyro.alpha) + Math.abs(gyro.beta) + Math.abs(gyro.gamma);
        if (rotationMagnitude > 400) {
            this.handleComplexMotion();
            return; // On fige l'intégration pendant la pirouette pour éviter l'erreur
        }

        // 3. INTÉGRATION 64-BIT (Vitesse stable)
        // Soustraction du biais accéléromètre (État 13)
        const pureAccY = math.subtract(accRaw.y, this.X.get([13, 0]));
        const nextV = math.add(currentV, math.multiply(pureAccY, d));
        
        this.X.set([4, 0], nextV);
        this.lastAccY = accRaw.y;
        this.syncUI(nextV, accRaw, jerk);
    }

    triggerSeismicEvent(mag, jerk) {
        document.getElementById('ekf-status').innerText = "VIBRATION DÉTECTÉE";
        document.getElementById('vibration-jerk').innerText = math.format(jerk, {precision: 4});
        // Logique de rapport automatique si secousse importante
        if (math.greater(math.abs(mag), 0.5)) SeismicReporter.logEvent(mag, jerk);
    }

    handleComplexMotion() {
        this.jumpCount++;
        document.getElementById('jump-counter').innerText = this.jumpCount;
        document.getElementById('motion-mode-master').innerText = "SALTO / VOL";
    }

    syncUI(v, acc, jerk) {
        // Mise à jour des IDs du HTML
        document.getElementById('speed-stable-ms').innerText = math.format(v, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.multiply(v, 3.6).toFixed(4);
        
        // Relativité
        const c = math.bignumber(299792458);
        const gamma = math.divide(1, math.sqrt(math.subtract(1, math.square(math.divide(v, c)))));
        document.getElementById('lorentz-factor').innerText = math.format(gamma, {precision: 15});
        
        // Force G
        const gRes = math.divide(math.sqrt(math.add(math.square(acc.x), math.square(acc.y), math.square(acc.z))), 9.805);
        document.getElementById('force-g-resultante').innerText = gRes.toFixed(3);
    }
}
const UKF = new OmniscienceUKF();
