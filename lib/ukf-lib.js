/**
 * ENGINE MASTER : UKF 21 ÉTATS (MATH.JS)
 */
class SpaceTimeUKF {
    constructor() {
        this.isRunning = false;
        // Vecteur d'état X (21x1)
        this.X = math.matrix(math.zeros([21, 1])); 
        this.vMs = 0;
        this.lat = 0; this.lon = 0; this.alt = 0;
        this.accelBrute = { x: 0, y: 0, z: 0 };
        this.lastTime = performance.now();
        this.gRef = 9.80665;
        this.totalDistance = 0;
    }

    predict() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Calcul de la magnitude réelle (Newton)
        const magnitude = Math.sqrt(
            Math.pow(this.accelBrute.x, 2) + 
            Math.pow(this.accelBrute.y, 2) + 
            Math.pow(this.accelBrute.z, 2)
        );

        // Différence par rapport à la gravité (Inversion pour décélération)
        let accReelle = magnitude - this.gRef;
        if (Math.abs(accReelle) < 0.25) accReelle = 0;

        // Mise à jour Vitesse (État index 3)
        let v = this.X.get([3, 0]);
        v += accReelle * dt;
        if (accReelle === 0) v *= 0.97; // Friction
        if (v < 0) v = 0;
        
        this.X.set([3, 0], v);
        this.vMs = v;
        this.totalDistance += (v * dt) / 1000; // km
    }

    updateGPS(lat, lon, alt, speed, accuracy) {
        this.lat = lat; this.lon = lon; this.alt = alt || 0;
        if (speed !== null && accuracy < 20) {
            const currentV = this.X.get([3, 0]);
            const fusionV = currentV + 0.8 * (speed - currentV);
            this.X.set([3, 0], fusionV);
            this.vMs = fusionV;
        }
    }
}
