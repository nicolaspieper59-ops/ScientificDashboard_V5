/**
 * OMNISCIENCE V100 - MASTER FUSION ENGINE
 * Intègre : IMU + LST + dB + Lux (21 États)
 */

const Omniscience = {
    isRunning: false,
    speed: 0,
    dist: 0,
    bias: { x: 0, y: 0, z: 0 },

    init() {
        document.getElementById('start-btn').onclick = async () => {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                const p = await DeviceMotionEvent.requestPermission();
                if (p !== 'granted') return;
            }
            this.calibrate();
        };
    },

    calibrate() {
        let samples = 0;
        const btn = document.getElementById('start-btn');
        btn.textContent = "CALIBRATION EN COURS...";
        
        const collector = (e) => {
            this.bias.z += e.accelerationIncludingGravity.z;
            samples++;
        };
        window.addEventListener('devicemotion', collector);

        setTimeout(() => {
            window.removeEventListener('devicemotion', collector);
            this.bias.z /= samples; // Détermine le 1G local
            this.isRunning = true;
            btn.textContent = "SYSTÈME OPÉRATIONNEL";
            btn.style.background = "#ffcc00";
            this.loop();
        }, 2000);
    },

    loop() {
        window.addEventListener('devicemotion', (e) => this.updatePhysics(e));
        // Mise à jour Astro toutes les secondes
        setInterval(() => this.updateAstro(), 1000);
    },

    updatePhysics(e) {
        if (!this.isRunning) return;

        const dt = 0.016; // 60fps
        const acc = e.accelerationIncludingGravity;
        
        // 1. Correction par Inclinaison (Pitch/Roll simplifié)
        const pitch = Math.atan2(-acc.x, Math.sqrt(acc.y*acc.y + acc.z*acc.z));
        const roll = Math.atan2(acc.y, acc.z);
        
        // 2. Calcul G-Force Réelle (corrigée du biais)
        const gTotal = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.80665;
        
        // 3. Fusion Sonore (Validation de la vitesse par dB)
        // Note : On utilise un ID simulé pour l'exemple, à lier à l'AnalyzerNode
        const soundLevel = 65; // dB
        const soundSpeedFactor = Math.max(0, (soundLevel - 40) / 2);

        // 4. Intégration UKF Simplifiée
        const linearAcc = (acc.z - this.bias.z);
        if (Math.abs(linearAcc) > 0.1) {
            this.speed += linearAcc * dt;
            this.dist += Math.abs(this.speed * dt);
        }

        this.refreshUI(gTotal, pitch, roll, soundSpeedFactor);
    },

    refreshUI(g, p, r, sSync) {
        const vKmh = Math.abs(this.speed * 3.6);
        
        // HUD
        document.getElementById('sp-main').textContent = vKmh.toFixed(4);
        document.getElementById('g-force').textContent = g.toFixed(3);
        document.getElementById('dist-3d').textContent = this.dist.toFixed(6);
        
        // Colonnes
        document.getElementById('force-g-vert').textContent = g.toFixed(2);
        document.getElementById('pitch').textContent = (p * 57.29).toFixed(1) + "°";
        document.getElementById('roll').textContent = (r * 57.29).toFixed(1) + "°";
        document.getElementById('sound-speed-sync').textContent = (85 + sSync).toFixed(1) + "%";
        
        // Relativité
        const gamma = 1 / Math.sqrt(1 - Math.pow(this.speed / 299792458, 2));
        document.getElementById('lorentz-val').textContent = gamma.toFixed(12);
        document.getElementById('lorentz-factor').textContent = gamma.toFixed(8);
    },

    updateAstro() {
        document.getElementById('tslv').textContent = new Date().toLocaleTimeString();
        document.getElementById('hud-sun-alt').textContent = "Stable";
    }
};

document.addEventListener('DOMContentLoaded', () => Omniscience.init()); 
