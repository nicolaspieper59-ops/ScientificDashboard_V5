/**
 * GNSS SPACETIME DASHBOARD - MASTER JS (FINAL VERSION)
 * Intégration : UKF 21 États + Ephem.js + Math.js + Leaflet
 */

(function() {
    "use strict";

    // --- CONFIGURATION & ÉTAT GLOBAL ---
    const state = {
        isRunning: false,
        startTime: Date.now(),
        lastTick: performance.now(),
        mass: 70,
        map: null,
        marker: null,
        vMax: 0,
        totalDist: 0,
        ntpOffset: 0,
        gravityBase: 9.80665,
        environmentFactor: 1.0
    };

    // --- 1. INITIALISATION DU SYSTÈME ---
    function init() {
        console.log("🛰️ Système GNSS/UKF en cours de démarrage...");
        
        // Initialisation de la carte Leaflet
        initMap();
        
        // Instanciation du moteur UKF (ProfessionalUKF défini dans ukf-lib.js)
        window.MainEngine = new ProfessionalUKF();
        
        // Liaison des événements UI
        setupEventListeners();
        
        // Lancement de la boucle d'affichage (60 FPS)
        requestAnimationFrame(updateLoop);
        
        // Synchronisation NTP (Simulation de décalage)
        state.ntpOffset = Math.random() * 50 - 25; 
    }

    function initMap() {
        if (!document.getElementById('map')) return;
        state.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([48.8566, 2.3522], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(state.map);
    }

    // --- 2. GESTION DES CAPTEURS & ÉVÉNEMENTS ---
    function setupEventListeners() {
        const startBtn = document.getElementById('gps-pause-toggle');
        
        startBtn.addEventListener('click', async () => {
            state.isRunning = !state.isRunning;
            window.MainEngine.isRunning = state.isRunning;
            
            startBtn.textContent = state.isRunning ? "⏸️ STOP ENGINE" : "▶️ MARCHE GPS";
            startBtn.classList.toggle('active', state.isRunning);

            if (state.isRunning) {
                // Demande de permission pour les capteurs (iOS)
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    try { await DeviceMotionEvent.requestPermission(); } catch (e) { console.error(e); }
                }

                // Activation du GPS haute fréquence
                navigator.geolocation.watchPosition(
                    (pos) => {
                        window.MainEngine.observeGPS(
                            pos.coords.latitude,
                            pos.coords.longitude,
                            pos.coords.altitude,
                            pos.coords.speed,
                            pos.coords.accuracy
                        );
                        // Mise à jour de la carte
                        if (state.map) {
                            const latlng = [pos.coords.latitude, pos.coords.longitude];
                            state.map.panTo(latlng);
                            if (!state.marker) {
                                state.marker = L.circleMarker(latlng, {color: '#00ff88', radius: 8}).addTo(state.map);
                            } else {
                                state.marker.setLatLng(latlng);
                            }
                        }
                    },
                    (err) => console.error("GPS Error:", err),
                    { enableHighAccuracy: true, maximumAge: 0 }
                );
            }
        });

        // Mise à jour des constantes via l'UI
        document.getElementById('mass-input').addEventListener('input', (e) => {
            state.mass = parseFloat(e.target.value) || 70;
            updateUI('mass-display', state.mass.toFixed(3) + " kg");
        });

        document.getElementById('environment-select').addEventListener('change', (e) => {
            const factors = { NORMAL: 1.0, FOREST: 2.5, CONCRETE: 7.0, METAL: 5.0 };
            state.environmentFactor = factors[e.target.value];
            updateUI('env-factor', `${e.target.value} (x${state.environmentFactor})`);
        });

        document.getElementById('reset-all-btn').addEventListener('click', () => location.reload());
    }

    // --- 3. BOUCLE DE CALCUL & AFFICHAGE (Le Cœur) ---
    function updateLoop(now) {
        const dt = (now - state.lastTick) / 1000;
        state.lastTick = now;

        if (state.isRunning && window.MainEngine) {
            const engine = window.MainEngine;
            engine.update(dt); // Exécution de la fusion UKF

            // A. Données de Navigation
            const vMs = engine.vMs || 0;
            const vKmh = vMs * 3.6;
            if (vKmh > state.vMax) state.vMax = vKmh;

            updateUI('speed-main-display', vKmh.toFixed(1) + " km/h");
            updateUI('speed-stable-kmh', vKmh.toFixed(1) + " km/h");
            updateUI('speed-stable-ms', vMs.toFixed(2) + " m/s");
            updateUI('speed-max-session', state.vMax.toFixed(1) + " km/h");
            updateUI('lat-ukf', engine.lat ? engine.lat.toFixed(6) : "...");
            updateUI('lon-ukf', engine.lon ? engine.lon.toFixed(6) : "...");
            updateUI('alt-display', engine.altitude.toFixed(2) + " m");
            updateUI('total-distance-3d', engine.distance3D.toFixed(4) + " km");

            // B. Physique & Relativité
            const c = 299792458;
            const beta = vMs / c;
            const gamma = 1 / Math.sqrt(1 - Math.pow(beta, 2));
            const dilationDayNs = (gamma - 1) * 86400 * 1e9;

            updateUI('lorentz-factor', gamma.toFixed(10));
            updateUI('time-dilation-vitesse', dilationDayNs.toFixed(2) + " ns/j");
            updateUI('pct-speed-of-light', (beta * 100).toFixed(6) + " %");
            updateUI('kinetic-energy', (0.5 * state.mass * vMs * vMs).toLocaleString() + " J");

            // C. Environnement & Dynamique
            const rho = 1.225 * Math.exp(-engine.altitude / 8500); // Modèle barométrique
            const drag = 0.5 * rho * vMs * vMs * 0.3 * 1.8; // Drag Force approx (Cda=0.3)
            updateUI('air-density', rho.toFixed(3) + " kg/m³");
            updateUI('drag-force', drag.toFixed(2) + " N");
            updateUI('acc-x', engine.accel.x.toFixed(3));
            updateUI('acc-y', engine.accel.y.toFixed(3));
            updateUI('acc-z', engine.accel.z.toFixed(3));

            // D. Astronomie (Liaison Ephem.js)
            if (engine.lat && engine.lon && window.Ephem) {
                const date = new Date();
                const sunPos = Ephem.getSunPosition(date, engine.lat, engine.lon);
                const moonPos = Ephem.getMoonPosition(date, engine.lat, engine.lon);
                const moonPhase = Ephem.getMoonPhase(date);

                updateUI('sun-alt', sunPos.altitude.toFixed(2) + "°");
                updateUI('sun-azimuth', sunPos.azimuth.toFixed(2) + "°");
                updateUI('moon-alt', moonPos.altitude.toFixed(2) + "°");
                updateUI('moon-phase-name', moonPhase);
                updateUI('astro-phase', sunPos.altitude > 0 ? "Jour ☀️" : "Nuit 🌙");
                
                // Animation de l'horloge céleste
                const sunEl = document.getElementById('sun-element');
                if(sunEl) sunEl.style.transform = `rotate(${sunPos.azimuth}deg)`;
            }

            // E. Temps & Système
            const nowTime = new Date();
            updateUI('utc-datetime', nowTime.toUTCString());
            updateUI('local-time', nowTime.toLocaleTimeString());
            updateUI('elapsed-time', ((Date.now() - state.startTime) / 1000).toFixed(1) + " s");
            updateUI('julian-date', getJulianDate(nowTime).toFixed(5));
        }
        
        requestAnimationFrame(updateLoop);
    }

    // --- UTILS ---
    function updateUI(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function getJulianDate(date) {
        return (date.getTime() / 86400000) - (date.getTimezoneOffset() / 1440) + 2440587.5;
    }

    // Lancement
    window.addEventListener('load', init);

})();
