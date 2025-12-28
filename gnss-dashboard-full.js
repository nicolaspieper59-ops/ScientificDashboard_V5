/** * GNSS SPACETIME - MASTER CONTROLLER
 */
(function() {
    const ukf = new ProfessionalUKF();
    const btn = document.getElementById('gps-pause-toggle');

    // Liaison avec ton weather.js (Vercel/OpenWeather)
    async function fetchWeather(lat, lon) {
        try {
            const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            const data = await response.json();
            if (data.main) {
                document.getElementById('temp-air').textContent = data.main.temp + "°C";
                document.getElementById('press-hpa').textContent = data.main.pressure + " hPa";
                document.getElementById('humidity-rel').textContent = data.main.humidity + "%";
                // Densité de l'air dynamique (Loi des gaz parfaits)
                const rho = data.main.pressure * 100 / (287.05 * (data.main.temp + 273.15));
                document.getElementById('air-density').textContent = rho.toFixed(3) + " kg/m³";
            }
        } catch (e) { console.warn("Weather API Offline"); }
    }

    btn.addEventListener('click', async () => {
        if (!ukf.isRunning) {
            // Permission pour DeviceMotionEvent (iOS/Android)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const res = await DeviceMotionEvent.requestPermission();
                if (res !== 'granted') return;
            }
            window.addEventListener('devicemotion', (e) => ukf.processMotion(e), true);
            ukf.isRunning = true;
            btn.textContent = "🛑 ARRÊT D'URGENCE";
            btn.classList.add('active');
        } else {
            location.reload();
        }
    });

    // Navigation & Astro
    navigator.geolocation.watchPosition((p) => {
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        ukf.vMs = p.coords.speed || 0;

        document.getElementById('lat-ukf').textContent = lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = lon.toFixed(6);
        document.getElementById('speed-main-display').textContent = (ukf.vMs * 3.6).toFixed(1);

        AstroBridge.update(lat, lon);
        fetchWeather(lat, lon);
    }, null, { enableHighAccuracy: true });

})();
