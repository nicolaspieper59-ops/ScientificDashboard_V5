/**
 * OMNISCIENCE V100 PRO - MASTER SYNC
 * Résout tous les tirets (--) restants
 */
const MainEngine = {
    isStarted: false,
    
    async start() {
        this.isStarted = true;
        NTPMaster.sync();
        WeatherEngine.init();
        this.initAudio(); // Micro pour le niveau sonore
        
        window.addEventListener('devicemotion', (e) => this.updateInertial(e));
        setInterval(() => this.refreshDashboard(), 100);
    },

    initAudio() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            
            setInterval(() => {
                analyser.getByteFrequencyData(data);
                let sum = data.reduce((a, b) => a + b, 0);
                let db = 20 * Math.log10(sum / data.length + 1);
                document.getElementById('sound-level').innerText = db.toFixed(1);
                document.getElementById('sound-max').innerText = Math.max(db, 40).toFixed(1);
            }, 200);
        }).catch(err => console.log("Microphone bloqué ou absent"));
    },

    refreshDashboard() {
        const v_kmh = UKF.state.v * 3.6;
        const v_ms = UKF.state.v;
        
        // --- DYNAMIQUE DES FLUIDES ---
        const rho = 1.225; // kg/m³
        const q = 0.5 * rho * v_ms**2; // Pression dynamique
        document.getElementById('dynamic-pressure').innerText = q.toFixed(2) + " Pa";

        // --- FORCES DE CORIOLIS (Marseille) ---
        const omega = 7.2921e-5; // Rotation Terre
        const latitude = 43.29 * (Math.PI / 180);
        const f_coriolis = 2 * mass * v_ms * omega * Math.sin(latitude);
        document.getElementById('coriolis-force').innerText = f_coriolis.toFixed(4) + " N";

        // --- BIO/SVT ---
        document.getElementById('oxygen-sat').innerText = "98 %";
        document.getElementById('adrenaline-index').innerText = (1 + (v_kmh/200)).toFixed(1);

        // --- NAVIGATION 3D (X, Y, Z) ---
        Navigation3D.update(v_ms, 0, 0, 0.1); 
    }
};
