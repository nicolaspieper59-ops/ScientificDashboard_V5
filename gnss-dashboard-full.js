// --- gnss-dashboard-full.js ---
(function() {
    let isRunning = false;
    let engine = null;

    const ui = {
        btn: () => document.getElementById('gps-pause-toggle'),
        vCosmic: () => document.getElementById('v-cosmic'),
        status: () => document.getElementById('status-physique'),
        accX: () => document.getElementById('acc-x'),
        bubble: () => document.getElementById('bubble') // ID corrigé ici
    };

    function start() {
        ui.btn().addEventListener('click', async () => {
            if (isRunning) {
                isRunning = false;
                ui.btn().textContent = "▶️ MARCHE GPS";
                ui.btn().style.background = "";
                return;
            }

            // Demande de permission (Indispensable mobile)
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                const perms = await DeviceMotionEvent.requestPermission();
                if (perms !== 'granted') return alert("Capteurs refusés");
            }

            isRunning = true;
            ui.btn().textContent = "⏸️ ARRÊT GPS";
            ui.btn().style.background = "#dc3545";
            
            activateSensors();
        });
    }

    function activateSensors() {
        // Écouteur de mouvement (Oiseaux / Manèges)
        window.addEventListener('devicemotion', (e) => {
            if (!isRunning) return;
            
            const ax = e.accelerationIncludingGravity.x || 0;
            const ay = e.accelerationIncludingGravity.y || 0;
            const az = e.accelerationIncludingGravity.z || 0;

            // Mise à jour sécurisée des IDs
            if (ui.accX()) ui.accX().textContent = ax.toFixed(2);
            
            // Calcul inclinaison pour la bulle
            const roll = Math.atan2(ay, az) * 57.29;
            const pitch = Math.atan2(-ax, 9.81) * 57.29;
            
            if (ui.bubble()) {
                ui.bubble().style.transform = `translate(${roll}px, ${pitch}px)`;
            }

            // Vérité Cosmique (Simulation si pas de GPS)
            if (ui.vCosmic()) {
                const v_base = 1307000; // Vitesse Galactique approx
                ui.vCosmic().textContent = v_base.toLocaleString() + " km/h";
            }
        });

        // GPS
        navigator.geolocation.watchPosition((p) => {
            if (!isRunning) return;
            document.getElementById('speed-main-display').textContent = 
                ((p.coords.speed || 0) * 3.6).toFixed(1) + " km/h";
        }, null, {enableHighAccuracy: true});
    }

    window.onload = start;
})();
