const Dashboard = {
    ukf: new UKFPro(),
    active: false,

    init() {
        document.getElementById('start-btn').onclick = () => {
            this.active = true;
            document.getElementById('start-btn').style.display = 'none';
            this.startSensors();
        };
        
        if ('getBattery' in navigator) {
            navigator.getBattery().then(b => {
                const up = () => document.getElementById('batt-level').textContent = (b.level * 100) + "%";
                up(); b.onlevelchange = up;
            });
        }
    },

    startSensors() {
        window.addEventListener('devicemotion', (e) => {
            if (!this.active) return;
            const acc = e.accelerationIncludingGravity;
            
            const pitch = (Math.atan2(-acc.x, Math.sqrt(acc.y**2 + acc.z**2)) * 180) / Math.PI;
            const roll = (Math.atan2(acc.y, acc.z) * 180) / Math.PI;

            const res = this.ukf.compute(acc, pitch);
            ScienceSocial.update(acc, res.vMs);

            // Update UI
            document.getElementById('sp-main').textContent = (res.vMs * 3.6).toFixed(2);
            document.getElementById('speed-stable-kmh').textContent = (res.vMs * 3.6).toFixed(1) + " km/h";
            document.getElementById('gradient-thermique').textContent = res.slope + " %";
            document.getElementById('pitch').textContent = pitch.toFixed(0) + "°";
            document.getElementById('roll').textContent = roll.toFixed(0) + "°";
            
            // Lorentz
            const gamma = 1 / Math.sqrt(1 - Math.pow(res.vMs/299792458, 2));
            document.getElementById('lorentz-factor').textContent = gamma.toFixed(10);

            // Shake POI
            if (Math.abs(acc.x) + Math.abs(acc.y) > 25) {
                const alert = document.getElementById('poi-alert');
                alert.style.display = 'block';
                setTimeout(() => alert.style.display = 'none', 2000);
            }
        });
    }
};

Dashboard.init();
