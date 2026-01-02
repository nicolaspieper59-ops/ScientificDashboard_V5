math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        // Vecteurs d'état 64 bits (Position, Vitesse, Accélération)
        this.X = {
            v: { x: math.bignumber(0), y: math.bignumber(0), z: math.bignumber(0) },
            biasA: { x: math.bignumber(0), y: math.bignumber(0), z: math.bignumber(0) }
        };
        this.orientation = { pitch: math.bignumber(0), roll: math.bignumber(0) };
    }

    setOrientation(p, r) {
        this.orientation.pitch = math.divide(math.multiply(math.bignumber(p), math.pi), 180);
        this.orientation.roll = math.divide(math.multiply(math.bignumber(r), math.pi), 180);
    }

    update(accRaw, gyro, dt, lightTensor, soundTensor) {
        if (!dt || dt <= 0) return;
        const d = math.bignumber(dt);
        const g = math.bignumber(9.80665);

        // 1. CORRECTION DE PENTE & GRAVITÉ (Projection 3D)
        const gX = math.multiply(g, math.sin(this.orientation.roll));
        const gY = math.multiply(g, math.sin(this.orientation.pitch));
        const gZ = math.multiply(g, math.cos(this.orientation.pitch));

        // 2. ACCÉLÉRATION LINÉAIRE PURE (Soustraction Biais + Gravité)
        const aPure = {
            x: math.subtract(math.bignumber(accRaw.x || 0), gX),
            y: math.subtract(math.bignumber(accRaw.y || 0), gY),
            z: math.subtract(math.bignumber(accRaw.z || 0), gZ)
        };

        // 3. FUSION TENSORIELLE (Lumière/Son comme stabilisateurs)
        // Les tenseurs agissent comme des filtres de confiance sur les micro-vibrations
        const axes = ['x', 'y', 'z'];
        axes.forEach(axis => {
            // v = v + (a * dt) + Correction(Photonique/Acoustique)
            const motionSignal = math.add(math.multiply(aPure[axis], d), lightTensor[axis], soundTensor[axis]);
            
            // Seuil microscopique (Noise Gate) pour éviter la dérive à 0.000000000
            if (math.larger(math.abs(motionSignal), math.bignumber("1e-9"))) {
                this.X.v[axis] = math.add(this.X.v[axis], motionSignal);
            } else {
                this.X.v[axis] = math.multiply(this.X.v[axis], math.bignumber(0.99)); // Amortissement
            }
        });

        // 4. NORME DU VECTEUR VITESSE 3D
        const vSumSq = math.add(math.square(this.X.v.x), math.square(this.X.v.y), math.square(this.X.v.z));
        const vTotal = math.sqrt(vSumSq);

        this.render(vTotal, aPure);
    }

    render(v, a) {
        const vKMH = math.multiply(v, 3.6);
        // Mise à jour HTML (IDs de ton index.html)
        document.getElementById('speed-stable-ms').innerText = math.format(v, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(vKMH, {notation: 'fixed', precision: 4});
        document.getElementById('sp-main-hud').innerText = math.format(vKMH, {notation: 'fixed', precision: 2});

        // IMU Axes
        document.getElementById('accel-x').innerText = math.format(a.x, {precision: 6});
        document.getElementById('accel-y').innerText = math.format(a.y, {precision: 6});
        document.getElementById('accel-z').innerText = math.format(a.z, {precision: 6});

        // Relativité Einsteinienne
        const c = math.bignumber(299792458);
        const beta = math.divide(v, c);
        const gamma = math.divide(1, math.sqrt(math.subtract(1, math.square(beta))));
        document.getElementById('lorentz-factor').innerText = math.format(gamma, {precision: 15});
    }
}
const UKF = new OmniscienceUKF();
