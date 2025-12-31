/**
 * OMNISCIENCE V100 PRO - UKF CORE
 * Utilise math.js pour la stabilité matricielle
 */
const UKF_Engine = {
    state: math.matrix([0, 0, 0]), // [Vitesse, Accel, Position]
    covariance: math.identity(3),
    lastUpdate: performance.now(),

    process(accRaw, dt) {
        // 1. Vecteur accélération
        const acc = math.matrix([accRaw.x, accRaw.y, accRaw.z]);
        const gForce = math.norm(acc) / 9.80665;

        // 2. Filtre de dérive temporelle (ZUPT)
        // Si l'accélération est proche de 1G (repos), on réduit la vitesse accumulée
        let v = math.subset(this.state, math.index(0));
        if (math.abs(gForce - 1.0) < 0.02) {
            v = v * 0.85; // Amortissement de la dérive
        } else {
            const linearAcc = (gForce - 1.0) * 9.80665;
            v += linearAcc * dt;
        }

        // 3. Mise à jour de l'état avec math.js
        this.state = math.matrix([v, gForce, 0]);

        return {
            speed: math.abs(v),
            g: gForce,
            lorentz: 1 / math.sqrt(1 - math.pow(v / 299792458, 2))
        };
    }
};
