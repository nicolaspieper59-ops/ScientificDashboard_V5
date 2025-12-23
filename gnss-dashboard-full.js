/**
 * ORCHESTRATEUR - FIX BOUTON MARCHE/ARRÊT
 */
(function() {
    let engine = null;
    let isRunning = false;
    let lastT = performance.now();

    // 1. LA FONCTION DE SUTURE DU BOUTON
    function bindButton() {
        const btn = document.getElementById('gps-pause-toggle');
        
        if (!btn) {
            console.error("❌ ERREUR: Le bouton 'gps-pause-toggle' est introuvable dans le HTML !");
            return;
        }

        btn.addEventListener('click', async function() {
            console.log("🔘 Clic détecté sur le bouton Marche/Arrêt");

            if (isRunning) {
                // ARRÊT
                isRunning = false;
                btn.textContent = "▶️ MARCHE GPS";
                btn.style.backgroundColor = ""; // Reset couleur
                console.log("🛑 Système arrêté.");
            } else {
                // MARCHE
                if (typeof window.ProfessionalUKF === 'undefined') {
                    alert("ERREUR : Le fichier ukf-lib.js n'est pas chargé. Vérifiez vos dossiers.");
                    return;
                }

                // Permission capteurs (Indispensable sur mobile)
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                    const resp = await DeviceMotionEvent.requestPermission();
                    if (resp !== 'granted') return;
                }

                if (!engine) engine = new window.ProfessionalUKF();
                isRunning = true;
                btn.textContent = "⏸️ ARRÊT GPS";
                btn.style.backgroundColor = "#dc3545"; // Rouge pendant la marche
                
                console.log("🚀 Système démarré.");
                startCapture();
                runLoop();
            }
        });
    }

    function startCapture() {
        // GPS
        navigator.geolocation.watchPosition(p => {
            if(engine && isRunning) engine.update({lat: p.coords.latitude, lon: p.coords.longitude});
        });

        // IMU
        window.ondevicemotion = (e) => {
            if(!isRunning || !engine) return;
            const now = performance.now();
            const dt = (now - lastT) / 1000;
            lastT = now;
            engine.predict(dt, e.accelerationIncludingGravity, e.rotationRate);
        };
    }

    function runLoop() {
        if (!isRunning) return;
        
        const state = engine.getState();
        // Mise à jour de l'affichage
        if (document.getElementById('lat-ukf')) 
            document.getElementById('lat-ukf').textContent = state.lat.toFixed(8);
        
        // Vérité Cosmique (Exemple : Rotation Terre + Orbite)
        const v_cosmic = (state.v * 3.6) + 1670 + 107000;
        if (document.getElementById('v-cosmic'))
            document.getElementById('v-cosmic').textContent = v_cosmic.toLocaleString() + " km/h";

        requestAnimationFrame(runLoop);
    }

    // Lancement immédiat
    if (document.readyState === "complete" || document.readyState === "interactive") {
        bindButton();
    } else {
        window.addEventListener('DOMContentLoaded', bindButton);
    }
})();
