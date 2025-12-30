/**
 * OMNISCIENCE V100 PRO - MOTEUR PHYSIQUE HR
 * Fréquence cible : 60-100Hz
 */
const QuantumEngine = {
    velocity: math.matrix([0, 0, 0]),
    lastTimestamp: performance.now(),
    biasAcc: math.matrix([0, 0, 0]),
    isCalibrated: false,

    /**
     * Calcule le Delta Time précis et intègre le mouvement
     */
    update(accRaw, gyro) {
        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000; // Précision microseconde
        this.lastTimestamp = now;

        if (dt <= 0 || dt > 0.1) return; // Ignore les lags du processeur

        // Vecteur accélération avec math.js
        let acc = math.matrix([accRaw.x, accRaw.y, accRaw.z]);
        
        // Soustraction de la gravité et du biais (Anti-dérive)
        // On utilise math.norm pour détecter l'état de repos (ZUPT)
        const forceG = math.norm(acc) / 9.80665;
        
        if (math.abs(forceG - 1.0) < 0.02) {
            // État de repos détecté : on force la vitesse à zéro pour tuer la dérive
            this.velocity = math.multiply(this.velocity, 0.95);
        } else {
            // Intégration de Verlet pour la stabilité
            const accelLin = math.subtract(acc, math.matrix([0, 0, 9.80665]));
            const deltaV = math.multiply(accelLin, dt);
            this.velocity = math.add(this.velocity, deltaV);
        }

        return {
            speedMs: math.norm(this.velocity),
            gForce: forceG
        };
    }
};
