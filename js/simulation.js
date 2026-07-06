// js/simulation.js — CycleGuard 3D Bike Simulation (Three.js)

const TILT_CRASH_DEG = 72;
const MAX_SPEED = 10;
const ACCELERATION = 5;
const BRAKE_FORCE = 8;
const FRICTION = 2.5;
const LEAN_SPEED = 55;
const LEAN_RETURN = 35;
const STEER_SPEED = 1.2;
const STEER_RETURN = 2.0;
const ROAD_LENGTH = 800;

let scene, camera, renderer, clock;
let bikeGroup, roadGroup, envGroup, headlightPoint;
const keys = {};
let simAnimFrame = null;

const simState = {
  speed: 0, leanAngle: 0, steerAngle: 0,
  posX: 0, posZ: 0, crashed: false,
  impactG: 0, _prevSpeed: 0, sessionCrashes: 0
};

let simOnTelemetry = null;
let simOnCrash = null;

// ──────────────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────────────
function initSimulation(canvasEl, telemetryFn, crashFn) {
  simOnTelemetry = telemetryFn;
  simOnCrash = crashFn;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  scene.fog = new THREE.Fog(0x050505, 60, 300);

  const W = canvasEl.clientWidth, H = canvasEl.clientHeight;
  camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 600);
  camera.position.set(0, 4, 10);

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  scene.add(new THREE.AmbientLight(0x202020, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(10, 30, 20);
  scene.add(sun);
  headlightPoint = new THREE.PointLight(0xa3a3a3, 3, 25);
  scene.add(headlightPoint);

  buildRoad();
  buildBike();
  buildCity();
  buildStarfield();

  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  window.addEventListener('resize', () => {
    const W2 = canvasEl.clientWidth, H2 = canvasEl.clientHeight;
    camera.aspect = W2 / H2;
    camera.updateProjectionMatrix();
    renderer.setSize(W2, H2);
  });

  clock = new THREE.Clock();
  simAnimate();
}

// ──────────────────────────────────────────────────────────────────────
// ROAD
// ──────────────────────────────────────────────────────────────────────
function buildRoad() {
  if (roadGroup) scene.remove(roadGroup);
  roadGroup = new THREE.Group();
  scene.add(roadGroup);

  const roadGeo = new THREE.PlaneGeometry(10, ROAD_LENGTH);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x001133 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -ROAD_LENGTH / 2;
  roadGroup.add(road);

  // Center dashes
  for (let z = 0; z > -ROAD_LENGTH; z -= 12) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 5),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.85 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.01, z - 4);
    roadGroup.add(m);
  }
  // Side lines
  [-4.8, 4.8].forEach(x => {
    for (let z = 0; z > -ROAD_LENGTH; z -= 1) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.65 })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, z);
      roadGroup.add(m);
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// BIKE
// ──────────────────────────────────────────────────────────────────────
function buildBike() {
  if (bikeGroup) scene.remove(bikeGroup);
  bikeGroup = new THREE.Group();
  const cyanMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff, emissive: 0x252525, shininess: 120 });
  const darkMat = new THREE.MeshPhongMaterial({ color: 0xff8c00, emissive: 0x111111 });
  const blackMat = new THREE.MeshPhongMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 1.8), cyanMat);
  body.position.y = 0.85;
  bikeGroup.add(body);

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.75), darkMat);
  tank.position.set(0, 1.18, 0.2);
  bikeGroup.add(tank);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.7), blackMat);
  seat.position.set(0, 1.12, -0.3);
  bikeGroup.add(seat);

  const handleGeo = new THREE.BoxGeometry(0.95, 0.06, 0.06);
  const handle = new THREE.Mesh(handleGeo, new THREE.MeshPhongMaterial({ color: 0x404040 }));
  handle.position.set(0, 1.28, 0.64);
  bikeGroup.add(handle);

  const headGeo = new THREE.BoxGeometry(0.28, 0.18, 0.05);
  const headMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 2.5 });
  const headM = new THREE.Mesh(headGeo, headMat);
  headM.position.set(0, 0.9, 0.93);
  bikeGroup.add(headM);

  const wheelMat = new THREE.MeshPhongMaterial({ color: 0x191919, shininess: 40 });
  [0.78, -0.78].forEach(z => {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.1, 8, 20), wheelMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, 0.38, z);
    bikeGroup.add(wheel);
  });

  scene.add(bikeGroup);
}

