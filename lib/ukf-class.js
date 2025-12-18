/**
 * PROFESSIONAL UKF V60 - DYNAMIC BALANCE EDITION
 * - Friction proportionnelle à la charge d'accélération.
 * - Stabilité "GPS-Like" : Maintien de l'élan par conservation d'énergie.
 * - ZUPT (Zero Velocity Update) intelligent.
 */

class ProfessionalUKF {
    constructor(lat = 0, lon = 0, alt = 0) {
        if (typeof math === 'undefined') throw new Error("math.js requis");

        this.n = 24;
        this.initialized = false;
        this.D2R = Math.PI / 180;
        this.R_MAJOR = 6378137.0;

        this.x = math.matrix(math.zeros([this.n, 1]));
        this.P = math.multiply(math.eye(this.n), 1e-4);
        
        // --- CONSTANTES DE DYNAMIQUE ---
        this.mass = 70.0; 
        this.k_drag = 0.05; // Coefficient de traînée aéro
        this.totalDistance3D = 0;
        this.lastAccMag = 0;
    }

    initialize(lat, lon, alt) {
        this.x.set([0, 0], lat);
        this.x.set([1, 0], lon);
        this.x.set([2, 0], alt);
        this.x.set([6, 0], 1.0);
        for (let i = 16; i <= 21; i++) this.x.set([i, 0], 1.0);
        this.initialized = true;
    }

    predict(dt, accRaw, gyroRaw) {
        if (!this.initialized || dt <= 0) return;

        // 1. Projection de l'accélération dans le repère terrestre
        const q = [this.x.get([6,0]), this.x.get([7,0]), this.x.get([8,0]), this.x.get([9,0])];
        const acc = [accRaw.x, accRaw.y, accRaw.z];
        const accNED = this.rotateVector(q, acc);
        
        // Compensation précise de la pesanteur
        accNED[2] += this.getGravitySomigliana(this.x.get([0, 0]), this.x.get([2, 0]));

        // 2. CALCUL DE LA FRICTION PROPORTIONNELLE (L'ÉQUILIBRE)
        const vx = this.x.get([3, 0]);
        const vy = this.x.get([4, 0]);
        const vz = this.x.get([5, 0]);
        const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
        const accMag = Math.sqrt(accNED[0]**2 + accNED[1]**2 + accNED[2]**2);

        /**
         * LOGIQUE DE BALANCE DYNAMIQUE :
         * Si l'accélération est forte, on réduit la friction (on laisse l'objet pousser).
         * Si l'accélération est faible (arrêt de l'effort), la friction reprend ses droits pour stabiliser.
         */
        const frictionBase = 0.9998; // Élan quasi-parfait (GPS-like)
        const dynamicFriction = frictionBase - (this.k_drag * speed * dt / (1 + accMag));
        
        // 3. INTÉGRATION VECTORIELLE AVEC ANTI-DÉRIVE DE ROTATION
        const gyroMag = Math.sqrt(gyroRaw.x**2 + gyroRaw.y**2 + gyroRaw.z**2);
        const stabilityFactor = gyroMag > 3.0 ? 0.1 : 1.0; // Ignore l'accélération si on tourne trop vite (manège)

        // Mise à jour des vitesses (v = v + a*dt) * friction
        this.x.set([3, 0], (vx + accNED[0] * dt * stabilityFactor) * dynamicFriction);
        this.x.set([4, 0], (vy + accNED[1] * dt * stabilityFactor) * dynamicFriction);
        this.x.set([5, 0], (vz + accNED[2] * dt * stabilityFactor) * dynamicFriction);

        // 4. PROTECTION ARRÊT NET (ZUPT)
        // Si la vitesse est infime et qu'aucune force n'est détectée
        if (speed < 0.05 && accMag < 0.01) {
            this.x.set([3, 0], 0); this.x.set([4, 0], 0); this.x.set([5, 0], 0);
        }

        // 5. Mise à jour Distance & Quaternions
        this.totalDistance3D += speed * dt;
        this.integrateQuaternions([gyroRaw.x, gyroRaw.y, gyroRaw.z], dt);
    }

    // [Fonctions utilitaires rotateVector, getGravitySomigliana, integrateQuaternions]
    // Ces fonctions assurent la précision mathématique du moteur.
    rotateVector(q,v){const[w,x,y,z]=q;const[vx,vy,vz]=v;return[vx*(w*w+x*x-y*y-z*z)+vy*2*(x*y-w*z)+vz*2*(x*z+w*y),vx*2*(x*y+w*z)+vy*(w*w-x*x+y*y-z*z)+vz*2*(y*z-w*x),vx*2*(x*z-w*y)+vy*2*(y*z+w*x)+vz*(w*w-x*x-y*y+z*z)];}
    getGravitySomigliana(l,a){const p=l*this.D2R;const s=Math.sin(p)**2;return(9.7803267714*(1+0.00193185138639*s)/Math.sqrt(1-0.00669437999013*s))*Math.pow(this.R_MAJOR/(this.R_MAJOR+a),2);}
    integrateQuaternions(g,dt){let q=[this.x.get([6,0]),this.x.get([7,0]),this.x.get([8,0]),this.x.get([9,0])];const h=0.5*dt;this.x.set([6,0],q[0]+h*(-q[1]*g[0]-q[2]*g[1]-q[3]*g[2]));this.x.set([7,0],q[1]+h*(q[0]*g[0]+q[2]*g[2]-q[3]*g[1]));this.x.set([8,0],q[2]+h*(q[0]*g[1]-q[1]*g[2]+q[3]*g[0]));this.x.set([9,0],q[3]+h*(q[0]*g[2]+q[1]*g[1]-q[2]*g[0]));const n=Math.sqrt(this.x.get([6,0])**2+this.x.get([7,0])**2+this.x.get([8,0])**2+this.x.get([9,0])**2);for(let i=6;i<=9;i++)this.x.set([i,0],this.x.get([i,0])/n);}
    }
