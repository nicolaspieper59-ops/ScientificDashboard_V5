/**
 * GEODESIC SPACETIME ENGINE - ANDROID & DEVICE MOTION READY
 * Suture complète pour 100+ IDs
 */
(function() {
    let isRunning = false;
    let lastT = performance.now();
    
    // États physiques
    const phys = {
        v: 0, lat: 0, lon: 0, alt: 0, 
        ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0,
        startTime: Date.now()
    };

    const C = 299792458;
    const G = 6.67430e-11;

    const btn = document.getElementById('gps-pause-toggle');

    // --- FONCTION DE SUTURE (Remplit le HTML) ---
    function updateDashboard() {
        if (!isRunning) return;

        const mass = parseFloat(document.getElementById('mass-input')?.value) || 70;
        const v_cosmic = phys.v + 465.1 + 29780 + 230000;
        const gamma = 1 / Math.sqrt(1 - Math.pow(v_cosmic / C, 2));

        // Mapping de tes IDs HTML
        const data = {
            'speed-main-display': (phys.v * 3.6).toFixed(2) + " km/h",
            'v-cosmic': (v_cosmic * 3.6).toLocaleString() + " km/h",
            'lat-ukf': phys.lat.toFixed(8),
            'lon-ukf': phys.lon.toFixed(8),
            'alt-ukf': phys.alt.toFixed(2),
            'acc-x': phys.ax.toFixed(4),
            'acc-y': phys.ay.toFixed(4),
            'acc-z': phys.az.toFixed(4),
            'lorentz-factor': gamma.toFixed(14),
            'time-dilation-vitesse': ((gamma - 1) * 86400 * 1e9).toFixed(2) + " ns/j",
            'speed-mach': (phys.v / 340.29).toFixed(4),
            'kinetic-energy': (0.5 * mass * phys.v**2).toLocaleString() + " J",
            'schwarzschild-radius': ((2 * G * mass) / C**2).toExponential(4) + " m",
            'elapsed-time': ((Date.now() - phys.startTime)/1000).toFixed(2) + " s"
        };

        // Injection automatique dans chaque ID trouvé
        for (const [id, val] of Object.entries(data)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }

        // Mise à jour de la bulle (Toboggans/Oiseaux)
        const bubble = document.getElementById('bubble');
        if (bubble) {
            const roll = Math.atan2(phys.ay, phys.az) * 57.29;
            const pitch = Math.atan2(-phys.ax, 9.81) * 57.29;
            bubble.style.transform = `translate(${roll}px, ${pitch}px)`;
        }

        requestAnimationFrame(updateDashboard);
    }

    // --- ACTIVATION DEVICE MOTION (CLIC OBLIGATOIRE SUR ANDROID) ---
    btn.onclick = async () => {
        if (isRunning) {
            isRunning = false;
            btn.textContent = "▶️ MARCHE GPS";
            btn.style.background = "";
            return;
        }

        // Demande de permission (iOS et Android Chrome récents)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') {
                alert("Permission Capteurs Refusée");
                return;
            }
        }

        isRunning = true;
        btn.textContent = "⏸ PAUSE SYSTÈME";
        btn.style.background = "#dc3545";

        // Écouteur de mouvement (Device Motion)
        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity;
            if (acc) {
                phys.ax = acc.x || 0;
                phys.ay = acc.y || 0;
                phys.az = acc.z || 0;
            }
        }, true);

        // Écouteur GPS
        navigator.geolocation.watchPosition((p) => {
            phys.lat = p.coords.latitude;
            phys.lon = p.coords.longitude;
            phys.alt = p.coords.altitude || 0;
            phys.v = p.coords.speed || 0;
        }, null, { enableHighAccuracy: true });

        updateDashboard();
    };
})();
