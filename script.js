// script.js (full)
// Third-person + First-person viewer with lamp toggle - FIXED SHADOW CAMERAS

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ------------------------- UI helpers -------------------------
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
function log(...args) {
  console.log(...args);
  const line = document.createElement("div");
  line.textContent = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  logEl.prepend(line);
  if (logEl.childElementCount > 200) logEl.removeChild(logEl.lastChild);
}
function setStatus(text) { statusEl.textContent = text; }

// ------------------------- Scene + Renderer -------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0c8ff);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Tone mapping for better lighting
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.2;
document.body.appendChild(renderer.domElement);

// ------------------------- Lights -------------------------
// Basic ambient light
const ambient = new THREE.AmbientLight(0x404040, 0.3);
scene.add(ambient);

// Store references to Blender lights
let blenderLights = [];
let lampLight = null; // The specific lamp light we control with 'L' key

// ------------------------- Ground -------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.MeshStandardMaterial({ color: 0x777777 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.position.y = -0.1;
scene.add(ground);

// ------------------------- Player & Character -------------------------
const player = new THREE.Object3D();
player.position.set(0, 0, 5);
scene.add(player);

// placeholder visible character until model loads
const placeholder = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x2266ff })
);
placeholder.castShadow = true;
placeholder.receiveShadow = true;
placeholder.position.y = 0.9;
player.add(placeholder);

// animation mixer / actions holder
let characterModel = null;
let mixer = null;
let idleAction = null;
let walkAction = null;

// ------------------------- Lamp detection + variables -------------------------
let lampMesh = null;      // the mesh to glow (Plane001_3)
let lampState = 0;        // 0 = off, 1 = on
let lampAnim = 0;         // 0..1 lerp value used for smooth fade

