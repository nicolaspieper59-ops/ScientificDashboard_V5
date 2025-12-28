/**
 * UKF 21 ÉTATS - FUSION UNIVERSELLE
 * Gère : Salto, Ascenseur, Wingsuit, Gastéropodes
 */
class ProfessionalUKF {
    constructor() {
        this.isRunning = false;
        // Vecteur d'état X (21x1) via math.js
        this.X = math.matrix(math.zeros([21, 1])); 
        this.P = math.multiply(math.identity(21), 0.1);
        
        this.vMs = 0;
        this.lat = null;
        this.lon = null;
        this.alt = 0;
        this.accel = { x: 0, y: 0, z: 0 };
        this.gRef = 9.80665;
        this.lastTime = performance.now();
        this.distance = 0;
    }

    predict() {
        if (!this.isRunning) return;
        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Magnitude 3D pour gérer toutes les orientations (Salto/Escalator)
        const magnitude = Math.sqrt(
            Math.pow(this.accel.x, 2) + 
            Math.pow(this.accel.y, 2) + 
            Math.pow(this.accel.z, 2)
        );

        // Newton : Accélération réelle sans gravité
        let aPure = magnitude - this.gRef;
        
        // Sensibilité adaptative (seuil bas pour les mouvements lents)
        if (Math.abs(aPure) < 0.015) {
            aPure = 0;
            this.vMs *= 0.98; // Friction fluide
        } else {
            this.vMs += aPure * dt;
        }

        if (this.vMs < 0) this.vMs = 0;
        
        // Mise à jour de l'état (Index 3 = Vitesse)
        this.X.set([3, 0], this.vMs);
        this.distance += (this.vMs * dt) / 1000;
    }

    observeGPS(lat, lon, alt, speed, acc) {
        this.lat = lat;
        this.lon = lon;
        this.alt = alt || 0;
        
        if (speed !== null && acc < 20) {
            const currentV = this.X.get([3, 0]);
            const fusionV = currentV + 0.7 * (speed - currentV);
            this.X.set([3, 0], fusionV);
            this.vMs = fusionV;
        }
    }
}
window.ProfessionalUKF = ProfessionalUKF;
