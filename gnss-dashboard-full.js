/** * GESTIONNAIRE DE DÉMARRAGE & ÉTAT DU SYSTÈME
 */
const SystemControl = {
    isGpsActive: false,

    init() {
        const startBtn = document.getElementById('start-btn');
        const gpsBtn = document.getElementById('gps-pause-toggle');

        // 1. Bouton Principal (Initialisation + Calibration)
        if (startBtn) {
            startBtn.onclick = () => this.launchFullSequence();
        }

        // 2. Bouton Marche/Arrêt GPS (Toggle)
        if (gpsBtn) {
            gpsBtn.onclick = () => this.toggleGps();
        }
    },

    async launchFullSequence() {
        const btn = document.getElementById('start-btn');
        
        // Demande de permissions pour mobile (iOS/Android)
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') return alert("Capteurs refusés.");
        }

        // Phase 1 : Calibration (3 secondes)
        btn.classList.add('calibrating');
        await startCalibration(); // Utilise la fonction de calibration créée précédemment
        
        // Phase 2 : Activation Système
        btn.classList.remove('calibrating');
        btn.style.background = "var(--success)";
        btn.textContent = "SYSTÈME OPÉRATIONNEL";
        
        // Phase 3 : Allumage automatique du GPS
        this.toggleGps(true);
    },

    toggleGps(forceState = null) {
        const gpsBtn = document.getElementById('gps-pause-toggle');
        this.isGpsActive = (forceState !== null) ? forceState : !this.isGpsActive;

        if (this.isGpsActive) {
            gpsBtn.textContent = "🛑 ARRÊT GPS";
            gpsBtn.style.background = "#ff4444";
            this.startGpsTracking();
        } else {
            gpsBtn.textContent = "▶️ MARCHE GPS";
            gpsBtn.style.background = "var(--col-nav)";
            this.stopGpsTracking();
        }
    },

    startGpsTracking() {
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => ukf.updateGPS(pos),
            (err) => console.error(err),
            { enableHighAccuracy: true, maximumAge: 0 }
        );
        document.getElementById('st-mode').textContent = "GNSS + IMU ACTIVE";
    },

    stopGpsTracking() {
        if (this.watchId) navigator.geolocation.clearWatch(this.watchId);
        document.getElementById('st-mode').textContent = "SENSEURS SEULS";
    }
};

// Lancement au chargement du DOM
document.addEventListener('DOMContentLoaded', () => SystemControl.init());
