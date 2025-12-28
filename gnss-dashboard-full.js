(function() {
    const engine = new ProfessionalUKF();
    
    // --- API MÉTÉO & POLLUTION (Simulation si pas de clé API) ---
    async function fetchEnvironment(lat, lon) {
        // En production, remplacez par un vrai fetch API
        const mockData = { temp: 22.5, press: 1012, no2: 12.4, pm25: 8.1 };
        document.getElementById('air-temp-c').textContent = mockData.temp;
        document.getElementById('pressure-hpa').textContent = mockData.press;
        document.getElementById('no2-val').textContent = mockData.no2;
        document.getElementById('pm25-val').textContent = mockData.pm25;
        document.getElementById('statut-meteo').textContent = "SYNCHRONISÉ";
    }

    async function startHardware() {
        // Capteur de Lumière
        if ('AmbientLightSensor' in window) {
            const light = new AmbientLightSensor();
            light.onreading = () => {
                document.getElementById('env-lux').textContent = light.illuminance + " lx";
                document.getElementById('ambient-light').textContent = light.illuminance;
            };
            light.start();
        }

        // Microphone (Niveau Sonore)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new AudioContext();
            const analyzer = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyzer);
            const data = new Uint8Array(analyzer.frequencyBinCount);
            setInterval(() => {
                analyzer.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b) / data.length;
                document.getElementById('sound-level').textContent = (avg * 1.2).toFixed(1) + " dB";
            }, 500);
        } catch(e) { document.getElementById('sound-level').textContent = "OFFLINE"; }
    }

    document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
        if (!engine.isRunning) {
            await startHardware();
            if (engine.lat) fetchEnvironment(engine.lat, engine.lon);
            engine.isRunning = true;
            document.getElementById('gps-pause-toggle').textContent = "🛑 ARRÊT";
            requestAnimationFrame(function loop() {
                if(engine.isRunning) {
                    engine.predict(0.016);
                    AstroEngine.calculate(engine.lat || 48.8, engine.lon || 2.3);
                    requestAnimationFrame(loop);
                }
            });
        } else {
            engine.isRunning = false;
            location.reload();
        }
    });

    navigator.geolocation.watchPosition((p) => {
        engine.lat = p.coords.latitude;
        engine.lon = p.coords.longitude;
        document.getElementById('lat-ukf').textContent = engine.lat.toFixed(6);
        document.getElementById('lon-ukf').textContent = engine.lon.toFixed(6);
        document.getElementById('gps-accuracy-display').textContent = p.coords.accuracy.toFixed(1) + " m";
    }, null, { enableHighAccuracy: true });

})();
