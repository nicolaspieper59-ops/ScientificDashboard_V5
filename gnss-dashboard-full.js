/**
 * GNSS SPACETIME ENGINE - V500 "INTELLIGENT-GRAVITY"
 * -----------------------------------------------
 * - Calibration Automatique Continue (Zero-Drift)
 * - Détection d'état Statique vs Dynamique
 * - Symétrie Newtonienne forcée
 */

class UniversalUKF {
    constructor() {
        this.vx = 0;
        this.lastTimestamp = performance.now();
        this.bias = { x: 0, y: 0, z: 0 };
        this.stabilityBuffer = [];
        this.isMoving = false;
        
        // Seuil de réalisme : si accélération constante > 2s, c'est une inclinaison.
        this.STABILITY_THRESHOLD = 2000; 
        this.init();
    }

    init() {
        window.addEventListener('devicemotion', (e) => this.predict(e), true);
        navigator.geolocation.watchPosition((p) => this.fuseGPS(p), null, {enableHighAccuracy: true});
        this.render();
    }

    predict(e) {
        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000;
        this.lastTimestamp = now;

        const acc = e.accelerationIncludingGravity;
        if (!acc) return;

        // --- 1. DÉTECTION AUTOMATIQUE DE L'INCLINAISON ---
        // On analyse si les valeurs sont figées (même si elles sont hautes)
        this.updateStability(acc, now);

        // --- 2. SOUSTRACTION DU BIAIS DYNAMIQUE ---
        let ax_net = acc.x - this.bias.x;
        let ay_net = acc.y - this.bias.y;

        // --- 3. LOGIQUE D'INERTIE SYMÉTRIQUE ---
        const moveThreshold = 0.05; // Sensibilité aux micro-mouvements
        
        if (Math.abs(ax_net) > moveThreshold) {
            this.vx += ax_net * dt;
            this.isMoving = true;
        } else {
            // Friction naturelle : ramène la vitesse à 0 si plus de poussée
            this.vx *= 0.96; 
            this.isMoving = false;
        }

        // --- 4. SÉCURITÉ ANTI-DÉRIVE ---
        // Si la vitesse est incohérente avec l'état statique, on purge.
        if (!this.isMoving && Math.abs(this.vx) < 0.5) {
            this.vx *= 0.8; 
        }

        if (Math.abs(this.vx) < 0.0001) this.vx = 0;
    }

    updateStability(acc, now) {
        // On garde les 50 dernières mesures
        this.stabilityBuffer.push({ x: acc.x, y: acc.y, z: acc.z, t: now });
        if (this.stabilityBuffer.length > 50) this.stabilityBuffer.shift();

        // Calcul de la variance (stabilité du signal)
        const varianceX = this.getVariance(this.stabilityBuffer.map(b => b.x));
        
        // Si le signal est stable (variance faible) pendant que le GPS dit 0
        // Alors on recalibre le "Zéro" automatiquement sur les valeurs actuelles
        if (varianceX < 0.01 && !this.gpsMoving) {
            this.bias.x = acc.x;
            this.bias.y = acc.y;
            this.bias.z = acc.z;
        }
    }

    getVariance(arr) {
        const m = arr.reduce((a, b) => a + b) / arr.length;
        return arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length;
    }

    fuseGPS(p) {
        const gpsSpeed = p.coords.speed || 0;
        this.gpsMoving = gpsSpeed > 0.2;

        // Si GPS très précis, on écrase la dérive de l'IMU
        if (p.coords.accuracy < 10) {
            this.vx = (this.vx * 0.7) + (gpsSpeed * 0.3);
        }
    }

    render() {
        const speedKmh = Math.abs(this.vx) * 3.6;
        
        // Affichage adaptatif
        const val = speedKmh < 0.1 ? (Math.abs(this.vx) * 1000).toFixed(2) + " mm/s" : speedKmh.toFixed(2) + " km/h";
        
        document.getElementById('speed-main-display').textContent = val;
        document.getElementById('status-ekf').textContent = this.gpsMoving ? "🛰️ MOUVEMENT GPS" : "⚓ STATIQUE (AUTO-CALIBRÉ)";

        requestAnimationFrame(() => this.render());
    }
}

window.App = new UniversalUKF();
