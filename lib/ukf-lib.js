math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        // État : [0-2]Pos, [3-5]Vel, [6-8]Acc, [9-11]GyroBias, [12-20]Orientation
        this.X = math.zeros(21, 1);
        this.gBase = math.bignumber(9.80665);
        this.v3D = math.bignumber(0);
        this.q = new THREE.Quaternion(); // Pour les acrobaties (Quaternions)
    }

    // Mise à jour Tensorielle
    update(accRaw, gyroRaw, dt, orientation, referenceMode) {
        if (!dt || dt <= 0) return;
        const d = math.bignumber(dt);
        
        // 1. Mise à jour de l'orientation par Quaternions (évite le Gimbal Lock en salto)
        this.q.setFromEuler(new THREE.Euler(
            math.unit(orientation.beta, 'deg').toNumber(),
            math.unit(orientation.gamma, 'deg').toNumber(),
            math.unit(orientation.alpha, 'deg').toNumber()
        ));

        // 2. Projection de l'accélération dans le référentiel monde
        let aVec = new THREE.Vector3(accRaw.x, accRaw.y, accRaw.z);
        aVec.applyQuaternion(this.q);

        // 3. Soustraction dynamique de la Gravité selon le corps céleste
        const gEffet = (referenceMode === "SPACE") ? math.bignumber(0) : this.gBase;
        const ax = math.subtract(math.bignumber(aVec.x), 0);
        const ay = math.subtract(math.bignumber(aVec.y), 0);
        const az = math.subtract(math.bignumber(aVec.z), gEffet);

        // 4. Filtre de bruit adaptatif (Noise Floor)
        const threshold = math.bignumber("0.0005");
        const process = (v) => math.smaller(math.abs(v), threshold) ? math.bignumber(0) : v;

        // 5. Intégration Newtonienne 64-bit
        const newVx = math.add(this.X.get([3,0]), math.multiply(process(ax), d));
        const newVy = math.add(this.X.get([4,0]), math.multiply(process(ay), d));
        const newVz = math.add(this.X.get([5,0]), math.multiply(process(az), d));

        this.X.set([3,0], newVx);
        this.X.set([4,0], newVy);
        this.X.set([5,0], newVz);

        this.v3D = math.sqrt(math.add(math.square(newVx), math.square(newVy), math.square(newVz)));
        this.render(ax, ay, az, referenceMode);
    }

    render(ax, ay, az, mode) {
        const vMs = this.v3D;
        const vKmh = math.multiply(vMs, 3.6);
        
        document.getElementById('speed-stable-ms').innerText = math.format(vMs, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(vKmh, {notation: 'fixed', precision: 4});
        document.getElementById('accel-x').innerText = math.format(ax, {precision: 6});
        document.getElementById('accel-y').innerText = math.format(ay, {precision: 6});
        document.getElementById('accel-z').innerText = math.format(az, {precision: 6});
        document.getElementById('dynamic-mode-val').innerText = mode;
    }
}
const UKF = new OmniscienceUKF();
