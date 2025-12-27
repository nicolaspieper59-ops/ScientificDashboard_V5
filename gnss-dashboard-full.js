/**
 * GNSS SpaceTime Dashboard - MOTEUR DE FUSION ET BRIDGE FINAL
 * Connecte ukf-lib.js aux IDs du HTML v6
 */

(function() {
    "use strict";

    const C = 299792458;
    let state = {
        isRunning: false,
        lastTick: performance.now(),
        mass: 70,
        utcOffset: 0
    };

    /**
     * INITIALISATION
     */
    async function init() {
        console.log("🚀 Liaison Moteur-Interface en cours...");
        
        // Synchronisation Heure (NTP-like)
        try {
            const t0 = performance.now();
            const resp = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
            const data = await resp.json();
            state.utcOffset = new Date(data.utc_datetime).getTime() - (Date.now() - (performance.now() - t0)/2);
            updateUI('clock-accuracy', "±" + ((performance.now()-t0)/2).toFixed(0) + "ms");
        } catch(e) { updateUI('clock-accuracy', "Locale (Offline)"); }

        setupHardwareHandlers();
        requestAnimationFrame(mainLoop);
    }

    /**
     * BOUCLE DE RENDU ET CALCULS (BRIDGE)
     */
    function mainLoop(now) {
        const dt = (now - state.lastTick) / 1000;
        state.lastTick = now;

        if (state.isRunning && window.MainEngine) {
            const engine = window.MainEngine;

            // --- 1. NAVIGATION & VITESSE (IDs Vérifiés) ---
            const v = engine.vMs || 0;
            updateUI('speed-main-display', (v * 3.6).toFixed(2));
            updateUI('v-stable-kh', (v * 3.6).toFixed(1));
            updateUI('v-stable-ms', v.toFixed(2));
            updateUI('vel-z', (engine.velocityVec?.z || 0).toFixed(2));
            updateUI('total-distance-3d', (engine.distance3D / 1000).toFixed(5));
            updateUI('dist-precise-ukf', (engine.distance3D / 1000).toFixed(5));

            // --- 2. CAPTEURS IMU (IDs Vérifiés) ---
            updateUI('accel-x', (engine.accel?.x || 0).toFixed(3));
            updateUI('accel-y', (engine.accel?.y || 0).toFixed(3));
            updateUI('accel-z', (engine.accel?.z || 0).toFixed(3));
            
            // Calcul Inclinaison pour le niveau à bulle
            const pitch = Math.atan2(-(engine.accel?.x || 0), Math.sqrt(Math.pow(engine.accel?.y||0, 2) + Math.pow(engine.accel?.z||9.8, 2))) * (180/Math.PI);
            const roll = Math.atan2((engine.accel?.y || 0), (engine.accel?.z || 9.8)) * (180/Math.PI);
            updateUI('pitch-val', pitch.toFixed(1) + "°");
            updateUI('roll-val', roll.toFixed(1) + "°");

            // --- 3. PHYSIQUE & RELATIVITÉ ---
            const alt = engine.altitude || 0;
            const beta = v / C;
            const gamma = 1 / Math.sqrt(1 - beta * beta);
            const rho = 1.225 * Math.exp(-alt / 8500); // Modèle atmosphérique
            
            updateUI('lorentz-factor', gamma.toFixed(10));
            updateUI('time-dilation', ((gamma - 1) * 1e9).toFixed(4));
            updateUI('mach-number', (v / 340.3).toFixed(5));
            updateUI('air-density', rho.toFixed(4));
            updateUI('drag-force', (0.5 * rho * v * v * 0.47 * 0.5).toFixed(2));
            updateUI('kinetic-energy', (0.5 * state.mass * v * v).toLocaleString());

            // --- 4. GPS ET STATUT ---
            updateUI('lat-ukf', engine.lat ? engine.lat.toFixed(6) : "...");
            updateUI('lon-ukf', engine.lon ? engine.lon.toFixed(6) : "...");
            updateUI('alt-ekf', alt.toFixed(2));
            
            const statusEl = document.getElementById('filter-status');
            if (statusEl) {
                statusEl.textContent = engine.isCalibrated ? "STABLE (UKF-21)" : "CALIBRATION...";
                statusEl.className = engine.isCalibrated ? "status-active" : "status-wait";
            }
        }
        requestAnimationFrame(mainLoop);
    }

    /**
     * GESTIONNAIRE MATÉRIEL (FIX GPS & ACCEL)
     */
    function setupHardwareHandlers() {
        const btn = document.getElementById('gps-pause-toggle');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            if (!state.isRunning) {
                // Déverrouillage des capteurs sur mobile
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    try { await DeviceMotionEvent.requestPermission(); } catch(e) {}
                }

                // Activation du GPS réel
                navigator.geolocation.watchPosition((pos) => {
                    if (window.MainEngine) {
                        window.MainEngine.lat = pos.coords.latitude;
                        window.MainEngine.lon = pos.coords.longitude;
                        window.MainEngine.altitude = pos.coords.altitude || 0;
                        if (pos.coords.speed) window.MainEngine.vMs = pos.coords.speed;
                    }
                }, null, { enableHighAccuracy: true });

                state.isRunning = true;
                if (window.MainEngine) window.MainEngine.isRunning = true;
                btn.textContent = "⏸️ STOP ENGINE";
                btn.style.borderLeft = "4px solid #ff4444";
            } else {
                state.isRunning = false;
                if (window.MainEngine) window.MainEngine.isRunning = false;
                btn.textContent = "▶️ START ENGINE";
                btn.style.borderLeft = "4px solid #00ff66";
            }
        });

        // Masse
        const massIn = document.getElementById('mass-input');
        if (massIn) {
            massIn.addEventListener('change', (e) => {
                state.mass = parseFloat(e.target.value) || 70;
                if(window.MainEngine) window.MainEngine.mass = state.mass;
            });
        }
    }

    function updateUI(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    window.addEventListener('load', init);
})();
