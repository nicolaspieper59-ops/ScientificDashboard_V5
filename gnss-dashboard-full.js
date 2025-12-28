/** * GNSS SPACETIME - ORCHESTRATEUR FINAL 
 */
(function() {
    const ukf = new ProfessionalUKF();
    const btn = document.getElementById('gps-pause-toggle');

    // Liaison automatique avec weather.js
    async function updateEnvironment(lat, lon) {
        try {
            const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            const data = await response.json();
            if (data.main) {
                document.getElementById('temp-air').textContent = data.main.temp.toFixed(1) + "°C";
                document.getElementById('press-hpa').textContent = data.main.pressure + " hPa";
                document.getElementById('humidity-rel').textContent = data.main.humidity + "%";
                
                // Calcul de la Densité de l'air (Loi des gaz parfaits)
                const rho = (data.main.pressure * 100) / (287.05 * (data.main.temp + 273.15));
                document.getElementById('air-density').textContent = rho.toFixed(3) + " kg/m³";
                
                // Calcul du Nombre de Mach
                const vsound = 331.3 * Math.sqrt(1 + data.main.temp / 273.15);
                const mach = ukf.vMs / vsound;
                document.getElementById('mach-number').textContent = mach.toFixed(4);
            }
        } catch (e) { console.warn("Weather API unreachable"); }
    }

    btn.addEventListener('click', async () => {
        if (!ukf.isRunning) {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const res = await DeviceMotionEvent.requestPermission();
                if (res !== 'granted') return;
            }
            window.addEventListener('devicemotion', (e) => ukf.processMotion(e), true);
            ukf.isRunning = true;
            btn.textContent = "🛑 ARRÊT D'URGENCE";
            btn.style.backgroundColor = "var(--danger)";
        } else {
            location.reload();
        }
    });

    // Flux GPS & Astro
    navigator.geolocation.watchPosition((p) => {
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        ukf.vMs = p.coords.speed || 0;

        document.getElementById('lat-ukf').textContent = lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = lon.toFixed(6);
        document.getElementById('speed-main-display').textContent = (ukf.vMs * 3.6).toFixed(1);

        AstroBridge.update(lat, lon);
        updateEnvironment(lat, lon);
    }, null, { enableHighAccuracy: true });

})();
