/**
 * UKF-LIB VOL 3D - Spécial Drone & Hélico
 * Gère la séparation entre Poussée et Mouvement
 */
class UKFPro {
    constructor() {
        this.vel = { x: 0, y: 0, z: 0 };
        this.lastUpdate = Date.now();
        this.g = 9.80665;
    }

    update(acc, pDeg, rDeg) {
        const dt = (Date.now() - this.lastUpdate) / 1000;
        this.lastUpdate = Date.now();

        const pRad = pDeg * (Math.PI / 180);
        const rRad = rDeg * (Math.PI / 180);

        // --- CALCUL DE L'ACCÉLÉRATION LINÉAIRE 3D ---
        // On projette la gravité sur les 3 axes selon l'assiette du drone
        const gravityX = this.g * Math.sin(pRad);
        const gravityY = -this.g * Math.sin(rRad) * Math.cos(pRad);
        const gravityZ = this.g * Math.cos(pRad) * Math.cos(rRad);

        // Accélération réelle sans gravité (corrigée du biais moteur)
        const ax = acc.x - gravityX;
        const ay = acc.y - gravityY;
        const az = acc.z - gravityZ;

        // Filtrage des vibrations moteurs (Seuil plus haut pour les drones)
        const noise = 0.05;
        const cleanAZ = Math.abs(az) < noise ? 0 : az;

        // Intégration de la vitesse verticale (Z) et horizontale
        this.vel.z += cleanAZ * dt;
        this.vel.x += (Math.abs(ax) < noise ? 0 : ax) * dt;

        return {
            velZ: this.vel.z,
            velH: Math.sqrt(this.vel.x**2 + ay**2), // Vitesse sol
            uncertainty: 0.15 + (Math.abs(az) * 0.2)
        };
    }
}
