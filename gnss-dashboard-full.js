(function() {
    "use strict";
    const engine = new ProfessionalUKF();

    async function activateSensors() {
        // Baromètre (Pression)
        if ('PressureSensor' in window) {
            const p = new PressureSensor({ frequency: 10 });
            p.onreading = () => { engine.pressureHardware = p.pressure / 100; };
            p.start();
        }

        // Luminosité (Ambient Light)
        if ('AmbientLightSensor' in window) {
            const l = new AmbientLightSensor();
            l.onreading = () => {
                document.querySelectorAll('[id^="env-lux"]').forEach(e => e.textContent = l.illuminance.toFixed(1));
            };
            l.start();
        }

        // Magnétomètre (Champ magnétique)
        if ('Magnetometer' in window) {
            const m = new Magnetometer({frequency: 10});
            m.onreading = () => {
                document.getElementById('mag-x').textContent = m.x.toFixed(1);
                document.getElementById('mag-y').textContent = m.y.toFixed(1);
                document.getElementById('mag-z').textContent = m.z.toFixed(1);
            };
            m.start();
        }

        // IMU (Pitch & Roll)
        window.addEventListener('deviceorientation', (e) => {
            document.querySelectorAll('[id^="pitch"]').forEach(el => el.textContent = e.beta.toFixed(1) + "°");
            document.querySelectorAll('[id^="roll"]').forEach(el => el.textContent = e.gamma.toFixed(1) + "°");
        });
    }

    function render() {
        if (!engine.isRunning) return;
        
        engine.predict();
        AstroEngine.update(engine.lat, engine.lon);

        // Relativité (Jamais de N/A)
        const c = 299792458;
        const beta = engine.vMs / c;
        const lorentz = 1 / Math.sqrt(1 - beta * beta);
        document.querySelectorAll('[id^="lorentz-factor"]').forEach(e => e.textContent = lorentz.toFixed(12));

        requestAnimationFrame(render);
    }

    document.getElementById('gps-pause-toggle').addEventListener('click', async () => {
        if (!engine.isRunning) {
            await activateSensors();
            engine.isRunning = true;
            document.getElementById('filter-status').textContent = "UKF ACTIVE";
            render();
        }
    });

    // GPS & Vitesse
    navigator.geolocation.watchPosition((p) => {
        engine.vMs = p.coords.speed || engine.vMs;
        engine.altitude = p.coords.altitude || 0;
        document.querySelectorAll('[id^="lat-ukf"]').forEach(e => e.textContent = p.coords.latitude.toFixed(6));
        document.querySelectorAll('[id^="lon-ukf"]').forEach(e => e.textContent = p.coords.longitude.toFixed(6));
    }, null, { enableHighAccuracy: true });

})();
