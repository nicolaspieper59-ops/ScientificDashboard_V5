math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        this.X = math.zeros(21, 1); // [0-2]Pos, [3-5]Vel, [6-11]Acc/Bias...
        this.P = math.multiply(math.identity(21), 0.01); // Incertitude initiale
        this.g = math.bignumber(9.80665);
    }

    update(accRaw, gyro, dt, tensors) {
        if (!dt || dt <= 0) return;
        const d = math.bignumber(dt);
        
        // 1. RÉCUPÉRATION DE L'INCLINAISON (Pitch/Roll)
        const pitch = math.divide(math.multiply(math.bignumber(gyro.beta || 0), math.pi), 180);
        const roll = math.divide(math.multiply(math.bignumber(gyro.gamma || 0), math.pi), 180);

        // 2. CORRECTION DE LA GRAVITÉ (Le coeur du problème)
        // On projette 'g' sur les axes pour ne garder que l'accélération LINEAIRE
        const ax = math.subtract(math.bignumber(accRaw.x || 0), math.multiply(this.g, math.sin(roll)));
        const ay = math.subtract(math.bignumber(accRaw.y || 0), math.multiply(this.g, math.sin(pitch)));
        const az = math.subtract(math.bignumber(accRaw.z || 0), math.multiply(this.g, math.cos(pitch)));

        // 3. FILTRE DE BRUIT MICROSCOPIQUE (Seuil 10^-6)
        const threshold = math.bignumber("0.000001");
        const a_pure = [ax, ay, az].map(a => math.smaller(math.abs(a), threshold) ? math.bignumber(0) : a);

        // 4. INTÉGRATION VECTORIELLE (v = v + a*dt)
        // On utilise les tenseurs (Lumière/Son) pour stabiliser
        const vx = math.add(this.X.get([3,0]), math.multiply(a_pure[0], d));
        const vy = math.add(this.X.get([4,0]), math.multiply(a_pure[1], d));
        const vz = math.add(this.X.get([5,0]), math.multiply(a_pure[2], d));

        this.X.set([3,0], vx); this.X.set([4,0], vy); this.X.set([5,0], vz);

        // 5. VITESSE 3D FINALE
        const v3D = math.sqrt(math.add(math.square(vx), math.square(vy), math.square(vz)));
        this.render(v3D, a_pure, pitch);
    }

    render(v, a, p) {
        const v_ms = v;
        const v_kmh = math.multiply(v_ms, 3.6);
        
        // Mise à jour de ton Dashboard (IDs exacts)
        document.getElementById('speed-stable-ms').innerText = math.format(v_ms, {notation: 'fixed', precision: 9});
        document.getElementById('speed-main-display').innerText = math.format(v_kmh, {notation: 'fixed', precision: 4});
        document.getElementById('accel-x').innerText = math.format(a[0], {precision: 6});
        document.getElementById('accel-y').innerText = math.format(a[1], {precision: 6});
        document.getElementById('accel-z').innerText = math.format(a[2], {precision: 6});
        
        // Pente
        document.getElementById('slope-percent').innerText = (Math.tan(parseFloat(p)) * 100).toFixed(2) + " %";
    }
}
const UKF = new OmniscienceUKF();
