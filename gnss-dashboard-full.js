const FlightDashboard = {
    ukf: new UKFPro(),
    active: false,

    init() {
        document.getElementById('start-btn').onclick = () => {
            this.active = true;
            document.getElementById('status-physique').textContent = "AIRBORNE / VOL";
        };
        this.loop();
    },

    loop() {
        window.addEventListener('devicemotion', (e) => {
            if (!this.active) return;

            const acc = e.accelerationIncludingGravity;
            // Récupération des angles depuis le HTML (Niveau à bulle)
            const pitch = parseFloat(document.getElementById('pitch').textContent);
            const roll = parseFloat(document.getElementById('roll').textContent);

            const flight = this.ukf.update(acc, pitch, roll);

            // --- MISE À JOUR NAVIGATION VOL ---
            const speedKmh = Math.abs(flight.velH * 3.6);
            document.getElementById('sp-main').textContent = speedKmh.toFixed(4);
            document.getElementById('speed-stable-kmh').textContent = speedKmh.toFixed(1) + " km/h";
            
            // Vitesse Verticale (Crucial pour drone)
            document.getElementById('vel-z').textContent = flight.velZ.toFixed(2) + " m/s";
            document.getElementById('vertical-speed-ekf').textContent = flight.velZ.toFixed(2) + " m/s";

            // --- DYNAMIQUE ---
            const gTotal = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.80665;
            document.getElementById('g-force').textContent = gTotal.toFixed(2);
            document.getElementById('force-g-vert').textContent = (acc.z / 9.80665).toFixed(2);

            // --- ASTRO ---
            // On garde les éphémérides pour le cap et la position du soleil (orientation)
            const lat = parseFloat(document.getElementById('lat-ukf').textContent);
            const lon = parseFloat(document.getElementById('lon-ukf').textContent);
            AstroEngine.updateAll(lat, lon);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => FlightDashboard.init());
