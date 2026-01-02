const AstroEngine = {
    update() {
        const lat = 43.284559; // Corse/Marseille par défaut
        const lon = 5.345678;
        const date = new Date();

        // Utilisation de ephem.js pour les calculs de précision
        const sunPos = ephem.sun(date, lat, lon);
        const moonPos = ephem.moon(date, lat, lon);

        document.getElementById('sun-alt').innerText = sunPos.alt.toFixed(2) + "°";
        document.getElementById('sun-azimuth').innerText = sunPos.az.toFixed(2) + "°";
        document.getElementById('moon-phase-name').innerText = moonPos.phaseName;
        document.getElementById('moon-illuminated').innerText = (moonPos.illum * 100).toFixed(1) + "%";
        document.getElementById('julian-date').innerText = ephem.toJulian(date).toFixed(5);

        // Correction Relativiste (Lorentz) basée sur la vitesse UKF
        const c = 299792458;
        const v = parseFloat(UKF.v3D.toString());
        const lorentz = 1 / Math.sqrt(1 - Math.pow(v/c, 2));
        document.getElementById('lorentz-factor').innerText = lorentz.toFixed(15);
    }
};
setInterval(AstroEngine.update, 1000);
