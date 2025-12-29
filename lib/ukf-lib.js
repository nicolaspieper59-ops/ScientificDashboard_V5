/**
 * UKF-LIB PRO - GESTION INERTIELLE & RELATIVISTE
 * Mapping complet des IDs HTML
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.distance3D = 0;
        this.mass = 70.0;
        this.accel = { x: 0, y: 0, z: 9.80665 };
        this.lastTime = performance.now();
        
        // Constantes Physiques
        this.C = 299792458;
        this.G = 6.67430e-11;
        this.RHO = 1.225; // Densité de l'air
    }

    update() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        // 1. Force Motrice (Accélération pure)
        const aPure = {
            x: this.accel.x,
            y: this.accel.y,
            z: this.accel.z - 9.80665
        };

        // 2. Force Opposée (Décélération Newtonienne)
        // La traînée (Drag) est proportionnelle au carré de la vitesse
        const dragAccelMag = (0.5 * this.RHO * (this.vMs**2) * 0.47 * 0.7) / this.mass;

        ['x', 'y', 'z'].forEach(axis => {
            const vDir = this.vMs > 0 ? (this.velocityVec[axis] / this.vMs) : 0;
            const totalA = aPure[axis] - (dragAccelMag * vDir);
            
            this.velocityVec[axis] += totalA * dt;

            // Friction cinétique au sol pour l'arrêt complet
            if (Math.abs(aPure[axis]) < 0.25) {
                this.velocityVec[axis] *= 0.98; 
            }
        });

        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        if (this.vMs < 0.01) this.vMs = 0;

        this.syncUI(dt);
    }

    syncUI(dt) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        // Navigation & Vitesse
        set('speed-main-display', (this.vMs * 3.6).toFixed(1));
        set('v-cosmic', (this.vMs * 3.6).toFixed(2) + " km/h");
        set('speed-stable-kmh', (this.vMs * 3.6).toFixed(1));
        set('speed-stable-ms', this.vMs.toFixed(2));
        
        // Relativité
        const beta = this.vMs / this.C;
        const gamma = 1 / Math.sqrt(1 - (beta**2) || 1);
        set('lorentz-factor', gamma.toFixed(12));
        set('time-dilation', ((gamma - 1) * 1e9).toFixed(4));
        set('relativistic-energy', (gamma * this.mass * this.C**2).toExponential(3));
        set('schwarzschild-radius', (2 * this.G * this.mass / this.C**2).toExponential(5));

        // Physique
        set('accel-long-2', Math.sqrt(this.accel.x**2 + this.accel.y**2).toFixed(3));
        set('kinetic-energy', (0.5 * this.mass * this.vMs**2).toFixed(2));
        set('drag-force', (0.5 * this.RHO * this.vMs**2 * 0.47 * 0.7).toFixed(2));

        // Distance
        this.distance3D += (this.vMs * dt) / 1000;
        set('total-distance-3d-2', this.distance3D.toFixed(6));
    }
            }
