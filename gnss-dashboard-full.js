/**
 * GNSS DASHBOARD CONTROLLER - ANDROID OPTIMIZED
 */
(function() {
    let engine = new window.ProfessionalUKF();
    let isRunning = false;
    let lastT = performance.now();

    const btn = document.getElementById('gps-pause-toggle');
    const massInput = document.getElementById('mass-input');

    // --- ACTIVATION ANDROID / IOS ---
    btn.onclick = async function() {
        if (isRunning) {
            isRunning = false;
            btn.textContent = "▶️ MARCHE GPS";
            btn.style.background = "";
            return;
        }

        // 1. Demande de permission (Crucial pour Chrome Android & iOS)
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const res = await DeviceMotionEvent.requestPermission();
                if (res !== 'granted') throw new Error("Permission refusée");
            } catch (e) {
                alert("Accès capteurs requis pour le dashboard.");
                return;
            }
        }

        // 2. Initialisation et démarrage
        isRunning = true;
        btn.textContent = "⏸ PAUSE SYSTÈME";
        btn.style.background = "#dc3545";
        
        startTracking();
        requestAnimationFrame(updateLoop);
    };

    function startTracking() {
        // Accéléromètre Android
        window.addEventListener('devicemotion', (e) => {
            if (!isRunning) return;
            const a = e.accelerationIncludingGravity || {x:0, y:0, z:0};
            engine.ax = a.x; engine.ay = a.y; engine.az = a.z;
            
            // Mise à jour visuelle immédiate de la bulle
            const roll = Math.atan2(a.y, a.z) * 57.29;
            const pitch = Math.atan2(-a.x, 9.81) * 57.29;
            const bubble = document.getElementById('bubble');
            if (bubble) bubble.style.transform = `translate(${roll}px, ${pitch}px)`;
            
            const pEl = document.getElementById('pitch');
            const rEl = document.getElementById('roll');
            if(pEl) pEl.textContent = pitch.toFixed(1) + "°";
            if(rEl) rEl.textContent = roll.toFixed(1) + "°";
        }, true);

        // GPS Android
        navigator.geolocation.watchPosition((p) => {
            if (!isRunning) return;
            engine.lat = p.coords.latitude;
            engine.lon = p.coords.longitude;
            engine.alt = p.coords.altitude || 0;
            engine.v = p.coords.speed || 0;
            if (engine.v > engine.maxV) engine.maxV = engine.v;
        }, null, { enableHighAccuracy: true });
    }

    function updateLoop() {
        if (!isRunning) return;

        const mass = parseFloat(massInput?.value) || 70;
        const results = engine.compute(mass);

        // --- SUTURE AUTOMATIQUE DES 100+ IDs ---
        // On parcourt tous les champs calculés
        for (const [id, value] of Object.entries(results)) {
            const el = document.getElementById(id);
            if (el) {
                // Optimisation : on ne met à jour que si le texte a changé
                if (el.textContent !== value) {
                    el.textContent = value;
                }
            }
        }

        requestAnimationFrame(updateLoop);
    }
})();
