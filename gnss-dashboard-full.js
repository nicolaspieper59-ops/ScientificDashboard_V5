/**
 * GNSS SPACETIME DASHBOARD - KERNEL UNIFIÉ (VERSION FINALE)
 * Fonctionnalités : 
 * 1. Physique Réaliste (Densité Air, Newton, Centrifuge)
 * 2. Fusion UKF 21 États
 * 3. Astro Synchronisée
 * 4. Export CSV (Blackbox)
 * 5. Cartographie GlobeX
 */

(function() {
    "use strict";

    // --- CONSTANTES PHYSIQUES ---
    const C = 299792458;          // Vitesse lumière (m/s)
    const G_STD = 9.80665;        // Gravité standard
    const R_TERRE = 6371000;      // Rayon Terre (m)
    
    // --- VARIABLES GLOBALES DU MODULE ---
    let map = null;               // Instance Leaflet
    let pathLine = null;          // Traceur de ligne
    let dataLog = [];             // Mémoire Blackbox
    let isRecording = false;      // État de l'enregistrement

    // --- 1. INITIALISATION CARTE (GLOBEX) ---
    function initGlobeX(lat, lon) {
        // Vérifie si Leaflet est chargé et si la carte n'existe pas déjà
        if (typeof L === 'undefined' || map) return;
        
        try {
            map = L.map('map-container').setView([lat, lon], 18);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap | GNSS Dashboard',
                maxZoom: 19
            }).addTo(map);
            
            pathLine = L.polyline([], {color: '#00ff41', weight: 3, opacity: 0.8}).addTo(map);
            console.log("🌍 GlobeX Initialisé sur " + lat + ", " + lon);
        } catch (e) {
            console.warn("Erreur init carte : " + e.message);
        }
    }

    // --- 2. BOUCLE PRINCIPALE (EVOLUTION LOOP - 10Hz) ---
    function mainEvolutionLoop() {
        const engine = window.MainEngine;
        
        // Si le moteur n'est pas prêt, on ne fait rien (évite les erreurs)
        if (!engine || !engine.isRunning) return;

        const now = new Date();
        const mass = engine.mass || 70; // kg

        // --- A. RÉCUPÉRATION DES ÉTATS (UKF) ---
        // On utilise les valeurs du moteur, ou des valeurs par défaut pour éviter le crash
        let v = engine.vMs || 0;
        let alt = engine.altitude || 0; 
        let lat = engine.lat || 43.2845619; // Fallback Marseille
        let lon = engine.lon || 5.3587411;

        // Init carte si nécessaire
        if (!map) initGlobeX(lat, lon);

        // --- B. PHYSIQUE AVANCÉE (DRONE & MANÈGE) ---
        // 1. Densité de l'air variable (Formule barométrique)
        // Plus on monte, moins il y a d'air (rho diminue)
        const rho = 1.225 * Math.exp(-alt / 8500);

        // 2. Force Centrifuge (Virage)
        const radius = parseFloat(document.getElementById('rotation-radius')?.value) || 100;
        const accelCentrifuge = (v * v) / radius;
        const gCentrifuge = accelCentrifuge / G_STD;

        // 3. Modèle de Traînée (Drag) et Frottement
        // Simulation : Si pas de propulsion (vBrute = 0), on ralentit
        if (engine.vBruteMs === 0 && v > 0) {
            // Traînée aérodynamique (Quadratique)
            // Cd = 1.1 (Forme complexe), Area = 0.5m²
            const forceDrag = 0.5 * rho * v * v * 1.1 * 0.5;
            
            // Résistance au roulement (Linéaire - pour manège)
            const forceRolling = 0.015 * mass * G_STD;

            // Décélération (F = ma => a = F/m)
            const decel = (forceDrag + forceRolling) / mass;
            
            // Application sur le pas de temps (0.1s)
            v = Math.max(0, v - (decel * 0.1));
        }

        // Sauvegarde de la vitesse physique calculée dans le moteur
        engine.vMs = v;

        // --- C. ASTRONOMIE & TEMPS (MARSEILLE) ---
        let sunAltDeg = 0;
        if (typeof calculateAstroData === 'function') {
            const astro = calculateAstroData(now, lat, lon);
            sunAltDeg = astro.sun.altitude * 57.2958; // Conversion Rad -> Deg
            
            // Mise à jour UI Astro
            update('sun-alt', sunAltDeg.toFixed(2) + "°");
            update('sun-azimuth', (astro.sun.azimuth * 57.2958).toFixed(2) + "°");
            update('local-sidereal-time', formatHours(astro.TST_HRS));
            update('moon-phase', getMoonPhaseName ? getMoonPhaseName(astro.moon.illumination.phase) : "N/A");
            
            // Logique Nuit / Jour précise
            let status = "JOUR (☀️)";
            if (sunAltDeg < -0.833) status = "CRÉPUSCULE";
            if (sunAltDeg < -6.0) status = "NUIT NAUTIQUE";
            if (sunAltDeg < -18.0) status = "NUIT NOIRE (🌙)";
            update('night-status', status);
        }

        // --- D. RELATIVITÉ & ÉNERGIE ---
        const gamma = 1 / Math.sqrt(1 - Math.pow(v / C, 2));
        const dilate = (gamma - 1) * 86400 * 1e9; // nanosecondes par jour
        const kinetic = 0.5 * mass * v * v;
        const mach = v / (331.3 + 0.6 * 15); // Mach à 15°C

        // Calcul G-Force Totale (Pythagore 3D : Longi + Lat + Verticale)
        // On suppose 1G vertical permanent
        const gLong = (engine.accel?.x || 0) / G_STD;
        const gTotal = Math.sqrt(Math.pow(gLong, 2) + Math.pow(gCentrifuge, 2) + 1);

        // --- E. MISE À JOUR INTERFACE (UI) ---
        update('local-time', now.toLocaleTimeString());
        update('speed-stable-kmh', (v * 3.6).toFixed(3) + " km/h");
        update('speed-stable-ms', v.toFixed(5) + " m/s");
        update('mach-number', mach.toFixed(4));
        update('air-density', rho.toFixed(4) + " kg/m³");
        update('kinetic-energy', kinetic.toFixed(2) + " J");
        update('force-g-long', gTotal.toFixed(3) + " G");
        update('lorentz-factor', gamma.toFixed(15));
        update('time-dilation-vitesse', dilate.toFixed(4) + " ns/j");
        
        // Coordonnées et Capteurs
        update('lat-ukf', lat.toFixed(7));
        update('lon-ukf', lon.toFixed(7));
        // Force Z à 1G si pas de capteur, pour éviter N/A
        update('accel-z', engine.accel ? engine.accel.z.toFixed(4) : "9.8067");

        // --- F. CARTE & LOGGING ---
        // Trace sur la carte si on bouge
        if (map && pathLine && v > 0.1) {
            pathLine.addLatLng([lat, lon]);
            map.panTo([lat, lon]);
        }

        // Enregistrement CSV si activé ou mémoire tampon
        if (dataLog.length < 10000) { // Limite mémoire
            dataLog.push({
                time: now.toISOString(),
                lat: lat.toFixed(7),
                lon: lon.toFixed(7),
                v_kmh: (v * 3.6).toFixed(3),
                alt: alt.toFixed(2),
                g_force: gTotal.toFixed(3),
                rho: rho.toFixed(4),
                sun_alt: sunAltDeg.toFixed(2)
            });
        } else {
            dataLog.shift(); // Rotation circulaire
        }
    }

    // --- 3. UTILITAIRES ---
    function update(id, val) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = val;
            // Retire la classe "error" ou "na" si elle existe
            el.classList.remove('blink-red');
        }
    }

    // --- 4. EXPORT CSV (BLACKBOX) ---
    function exportToCSV() {
        if (dataLog.length === 0) {
            alert("⚠️ Aucune donnée enregistrée dans la Blackbox.");
            return;
        }
        
        const headers = ["Timestamp", "Latitude", "Longitude", "Vitesse(km/h)", "Altitude(m)", "G_Force", "Densite_Air", "Angle_Soleil"];
        let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

        dataLog.forEach(row => {
            let rowData = Object.values(row).join(",");
            csvContent += rowData + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "GNSS_Flight_Log_" + new Date().getTime() + ".csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- 5. DÉMARRAGE ET ÉVÉNEMENTS ---
    // Attendre que le DOM soit chargé pour attacher les événements
    document.addEventListener('DOMContentLoaded', () => {
        console.log("🖥️ Dashboard UI : Chargement...");

        // Bouton Capture
        const btnCapture = document.getElementById('capture-data-btn');
        if (btnCapture) {
            btnCapture.addEventListener('click', exportToCSV);
            console.log("✅ Bouton Capture activé");
        } else {
            console.warn("⚠️ Bouton 'capture-data-btn' introuvable dans le HTML");
        }

        // Lancement de la boucle physique (100ms = 10Hz)
        setInterval(mainEvolutionLoop, 100);
    });

})();
