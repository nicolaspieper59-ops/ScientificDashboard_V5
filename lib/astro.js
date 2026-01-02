const AstroEngine = {
    update() {
        const now = new Date();
        const lat = 43.2965; // Marseille
        const lon = 5.3698;
        const jd = (now.getTime() / 86400000) + 2440587.5;

        // Phase de Lune
        const cycle = (jd - 2451550.1) / 29.53;
        const phase = cycle - Math.floor(cycle);
        const names = ["Nouvelle", "1er Croissant", "1er Quartier", "Gibbeuse C.", "Pleine", "Gibbeuse D.", "Dernier Quartier", "Dernier Croissant"];
        
        document.getElementById('moon-phase-name').innerText = names[Math.floor(phase * 8)];
        document.getElementById('moon-illuminated').innerText = (Math.abs(50 - (phase * 100 - 50) * 2)).toFixed(1) + "%";
        
        // Soleil Elevation (Simplifié)
        const sunAlt = 90 - Math.abs(lat - (23.44 * Math.cos((jd - 2451718) * 0.0172)));
        document.getElementById('sun-alt').innerText = sunAlt.toFixed(2) + "°";
        
        // Temps Sidéral
        const lst = (18.697 + 24.0657 * (jd - 2451545.0) + lon/15) % 24;
        document.getElementById('sidereal-time-vrai').innerText = lst.toFixed(4) + " h";
    }
};
