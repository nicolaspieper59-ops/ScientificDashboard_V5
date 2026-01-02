const Navigation3D = {
    records: [],
    
    async init() {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            await DeviceMotionEvent.requestPermission();
        }

        let orientation = { beta: 0, gamma: 0 };
        window.addEventListener('deviceorientation', (e) => {
            orientation = { beta: e.beta, gamma: e.gamma };
            document.getElementById('pitch').innerText = (e.beta || 0).toFixed(1) + "°";
            document.getElementById('roll').innerText = (e.gamma || 0).toFixed(1) + "°";
        });

        window.addEventListener('devicemotion', (e) => {
            const acc = e.accelerationIncludingGravity;
            const gSum = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2) / 9.81;
            
            // Sélecteur automatique de référentiel
            let mode = "EARTH";
            if (gSum < 0.1) mode = "SPACE";
            else if (gSum > 2.5) mode = "ACROBATICS";

            UKF.update(acc, e.rotationRate, orientation, mode);

            // Boîte Noire automatique
            if (this.records.length < 1000) {
                this.records.push({t: Date.now(), v: document.getElementById('speed-stable-ms').innerText});
            }
        });
    },

    save() {
        const blob = new Blob([JSON.stringify(this.records)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = "blackbox_omniscience.json";
        a.click();
    }
};

// Liaison bouton INITIALISER (ID du bouton dans ton HTML)
document.getElementById('start-btn-final').addEventListener('click', () => {
    Navigation3D.init();
    if (typeof WeatherEngine !== 'undefined') WeatherEngine.init();
});

document.getElementById('capture-data-btn').addEventListener('click', () => {
    Navigation3D.save();
});
