// Configuration Math.js pour la précision 64 bits
math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        this.X = math.zeros(21, 1); // État : Pos(3), Vel(3), Acc(3), Bias(3), Quat(4), etc.
        this.gBase = math.bignumber(9.80665);
        this.v3D = math.bignumber(0);
        this.lastUpdate = performance.now();
    }

    // Mise à jour principale
    predict(accRaw, gyroRaw, orientation, mode) {
        const now = performance.now();
        const dt = math.bignumber((now - this.lastUpdate) / 1000);
        this.lastUpdate = now;

        if (dt <= 0) return;

        // 1. COMPENSATION DE LA ROTATION (SALTO/ACROBATIE)
        // On utilise les angles d'Euler pour reconstruire la matrice de rotation
        const pitch = math.unit(orientation.beta || 0, 'deg').toNumber();
        const roll = math.unit(orientation.gamma || 0, 'deg').toNumber();
        
        // Projection de la gravité
        const gx = math.multiply(this.gBase, math.sin(math.unit(roll, 'deg')));
        const gy = math.multiply(this.gBase, math.sin(math.unit(pitch, 'deg')));
        const gz = math.multiply(this.gBase, math.cos(math.unit(pitch, 'deg')));

        // 2. ACCÉLÉRATION LINÉAIRE PURE
        const ax = math.subtract(math.bignumber(accRaw.x), gx);
        const ay = math.subtract(math.bignumber(accRaw.y), gy);
        const az = math.subtract(math.bignumber(accRaw.z), (mode === "SPACE" ? 0 : gz));

        // 3. FILTRE DE BRUIT ET INTÉGRATION
        const threshold = math.bignumber(0.005);
        const filter = (v) => math.smaller(math.abs(v), threshold) ? math.bignumber(0) : v;

        const vx = math.add(this.X.get([3,0]), math.multiply(filter(ax), dt));
        const vy = math.add(this.X.get([4,0]), math.multiply(filter(ay), dt));
        const vz = math.add(this.X.get([5,0]), math.multiply(filter(az), dt));

        this.X.set([3,0], vx); this.X.set([4,0], vy); this.X.set([5,0], vz);

        // 4. VITESSE STABLE 3D
        this.v3D = math.sqrt(math.add(math.square(vx), math.square(vy), math.square(vz)));
        this.render(ax, ay, az, mode);
    }

    render(ax, ay, az, mode) {
        document.getElementById('speed-stable-ms').innerText = math.format(this.v3D, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(math.multiply(this.v3D, 3.6), {notation: 'fixed', precision: 4});
        document.getElementById('accel-x').innerText = math.format(ax, {precision: 5});
        document.getElementById('accel-y').innerText = math.format(ay, {precision: 5});
        document.getElementById('accel-z').innerText = math.format(az, {precision: 5});
    }
}
const UKF = new OmniscienceUKF();
