(function() {
    const ukf = new ProfessionalUKF();
    const btnStart = document.getElementById('gps-pause-toggle');

    btnStart.addEventListener('click', async () => {
        if (!ukf.isRunning) {
            // Demande de permission DeviceMotion (Crucial pour iOS/Android)
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            window.addEventListener('devicemotion', (e) => ukf.processMotion(e), true);
            
            ukf.isRunning = true;
            btnStart.textContent = "🛑 ARRÊT D'URGENCE";
            btnStart.style.backgroundColor = "red";
            startDataStreams();
        } else {
            location.reload();
        }
    });

    function startDataStreams() {
        navigator.geolocation.watchPosition((p) => {
            const lat = p.coords.latitude;
            const lon = p.coords.longitude;
            ukf.vMs = p.coords.speed || 0;

            document.getElementById('lat-ukf').textContent = lat.toFixed(6);
            document.getElementById('lon-ukf').textContent = lon.toFixed(6);

            if (typeof AstroBridge !== 'undefined') AstroBridge.update(lat, lon);
            
            // --- UTILISATION DE VOTRE weather.js ---
            fetch(`/api/weather?lat=${lat}&lon=${lon}`)
                .then(r => r.json())
                .then(data => {
                    const temp = data.main.temp;
                    const press = data.main.pressure;
                    
                    document.getElementById('temp-air').textContent = temp + "°C";
                    document.getElementById('press-hpa').textContent = press + " hPa";
                    document.getElementById('humidity-rel').textContent = data.main.humidity + "%";
                    
                    // Calcul Densité de l'air (Physique des fluides)
                    const rho = (press * 100) / (287.05 * (temp + 273.15));
                    document.getElementById('air-density').textContent = rho.toFixed(3) + " kg/m³";

                    // Calcul du Nombre de Mach
                    const vSon = 331.3 * Math.sqrt(1 + temp / 273.15);
                    document.getElementById('mach-number').textContent = (ukf.vFiltered / vSon).toFixed(4);
                    document.getElementById('speed-of-sound').textContent = vSon.toFixed(1) + " m/s";
                });
        }, null, { enableHighAccuracy: true });
    }
})();
