math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        this.X = math.zeros(21, 1); // [0-2]Pos, [3-5]Vel, [6-8]Acc, [9-11]Att...
        this.P = math.multiply(math.identity(21), 0.1);
        this.isCalibrated = false;
        this.biasA = math.zeros(3, 1);
    }

    update(accRaw, gyro, dt) {
        if (isNaN(dt) || dt <= 0) return;
        const d = math.bignumber(dt);
        
        // 1. Correction des Biais (États 12-14)
        const pureAccY = math.subtract(math.bignumber(accRaw.y), this.X.get([13, 0]));

        // 2. Intégration de la Vitesse (v = v + a*dt)
        let currentV = this.X.get([4, 0]);
        let nextV = math.add(currentV, math.multiply(pureAccY, d));
        
        // Sécurité anti-vitesse négative au repos
        if (math.smaller(nextV, 0)) nextV = math.bignumber(0);
        
        this.X.set([4, 0], nextV);
        this.render(nextV, accRaw);
    }

    render(v, acc) {
        // Liaison avec les IDs exacts de ton index (25) (15).html
        const v_ms = v;
        const v_kmh = math.multiply(v_ms, 3.6);
        const c = math.bignumber(299792458);

        // Vitesse
        document.getElementById('speed-stable-ms').innerText = math.format(v_ms, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(v_kmh, {notation: 'fixed', precision: 4});
        document.getElementById('sp-main-hud').innerText = math.format(v_kmh, {notation: 'fixed', precision: 2});

        // Relativité
        const beta = math.divide(v_ms, c);
        const lorentz = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
        document.getElementById('lorentz-factor').innerText = math.format(lorentz, {precision: 15});

        // Sismographe (Jerk)
        const gRes = math.divide(math.sqrt(math.add(math.square(acc.x), math.square(acc.y), math.square(acc.z))), 9.805);
        document.getElementById('force-g-resultante').innerText = gRes.toFixed(3);
    }
}
const UKF = new OmniscienceUKF();
