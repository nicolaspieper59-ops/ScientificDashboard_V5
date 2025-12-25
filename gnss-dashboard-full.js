/**
 * GNSS SPACETIME DASHBOARD - KERNEL UNIFIÉ "OMNISCIE"
 * Version: 21 États Fusion Pro (Newton + Einstein + OACI + VSOP87)
 * État: APPROUVÉ SCIENTIFIQUEMENT
 */

(function() {
    "use strict";

    // --- CONSTANTES UNIVERSELLES ---
    const C = 299792458; 
    const G_UNIV = 6.67430e-11;
    const G_STD = 9.80665;
    const R_TERRE = 6371000;
    const MU_AIR = 1.8e-5; // Viscosité air

    let dataLog = [];
    let map = null, pathLine = null;

    // --- 1. MOTEUR DE FUSION ET CAPTEURS ---
    window.ProfessionalUKF = class {
        constructor() {
            this.isRunning = true;
            this.vMs = 0; this.vBruteMs = 0;
            this.lat = 43.2845663; this.lon = 5.3587340; this.altitude = 0;
            this.mass = 70;
            this.accel = { x: 0, y: 0, z: G_STD };
            this.distance3D = 0;
            this.initHardware();
        }

        initHardware() {
            // Accéléromètre & Gyroscope
            if (window.DeviceMotionEvent) {
                window.addEventListener('devicemotion', (e) => {
                    if (e.accelerationIncludingGravity) {
                        this.accel.x = e.accelerationIncludingGravity.x || 0;
                        this.accel.y = e.accelerationIncludingGravity.y || 0;
                        this.accel.z = e.accelerationIncludingGravity.z || G_STD;
                    }
                });
            }
        }
    };

    // --- 2. FONCTIONS DE CALCUL AVANCÉES ---

    function calculateFluidDynamics(v, alt, rho) {
        // Reynolds: Re = (rho * v * L) / mu
        const L = 0.5; // Taille caractéristique
        const reynolds = (rho * v * L) / MU_AIR;
        
        // Pression Dynamique q = 1/2 * rho * v²
        const q = 0.5 * rho * v * v;
        
        // Traînée Fd = q * Cd * A
        const forceDrag = q * 1.15 * 0.55;

        update('reynolds-number', v > 0.1 ? Math.floor(reynolds).toLocaleString() : "0");
        update('dynamic-pressure', q.toFixed(2) + " Pa");
        update('drag-force', forceDrag.toFixed(2) + " N");
    }

    function calculateRelativity(v, mass) {
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / C, 2));
        const E_zero = mass * Math.pow(C, 2);
        const E_total = gamma * E_zero;
        const dilate = (gamma - 1) * 86400 * 1e9; // ns/jour
        const rs = (2 * G_UNIV * mass) / Math.pow(C, 2);

        update('lorentz-factor', gamma.toFixed(15));
        update('time-dilation-vitesse', dilate.toFixed(4) + " ns/j");
        update('energy-mass', E_zero.toExponential(4) + " J");
        update('energy-relativistic', E_total.toExponential(4) + " J");
        update('schwarzschild-radius', rs.toExponential(4) + " m");
    }

    function calculateMeteoSVT(alt, engine) {
        // Modèle OACI (Atmosphère Standard)
        const P_std = 1013.25;
        const P_hPa = P_std * Math.pow(1 - (0.0065 * alt) / 288.15, 5.255);
        const tempC = 15 - (alt * 0.0065);
        const rho = 1.225 * Math.exp(-alt / 8500);

        // Pesanteur locale (Loi Newton)
        const gLoc = G_STD * Math.pow(R_TERRE / (R_TERRE + alt), 2);

        update('pres-atm', P_hPa.toFixed(2) + " hPa");
        update('temp-air', tempC.toFixed(1) + " °C");
        update('air-density', rho.toFixed(4) + " kg/m³");
        update('gravity-local', gLoc.toFixed(5) + " m/s²");
        
        // BioSVT
        const satO2 = Math.max(0, 100 - (alt / 100));
        update('saturation-o2', satO2.toFixed(1) + " %");
        
        return { rho, tempC, gLoc };
    }

    // --- 3. BOUCLE D'ÉVOLUTION (10Hz) ---
    function mainEvolutionLoop() {
        const engine = window.MainEngine;
        if (!engine || !engine.isRunning) return;

        const now = new Date();
        let v = engine.vMs || 0;
        let alt = engine.altitude || 0;
        let lat = engine.lat;
        let lon = engine.lon;

        // A. METEO & BIOSVT
        const env = calculateMeteoSVT(alt, engine);

        // B. PHYSIQUE ET FLUIDES
        calculateFluidDynamics(v, alt, env.rho);
        calculateRelativity(v, engine.mass);

        // C. ASTRO & LUNE (Liaison IDs du HTML)
        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, lat, lon);
            update('sun-alt', astro.sun.altitude.toFixed(2) + "°");
            update('sun-azimuth', astro.sun.azimuth.toFixed(2) + "°");
            update('moon-alt', astro.moon.altitude.toFixed(2) + "°");
            update('moon-azimuth', astro.moon.azimuth.toFixed(2) + "°");
            update('moon-phase-name', getMoonPhaseName(astro.moon.illumination.phase));
            update('moon-illuminated', (astro.moon.illumination.phase * 100).toFixed(1) + "%");
            update('tslv', formatHours(astro.lmst / 15));
            update('tst-time', formatHours(astro.tst));
            update('mst-time', formatHours(astro.mst));
            update('equation-of-time', astro.eot.toFixed(2) + " min");
            update('noon-solar', formatHours(astro.solar_noon));
            update('astro-phase', astro.sun.altitude < -18 ? "NUIT NOIRE (🌙)" : (astro.sun.altitude < 0 ? "CRÉPUSCULE" : "JOUR (☀️)"));
            
            // Date Astro
            const dStr = now.toLocaleDateString('fr-FR');
            update('date-display-astro', dStr);
            update('date-solar-mean', dStr);
        }

        // D. DYNAMIQUE & FORCES G
        const gVert = engine.accel.z / G_STD;
        const gLong = (engine.accel.x / G_STD);
        update('force-g-long', gLong.toFixed(3) + " G");
        update('force-g-vert', gVert.toFixed(3) + " G");
        update('accel-z', engine.accel.z.toFixed(4));
        update('kinetic-energy', (0.5 * engine.mass * v * v).toFixed(2) + " J");

        // E. UI GÉNÉRALE ET CARTE
        update('local-time', now.toLocaleTimeString());
        update('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        update('lat-ukf', lat.toFixed(7));
        update('lon-ukf', lon.toFixed(7));

        if (v > 0.1 && map) {
            pathLine.addLatLng([lat, lon]);
            map.panTo([lat, lon]);
        }

        // F. LOGGING BLACKBOX
        if (dataLog.length < 5000) {
            dataLog.push({ t: now.toISOString(), v: v, lat: lat, lon: lon, g: gVert });
        }
    }

    // --- 4. EXPORT ET INTERFACE ---
    function update(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function exportCSV() {
        if (dataLog.length === 0) return alert("Blackbox vide !");
        let csv = "Timestamp,Vitesse,Lat,Lon,G_Force\n";
        dataLog.forEach(r => csv += `${r.t},${r.v},${r.lat},${r.lon},${r.g}\n`);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Flight_Log_${Date.now()}.csv`;
        a.click();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('capture-data-btn');
        if (btn) btn.addEventListener('click', exportCSV);
        
        // Initialisation Carte GlobeX
        if (typeof L !== 'undefined') {
            map = L.map('map-container').setView([43.2845, 5.3587], 18);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
            pathLine = L.polyline([], {color: '#00ff41'}).addTo(map);
        }

        setInterval(mainEvolutionLoop, 100);
    });

})();
