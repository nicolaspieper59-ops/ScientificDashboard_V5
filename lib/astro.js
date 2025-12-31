/**
 * OMNISCIENCE V100 PRO - ASTRO ENGINE
 * Gère le Soleil, la Lune, et l'Horloge Minecraft
 */

const AstroEngine = {
    update(date, lat, lon) {
        // Vérification de la librairie Ephem
        const hasEphem = typeof Ephem !== 'undefined';
        
        // 1. Calculs Soleil
        let sunAlt = 0, sunAz = 0;
        if (hasEphem) {
            const sun = Ephem.getSun(date, lat, lon);
            sunAlt = sun.altitude;
            sunAz = sun.azimuth;
        } else {
            // Fallback (approximation simple pour démo)
            const hour = date.getUTCHours() + lon/15;
            sunAlt = Math.sin((hour - 6) * Math.PI / 12) * 60; // Fake sine wave
        }

        // 2. Calculs Lune
        let moonDist = 384400;
        let moonPhase = "Nouvelle Lune";
        let moonIllum = 0;
        let moonAlt = 0;
        
        if (hasEphem) {
            const moon = Ephem.getMoon(date, lat, lon);
            moonDist = moon.distance;
            moonPhase = moon.phaseName;
            moonIllum = moon.illuminated;
            moonAlt = moon.altitude;
        }

        // 3. Temps Sidéral (TSL)
        // Approx: GMST + lon
        const tslVal = hasEphem ? Ephem.getLST(date, lon) : "00:00:00";

        // --- MISE À JOUR DOM (Sécurisée) ---
        this.setIf('hud-sun-alt', sunAlt.toFixed(2) + "°");
        this.setIf('sun-azimuth', sunAz.toFixed(2) + "°");
        
        this.setIf('moon-distance', Math.round(moonDist).toLocaleString() + " km");
        this.setIf('moon-phase-name', moonPhase);
        this.setIf('moon-illuminated', (moonIllum * 100).toFixed(1) + "%");
        this.setIf('moon-alt', moonAlt.toFixed(2) + "°");
        
        this.setIf('tslv', tslVal);
        this.setIf('tslv-1', tslVal); // Doublon géré
        
        // Dates solaires
        this.setIf('date-display-astro', date.toLocaleDateString());
        this.setIf('gmt-time-display-1', date.toLocaleTimeString());
        this.setIf('gmt-time-display-2', date.toISOString().split('T')[1]);
        
        // Julian Date
        const jd = (date.getTime() / 86400000) + 2440587.5;
        this.setIf('julian-date', jd.toFixed(5));

        // --- VISUEL HORLOGE MINECRAFT ---
        const clock = document.getElementById('minecraft-clock');
        if (clock) {
            // Rotation: Midi (90°) = Zénith. Minuit (-90°) = Nadir.
            // Mapping: Altitude 0 -> 0deg ou 180deg. 
            // Simplification: On tourne selon l'heure solaire locale
            const localHour = (date.getUTCHours() + lon/15 + 24) % 24;
            const rotation = ((localHour / 24) * 360) + 180; // Minuit en bas
            clock.style.transform = `rotate(${rotation}deg)`;
            
            // Phase Text
            const phaseText = (sunAlt > -6) ? "Jour (☀️)" : "Nuit (🌙)";
            this.setIf('astro-phase', phaseText);
        }
    },

    // Utilitaire pour éviter les crashs si ID manquant
    setIf(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }
};
