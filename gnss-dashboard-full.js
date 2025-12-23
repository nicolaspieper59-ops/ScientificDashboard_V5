(function() {
    let engine = null;
    let isRunning = false;

    const updateUI = () => {
        if (!isRunning || !engine) return;

        const mass = parseFloat(document.getElementById('object-mass')?.value) || 70;
        const data = engine.computeExtendedState(mass);

        // --- MAPPING MASSIF PAR ID ---
        const map = {
            'speed-main-display': data.v_kmh.toFixed(2) + " km/h",
            'speed-stable-kmh': data.v_kmh.toFixed(2) + " km/h",
            'lat-ukf': data.lat.toFixed(8),
            'lon-ukf': data.lon.toFixed(8),
            'alt-ukf': data.alt.toFixed(2),
            'lorentz-factor': data.gamma.toFixed(10),
            'time-dilation-vitesse': data.dilation.toFixed(3) + " ns/j",
            'speed-mach': data.mach.toFixed(4),
            'kinetic-energy': data.ke.toLocaleString() + " J",
            'schwarzschild-radius': data.schwarzschild.toExponential(4) + " m",
            'v-cosmic': (data.v_kmh + 107000 + 828000).toLocaleString() + " km/h"
        };

        // Application automatique : si l'ID existe dans le HTML, on le remplit
        for (let [id, val] of Object.entries(map)) {
            let el = document.getElementById(id);
            if (el) el.textContent = val;
        }

        requestAnimationFrame(updateUI);
    };

    const init = () => {
        const btn = document.getElementById('gps-pause-toggle');
        btn.onclick = async () => {
            if (isRunning) { isRunning = false; btn.textContent = "▶️ MARCHE GPS"; return; }

            if (window.DeviceMotionEvent?.requestPermission) await DeviceMotionEvent.requestPermission();
            
            engine = new window.ProfessionalUKF();
            isRunning = true;
            btn.textContent = "⏸️ ARRÊT GPS";
            btn.style.background = "#dc3545";

            // Capteurs
            window.ondevicemotion = (e) => engine.predict(0.02, e.accelerationIncludingGravity, e.rotationRate);
            navigator.geolocation.watchPosition(p => engine.update({lat:p.coords.latitude, lon:p.coords.longitude, alt:p.coords.altitude}));
            
            updateUI();
        };
    };

    window.onload = init;
})();
