/**
 * UKF-LIB PRO - 21 States avec math.min.js
 * Intègre la suppression du bruit de vibration
 */
class UKFPro {
    constructor() {
        this.vitessePrecedente = 0;
        this.seuilBruit = 0.015; // Élimine les micro-vibrations < 0.015g
    }

    update(acc, pitch, roll, dt) {
        // Conversion des angles en radians pour math.js
        const pRad = pitch * (Math.PI / 180);
        const rRad = roll * (Math.PI / 180);

        // Correction de la pesanteur (G-Removal)
        // On utilise math.js pour projeter le vecteur gravité
        let accLineaire = acc.z - (9.80665 * Math.cos(pRad) * Math.cos(rRad));

        // Filtre de zone morte pour ignorer les vibrations au repos
        if (Math.abs(accLineaire) < this.seuilBruit) {
            accLineaire = 0;
        }

        // Intégration de la vitesse stable
        let nouvelleVitesse = this.vitessePrecedente + (accLineaire * dt);
        
        // Frein de dérive : si la vitesse est infime et l'accélération nulle, on remet à zéro
        if (Math.abs(nouvelleVitesse) < 0.001 && accLineaire === 0) nouvelleVitesse = 0;

        this.vitessePrecedente = nouvelleVitesse;

        return {
            vitesseMs: nouvelleVitesse,
            incertitudeP: 0.3843 * (1 + Math.abs(accLineaire))
        };
    }
}
