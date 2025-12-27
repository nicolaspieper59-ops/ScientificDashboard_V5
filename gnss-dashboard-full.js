/**
 * GNSS DASHBOARD MASTER - VERSION FINALE
 */
(function() {
    "use strict";

    const state = {
        isRunning: false,
        map: null,
        marker: null,
        lastTick: performance.now()
    };

    async function init() {
        // Init Carte
        state.map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(state.map);
        
        window.MainEngine = new ProfessionalUKF();
        
        const startBtn = document.getElementById('gps-pause-toggle');
        startBtn.addEventListener('click', handleToggle);
        
        requestAnimationFrame(updateLoop);
    }

    async function handleToggle() {
        // --- 1. GESTION DES PERMISSIONS ---
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                if (response !== 'granted') return alert("Permission capteurs refusée.");
            } catch (e) { console.error(e); }
        }

        state.isRunning = !state.isRunning;
        window.MainEngine.isRunning = state.isRunning;
        
        const btn = document.getElementById('gps-pause-toggle');
        btn.textContent = state.isRunning ? "⏸️ STOP ENGINE" : "▶️ MARCHE GPS";
        btn.style.background = state.isRunning ? "#331111" : "#113311";

        if (state.isRunning) {
            startSensors();
        }
    }

    function startSensors() {
        // --- 2. GPS ---
        navigator.geolocation.watchPosition(
            (p) => {
                window.MainEngine.observeGPS(
                    p.coords.latitude, p.coords.longitude, 
                    p.coords.altitude, p.coords.speed, p.coords.accuracy
                );
                updateMap(p.coords.latitude, p.coords.longitude);
            },
            (e) => console.warn(e),
            { enableHighAccuracy: true }
        );

        // --- 3. DEVICE MOTION (Newton) ---
        window.addEventListener('devicemotion', (e) => {
            if (!window.MainEngine) return;
            const acc = e.accelerationIncludingGravity;
            window.MainEngine.accel = { x: acc.x || 0, y: acc.y || 0, z: acc.z || 0 };
        });

        // --- 4. DEVICE ORIENTATION (Boussole/Niveau) ---
        window.addEventListener('deviceorientation', (e) => {
            updateUI('pitch-display', e.beta.toFixed(1) + "°");
            updateUI('roll-display', e.gamma.toFixed(1) + "°");
        });
    }

    function updateLoop(now) {
        const dt = (now - state.lastTick) / 1000;
        state.lastTick = now;

        if (state.isRunning && window.MainEngine) {
            const engine = window.MainEngine;
            engine.predict(dt);

            // Peuplement des IDs Navigation
            updateUI('speed-main-display', (engine.vMs * 3.6).toFixed(1) + " km/h");
            updateUI('lat-ukf', engine.lat ? engine.lat.toFixed(6) : "Recherche...");
            updateUI('lon-ukf', engine.lon ? engine.lon.toFixed(6) : "...");
            updateUI('alt-display', engine.altitude ? engine.altitude.toFixed(1) + " m" : "0 m");
            
            // Peuplement Relativité
            const beta = engine.vMs / 299792458;
            const gamma = 1 / Math.sqrt(1 - beta * beta);
            updateUI('lorentz-factor', gamma.toFixed(10));

            // Peuplement Astro (via ephem.js si disponible)
            if (window.Ephem && engine.lat) {
                const sun = Ephem.getSunPosition(new Date(), engine.lat, engine.lon);
                updateUI('sun-alt', sun.altitude.toFixed(2) + "°");
                updateUI('sun-azimuth', sun.azimuth.toFixed(2) + "°");
            }
        }
        requestAnimationFrame(updateLoop);
    }

    function updateMap(lat, lon) {
        if (!state.map) return;
        state.map.setView([lat, lon], 15);
        if (!state.marker) {
            state.marker = L.circleMarker([lat, lon], {color: '#00ff88'}).addTo(state.map);
        } else {
            state.marker.setLatLng([lat, lon]);
        }
    }

    function updateUI(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);
})();
