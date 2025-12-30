const App = {
    isRunning: false,
    startTime: null,

    init() {
        document.getElementById('start-btn').onclick = async () => {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                const res = await DeviceMotionEvent.requestPermission();
                if (res !== 'granted') return alert("Permission requise.");
            }
            this.startSystem();
        };
    },

    startSystem() {
        this.isRunning = true;
        this.startTime = Date.now();
        document.getElementById('start-btn').textContent = "SYSTÈME ACTIF";
        document.getElementById('start-btn').style.background = "#ffcc00";

        // Boucle de mise à jour
        window.addEventListener('devicemotion', (e) => this.update(e));
        setInterval(() => this.updateAstro(), 1000);
    },

    update(e) {
        if (!this.isRunning) return;

        // Exemple de mapping vers les IDs uniques
        const accZ = e.accelerationIncludingGravity.z;
        const gForce = Math.abs(accZ / 9.80665).toFixed(2);
        
        document.getElementById('g-force').textContent = gForce;
        document.getElementById('force-g-vert').textContent = gForce;
        
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        document.getElementById('elapsed-time').textContent = elapsed + " s";
    },

    updateAstro() {
        // Remplacement des points de suspension par des données simulées ou calculées
        document.getElementById('tslv').textContent = new Date().toLocaleTimeString();
        document.getElementById('hud-sun-alt').textContent = "Stable";
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
