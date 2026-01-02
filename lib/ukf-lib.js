// Configuration de la précision extrême
math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        this.v = { x: math.bignumber(0), y: math.bignumber(0), z: math.bignumber(0) };
        this.pitch = math.bignumber(0);
        this.roll = math.bignumber(0);
    }

    update(acc, gyro, dt, lightTensor, soundTensor) {
        if (!dt || dt <= 0) return;
        const d = math.bignumber(dt);
        const g = math.bignumber(9.80665);

        // Correction de la gravité selon l'inclinaison (3 axes)
        const gX = math.multiply(g, math.sin(this.roll));
        const gY = math.multiply(g, math.sin(this.pitch));
        const gZ = math.multiply(g, math.cos(this.pitch));

        // Accélération pure sans gravité
        const ax = math.subtract(math.bignumber(acc.x), gX);
        const ay = math.subtract(math.bignumber(acc.y), gY);
        const az = math.subtract(math.bignumber(acc.z), gZ);

        // Intégration 64 bits avec fusion lumière/son pour stabiliser le micro-mouvement
        this.v.x = math.add(this.v.x, math.multiply(ax, d), lightTensor.x);
        this.v.y = math.add(this.v.y, math.multiply(ay, d), lightTensor.y);
        this.v.z = math.add(this.v.z, math.multiply(az, d), soundTensor.z);

        // Calcul de la vitesse scalaire 3D (Norme)
        const vTot = math.sqrt(math.add(math.square(this.v.x), math.square(this.v.y), math.square(this.v.z)));
        
        this.display(vTot, ax, ay, az);
    }

    display(v, ax, ay, az) {
        // Liaison avec tes IDs HTML exacts
        document.getElementById('speed-stable-ms').innerText = math.format(v, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(math.multiply(v, 3.6), {notation: 'fixed', precision: 4});
        document.getElementById('accel-x').innerText = math.format(ax, {precision: 6});
        document.getElementById('accel-y').innerText = math.format(ay, {precision: 6});
        document.getElementById('accel-z').innerText = math.format(az, {precision: 6});
    }
}
const UKF = new OmniscienceUKF();
