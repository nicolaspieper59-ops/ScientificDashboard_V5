/**
 * ASTRO & BIO-SVT ENGINE
 */
const AstroEngine = {
    update(lat, lon, weatherData) {
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        const now = new Date();

        // 1. TEMPS & ASTRONOMIE (Via Ephem.js)
        if (typeof Ephem !== 'undefined') {
            const obs = new Ephem.Observer(lat, lon, 0);
            const sun = Ephem.Sun.get(now, obs);
            const moon = Ephem.Moon.get(now, obs);

            set('sun-alt', sun.altitude.toFixed(2) + "°");
            set('sun-azimuth', sun.azimuth.toFixed(2) + "°");
            set('tslv', Ephem.LocalSiderealTime(now, lon));
            set('moon-phase-name', moon.phaseName);
            set('moon-alt', moon.altitude.toFixed(2) + "°");
        }

        // 2. MÉTÉO & THERMODYNAMIQUE (ISA)
        if (weatherData && weatherData.main) {
            const tempK = weatherData.main.temp + 273.15;
            const pressPa = weatherData.main.pressure * 100;
            const rho = pressPa / (287.058 * tempK);
            
            set('air-density', rho.toFixed(4));
            set('local-speed-of-sound', Math.sqrt(1.4 * 287.058 * tempK).toFixed(2));
            
            // BioSVT : Saturation O2 (Loi de Henry/Altimétrie)
            const alt = 44330 * (1 - Math.pow(weatherData.main.pressure / 1013.25, 0.1903));
            set('geopotential-alt', alt.toFixed(1));
            set('O2-saturation', (100 * Math.exp(-alt / 8000)).toFixed(1) + " %");
        }

        // 3. HORLOGES
        set('local-time', now.toLocaleTimeString());
        set('utc-datetime', now.toUTCString());
        set('julian-date', ((now / 86400000) + 2440587.5).toFixed(5));
    }
};