// ------------------------- Custom Shader for Lamp -------------------------
const lampVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lampFragmentShader = `
  uniform vec3 baseColor;
  uniform vec3 emissiveColor;
  uniform float emissiveIntensity;
  
  varying vec2 vUv;
  
  void main() {
    // Start with light gray base, add yellow emissive glow
    vec3 finalColor = baseColor + (emissiveColor * emissiveIntensity);
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ------------------------- Loaders & model loading -------------------------
const loader = new GLTFLoader();

// Change this path if you moved the GLB outside src (for large files).
// If your model is in public/model.glb use "/model.glb" instead.
const MODEL_PATH = new URL("../assets/model2.glb", import.meta.url).href;
const CHARACTER_PATH = new URL("../assets/red_animator_vs_animation.glb", import.meta.url).href;

loader.load(MODEL_PATH, (gltf) => {
  const model = gltf.scene;
  
  console.group("=== MODEL DEBUG INFO ===");
  let meshCount = 0;
  let lightCount = 0;
  
  // First pass: Identify lights
  model.traverse((n) => {
    if (n.isMesh) {
      meshCount++;
      console.log(`Mesh ${meshCount}:`, n.name, "Material:", n.material?.type);
    }
    if (n instanceof THREE.Light) {
      lightCount++;
      console.log(`Light ${lightCount}:`, n.type, n.name, "Intensity:", n.intensity, "Color:", n.color);
      blenderLights.push(n);
    }
  });
  console.groupEnd();
  
  // Configure ALL meshes for proper Three.js lighting and shadows
  model.traverse((n) => {
    if (n.isMesh) {
      // Enable shadows for ALL meshes
      n.castShadow = true;
      n.receiveShadow = true;
      
      // Ensure materials work with Three.js lighting
      if (n.material) {
        // Convert to MeshStandardMaterial if it's not already (for all objects)
        if (!n.material.isMeshStandardMaterial && !n.material.isShaderMaterial) {
          const oldMat = n.material;
          n.material = new THREE.MeshStandardMaterial({
            color: oldMat.color || new THREE.Color(0xffffff),
            map: oldMat.map,
            transparent: oldMat.transparent,
            opacity: oldMat.opacity !== undefined ? oldMat.opacity : 1.0,
            metalness: 0.1,
            roughness: 0.8
          });
          console.log(`Converted material for: ${n.name}`);
        }
        
        // Ensure material properties work with shadows
        n.material.needsUpdate = true;
      }

      // Handle specific objects (lamp and cube)
      if (n.name === "Plane001_3") {
        // For lamp: Use ShaderMaterial with LIGHT GRAY base color
        const lampShaderMaterial = new THREE.ShaderMaterial({
          uniforms: {
            baseColor: { value: new THREE.Color(0xCCCCCC) }, // LIGHT GRAY base
            emissiveColor: { value: new THREE.Color(0x000000) }, // Start with no glow
            emissiveIntensity: { value: 0.0 }
          },
          vertexShader: lampVertexShader,
          fragmentShader: lampFragmentShader,
          side: THREE.DoubleSide
        });

        n.material = lampShaderMaterial;
        lampMesh = n;
        log("LAMP FOUND: Plane001_3 - ShaderMaterial applied");
      }
    }
  });

  scene.add(model);
  
  // FIND AND CONFIGURE THE LAMP LIGHT "point.001"
  let foundLampLight = false;
  scene.traverse((obj) => {
    if (obj instanceof THREE.Light && obj.name === "Point") {
      lampLight = obj;
      console.log("Found lamp light  :", lampLight.type, "Original intensity:", lampLight.intensity);
      
      // Store original intensity and start with light OFF
      lampLight.userData.originalIntensity = lampLight.intensity;
      lampLight.intensity = 0; // Start OFF
      lampLight.visible = true; // But keep it visible for when we turn it on
      
      foundLampLight = true;
      log("Lamp light 'point.001' configured - starts OFF, controlled by L key");
    }
  });
   

  if (!foundLampLight) {
    log("WARNING: Lamp light 'point.001' not found in scene");
  }

  // CONFIGURE ALL BLENDER LIGHTS with PROPER SHADOW CAMERAS
  blenderLights.forEach(light => {
    if (light !== lampLight) { // Don't modify the lamp light twice
      // Reduce intensity for other lights to prevent overbrightness
      light.intensity = light.intensity * 0.3; // 30% of original
      console.log(`Other light ${light.name} intensity: ${light.intensity}`);
    }
    
    // Configure shadows for all lights with PROPER CAMERA SETTINGS
    if (light.castShadow !== undefined) {
      light.castShadow = true;
      if (light.shadow) {
        light.shadow.mapSize.width = 2048; // Higher resolution
        light.shadow.mapSize.height = 2048;
        light.shadow.bias = -0.0001;
        
        // FIX SHADOW CAMERA FOR DIFFERENT LIGHT TYPES
        if (light.isDirectionalLight && light.shadow.camera) {
          // Directional light (like sun) - make shadow camera cover entire building
          light.shadow.camera.near = 0.1;
          light.shadow.camera.far = 200; // Cover large area
          light.shadow.camera.left = -50;
          light.shadow.camera.right = 50;
          light.shadow.camera.top = 50;
          light.shadow.camera.bottom = -50;
          console.log(`Directional light shadow camera configured for ${light.name}`);
        }
        else if (light.isPointLight && light.shadow.camera) {
          // Point light - make shadow camera cover reasonable area
          light.shadow.camera.near = 0.1;
          light.shadow.camera.far = 100; // Increased far distance
          console.log(`Point light shadow camera configured for ${light.name}`);
        }
        else if (light.isSpotLight && light.shadow.camera) {
          // Spot light
          light.shadow.camera.near = 0.1;
          light.shadow.camera.far = 100;
          console.log(`Spot light shadow camera configured for ${light.name}`);
        }
        
        // Update the shadow camera
        light.shadow.camera.updateProjectionMatrix();
      }
    }
  });

  log(`Model loaded: ${MODEL_PATH} - ${meshCount} meshes, ${lightCount} Blender lights`);
  log(`All lights ON except lamp light (point.001) - use L key to toggle lamp`);
  setStatus("Model loaded — All lights ON, Lamp: OFF (press L)");
  
  // Force immediate render
  renderer.render(scene, camera);
  
}, undefined, (err) => {
  console.error("Model load error:", err);
  setStatus("Model failed to load. See console.");
});

// character loader (optional)
const charLoader = new GLTFLoader();
charLoader.load(CHARACTER_PATH, (gltf) => {
  const c = gltf.scene;
  // FIX: Character 3x bigger
  c.scale.set(3, 3, 3);
  c.traverse(n => { 
    if (n.isMesh) { 
      n.castShadow = true; 
      n.receiveShadow = true; 
    } 
  });

  c.position.y = 0;
  player.remove(placeholder);
  player.add(c);
  characterModel = c;

  if (gltf.animations && gltf.animations.length) {
    mixer = new THREE.AnimationMixer(c);
    idleAction = mixer.clipAction(gltf.animations[0]);
    idleAction.play();
    let walkClip = gltf.animations.find(a => /walk|run|locomotion/i.test(a.name));
    if (!walkClip && gltf.animations.length > 1) walkClip = gltf.animations[1];
    if (walkClip) walkAction = mixer.clipAction(walkClip);
  }

  log("Character loaded - 3x scale");
}, undefined, (err) => {
  log("Character load failed:", err);
});

// ------------------------- Controls -------------------------
const fpsControls = new PointerLockControls(camera, document.body);
const tpsControls = new OrbitControls(camera, renderer.domElement);
tpsControls.enablePan = true;
tpsControls.enableDamping = true;
tpsControls.dampingFactor = 0.05;
tpsControls.minDistance = 2;
tpsControls.maxDistance = 6;
tpsControls.maxPolarAngle = Math.PI/2 - 0.05;

camera.position.set(0, 2, 3);
tpsControls.target.copy(player.position);

// UI buttons
document.getElementById("fpsBtn").addEventListener("click", () => {
  setMode("FPS"); 
  fpsControls.lock();
});
document.getElementById("tpsBtn").addEventListener("click", () => {
  setMode("TPS"); 
  fpsControls.unlock();
});
document.getElementById("scanBtn").addEventListener("click", () => {
  log("Manual mesh scan:");
  scene.traverse(o => { 
    if (o.isMesh) log("mesh:", o.name, "material:", o.material?.name); 
    if (o instanceof THREE.Light) log("light:", o.type, o.name, "intensity:", o.intensity, "visible:", o.visible);
  });
});

// mode state
let mode = "TPS";
function setMode(m) {
  mode = m;
  if (mode === "TPS") {
    tpsControls.enabled = true;
    setStatus(`Third-Person — Lamp: ${lampState ? "ON" : "OFF"} (L toggle)`);
  } else {
    tpsControls.enabled = false;
    setStatus(`First-Person — Lamp: ${lampState ? "ON" : "OFF"} (L toggle)`);
  }
}
setMode("TPS");

// ------------------------- Input (WASD + L) -------------------------
const keys = { w:false, a:false, s:false, d:false };
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;

  if (e.code === "KeyL") {
    lampState = lampState ? 0 : 1;
    setStatus(`${mode === "TPS" ? "Third-Person" : "First-Person"} — Lamp: ${lampState ? "ON" : "OFF"} (L)`);
    log("Lamp toggled =>", lampState ? "ON" : "OFF");
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
});

// ------------------------- Improved Movement System -------------------------
function fpsForwardVector(out) {
  const obj = fpsControls.getObject ? fpsControls.getObject() : camera;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(obj.quaternion);
  dir.y = 0; dir.normalize();
  out.copy(dir);
}

// ------------------------- Animate loop -------------------------
const clock = new THREE.Clock();
const walkSpeed = 5.0;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (mixer) mixer.update(dt);

  // lamp animation smoothing
  const target = lampState ? 1 : 0;
  lampAnim = THREE.MathUtils.lerp(lampAnim, target, 0.15);

  // Update lamp mesh glow
  if (lampMesh && lampMesh.material.isShaderMaterial) {
    // Update shader uniforms for lamp glow
    const r = lampAnim * 1.0;    // Full red
    const g = lampAnim * 0.9;    // High green for yellow
    const b = lampAnim * 0.3;    // Low blue for yellow
    
    // Update shader uniforms
    lampMesh.material.uniforms.emissiveColor.value.set(r, g, b);
    lampMesh.material.uniforms.emissiveIntensity.value = lampAnim * 2.0;
    
    // Keep base color light gray
    lampMesh.material.uniforms.baseColor.value.set(0xCCCCCC);
  }
  
  // Control the Blender lamp light intensity
  if (lampLight) {
    lampLight.intensity = lampAnim * (lampLight.userData.originalIntensity || 1.0);
  }

  // movement
  let move = new THREE.Vector3();

  if (mode === "FPS") {
    const f = new THREE.Vector3(); fpsForwardVector(f);
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0,1,0)).normalize();
    if (keys.w) move.add(f);
    if (keys.s) move.sub(f);
    if (keys.a) move.sub(right);
    if (keys.d) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize();
      player.position.add(move.multiplyScalar(walkSpeed * dt));
      const head = player.position.clone(); head.y += 1.6;
      camera.position.copy(head);
      const obj = fpsControls.getObject ? fpsControls.getObject() : camera;
      const e = new THREE.Euler(0,0,0,"YXZ"); e.setFromQuaternion(obj.quaternion);
      player.rotation.y = THREE.MathUtils.lerpAngle(player.rotation.y, e.y, 0.3);
      if (walkAction && idleAction) {
        if (!walkAction.isRunning()) {
          idleAction.fadeOut(0.2);
          walkAction.reset().fadeIn(0.2).play();
        }
      }
    } else {
      if (walkAction && idleAction) {
        if (!idleAction.isRunning()) {
          walkAction.fadeOut(0.2);
          idleAction.reset().fadeIn(0.2).play();
        }
      }
    }

  } else {
    // TPS - Improved camera-relative movement
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    
    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();

    if (keys.w) move.add(cameraDirection);
    if (keys.s) move.sub(cameraDirection);
    if (keys.a) move.add(cameraRight);
    if (keys.d) move.sub(cameraRight);

    if (move.lengthSq() > 0) {
      move.normalize();
      player.position.add(move.multiplyScalar(walkSpeed * dt));
      
      // Smooth character rotation towards movement
      const targetYaw = Math.atan2(-move.x, -move.z);
      player.rotation.y = THREE.MathUtils.lerpAngle(player.rotation.y, targetYaw, 0.2);
      
      if (walkAction && idleAction) {
        if (!walkAction.isRunning()) {
          idleAction.fadeOut(0.2);
          walkAction.reset().fadeIn(0.2).play();
        }
      }
    } else {
      if (walkAction && idleAction) {
        if (!idleAction.isRunning()) {
          walkAction.fadeOut(0.2);
          idleAction.reset().fadeIn(0.2).play();
        }
      }
    }

    // IMPROVED TPS CAMERA FOLLOW
    const targetPosition = player.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    tpsControls.target.lerp(targetPosition, 0.2);
    
    const cameraDistance = 3;
    const cameraHeight = 1.5;
    
    const playerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
    playerForward.y = 0;
    playerForward.normalize();
    
    const desiredPosition = player.position.clone()
      .sub(playerForward.multiplyScalar(cameraDistance))
      .add(new THREE.Vector3(0, cameraHeight, 0));
    
    camera.position.lerp(desiredPosition, 0.15);
    
    tpsControls.update();
  }

  renderer.render(scene, camera);
}
animate();

// ------------------------- Resize -------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------- DEBUG FUNCTIONS -------------------------
window.__CHECK_SHADOW_CAMERAS = () => {
  console.group("=== SHADOW CAMERA STATUS ===");
  blenderLights.forEach(light => {
    if (light.castShadow && light.shadow && light.shadow.camera) {
      console.log(`Light: ${light.type} "${light.name}"`, {
        near: light.shadow.camera.near,
        far: light.shadow.camera.far,
        type: light.shadow.camera.type
      });
      if (light.isDirectionalLight) {
        console.log(`  Directional bounds:`, {
          left: light.shadow.camera.left,
          right: light.shadow.camera.right,
          top: light.shadow.camera.top,
          bottom: light.shadow.camera.bottom
        });
      }
    }
  });
  console.groupEnd();
};

window.__CHECK_LIGHTS = () => {
  console.group("=== LIGHT STATUS ===");
  let totalLights = 0;
  let lampLightFound = false;
  
  scene.traverse(obj => {
    if (obj instanceof THREE.Light) {
      totalLights++;
      const isLampLight = (obj === lampLight);
      if (isLampLight) lampLightFound = true;
      
      console.log(`Light: ${obj.type} "${obj.name}"`, {
        intensity: obj.intensity,
        isLampLight: isLampLight,
        originalIntensity: obj.userData.originalIntensity,
        visible: obj.visible
      });
    }
  });
  
  console.log(`SUMMARY: ${totalLights} total lights, Lamp light found: ${lampLightFound}`);
  console.groupEnd();
};

window.__TOGGLE_LAMP = () => {
  lampState = lampState ? 0 : 1;
  log("Debug: Lamp toggled =>", lampState ? "ON" : "OFF");
};

log("Viewer ready. All Blender lights ON with fixed shadow cameras!");
setStatus("Ready — loading assets...");