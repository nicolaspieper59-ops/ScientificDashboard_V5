/**
 * GNSS SpaceTime Engine - V130 "ULTRA-STATIC"
 * ------------------------------------------
 * - Cible : Mouvements ultra-lents (0.012 km/h / 3.3 mm/s)
 * - Correction : Suppression du ZUPT agressif
 * - Stabilité : Intégration par double lissage pour éviter la dérive thermique
 */

class ProfessionalUKF {
    constructor() {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 24;
        this.initialized = false;
        this.isCalibrated = false;
        this.calibSamples = [];
        this.bias = { ax: 0, ay: 0, az: 0 };
        this.x = math.matrix(math.zeros([this.n, 1]));
        
        // --- REGLAGES ULTRA-LENTS ---
        this.hGain = 1.500;           // Gain maximum pour les micro-signaux
        this.noiseFloor = 0.0015;     // Seuil abaissé au minimum (1.5 mm/s²)
        this.lpfBase = 0.250;         // Plus réactif pour ne pas rater le début du mouvement
        
        this.accelSmooth = { x: 0, y: 0, z: 0 };
        this.lastAccWorld = [0, 0, 0];
        this.totalDistance3D = 0;
        
        // --- MOMENTUM INFINI ---
        // On réduit la résistance à presque zéro pour ne pas "manger" la petite vitesse
        this.airResistance = 0.000001; 
        
        this.jitter = 0;
        this.staticLock = false;      // Verrou de sécurité
    }

    calibrate(accRaw) {
        // Pour 0.012 km/h, la calibration doit être chirurgicale
        if (this.calibSamples.length < 300) { // 6 secondes de repos absolu
            this.calibSamples.push({x: accRaw.x, y: accRaw.y, z: accRaw.z});
            return false;
        }
        const sum = this.calibSamples.reduce((a, b) => ({x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}));
        this.bias = { ax: sum.x/300, ay: sum.y/300, az: sum.z/300 };
        this.isCalibrated = true;
        this.initialized = true;
        return true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. CALCUL DU JITTER ULTRA-SENSIBLE
        const diff = Math.abs(accRaw.x - this.accelSmooth.x) + Math.abs(accRaw.y - this.accelSmooth.y);
        this.jitter = this.jitter * 0.95 + diff * 0.05;

        // 2. FILTRAGE DYNAMIQUE RELAXÉ
        // On filtre moins fort pour laisser passer les micro-accélérations du téléphérique
        let lpfCurrent = this.lpfBase / (1.0 + this.jitter * 1.5);
        lpfCurrent = Math.max(0.10, Math.min(0.50, lpfCurrent));

        this.accelSmooth.x += lpfCurrent * (accRaw.x - this.accelSmooth.x);
        this.accelSmooth.y += lpfCurrent * (accRaw.y - this.accelSmooth.y);
        this.accelSmooth.z += lpfCurrent * (accRaw.z - this.accelSmooth.z);

        // 3. COMPENSATION
        const ax = (this.accelSmooth.x - this.bias.ax) * this.hGain;
        const ay = (this.accelSmooth.y - this.bias.ay) * this.hGain;
        const az = (this.accelSmooth.z - (this.bias.az - 9.80665));

        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const accWorld = this.rotateVector(q, [ax, ay, az]);
        accWorld[2] += 9.80665;

        // 4. INTÉGRATION SANS SEUIL DE COUPURE BRUTAL
        let vx = this.x.get([3, 0]);
        let vy = this.x.get([4, 0]);
        let vz = this.x.get([5, 0]);

        const accMag = Math.sqrt(accWorld[0]**2 + accWorld[1]**2 + accWorld[2]**2);
        
        // On intègre tout, même le "bruit", si le jitter indique un mouvement
        if (accMag > this.noiseFloor || this.jitter > 0.01) {
            vx += (this.lastAccWorld[0] + accWorld[0]) * 0.5 * dt;
            vy += (this.lastAccWorld[1] + accWorld[1]) * 0.5 * dt;
            vz += (this.lastAccWorld[2] + accWorld[2]) * 0.5 * dt;
            this.staticLock = false;
        }

        // 5. MAINTENANCE DE LA VITESSE MICROSCOPIQUE
        const currentSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        
        // On ne force PAS le zéro à 0.012 kmh. On laisse glisser.
        if (currentSpeed > 0.0001) { // Seuil de 0.3 mm/s (10x plus bas qu'avant)
            const decay = 1.0 - (this.airResistance * dt);
            vx *= decay; vy *= decay; vz *= decay;
        } else if (this.jitter < 0.001) {
            // Uniquement si l'appareil est posé sur une table (jitter nul)
            vx = 0; vy = 0; vz = 0;
            this.staticLock = true;
        }

        this.x.set([3, 0], vx);
        this.x.set([4, 0], vy);
        this.x.set([5, 0], vz);
        this.lastAccWorld = [...accWorld];
        this.totalDistance3D += currentSpeed * dt;

        this.integrateQuaternions(gyroRaw, dt);
    }

    // ... (rotateVector, integrateQuaternions, fuseGPS identiques) ...

    getState() {
        const v = [this.x.get([3, 0]), this.x.get([4, 0]), this.x.get([5, 0])];
        const s = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
        return {
            speedKmh: (s * 3.6).toFixed(3),
            distance: this.totalDistance3D.toFixed(3),
            jitter: this.jitter.toFixed(4),
            status: this.staticLock ? "IDLE" : "MICRO-MOTION"
        };
    }
    }
