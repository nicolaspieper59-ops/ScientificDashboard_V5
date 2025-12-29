/**
 * ASTRO & ENVIRONMENT PRO
 */
const AstroEngine = {
    update(lat, lon, weather) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        const now = new Date();

        // 1. Astro (Ephem.js)
        const obs = new Ephem.Observer(lat, lon, 0);
        const sun = Ephem.Sun.get(now, obs);
        const moon = Ephem.Moon.get(now, obs);

        set('sun-altitude', sun.altitude.toFixed(2) + "°");
        set('sun-azimuth', sun.azimuth.toFixed(2) + "°");
        set('moon-phase-name', moon.phaseName);
        set('julian-date', ((now / 86400000) + 2440587.5).toFixed(5));
        set('tslv', Ephem.LocalSiderealTime(now, lon));

        // 2. Thermodynamique ISA & BioSVT
        if (weather) {
            const T_kelvin = weather.main.temp + 273.15;
            const P_pa = weather.main.pressure * 100;
            const rho = P_pa / (287.058 * T_kelvin);
            
            set('air-density', rho.toFixed(4));
            set('local-speed-of-sound', Math.sqrt(1.4 * 287.05 * T_kelvin).toFixed(2));
            
            // Saturation O2 selon l'altitude barométrique (Loi de Henry)
            const h = 44330 * (1 - Math.pow(weather.main.pressure / 1013.25, 0.1903));
            set('geopotential-alt', h.toFixed(1));
            set('O2-saturation', (100 * Math.exp(-h / 8000)).toFixed(1) + " %");
        }
    }
};
