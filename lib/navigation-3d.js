let currentPitch = 0;
let currentRoll = 0;

window.addEventListener('deviceorientation', (event) => {
    currentPitch = event.beta;  // Inclinaison avant/arrière
    currentRoll = event.gamma; // Inclinaison gauche/droite
    document.getElementById('pitch').innerText = currentPitch.toFixed(1) + "°";
    document.getElementById('roll').innerText = currentRoll.toFixed(1) + "°";
});

window.addEventListener('devicemotion', (event) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    // On envoie les données brutes + l'inclinaison actuelle à l'UKF
    UKF.update(acc, event.rotationRate, 0.02, currentPitch, currentRoll);
});
