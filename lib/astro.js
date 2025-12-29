/**
 * ASTRO.JS PRO : Ephem.js & Thermodynamic ISA
 */
const AstroEngine = {
    sync(lat, lon, weather) {
        const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
        const now = new Date();

        // 1. Astro via Ephem.js
        const obs = new Ephem.Observer(lat, lon, 0);
        const sun = Ephem.Sun.get(now, obs);
        const moon = Ephem.Moon.get(now, obs);

        set('sun-alt', sun.altitude.toFixed(2) + "°");
        set('sun-azimuth', sun.azimuth.toFixed(2) + "°");
        set('moon-phase-name', moon.phaseName);
        set('julian-date', ((now / 86400000) + 2440587.5).toFixed(5));
        set('tslv', Ephem.LocalSiderealTime(now, lon));

        // 2. Correction ISA (Météo -> Physique)
        if (weather && weather.main) {
            const T = weather.main.temp + 273.15; // Kelvin
            const P = weather.main.pressure * 100; // Pa
            
            // Densité de l'air (rho = P / RT)
            const rho = P / (287.058 * T);
            set('air-density', rho.toFixed(4) + " kg/m³");
            
            // Vitesse du son (a = sqrt(gamma * R * T))
            const vSon = Math.sqrt(1.4 * 287.058 * T);
            set('local-speed-of-sound', vSon.toFixed(2) + " m/s");
            
            // Altitude Géopotentielle
            const alt = 44330 * (1 - Math.pow(weather.main.pressure / 1013.25, 0.1903));
            set('geopotential-alt', alt.toFixed(1) + " m");
            
            // Saturation O2 (Loi de Henry simplifiée)
            set('O2-saturation', (100 * Math.exp(-alt / 8000)).toFixed(1) + " %");
        }
    }
};
