/**
 * OMNISCIENCE V100 - CONTRÔLEUR MASTER
 */
const ukf = new ProfessionalUKF();

const ConfigManager = {
    init() {
        this.initTheme();
        this.loadSettings();
        document.querySelectorAll('select, input').forEach(el => {
            el.addEventListener('change', () => this.saveSettings());
        });
    },
    initTheme() {
        const btn = document.getElementById('toggle-mode-btn');
        const saved = localStorage.getItem('omni-theme') || 'dark-mode';
        document.body.className = saved;
        btn.onclick = () => {
            document.body.classList.toggle('light-mode');
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('omni-theme', document.body.className);
            this.updateThemeBtn();
        };
        this.updateThemeBtn();
    },
    updateThemeBtn() {
        const btn = document.getElementById('toggle-mode-btn');
        const isDark = document.body.classList.contains('dark-mode');
        btn.innerHTML = isDark ? '🌙 Mode Nuit' : '☀️ Mode Jour';
    },
    saveSettings() {
        const data = { mass: document.getElementById('mass-input').value, env: document.getElementById('environment-select').value };
        localStorage.setItem('omni-settings', JSON.stringify(data));
    },
    loadSettings() {
        const saved = JSON.parse(localStorage.getItem('omni-settings'));
        if (saved) {
            document.getElementById('mass-input').value = saved.mass;
            document.getElementById('environment-select').value = saved.env;
        }
    }
};

async function startCalibration() {
    const btn = document.getElementById('start-btn');
    let samples = [];
    let timeLeft = 3;
    
    btn.disabled = true;
    const timer = setInterval(() => {
        btn.textContent = `CALIBRATION : ${timeLeft}s`;
        if (timeLeft-- <= 0) clearInterval(timer);
    }, 1000);

    const collect = (e) => samples.push({x: e.accelerationIncludingGravity.x, y: e.accelerationIncludingGravity.y, z: e.accelerationIncludingGravity.z});
    window.addEventListener('devicemotion', collect);

    setTimeout(() => {
        window.removeEventListener('devicemotion', collect);
        ukf.calibrate(samples);
        ukf.isRunning = true;
        btn.textContent = "SYSTÈME ACTIF";
        btn.style.background = "#00ff88";
        loop();
    }, 3500);
}

function loop() {
    window.addEventListener('devicemotion', (e) => {
        ukf.update(e);
        // Mise à jour des IDs clés
        document.getElementById('sp-main').textContent = (ukf.vel.ms * 3.6).toFixed(4);
        document.getElementById('dist-3d').textContent = ukf.distance3D.toFixed(6);
        document.getElementById('g-force').textContent = ukf.gForce.toFixed(2);
        
        const gamma = 1 / Math.sqrt(1 - (ukf.vel.ms/299792458)**2 || 1);
        document.getElementById('lorentz-val').textContent = gamma.toFixed(12);
        document.getElementById('local-time').textContent = new Date().toLocaleTimeString();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    ConfigManager.init();
    document.getElementById('start-btn').onclick = startCalibration;
});
