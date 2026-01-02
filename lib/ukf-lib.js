// Configuration 64-bit
math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        // Vecteur d'état : 21 éléments (Position, Vitesse, Accel, Biais, Inclinaison...)
        this.X = math.zeros(21, 1);
        this.g = math.bignumber(9.80665);
        this.v3D = math.bignumber(0);
    }

    // Mise à jour principale appelée par Navigation3D
    update(accRaw, gyro, dt, pitchDeg, rollDeg) {
        if (!dt || dt <= 0) return;
        const d = math.bignumber(dt);

        // 1. Conversion des angles en Radians (64-bit)
        const pitch = math.divide(math.multiply(math.bignumber(pitchDeg || 0), math.pi), 180);
        const roll = math.divide(math.multiply(math.bignumber(rollDeg || 0), math.pi), 180);

        // 2. SOUSTRACTION DE LA GRAVITÉ TENSORIELLE
        // Formule : Acc_Pure = Acc_Raw - (G * sin(inclinaison))
        const ax_pure = math.subtract(math.bignumber(accRaw.x || 0), math.multiply(this.g, math.sin(roll)));
        const ay_pure = math.subtract(math.bignumber(accRaw.y || 0), math.multiply(this.g, math.sin(pitch)));
        const az_pure = math.subtract(math.bignumber(accRaw.z || 0), math.multiply(this.g, math.cos(pitch)));

        // 3. FILTRE DE BRUIT (Threshold)
        // On ignore tout mouvement < 0.001 m/s² pour stopper la dérive au repos
        const limit = math.bignumber(0.001);
        const process = (val) => math.smaller(math.abs(val), limit) ? math.bignumber(0) : val;

        const ax = process(ax_pure);
        const ay = process(ay_pure);
        const az = process(az_pure);

        // 4. INTÉGRATION DES 21 ÉTATS (Focus Vitesse)
        // v = v + a * dt
        const vx = math.add(this.X.get([3, 0]), math.multiply(ax, d));
        const vy = math.add(this.X.get([4, 0]), math.multiply(ay, d));
        const vz = math.add(this.X.get([5, 0]), math.multiply(az, d));

        // Mise à jour du vecteur d'état
        this.X.set([3, 0], vx);
        this.X.set([4, 0], vy);
        this.X.set([5, 0], vz);

        // 5. CALCUL DE LA NORME 3D (Vitesse réelle dans l'espace)
        this.v3D = math.sqrt(math.add(math.square(vx), math.square(vy), math.square(vz)));

        this.render(ax, ay, az);
    }

    render(ax, ay, az) {
        const v = this.v3D;
        const vKmh = math.multiply(v, 3.6);

        // Affichage Haute Précision (9 décimales)
        document.getElementById('speed-stable-ms').innerText = math.format(v, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(vKmh, {notation: 'fixed', precision: 4});
        
        // IMU Debug
        document.getElementById('accel-x').innerText = math.format(ax, {precision: 6});
        document.getElementById('accel-y').innerText = math.format(ay, {precision: 6});
        document.getElementById('accel-z').innerText = math.format(az, {precision: 6});
    }
}
const UKF = new OmniscienceUKF();
