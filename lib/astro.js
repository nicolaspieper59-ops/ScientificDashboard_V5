/**
 * OMNISCIENCE V100 PRO - ASTRO CONNECTOR
 * Connecte le moteur Ephem au DOM HTML
 */
const AstroEngine = {
    update(date, lat, lon) {
        // 1. Calculs via notre moteur Ephem.js
        const sun = Ephem.getSun(date, lat, lon);
        const moon = Ephem.getMoon(date, lat, lon);
        const lst = Ephem.getLST(date, lon);

        // 2. Mise à jour des valeurs Soleil
        this.set('hud-sun-alt', sun.altitude.toFixed(2) + "°");
        this.set('sun-azimuth', sun.azimuth.toFixed(2) + "°");
        
        // 3. Mise à jour des valeurs Lune (Distance dynamique maintenant !)
        this.set('moon-distance', Math.round(moon.distance).toLocaleString() + " km");
        this.set('moon-phase-name', moon.phaseName);
        this.set('moon-illuminated', (moon.illuminated * 100).toFixed(1) + "%");
        this.set('moon-alt', moon.altitude.toFixed(2) + "°");
        
        // 4. Temps Sidéral
        this.set('tslv', lst);
        this.set('tslv-1', lst);

        // 5. Horloge Céleste (Minecraft Style)
        const clock = document.getElementById('minecraft-clock');
        if (clock) {
            // Altitude > 0 = Jour (0-180deg sur l'horloge)
            // On mappe l'angle solaire sur la rotation CSS
            // Midi solaire = Zénith (Top)
            let rotation = -sun.azimuth + 180; // Simplification pour démo
            // Ou rotation basée sur l'heure :
            const hours = date.getUTCHours() + lon/15;
            rotation = ((hours / 24) * 360) + 180; 
            
            clock.style.transform = `rotate(${rotation}deg)`;
            
            // Icônes jour/nuit
            const phase = sun.altitude > -6 ? "Jour (☀️)" : "Nuit (🌙)";
            this.set('astro-phase', phase);
        }
        
        // 6. Dates
        this.set('date-display-astro', date.toLocaleDateString());
        this.set('julian-date', Ephem.toJulian(date).toFixed(5));
    },

    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }
};
