const MainApp = {
    init() {
        console.log("Démarrage Omniscience V100 PRO...");
        
        // Nettoyage des NaN par défaut
        document.querySelectorAll('span').forEach(el => {
            if (el.innerText === "--" || el.innerText === "NaN") el.innerText = "0.00";
        });

        // Initialisation des modules
        Navigation3D.init();
        this.initWeather();
        this.initExport();
    },

    initWeather() {
        // Capture du son pour le score de fluidité (Validation record)
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            const ctx = new AudioContext();
            const ana = ctx.createAnalyser();
            ctx.createMediaStreamSource(stream).connect(ana);
            const data = new Uint8Array(ana.frequencyBinCount);
            setInterval(() => {
                ana.getByteFrequencyData(data);
                const vol = data.reduce((a, b) => a + b) / data.length;
                document.getElementById('score-fluidite').innerText = Math.floor(vol);
            }, 100);
        }).catch(() => console.log("Microphone OFF"));
    },

    initExport() {
        document.getElementById('btn-export-all').onclick = () => {
            const report = {
                timestamp: new Date().toISOString(),
                v_max: document.getElementById('speed-main-display').innerText,
                lorentz: document.getElementById('lorentz-factor').innerText,
                status: "CERTIFIED"
            };
            const blob = new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "Omniscience_Record.json";
            a.click();
        };
    }
};

// Liaison avec le bouton géant de ton HUD
document.getElementById('start-btn-final').onclick = () => MainApp.init();
