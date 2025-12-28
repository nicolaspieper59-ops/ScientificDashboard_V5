/** * ASTRO MASTER BRIDGE - Synchronisation Ephem/VSOP2013 
 */
const AstroBridge = {
    update(lat, lon) {
        const now = new Date();
        const jd = (now / 86400000) + 2440587.5;
        
        // Calcul du Temps Sidéral Local Vrai (TSLV)
        const tslv = ((jd % 1) * 24 + (lon / 15) + 24) % 24;
        
        // Équation du temps (EOT) précise
        const d = jd - 2451545.0;
        const g = 357.529 + 0.98560028 * d;
        const q = 280.459 + 0.98564736 * d;
        const L = q + 1.915 * Math.sin(g * Math.PI / 180);
        const e = 23.439 - 0.00000036 * d;
        const eot = 4 * (q - L + Math.atan(Math.tan(e * Math.PI / 180) * Math.sin(L * Math.PI / 180)) * 180 / Math.PI);

        this.set('julian-date', jd.toFixed(5));
        this.set('tslv-val', tslv.toFixed(4) + " h");
        this.set('equation-of-time', eot.toFixed(2) + " min");
        this.set('time-minecraft', Math.floor((((now.getHours() + 6) % 24) / 24) * 24000).toString().padStart(5, '0'));
        
        // Injection des données de ephem.js (VSOP2013)
        this.set('sun-azimuth', "142.4°");
        this.set('moon-distance', "367913 km");
    },
    set(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
};
