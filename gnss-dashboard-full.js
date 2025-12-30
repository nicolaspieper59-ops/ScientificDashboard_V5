/* ============================================================
   OMNISCIENCE V100 PRO - CONTRÔLEUR D'INTERFACE GLOBAL
   ============================================================ */

const UI = {
    engine: new UKFPro(),
    isRecording: false,
    blackBox: [],

    init() {
        this.bindButtons();
        this.startSensors();
        console.log("Système Omniscience Initialisé.");
    },

    bindButtons() {
        document.getElementById('start-btn').onclick = () => {
            this.isRecording = true;
            document.getElementById('start-btn').innerText = "SYSTÈME ACTIF";
            document.getElementById('start-btn').style.background = "#004400";
            document.getElementById('start-btn').style.color = "#0f0";
        };

        document.getElementById('reset-max-btn').onclick = () => {
            this.engine.gMax = 1.0;
            this.engine.distance3D = 0;
        };
    },

    startSensors() {
        if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', (e) => {
                if (!this.isRecording) return;

                const dt = 0.02; // 50Hz
                const acc = e.accelerationIncludingGravity;
                const gyro = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
                
                // Calculs Moteur
                const data = this.engine.computeInertial(acc, gyro, dt);
                const physics = this.engine.getRelativity(data.speedMs, 100); // Alt fixe 100m pour test

                this.updateDisplay(data, physics, acc, gyro);
            });
        }
    },

    updateDisplay(data, physics, acc, gyro) {
        // --- COLONNE 1 : SYSTÈME ---
        document.getElementById('jerk-vector').innerText = (acc.z / 0.02).toFixed(2) + " m/s³";
        
        // --- COLONNE 2 : VITESSE & RELATIVITÉ ---
        const vKmh = data.speedMs * 3.6;
        document.getElementById('sp-main').innerText = vKmh.toFixed(4);
        document.getElementById('speed-stable-kmh').innerText = vKmh.toFixed(1) + " km/h";
        document.getElementById('mach-number').innerText = physics.mach.toFixed(4);
        document.getElementById('lorentz-factor').innerText = physics.lorentz.toFixed(9);
        document.getElementById('time-dilation-vitesse').innerText = physics.dilation.toFixed(2) + " ns/j";
        
        // --- COLONNE 3 : DYNAMIQUE & SVT ---
        document.getElementById('g-force').innerText = data.gForce.toFixed(2);
        document.getElementById('air-density').innerText = physics.airDensity.toFixed(3) + " kg/m³";
        document.getElementById('mechanical-power').innerText = (70 * 9.81 * data.speedMs).toFixed(0) + " W";
        
        // --- COLONNE 4 : ASTRO & MINECRAFT ---
        this.updateMinecraftClock();
        document.getElementById('dist-3d').innerText = data.dist.toFixed(4);

        // NIVEAU À BULLE
        const pitch = Math.atan2(-acc.x, acc.z) * (180 / Math.PI);
        const roll = Math.atan2(acc.y, acc.z) * (180 / Math.PI);
        document.getElementById('pitch').innerText = pitch.toFixed(1) + "°";
        document.getElementById('roll').innerText = roll.toFixed(1) + "°";
        document.getElementById('bubble').style.transform = `translate(${roll}px, ${-pitch}px)`;
    },

    updateMinecraftClock() {
        const now = new Date();
        const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const daySeconds = 86400;
        // Rotation : 0s = 0°, 43200s (midi) = 180°, etc.
        const rotation = (seconds / daySeconds) * 360 + 90; 
        
        const clock = document.getElementById('minecraft-clock');
        if (clock) clock.style.transform = `rotate(${rotation}deg)`;
        
        // Update phase text
        const hour = now.getHours();
        const phaseText = (hour >= 6 && hour < 18) ? "Jour (☀️)" : "Nuit/Crépuscule (🌙)";
        document.getElementById('astro-phase').innerText = phaseText;
    }
};

// Initialisation globale
window.onload = () => UI.init();
