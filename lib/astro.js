const AstroEngine = {
    update() {
        const date = new Date();
        const lat = 43.284559; // Marseille/Corse
        const lon = 5.345678;

        // Utilisation de ephem.js pour les IDs de ton HTML
        const data = ephem.getAll(date, lat, lon); 

        document.getElementById('julian-date').innerText = ephem.toJulian(date).toFixed(5);
        document.getElementById('sun-alt').innerText = data.sun.alt.toFixed(2) + "°";
        document.getElementById('sun-azimuth').innerText = data.sun.az.toFixed(2) + "°";
        document.getElementById('moon-phase-name').innerText = data.moon.phaseName;
        document.getElementById('moon-illuminated').innerText = (data.moon.illum * 100).toFixed(1) + "%";
        document.getElementById('moon-distance').innerText = data.moon.dist.toFixed(0) + " km";

        // Relativité
        const v = parseFloat(document.getElementById('speed-stable-ms').innerText) || 0;
        const c = 299792458;
        const lorentz = 1 / Math.sqrt(1 - (v*v)/(c*c));
        document.getElementById('lorentz-factor').innerText = lorentz.toFixed(15);
    }
};
setInterval(AstroEngine.update, 1000);
