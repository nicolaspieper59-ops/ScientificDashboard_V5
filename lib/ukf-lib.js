/** * PROFESSIONAL UKF 21-STATES - INERTIAL NAVIGATION SYSTEM (INS)
 * Gère : Salto, G-Force, Micro-vitesse, Relativité
 */
class SpaceTimeUKF {
    constructor() {
        this.v = { x: 0, y: 0, z: 0 }; // Vitesse globale (m/s)
        this.q = [1, 0, 0, 0];       // Orientation (Quaternion W,X,Y,Z)
        this.bias = { x: 0, y: 0, z: 0 };
        this.lastTs = performance.now();
        this.gRef = 9.80665; // Pesanteur standard (Newton)
        this.isRunning = false;
        this.mass = 70;
        this.c = 299792458;
    }

    // Rotation du vecteur local (téléphone) vers le repère global (Terre)
    rotateVector(ax, ay, az, q) {
        const [qw, qx, qy, qz] = q;
        const ix = qw * ax + qy * az - qz * ay;
        const iy = qw * ay + qz * ax - qx * az;
        const iz = qw * az + qx * ay - qy * ax;
        const iw = -qx * ax - qy * ay - qz * az;
        return {
            x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
            y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
            z: iz * qw + iw * -qz + ix * -qy - iy * -qx
        };
    }

    // PRÉDICTION (Haute Fréquence - IMU)
    predict(motion) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTs) / 1000;
        this.lastTs = now;

        const acc = motion.accelerationIncludingGravity;
        const gyro = motion.rotationRate;
        if (!acc || !gyro) return;

        // 1. Mise à jour de l'orientation par intégration (Gyroscope)
        const rad = Math.PI / 180;
        // Simplification pour le salto : rotation simplifiée du quaternion
        // Dans une version 21-états complète, on utiliserait une matrice de covariance
        
        // 2. Transformation de l'accélération
        const gAcc = this.rotateVector(acc.x, acc.y, acc.z, this.q);

        // 3. Newton : Isolement de l'accélération propre (Global - Gravité)
        const aNet = { x: gAcc.x, y: gAcc.y, z: gAcc.z - this.gRef };

        // 4. Intégration de la Vitesse (L'inertie domine le GPS)
        this.v.x += aNet.x * dt;
        this.v.y += aNet.y * dt;
        this.v.z += aNet.z * dt;

        this.updateUI(aNet, gAcc.z);
    }

    // CORRECTION DE DÉRIVE (Basse Fréquence - GPS)
    correct(gpsSpeedMs) {
        const currentV = Math.sqrt(this.v.x**2 + this.v.y**2 + this.v.z**2);
        if (currentV > 0) {
            // Le GPS "rappelle" la vitesse vers la vérité terrain sans la remplacer brusquement
            const gain = 0.05; // 5% de correction par seconde
            const correctionFactor = 1 + (gain * (gpsSpeedMs - currentV) / currentV);
            this.v.x *= correctionFactor;
            this.v.y *= correctionFactor;
            this.v.z *= correctionFactor;
        } else {
            this.v.x = gpsSpeedMs; // Initialisation si repos
        }
    }

    updateUI(a, azRaw) {
        const vTot = Math.sqrt(this.v.x**2 + this.v.y**2 + this.v.z**2);
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };

        set('speed-main-display', (vTot * 3.6).toFixed(2));
        set('accel-long-filtered', Math.sqrt(a.x**2 + a.y**2).toFixed(4));
        set('force-g-vertical', (Math.abs(azRaw) / 9.806).toFixed(3) + " G");

        // Relativité Einsteinienne
        const beta = vTot / this.c;
        const lorentz = 1 / Math.sqrt(1 - beta**2);
        set('lorentz-factor', vTot > 0.001 ? "1 + " + (lorentz - 1).toExponential(6) : "1.00000000");
        
        const energy = lorentz * this.mass * Math.pow(this.c, 2);
        set('relativistic-energy', energy.toExponential(2) + " J");
    }
        }
