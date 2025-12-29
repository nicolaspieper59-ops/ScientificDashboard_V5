(function() {
    const ukf = new ProfessionalUKF();
    const btnStart = document.getElementById('gps-pause-toggle');

    // Fonction de demande de permission pour les capteurs (iOS 13+)
    async function requestSensorPermission() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceMotionEvent.requestPermission();
                return permissionState === 'granted';
            } catch (error) {
                console.error("Erreur de permission capteurs:", error);
                return false;
            }
        }
        return true; // Pour les navigateurs non-iOS
    }

    btnStart.addEventListener('click', async () => {
        if (!ukf.isRunning) {
            const hasPermission = await requestSensorPermission();
            
            if (hasPermission) {
                // Activation de l'accéléromètre
                window.addEventListener('devicemotion', (e) => ukf.processMotion(e), true);
                
                // Activation du GPS
                startGPS();
                
                ukf.isRunning = true;
                btnStart.innerHTML = "🛑 ARRÊT D'URGENCE";
                btnStart.style.backgroundColor = "var(--danger)";
                document.getElementById('gps-status').textContent = "ACTIF";
            } else {
                alert("Permission refusée. Le dashboard ne peut pas lire l'accéléromètre.");
            }
        } else {
            location.reload(); // Reset complet
        }
    });

    function startGPS() {
        navigator.geolocation.watchPosition((p) => {
            const lat = p.coords.latitude;
            const lon = p.coords.longitude;
            ukf.vMs = p.coords.speed || 0;

            document.getElementById('lat-ukf').textContent = lat.toFixed(6);
            document.getElementById('lon-ukf').textContent = lon.toFixed(6);
            document.getElementById('speed-main-display').textContent = (ukf.vMs * 3.6).toFixed(1);

            // Mise à jour Astro & Météo
            if (typeof AstroBridge !== 'undefined') AstroBridge.update(lat, lon);
            updateWeather(lat, lon);
        }, (err) => console.error(err), { enableHighAccuracy: true });
    }

    async function updateWeather(lat, lon) {
        try {
            const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            const data = await res.json();
            if (data.main) {
                document.getElementById('temp-air').textContent = data.main.temp + "°C";
                document.getElementById('press-hpa').textContent = data.main.pressure + " hPa";
                // Calcul densité de l'air
                const rho = (data.main.pressure * 100) / (287.05 * (data.main.temp + 273.15));
                document.getElementById('air-density').textContent = rho.toFixed(3) + " kg/m³";
            }
        } catch (e) { console.warn("Weather API inaccessible"); }
    }
})();
