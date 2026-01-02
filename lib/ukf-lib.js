math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        this.v = { x: math.bignumber(0), y: math.bignumber(0), z: math.bignumber(0) };
        this.g = math.bignumber(9.80665);
        this.lastT = performance.now();
    }

    update(acc, gyro, orientation, mode) {
        const now = performance.now();
        const dt = math.divide(math.bignumber(now - this.lastT), 1000);
        this.lastT = now;
        if (math.equal(dt, 0)) return;

        // 1. Correction de pente/salto par projection
        const p = math.unit(orientation.beta || 0, 'deg').toNumber();
        const r = math.unit(orientation.gamma || 0, 'deg').toNumber();
        
        // Soustraction de la gravité projetée
        const ax = math.subtract(math.bignumber(acc.x), math.multiply(this.g, math.sin(math.unit(r, 'deg'))));
        const ay = math.subtract(math.bignumber(acc.y), math.multiply(this.g, math.sin(math.unit(p, 'deg'))));
        const az = math.subtract(math.bignumber(acc.z), (mode === "SPACE" ? 0 : math.multiply(this.g, math.cos(math.unit(p, 'deg')))));

        // 2. Intégration (Filtre de bruit à 0.001)
        const filter = (val) => math.smaller(math.abs(val), 0.001) ? math.bignumber(0) : val;
        this.v.x = math.add(this.v.x, math.multiply(filter(ax), dt));
        this.v.y = math.add(this.v.y, math.multiply(filter(ay), dt));
        this.v.z = math.add(this.v.z, math.multiply(filter(az), dt));

        // 3. Calcul de la norme 3D
        const vTot = math.sqrt(math.add(math.square(this.v.x), math.square(this.v.y), math.square(this.v.z)));
        
        this.display(vTot, ax, ay, az, mode);
    }

    display(v, ax, ay, az, mode) {
        // IDs EXACTS de ton HTML
        document.getElementById('speed-stable-ms').innerText = math.format(v, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(math.multiply(v, 3.6), {notation: 'fixed', precision: 4});
        document.getElementById('accel-x').innerText = math.format(ax, {precision: 5});
        document.getElementById('accel-y').innerText = math.format(ay, {precision: 5});
        document.getElementById('accel-z').innerText = math.format(az, {precision: 5});
        document.getElementById('ekf-status').innerText = "V100 PRO: " + mode;
    }
}
const UKF = new OmniscienceUKF();
