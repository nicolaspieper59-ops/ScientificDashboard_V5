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
                document.getElementById('score-fluidite').innerText = Math.min(100, volume * 2).toFixed(0);
            }, 200);
        } catch(e) { console.log("Microphone non disponible"); }
    }
};