// ──────────────────────────────────────────────────────────────────────
// ENVIRONMENTS
// ──────────────────────────────────────────────────────────────────────
function clearEnv() {
  if (envGroup) { scene.remove(envGroup); envGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  envGroup = new THREE.Group();
  scene.add(envGroup);
}

function buildCity() {
  clearEnv();
  scene.background = new THREE.Color(0x000a1f);
  scene.fog = new THREE.Fog(0x000a1f, 60, 280);
  const bColors = [0x002244, 0x003366, 0x001133];
  const accents = [0xffcc00, 0xff9900, 0xffd700, 0xffa500];
  for (let seg = 0; seg < 22; seg++) {
    const zBase = -seg * 35;
    [-1, 1].forEach(side => {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const w = 4 + Math.random() * 6, h = 10 + Math.random() * 45, d = 4 + Math.random() * 5;
        const x = side * (9 + i * 9 + Math.random() * 3);
        const z = zBase - i * 14 + Math.random() * 6;
        const mat = new THREE.MeshPhongMaterial({
          color: bColors[Math.floor(Math.random() * bColors.length)],
          emissive: accents[Math.floor(Math.random() * accents.length)],
          emissiveIntensity: 0.015 + Math.random() * 0.07
        });
        const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        bld.position.set(x, h / 2, z);
        envGroup.add(bld);
        // Windows
        const rows = Math.floor(h / 2.8), cols = Math.floor(w / 1.8);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (Math.random() > 0.45) {
              const wm = new THREE.Mesh(
                new THREE.BoxGeometry(0.55, 0.7, 0.05),
                new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xffcc00 : 0x001133, transparent: true, opacity: 0.85 })
              );
              wm.position.set(x + (c - cols / 2 + 0.5) * 1.5, 1.5 + r * 2.8, z + d / 2 + 0.04);
              envGroup.add(wm);
            }
          }
        }
      }
    });
    // Street lights
    [-5.8, 5.8].forEach(x => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 5, 6), new THREE.MeshPhongMaterial({ color: 0x2a2a2a }));
      pole.position.set(x, 2.5, zBase);
      envGroup.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf1f1f1 }));
      lamp.position.set(x + (x > 0 ? -0.4 : 0.4), 5.1, zBase);
      envGroup.add(lamp);
    });
  }
}

function buildMountain() {
  clearEnv();
  scene.background = new THREE.Color(0x070707);
  scene.fog = new THREE.Fog(0x070707, 40, 220);
  for (let i = 0; i < 32; i++) {
    const side = (Math.random() > 0.5 ? 1 : -1);
    const x = side * (18 + Math.random() * 70);
    const z = -Math.random() * ROAD_LENGTH;
    const h = 25 + Math.random() * 65;
    const r = 12 + Math.random() * 28;
    const mat = new THREE.MeshPhongMaterial({ color: 0x181818, emissive: 0x4c4c4c, emissiveIntensity: 0.025 });
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
    mtn.position.set(x, h / 2, z);
    envGroup.add(mtn);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, h * 0.22, 7), new THREE.MeshPhongMaterial({ color: 0xe7e7e7 }));
    snow.position.set(x, h, z);
    envGroup.add(snow);
  }
  for (let z = 0; z > -ROAD_LENGTH; z -= 16) {
    [-7, -10, 7, 10].forEach(x => {
      if (Math.random() > 0.5) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3, 6), new THREE.MeshPhongMaterial({ color: 0x262626 }));
        trunk.position.set(x, 1.5, z);
        envGroup.add(trunk);
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 7), new THREE.MeshPhongMaterial({ color: 0x393939 }));
        leaves.position.set(x, 5, z);
        envGroup.add(leaves);
      }
    });
  }
}

function buildBeach() {
  clearEnv();
  scene.background = new THREE.Color(0x070707);
  scene.fog = new THREE.Fog(0x070707, 55, 260);
  // Ocean
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(180, ROAD_LENGTH), new THREE.MeshPhongMaterial({ color: 0x0066ff, emissive: 0x002266, emissiveIntensity: 0.35, transparent: true, opacity: 0.82 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-100, -0.1, -ROAD_LENGTH / 2);
  envGroup.add(ocean);
  // Sand
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(180, ROAD_LENGTH), new THREE.MeshLambertMaterial({ color: 0xffcc00 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(100, 0, -ROAD_LENGTH / 2);
  envGroup.add(sand);
  // Moon shimmer
  const shimmer = new THREE.Mesh(new THREE.PlaneGeometry(10, 80), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 }));
  shimmer.rotation.x = -Math.PI / 2;
  shimmer.position.set(-50, 0.05, -200);
  envGroup.add(shimmer);
  // Palms
  for (let z = 0; z > -ROAD_LENGTH; z -= 28) {
    if (Math.random() > 0.35) {
      const x = 8 + Math.random() * 20;
      const h = 6 + Math.random() * 5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, h, 6), new THREE.MeshPhongMaterial({ color: 0x404040 }));
      trunk.position.set(x, h / 2, z);
      trunk.rotation.z = (Math.random() - 0.5) * 0.3;
      envGroup.add(trunk);
      const top = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 5), new THREE.MeshPhongMaterial({ color: 0x5c5c5c }));
      top.scale.y = 0.32;
      top.position.set(x + (Math.random() - 0.5) * 0.5, h + 0.4, z);
      envGroup.add(top);
    }
  }
}

function buildStarfield() {
  const n = 2000;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 600;
    pos[i * 3 + 1] = 20 + Math.random() * 180;
    pos[i * 3 + 2] = Math.random() * -ROAD_LENGTH;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, transparent: true, opacity: 0.75 })));
}

