/**
 * OMNISCIENCE V100 PRO - ASTRO ENGINE
 */
const AstroEngine = {
    update(lat, lon) {
        const now = new Date();
        // Utilisation du moteur Ephem pour les données brutes
        const sun = Ephem.getSun(now, lat, lon);
        const moon = Ephem.getMoon(now, lat, lon);

        // Mise à jour DOM
        this.set('hud-sun-alt', sun.altitude.toFixed(2) + "°");
        this.set('sun-azimuth', sun.azimuth.toFixed(2) + "°");
        this.set('moon-distance', Math.round(moon.distance).toLocaleString() + " km");
        this.set('moon-phase-name', moon.phaseName);
        this.set('moon-illuminated', (moon.illuminated * 100).toFixed(1) + "%");
        
        // Animation de l'horloge
        const clock = document.getElementById('minecraft-clock');
        if (clock) {
            const rot = ((now.getUTCHours() + lon/15) / 24) * 360 + 180;
            clock.style.transform = `rotate(${rot}deg)`;
        }
    },
    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }
};
