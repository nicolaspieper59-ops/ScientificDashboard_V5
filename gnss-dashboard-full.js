const MainApp = {
    async start() {
        // 1. Initialiser les variables à 0 pour éviter NaN
        document.querySelectorAll('span').forEach(s => { if(s.innerText === "--") s.innerText = "0"; });
        
        // 2. Lancer les modules
        await WeatherEngine.init();
        this.initInertial();
        this.initVoice();
        
        document.getElementById('btn-export-all').onclick = () => SeismicReporter.exportJSON();
        console.log("Omniscience V100 PRO : Systèmes nominaux.");
    },

    initInertial() {
        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity;
            const gyro = e.rotationRate;
            if (acc && gyro) {
                UKF.update({x: acc.x, y: acc.y, z: acc.z}, gyro, 0.02);
            }
        });
    },

    initVoice() {
        const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (Speech) {
            const rec = new Speech();
            rec.continuous = true;
            rec.onresult = (e) => {
                if (e.results[e.results.length-1][0].transcript.includes("snapshot")) {
                    this.takeSnapshot();
                }
            };
            rec.start();
        }
    },

    takeSnapshot() {
        const snap = {
            t: new Date().toISOString(),
            v: document.getElementById('speed-stable-ms').innerText
        };
        let snaps = JSON.parse(localStorage.getItem('voice_snapshots') || "[]");
        snaps.push(snap);
        localStorage.setItem('voice_snapshots', JSON.stringify(snaps));
        document.body.style.border = "5px solid gold";
        setTimeout(() => document.body.style.border = "none", 500);
    }
};

document.getElementById('btn-init').onclick = () => MainApp.start();