// ──────────────────────────────────────────────────────────────────────
// PHYSICS UPDATE
// ──────────────────────────────────────────────────────────────────────
function simUpdate(dt) {
  if (simState.crashed) return;

  // Speed
  if (keys['w'] || keys['W']) {
    simState.speed = Math.min(simState.speed + ACCELERATION * dt, MAX_SPEED);
  } else if (keys['s'] || keys['S']) {
    simState.speed = Math.max(simState.speed - BRAKE_FORCE * dt, -2);
  } else {
    const f = FRICTION * dt;
    simState.speed = simState.speed > 0 ? Math.max(simState.speed - f, 0) : Math.min(simState.speed + f, 0);
  }

  // Lean (arrow keys)
  if (keys['ArrowLeft']) {
    simState.leanAngle = Math.max(simState.leanAngle - LEAN_SPEED * dt, -90);
  } else if (keys['ArrowRight']) {
    simState.leanAngle = Math.min(simState.leanAngle + LEAN_SPEED * dt, 90);
  } else {
    const ret = LEAN_RETURN * dt;
    if (Math.abs(simState.leanAngle) <= ret) simState.leanAngle = 0;
    else simState.leanAngle -= Math.sign(simState.leanAngle) * ret;
  }

  // Steer (A/D)
  if (keys['a'] || keys['A']) simState.steerAngle = Math.max(simState.steerAngle - STEER_SPEED * dt, -0.55);
  else if (keys['d'] || keys['D']) simState.steerAngle = Math.min(simState.steerAngle + STEER_SPEED * dt, 0.55);
  else {
    const ret = STEER_RETURN * dt;
    if (Math.abs(simState.steerAngle) <= ret) simState.steerAngle = 0;
    else simState.steerAngle -= Math.sign(simState.steerAngle) * ret;
  }

  // Impact G (sim approximation)
  const speedDelta = Math.abs(simState.speed - simState._prevSpeed) / Math.max(dt, 0.01);
  simState.impactG = Math.min(0.5 + speedDelta * 0.2 + Math.abs(simState.leanAngle) * 0.008, 5);
  simState._prevSpeed = simState.speed;

  // Crash check
  if (Math.abs(simState.leanAngle) > TILT_CRASH_DEG) {
    triggerSimCrash('Tilt Crash — Lean angle exceeded 72°');
    return;
  }

  // Move bike
  simState.posX -= Math.sin(simState.steerAngle) * simState.speed * dt;
  simState.posZ -= Math.cos(simState.steerAngle) * simState.speed * dt;
  simState.posX = Math.max(-4.2, Math.min(4.2, simState.posX));
  if (simState.posZ < -ROAD_LENGTH + 50) { simState.posZ += ROAD_LENGTH - 100; bikeGroup.position.z += ROAD_LENGTH - 100; }

  bikeGroup.position.x = simState.posX;
  bikeGroup.position.z = simState.posZ;
  bikeGroup.rotation.y = simState.steerAngle;
  bikeGroup.rotation.z = -simState.leanAngle * Math.PI / 180;

  if (headlightPoint) headlightPoint.position.set(simState.posX, 3, simState.posZ - 2);

  // Camera lerp
  const camTargX = simState.posX - Math.sin(simState.steerAngle) * 5;
  const camTargZ = simState.posZ + 8;
  camera.position.x += (camTargX - camera.position.x) * 7 * dt;
  camera.position.y += (4.2 - camera.position.y) * 5 * dt;
  camera.position.z += (camTargZ - camera.position.z) * 7 * dt;
  camera.lookAt(simState.posX, 0.8, simState.posZ - 4);

  // Telemetry
  if (simOnTelemetry) {
    const kmh = (simState.speed / MAX_SPEED) * 120;
    simOnTelemetry(kmh, simState.leanAngle, simState.impactG);
  }
}

function triggerSimCrash(reason) {
  simState.crashed = true;
  simState.sessionCrashes++;
  bikeGroup.rotation.z = (simState.leanAngle >= 0 ? 1 : -1) * (Math.PI / 2);
  if (simOnCrash) simOnCrash(reason, simState.leanAngle, simState.impactG, new Date());
}

function resetSimulation() {
  Object.assign(simState, { speed: 0, leanAngle: 0, steerAngle: 0, posX: 0, posZ: 0, crashed: false, impactG: 0, _prevSpeed: 0 });
  bikeGroup.position.set(0, 0, 0);
  bikeGroup.rotation.set(0, 0, 0);
  camera.position.set(0, 4, 10);
}

function simAnimate() {
  simAnimFrame = requestAnimationFrame(simAnimate);
  const dt = Math.min(clock.getDelta(), 0.05);
  // Spin wheels
  if (!simState.crashed && bikeGroup) {
    bikeGroup.children.forEach(c => { if (c.geometry && c.geometry.type === 'TorusGeometry') c.rotation.x += simState.speed * dt * 3.5; });
  }
  simUpdate(dt);
  renderer.render(scene, camera);
}

function stopSimulation() {
  if (simAnimFrame) { cancelAnimationFrame(simAnimFrame); simAnimFrame = null; }
}

function switchEnv(mode) {
  if (mode === 'city') buildCity();
  else if (mode === 'mountain') buildMountain();
  else if (mode === 'beach') buildBeach();
}
