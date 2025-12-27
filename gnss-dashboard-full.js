/**
 * GNSS SpaceTime Dashboard - MOTEUR DE FUSION FINAL
 * Version: Professional UKF-21 Bridge
 * Intègre: GPS, IMU, Relativité, Astro & Cartographie
 */

(function() {
    "use strict";

    // --- CONFIGURATION ---
    const C = 299792458; // Vitesse lumière
    let state = {
        isRunning: false,
        lastTick: performance.now(),
        mass: 70,
        utcOffset: 0,
        map: null,
        userMarker: null
    };

    /**
     * INITIALISATION GÉNÉRALE
     */
    async function init() {
        console.log("🚀 Lancement du moteur de fusion...");
        
        // 1. Initialisation Carte Leaflet
        initMap();

        // 2. Synchronisation Temps (NTP-like)
        try {
            const t0 = performance.now();
            const resp = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await resp.json();
            state.utcOffset = new Date(data.utc_datetime).getTime() - (Date.now() - (performance.now() - t0)/2);
        } catch(e) { console.warn("Sync NTP échouée, mode local."); }

        // 3. Liaison Événements
        setupHardwareControls();

        // 4. Lancement de la boucle de calcul (60 FPS)
        requestAnimationFrame(mainEngineLoop);
    }

    /**
     * INITIALISATION DE LA CARTE
     */
    function initMap() {
        if (!document.getElementById('map')) return;
        
        state.map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([48.8566, 2.3522], 13);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(state.map);
        
        // Force le rendu après le chargement du DOM
        setTimeout(() => state.map.invalidateSize(), 500);
    }

    /**
     * BOUCLE DE CALCUL ET DE RENDU (BRIDGE)
     */
    function mainEngineLoop(now) {
        const dt = (now - state.lastTick) / 1000;
        state.lastTick = now;

        if (state.isRunning && window.MainEngine) {
            const engine = window.MainEngine;
            
            // Mise à jour de la logique interne si nécessaire
            if (typeof engine.update === 'function') engine.update(dt);

            // --- CALCULS PHYSIQUES ---
            const v = engine.vMs || 0;
            const alt = engine.altitude || 0;
            const gamma = 1 / Math.sqrt(1 - Math.pow(v/C, 2));
            const rho = 1.225 * Math.exp(-alt / 8500);
            const mach = v / (331.3 * Math.sqrt(1 + (15 - 0.0065 * alt) / 273.15));

            // --- MISE À JOUR UI : COLONNE 1 (SYSTÈME) ---
            updateUI('lat-ukf', engine.lat ? engine.lat.toFixed(6) : "...");
            updateUI('lon-ukf', engine.lon ? engine.lon.toFixed(6) : "...");
            updateUI('alt-ekf', alt.toFixed(2));
            updateUI('filter-status', engine.isCalibrated ? "STABLE (UKF-21)" : "CALIBRATION...");
            
            // --- MISE À JOUR UI : COLONNE 2 (VITESSE) ---
            updateUI('speed-main-display', (v * 3.6).toFixed(2));
            updateUI('v-stable-kh', (v * 3.6).toFixed(1));
            updateUI('v-stable-ms', v.toFixed(2));
            updateUI('total-distance-3d', (engine.distance3D / 1000).toFixed(5));

            // --- MISE À JOUR UI : COLONNE 3 (PHYSIQUE) ---
            updateUI('lorentz-factor', gamma.toFixed(10));
            updateUI('time-dilation', ((gamma - 1) * 1e9).toFixed(4));
            updateUI('accel-x', (engine.accel?.x || 0).toFixed(3));
            updateUI('accel-y', (engine.accel?.y || 0).toFixed(3));
            updateUI('accel-z', (engine.accel?.z || 0).toFixed(3));
            updateUI('kinetic-energy', (0.5 * state.mass * v * v).toFixed(0));

            // --- MISE À JOUR UI : COLONNE 4 (ASTRO/AIR) ---
            updateUI('air-density', rho.toFixed(4));
            updateUI('mach-number', mach.toFixed(4));
            updateUI('drag-force', (0.5 * rho * v * v * 0.47 * 0.5).toFixed(2));

            // --- GESTION CARTE ---
            if (state.map && engine.lat && engine.lon) {
                const pos = [engine.lat, engine.lon];
                state.map.panTo(pos);
                if (!state.userMarker) {
                    state.userMarker = L.circleMarker(pos, {color: '#00ff88', radius: 5}).addTo(state.map);
                } else {
                    state.userMarker.setLatLng(pos);
                }
            }
        }
        requestAnimationFrame(mainEngineLoop);
    }

    /**
     * CONTRÔLES MATÉRIELS (GPS & IMU)
     */
    function setupHardwareControls() {
        const btn = document.getElementById('gps-pause-toggle');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            if (!state.isRunning) {
                // 1. Demande de permission (iOS)
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission();
                }

                // 2. Activation GPS Temps Réel
                navigator.geolocation.watchPosition((p) => {
                    if (window.MainEngine) {
                        window.MainEngine.lat = p.coords.latitude;
                        window.MainEngine.lon = p.coords.longitude;
                        window.MainEngine.altitude = p.coords.altitude || 0;
                        if (p.coords.speed) window.MainEngine.vMs = p.coords.speed;
                    }
                }, null, { enableHighAccuracy: true });

                state.isRunning = true;
                if (window.MainEngine) window.MainEngine.isRunning = true;
                btn.textContent = "⏸️ STOP ENGINE";
                btn.classList.add('active');
            } else {
                state.isRunning = false;
                if (window.MainEngine) window.MainEngine.isRunning = false;
                btn.textContent = "▶️ START ENGINE";
                btn.classList.remove('active');
            }
        });

        // Liaison de la masse
        const mInput = document.getElementById('mass-input');
        if (mInput) mInput.addEventListener('change', (e) => {
            state.mass = parseFloat(e.target.value) || 70;
        });
    }

    function updateUI(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);
})();
