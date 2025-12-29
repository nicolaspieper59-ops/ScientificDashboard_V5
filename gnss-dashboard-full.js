const ukf = new ProfessionalUKF();
const VisionMicro = {
    prevFrame: null,
    async init() {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", frameRate: 60 } });
        this.video = document.createElement('video');
        this.video.srcObject = stream;
        this.video.play();
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
    },
    getFlow() {
        if (!this.video) return null;
        this.ctx.drawImage(this.video, 0, 0, 64, 64);
        const data = this.ctx.getImageData(0,0,64,64).data;
        // Analyse de flux simplifiée pour détection micro
        let flow = { x: 0, y: 0 }; 
        if(this.prevFrame) { /* ... logique corrélation ... */ }
        this.prevFrame = data;
        return flow;
    }
};

document.getElementById('start-btn').onclick = async () => {
    if (DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission();
    ukf.isRunning = true;
    await VisionMicro.init();
    
    window.addEventListener('devicemotion', (e) => {
        const flow = VisionMicro.getFlow();
        ukf.update(e, flow);
        if(Math.abs(e.acceleration.x) > 20) { // Detection POI
             document.getElementById('poi-alert').style.display = 'block';
             setTimeout(()=>document.getElementById('poi-alert').style.display='none', 2000);
        }
    });
};
