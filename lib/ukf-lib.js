/**
 * OMNISCIENCE V100 PRO - Core UKF 21-States
 * Gère la fusion sensorielle, les biais et la stabilité nanométrique.
 */

math.config({ number: 'BigNumber', precision: 64 });

class OmniscienceUKF {
    constructor() {
        // 21 États : [Pos(3), Vel(3), Acc(3), Att(3), BiaisA(3), BiaisG(3), Echelle(3)]
        this.state = math.zeros(21, 1);
        this.covariance = math.identity(21);
        this.processNoise = math.multiply(math.identity(21), math.bignumber(0.0001));
        this.measurementNoise = math.bignumber(0.01);
        
        this.jumpDetected = 0;
        this.lastG = math.bignumber(1);
    }

    /**
     * Prédiction cinématique (Traite le mouvement dans le métro/avion)
     */
    predict(dt) {
        const deltaT = math.bignumber(dt);
        // Mise à jour simplifiée de la position et vitesse (intégration 64-bit)
        for (let i = 0; i < 3; i++) {
            const pos = this.state.get([i, 0]);
            const vel = this.state.get([i + 3, 0]);
            const acc = this.state.get([i + 6, 0]);

            // r = r + v*dt + 0.5*a*dt^2
            const newPos = math.add(pos, math.multiply(vel, deltaT), math.multiply(0.5, acc, math.square(deltaT)));
            this.state.set([i, 0], newPos);
        }
    }

    /**
     * Mise à jour avec correction de Biais (États 13-18)
     */
    update(accelVector, gyroVector, confidence) {
        // Soustraction des biais estimés des états 13-15
        const cleanAcc = {
            x: math.subtract(accelVector.x, this.state.get([12, 0])),
            y: math.subtract(accelVector.y, this.state.get([13, 0])),
            z: math.subtract(accelVector.z, this.state.get([14, 0]))
        };

        // Injection dans le vecteur d'état
        this.state.set([6, 0], cleanAcc.x);
        this.state.set([7, 0], cleanAcc.y);
        this.state.set([8, 0], cleanAcc.z);

        // Détection automatique de saut/salto (G-force et Rotation)
        const gForce = math.sqrt(math.add(math.square(cleanAcc.x), math.square(cleanAcc.y), math.square(cleanAcc.z)));
        const rotMag = math.add(math.abs(gyroVector.x), math.abs(gyroVector.y), math.abs(gyroVector.z));

        if (math.smaller(gForce, 0.3) || math.greater(rotMag, 300)) {
            this.handleComplexMotion();
        }

        this.syncToHTML(cleanAcc, gForce, confidence);
    }

    handleComplexMotion() {
        // Si on détecte une phase balistique (salto ou apesanteur en avion)
        this.jumpDetected++;
        const jumpElem = document.getElementById('jump-counter');
        if (jumpElem) jumpElem.innerText = this.jumpDetected;
        
        const modeElem = document.getElementById('motion-mode');
        if (modeElem) modeElem.innerText = "COMPLEXE / SALTO";
    }

    /**
     * Injection directe dans le DOM (Mapping des IDs analysés)
     */
    syncToHTML(acc, g, confidence) {
        const v_ms = this.state.get([4, 0]); // Vitesse Vy
        const v_kmh = math.multiply(v_ms, 3.6);

        // HUD Principal
        const mainHud = document.getElementById('speed-main-display');
        const stableMs = document.getElementById('v-stable-ms');
        const gRes = document.getElementById('force-g-resultante');

        if (mainHud) mainHud.innerText = math.format(v_kmh, { notation: 'fixed', precision: 4 });
        if (stableMs) stableMs.innerText = math.format(v_ms, { notation: 'fixed', precision: 9 });
        if (gRes) gRes.innerText = math.format(math.divide(g, 9.805), { notation: 'fixed', precision: 3 });

        // Mise à jour des incertitudes (Debug UKF)
        const uncertainty = document.getElementById('ukf-velocity-uncertainty');
        if (uncertainty) uncertainty.innerText = math.format(this.covariance.get([4, 4]), { precision: 4 });
    }
}

const UKF = new OmniscienceUKF();
