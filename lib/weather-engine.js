const WeatherEngine = {
    async init() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);

            setInterval(() => {
                analyser.getByteFrequencyData(data);
                const volume = data.reduce((a, b) => a + b) / data.length;
                
                // On injecte le volume dans le score de fluidité
                document.getElementById('score-fluidite').innerText = Math.floor(volume);
                
                // Simulation ou lecture Lux pour stabiliser l'UKF
                const lux = parseFloat(document.getElementById('env-lux')?.innerText) || 0;
                document.getElementById('light-lux').innerText = lux.toFixed(1);
            }, 100);
        } catch(e) { console.warn("Audio non autorisé, mode dégradé actif."); }
    }
};
