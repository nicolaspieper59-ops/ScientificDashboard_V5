/**
 * MASTER UKF - VERSION FINALE PROFESSIONNELLE
 * Gestion de l'Inertie, de l'Inclinaison et de la Décélération Newtonienne
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        this.vMs = 0;
        this.velocityVec = { x: 0, y: 0, z: 0 };
        this.distance3D = 0;
        this.mass = 70.0;
        this.accelRaw = { x: 0, y: 0, z: 9.80665 };
        this.lastTime = performance.now();
        
        // Constantes Physiques
        this.C = 299792458;
        this.G = 6.67430e-11;
        this.RHO = 1.225; // Densité de l'air kg/m3
        this.CD = 0.47;  // Coeff de traînée
        this.AREA = 0.7; // Surface frontale
    }

    update(e) {
        if (!this.isRunning || !e.accelerationIncludingGravity) return;
        
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;

        this.accelRaw = {
            x: e.accelerationIncludingGravity.x || 0,
            y: e.accelerationIncludingGravity.y || 0,
            z: e.accelerationIncludingGravity.z || 9.81
        };

        // 1. CORRECTION DE L'INCLINAISON (ANNULATION GRAVITÉ)
        // On calcule l'inclinaison pour soustraire la gravité projetée
        const pitch = Math.atan2(-this.accelRaw.x, 10);
        const roll = Math.atan2(this.accelRaw.y, this.accelRaw.z);

        const gx = -Math.sin(pitch) * 9.80665;
        const gy = Math.sin(roll) * Math.cos(pitch) * 9.80665;
        const gz = Math.cos(roll) * Math.cos(pitch) * 9.80665;

        const aPure = {
            x: this.accelRaw.x - gx,
            y: this.accelRaw.y - gy,
            z: this.accelRaw.z - gz
        };

        // 2. CALCUL DE LA DÉCÉLÉRATION (FORCE OPPOSÉE)
        // Newton : F_traînée = 1/2 * Rho * V² * Cd * A
        const dragForceMag = 0.5 * this.RHO * (this.vMs**2) * this.CD * this.AREA;
        const dragAccelMag = dragForceMag / this.mass;

        ['x', 'y', 'z'].forEach(axis => {
            const vDir = this.vMs > 0.1 ? (this.velocityVec[axis] / this.vMs) : 0;
            
            // Accélération Nette = (Poussée - Décélération de traînée)
            const totalA = aPure[axis] - (dragAccelMag * vDir);
            
            if (Math.abs(aPure[axis]) > 0.25) {
                this.velocityVec[axis] += totalA * dt;
            } else {
                this.velocityVec[axis] *= 0.96; // Friction de repos
            }
        });

        this.vMs = Math.sqrt(this.velocityVec.x**2 + this.velocityVec.y**2 + this.velocityVec.z**2);
        if (this.vMs < 0.05) this.vMs = 0;

        this.syncUI(dt);
    }

    syncUI(dt) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

        // Vitesse et Distance
        const vKmh = this.vMs * 3.6;
        set('speed-main-display', vKmh.toFixed(1));
        set('v-cosmic', vKmh.toFixed(2) + " km/h");
        set('speed-stable-kmh', vKmh.toFixed(1));
        set('speed-stable-ms', this.vMs.toFixed(2));
        
        this.distance3D += (this.vMs * dt) / 1000;
        set('total-distance-3d-2', this.distance3D.toFixed(6));
        set('total-distance-precise', this.distance3D.toFixed(6));

        // Relativité (Einstein)
        const beta = this.vMs / this.C;
        const gamma = 1 / Math.sqrt(1 - (beta**2) || 1);
        set('lorentz-factor', gamma.toFixed(12));
        set('time-dilation', ((gamma - 1) * 86400 * 1e9).toFixed(2));
        set('relativistic-energy', (gamma * this.mass * this.C**2).toExponential(3));
        set('schwarzschild-radius', (2 * this.G * this.mass / this.C**2).toExponential(5));

        // Dynamique
        set('kinetic-energy', (0.5 * this.mass * this.vMs**2).toFixed(2));
        set('drag-force', (0.5 * this.RHO * this.vMs**2 * this.CD * this.AREA).toFixed(2));
        set('coriolis-force', (2 * this.mass * this.vMs * 7.2921e-5).toExponential(3));
    }
            }
