(function() {
    const ukf = new ProfessionalUKF();
    const btnStart = document.getElementById('gps-pause-toggle');

    // --- INITIALISATION BOUTONS ---
    document.getElementById('night-mode-toggle').onclick = () => document.body.classList.toggle('night-ui');
    document.getElementById('clear-all-btn').onclick = () => location.reload();
    document.getElementById('reset-vmax-btn').onclick = () => { ukf.vMs = 0; };
    
    // Synchronisation Masse UI -> Système
    const mInput = document.getElementById('mass-val'); // Adapté à votre HTML
    if(mInput) { ukf.mass = parseFloat(mInput.textContent) || 70; }

    btnStart.addEventListener('click', async () => {
        if (!ukf.isRunning) {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                await DeviceMotionEvent.requestPermission();
            }
            window.addEventListener('devicemotion', (e) => ukf.processMotion(e), true);
            ukf.isRunning = true;
            btnStart.textContent = "🛑 ARRÊT D'URGENCE";
            btnStart.style.backgroundColor = "var(--danger)";
        } else { location.reload(); }
    });

    // --- BOUCLE GPS / ASTRO / MÉTÉO ---
    navigator.geolocation.watchPosition((p) => {
        const lat = p.coords.latitude;
        const lon = p.coords.longitude;
        ukf.vMs = p.coords.speed || 0;

        document.getElementById('lat-ukf').textContent = lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = lon.toFixed(6);
        document.getElementById('speed-main-display').textContent = (ukf.vMs * 3.6).toFixed(1);

        AstroBridge.update(lat, lon);
        
        // Météo dynamique (Densité de l'air & Mach)
        fetch(`/api/weather?lat=${lat}&lon=${lon}`)
            .then(r => r.json())
            .then(data => {
                const temp = data.main.temp;
                document.getElementById('temp-air').textContent = temp + "°C";
                document.getElementById('press-hpa').textContent = data.main.pressure + " hPa";
                
                const rho = (data.main.pressure * 100) / (287.05 * (temp + 273.15));
                document.getElementById('air-density').textContent = rho.toFixed(3) + " kg/m³";
                
                const vSon = 331.3 * Math.sqrt(1 + temp / 273.15);
                document.getElementById('mach-number').textContent = (ukf.vMs / vSon).toFixed(4);
            }).catch(() => {});
    }, null, { enableHighAccuracy: true });
})();
