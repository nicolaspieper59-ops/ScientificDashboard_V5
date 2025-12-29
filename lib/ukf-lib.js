class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.mass = 70.0;
        this.lastTime = performance.now();
        // Paramètres de décélération (Physique des fluides)
        this.rho = 1.225; // Densité de l'air
        this.Cd = 0.47;  // Coefficient de traînée
        this.A = 0.7;   // Surface frontale
    }

    update(accelIncludingGravity, rotationRate) {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        // --- 1. CORRECTION DE L'INCLINAISON (FILTRE 9 AXES) ---
        // On calcule l'angle d'inclinaison (Pitch/Roll) pour isoler la gravité
        const pitchRad = Math.atan2(-accelIncludingGravity.x, 10); 
        const rollRad = Math.atan2(accelIncludingGravity.y, accelIncludingGravity.z);

        // Projection de la gravité sur les axes du téléphone
        const gx = -Math.sin(pitchRad) * 9.80665;
        const gy = Math.sin(rollRad) * Math.cos(pitchRad) * 9.80665;
        const gz = Math.cos(rollRad) * Math.cos(pitchRad) * 9.80665;

        // --- 2. ACCÉLÉRATION LINÉAIRE PURE ---
        const aPure = {
            x: accelIncludingGravity.x - gx,
            y: accelIncludingGravity.y - gy,
            z: accelIncludingGravity.z - gz
        };

        // --- 3. DÉCÉLÉRATION NEWTONIENNE (OPPOSÉ DE L'ACCÉLÉRATION) ---
        // Force de traînée s'opposant au vecteur vitesse : F = 1/2 * rho * v² * Cd * A
        const dragMag = 0.5 * this.rho * Math.pow(this.vMs, 2) * this.Cd * this.A;
        const dragAccel = dragMag / this.mass; // a = F/m

        ['x', 'y', 'z'].forEach(axis => {
            const vDir = this.vMs > 0.1 ? (this.velocityVec[axis] / this.vMs) : 0;
            
            // Équation Maîtresse : Accélération Nette = (Poussée - Décélération)
            // La décélération est par définition l'opposé du sens de marche
            const netA = aPure[axis] - (dragAccel * vDir);

            // Filtrage du bruit statique pour éviter le figeage ou la dérive
            if (Math.abs(aPure[axis]) > 0.25) {
                this.velocityVec[axis] += netA * dt;
            } else {
                // Si pas d'accélération, la décélération de frottement ramène à 0
                this.velocityVec[axis] *= 0.96; 
            }
        });

        this.vMs = Math.sqrt(Math.pow(this.velocityVec.x, 2) + Math.pow(this.velocityVec.y, 2));
        this.syncHTML();
    }

    syncHTML() {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        const vKmh = this.vMs * 3.6;

        set('speed-main-display', vKmh.toFixed(1));
        set('v-cosmic', vKmh.toFixed(2) + " km/h");
        set('kinetic-energy', (0.5 * this.mass * Math.pow(this.vMs, 2)).toFixed(2));
        set('drag-force', (0.5 * this.rho * Math.pow(this.vMs, 2) * this.Cd * this.A).toFixed(2));
        
        // Relativité
        const c = 299792458;
        const gamma = 1 / Math.sqrt(1 - Math.pow(this.vMs/c, 2) || 1);
        set('lorentz-factor', gamma.toFixed(12));
    }
            }
