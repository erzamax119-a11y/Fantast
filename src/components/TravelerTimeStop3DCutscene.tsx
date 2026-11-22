import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Clock, FastForward } from 'lucide-react';

interface TravelerTimeStop3DCutsceneProps {
  remainingTime: number;
  totalDuration?: number;
  onSkip: () => void;
  onWebGLUnavailable?: () => void;
}

type CutscenePhase = 'rapalan' | 'hourglass' | 'timestop';

const PHASE_LABELS: Record<CutscenePhase, string> = {
  rapalan: 'FASE I · TRAVELER MERAPALKAN MANTRA CHRONOS',
  hourglass: 'FASE II · JAM PASIR MUNCUL DARI LINGKARAN RAPALAN',
  timestop: 'FASE III · LEDAKAN AREA MENGHENTIKAN WAKTU (TIME STOP)'
};

// Pre-allocated scratch helpers (zero GC inside render tick)
const _camTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _currentLook = new THREE.Vector3(0, 1.35, 0.4);
const _dummy = new THREE.Object3D();
const _tmpColor = new THREE.Color();
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecC = new THREE.Vector3();

function createRadialGlowTexture(innerHex: string, midHex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, innerHex);
    g.addColorStop(0.32, midHex);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const TravelerTimeStop3DCutscene: React.FC<TravelerTimeStop3DCutsceneProps> = ({
  remainingTime,
  totalDuration = 4.5,
  onSkip,
  onWebGLUnavailable
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const remainingRef = useRef<number>(remainingTime);
  const lastSyncTimeRef = useRef<number>(performance.now());
  const onSkipRef = useRef(onSkip);
  const onFallbackRef = useRef(onWebGLUnavailable);

  const [phase, setPhase] = useState<CutscenePhase>('rapalan');
  const [uiProgress, setUiProgress] = useState<number>(0);

  onSkipRef.current = onSkip;
  onFallbackRef.current = onWebGLUnavailable;

  useEffect(() => {
    remainingRef.current = remainingTime;
    lastSyncTimeRef.current = performance.now();
  }, [remainingTime]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onSkipRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      const testGl =
        canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' }) ||
        canvas.getContext('webgl', { antialias: true, powerPreference: 'high-performance' });
      if (!testGl) {
        onFallbackRef.current?.();
        return;
      }

      const debugExt = testGl.getExtension('WEBGL_debug_renderer_info');
      const gpuName = debugExt
        ? String(testGl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '')
        : '';
      const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuName);

      renderer = new THREE.WebGLRenderer({
        canvas,
        context: testGl as WebGLRenderingContext,
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.setSize(window.innerWidth, Math.max(1, window.innerHeight), false);

      const disposables: Array<{ dispose: () => void }> = [];
      const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
        disposables.push(g);
        return g;
      };
      const trackMat = <T extends THREE.Material>(m: T): T => {
        disposables.push(m);
        return m;
      };
      const trackTex = <T extends THREE.Texture>(t: T): T => {
        disposables.push(t);
        return t;
      };

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020915);
      scene.fog = new THREE.FogExp2(0x031120, 0.022);

      const camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / Math.max(1, window.innerHeight),
        0.1,
        140
      );
      camera.position.set(2.4, 2.2, 6.2);
      _currentLook.set(0, 1.35, 0.4);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      disposables.push(envRT, roomEnv, pmrem);

      // 3-Point Warm/Cool Lighting Rig + Incantation & Hourglass Point Lights
      const hemiLight = new THREE.HemisphereLight(0x67e8f9, 0x07121e, 0.85);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfef3c7, 2.1);
      keyLight.position.set(4.5, 9.5, 5.5);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 30;
        keyLight.shadow.camera.left = -9;
        keyLight.shadow.camera.right = 9;
        keyLight.shadow.camera.top = 9;
        keyLight.shadow.camera.bottom = -9;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.02;
      }
      scene.add(keyLight);

      const cyanRim = new THREE.PointLight(0x06b6d4, 9, 24, 1.4);
      cyanRim.position.set(-4.2, 3.4, -3.5);
      scene.add(cyanRim);

      const mantraLight = new THREE.PointLight(0x22d3ee, 6, 16, 1.4);
      mantraLight.position.set(0, 0.85, 1.65);
      scene.add(mantraLight);

      const hourglassLight = new THREE.PointLight(0xfbbf24, 3.5, 22, 1.4);
      hourglassLight.position.set(0, 2.1, 1.65);
      scene.add(hourglassLight);

      // =========================================================================
      // BACKGROUND 1: Chronos Astral Nebula & Temporal Rift Sky Dome (GLSL)
      // =========================================================================
      const skyUniforms = {
        uTime: { value: 0 },
        uEnergy: { value: 0.25 },
        uFreeze: { value: 0 },
        uFlash: { value: 0 }
      };
      const skyMat = trackMat(
        new THREE.ShaderMaterial({
          uniforms: skyUniforms,
          side: THREE.BackSide,
          depthWrite: false,
          vertexShader: `
            varying vec3 vWorldDir;
            void main() {
              vWorldDir = normalize(position);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec3 vWorldDir;
            uniform float uTime;
            uniform float uEnergy;
            uniform float uFreeze;
            uniform float uFlash;

            float hash(vec3 p) {
              p = fract(p * 0.3183099 + 0.1);
              p *= 17.0;
              return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
            }

            float noise3(vec3 x) {
              vec3 i = floor(x);
              vec3 f = fract(x);
              f = f * f * (3.0 - 2.0 * f);
              return mix(
                mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                    mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                    mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
                f.z
              );
            }

            float fbm(vec3 p) {
              float v = 0.0;
              float a = 0.5;
              for (int i = 0; i < 4; i++) {
                v += a * noise3(p);
                p = p * 2.02 + vec3(0.17, -0.14, 0.19);
                a *= 0.5;
              }
              return v;
            }

            void main() {
              vec3 dir = normalize(vWorldDir);
              float horizonGlow = pow(1.0 - abs(dir.y), 3.4);
              vec3 nebCoord = dir * 2.3 + vec3(uTime * 0.025, -uTime * 0.018, uTime * 0.02);
              float n1 = fbm(nebCoord);
              float n2 = fbm(nebCoord * 2.15 + vec3(n1 * 1.3));
              float riftBand = smoothstep(0.44, 0.85, n2);

              vec3 deepSpace = vec3(0.01, 0.025, 0.065);
              vec3 chronosTeal = vec3(0.03, 0.18, 0.28);
              vec3 astralGold = vec3(0.42, 0.25, 0.06);
              vec3 iceBlue = vec3(0.06, 0.28, 0.42);

              vec3 col = mix(deepSpace, chronosTeal, n1 * 0.85 + horizonGlow * 0.4);
              col += astralGold * pow(riftBand, 2.2) * (0.18 + uEnergy * 0.32) * (1.0 - uFreeze * 0.45);
              col += iceBlue * riftBand * (0.18 + uFreeze * 0.35);
              col += vec3(0.04, 0.22, 0.34) * horizonGlow * (0.28 + uEnergy * 0.22);

              // Twinkling stars (frozen when uFreeze approaches 1)
              float starCell = hash(floor(dir * 145.0));
              float star = smoothstep(0.992, 0.999, starCell) * smoothstep(-0.08, 0.45, dir.y);
              float twinkle = mix(0.55 + 0.45 * sin(uTime * 4.5 + starCell * 90.0), 0.9, uFreeze);
              col += vec3(0.82, 0.95, 1.0) * star * twinkle;

              // Controlled cyan-gold flash on detonation
              col += vec3(0.24, 0.65, 0.85) * uFlash * 0.24;

              gl_FragColor = vec4(col, 1.0);
            }
          `
        })
      );
      scene.add(new THREE.Mesh(trackGeo(new THREE.SphereGeometry(85, 32, 24)), skyMat));

      // Procedural Glow Textures (for hand halos, hourglass singularity, sparks)
      const cyanGlowTex = trackTex(
        createRadialGlowTexture('rgba(207, 250, 254, 0.92)', 'rgba(34, 211, 238, 0.36)')
      );
      const goldGlowTex = trackTex(
        createRadialGlowTexture('rgba(254, 249, 195, 0.92)', 'rgba(251, 191, 36, 0.36)')
      );

      // Procedural CanvasTexture for Lingkaran Rapalan (Incantation Seal)
      const sealCanvas = document.createElement('canvas');
      sealCanvas.width = 512;
      sealCanvas.height = 512;
      const sctx = sealCanvas.getContext('2d');
      if (sctx) {
        sctx.clearRect(0, 0, 512, 512);
        const radGrad = sctx.createRadialGradient(256, 256, 16, 256, 256, 248);
        radGrad.addColorStop(0, 'rgba(34, 211, 238, 0.28)');
        radGrad.addColorStop(0.45, 'rgba(6, 182, 212, 0.12)');
        radGrad.addColorStop(0.8, 'rgba(251, 191, 36, 0.08)');
        radGrad.addColorStop(1, 'rgba(2, 10, 20, 0)');
        sctx.fillStyle = radGrad;
        sctx.fillRect(0, 0, 512, 512);

        sctx.strokeStyle = '#67e8f9';
        sctx.lineWidth = 4;
        sctx.beginPath();
        sctx.arc(256, 256, 236, 0, Math.PI * 2);
        sctx.stroke();

        sctx.strokeStyle = '#fbbf24';
        sctx.lineWidth = 2.5;
        sctx.beginPath();
        sctx.arc(256, 256, 204, 0, Math.PI * 2);
        sctx.stroke();

        sctx.strokeStyle = 'rgba(103, 232, 249, 0.85)';
        sctx.lineWidth = 2.2;
        for (let sq = 0; sq < 2; sq++) {
          const offset = sq * (Math.PI / 4);
          sctx.beginPath();
          for (let i = 0; i <= 4; i++) {
            const a = offset + (i * Math.PI) / 2;
            const px = 256 + Math.cos(a) * 198;
            const py = 256 + Math.sin(a) * 198;
            if (i === 0) sctx.moveTo(px, py);
            else sctx.lineTo(px, py);
          }
          sctx.stroke();
        }

        sctx.strokeStyle = '#22d3ee';
        sctx.lineWidth = 2;
        sctx.beginPath();
        sctx.arc(256, 256, 134, 0, Math.PI * 2);
        sctx.stroke();

        for (let i = 0; i < 24; i++) {
          const a = (i * Math.PI * 2) / 24;
          sctx.strokeStyle = i % 2 === 0 ? '#fbbf24' : '#67e8f9';
          sctx.lineWidth = i % 3 === 0 ? 3 : 1.6;
          sctx.beginPath();
          sctx.moveTo(256 + Math.cos(a) * 208, 256 + Math.sin(a) * 208);
          sctx.lineTo(256 + Math.cos(a) * 230, 256 + Math.sin(a) * 230);
          sctx.stroke();
        }

        sctx.strokeStyle = '#fef08a';
        sctx.lineWidth = 2.4;
        sctx.beginPath();
        sctx.moveTo(212, 206);
        sctx.lineTo(300, 206);
        sctx.lineTo(212, 306);
        sctx.lineTo(300, 306);
        sctx.closePath();
        sctx.stroke();
      }
      const sealTex = trackTex(new THREE.CanvasTexture(sealCanvas));
      sealTex.colorSpace = THREE.SRGBColorSpace;
      sealTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

      // Shared PBR Materials
      const obsidianMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0a1320,
          roughness: 0.45,
          metalness: 0.62
        })
      );
      const cloakMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0f2942,
          emissive: 0x082f49,
          emissiveIntensity: 0.35,
          roughness: 0.65,
          metalness: 0.18,
          side: THREE.DoubleSide
        })
      );
      const armorCyanMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0e7490,
          emissive: 0x083344,
          emissiveIntensity: 0.45,
          roughness: 0.24,
          metalness: 0.82
        })
      );
      const goldTrimMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          emissive: 0xb45309,
          emissiveIntensity: 0.35,
          roughness: 0.18,
          metalness: 0.92
        })
      );
      const cyanGlowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x67e8f9,
          emissive: 0x06b6d4,
          emissiveIntensity: 0.92,
          roughness: 0.14,
          metalness: 0.12
        })
      );
      const goldGlowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.88,
          roughness: 0.15,
          metalness: 0.22
        })
      );
      const glassBulbMat = trackMat(
        new THREE.MeshPhysicalMaterial({
          color: 0xa5f3fc,
          emissive: 0x0891b2,
          emissiveIntensity: 0.38,
          roughness: 0.08,
          metalness: 0.08,
          transparent: true,
          opacity: isSoftwareGl ? 0.5 : 0.72,
          clearcoat: 1.0,
          depthWrite: false
        })
      );

      // 1. Grounded Arena Floor, Stone Dais & Radial Contact Shadow
      const floorPlane = new THREE.Mesh(
        trackGeo(new THREE.CircleGeometry(28, 48)),
        trackMat(
          new THREE.MeshStandardMaterial({
            color: 0x030c18,
            roughness: 0.85,
            metalness: 0.24
          })
        )
      );
      floorPlane.rotation.x = -Math.PI / 2;
      floorPlane.position.y = -0.22;
      floorPlane.receiveShadow = true;
      scene.add(floorPlane);

      const daisBase = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(4.5, 5.05, 0.22, 24)),
        obsidianMat
      );
      daisBase.position.y = -0.11;
      daisBase.receiveShadow = true;
      scene.add(daisBase);

      const daisTrim = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(4.52, 0.055, 10, 64)),
        goldTrimMat
      );
      daisTrim.rotation.x = Math.PI / 2;
      daisTrim.position.y = 0.01;
      scene.add(daisTrim);

      // Contact shadow beneath Traveler
      const contactShadowTex = trackTex(
        createRadialGlowTexture('rgba(0, 0, 0, 0.72)', 'rgba(0, 0, 0, 0.25)')
      );
      const contactShadow = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(1.5, 1.5)),
        trackMat(
          new THREE.MeshBasicMaterial({
            map: contactShadowTex,
            transparent: true,
            depthWrite: false
          })
        )
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.set(0, 0.008, -0.75);
      scene.add(contactShadow);

      // Arena perimeter pylons + vertical Chrono Rune Curtains
      const pylonGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.22, 1.85, 6));
      const pylonCapGeo = trackGeo(new THREE.OctahedronGeometry(0.2, 0));
      const pylonBeamGeo = trackGeo(new THREE.CylinderGeometry(0.008, 0.045, 3.6, 8, 1, true));
      const pylonBeamMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      const pylonCaps: THREE.Mesh[] = [];
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI * 2) / 6 + Math.PI / 6;
        const pGroup = new THREE.Group();
        pGroup.position.set(Math.cos(ang) * 5.2, 0.7, Math.sin(ang) * 5.2);
        pGroup.lookAt(0, 0.7, 0);
        const pMesh = new THREE.Mesh(pylonGeo, obsidianMat);
        pMesh.castShadow = true;
        pGroup.add(pMesh);
        const cap = new THREE.Mesh(pylonCapGeo, i % 2 === 0 ? cyanGlowMat : goldGlowMat);
        cap.position.y = 1.2;
        pGroup.add(cap);
        const pBeam = new THREE.Mesh(pylonBeamGeo, pylonBeamMat);
        pBeam.position.y = 3.2;
        pGroup.add(pBeam);
        pylonCaps.push(cap);
        scene.add(pGroup);
      }

      // =========================================================================
      // BACKGROUND 2: Monumental Floating Astral Clockwork Dial (Freezes in Phase III!)
      // =========================================================================
      const skyClockGroup = new THREE.Group();
      skyClockGroup.position.set(0, 4.3, -8.5);
      scene.add(skyClockGroup);

      const clockOuterRing = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(4.8, 0.08, 12, 72)),
        goldTrimMat
      );
      const clockMidRing = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(3.85, 0.045, 10, 64)),
        cyanGlowMat
      );
      const clockInnerRing = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(2.4, 0.04, 10, 48)),
        goldTrimMat
      );
      skyClockGroup.add(clockOuterRing, clockMidRing, clockInnerRing);

      // 12 Hour Numeral Obelisk Ticks
      const tickGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.52, 0.08));
      for (let i = 0; i < 12; i++) {
        const ang = (i * Math.PI * 2) / 12;
        const tickMesh = new THREE.Mesh(tickGeo, i % 3 === 0 ? goldGlowMat : cyanGlowMat);
        tickMesh.position.set(Math.cos(ang) * 4.32, Math.sin(ang) * 4.32, 0);
        tickMesh.rotation.z = ang + Math.PI / 2;
        skyClockGroup.add(tickMesh);
      }

      // Clock Center Gear & Sweeping Hour / Minute Hands
      const clockHub = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.32, 0)), goldGlowMat);
      skyClockGroup.add(clockHub);

      const hourHandPivot = new THREE.Group();
      const hourHandMesh = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.11, 2.2, 4)),
        goldGlowMat
      );
      hourHandMesh.position.y = 1.1;
      hourHandPivot.add(hourHandMesh);

      const minuteHandPivot = new THREE.Group();
      const minuteHandMesh = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.08, 3.3, 4)),
        cyanGlowMat
      );
      minuteHandMesh.position.y = 1.65;
      minuteHandPivot.add(minuteHandMesh);
      skyClockGroup.add(hourHandPivot, minuteHandPivot);

      // 2. Composite 3D Traveler Character (Grounded at z = -0.75)
      const travelerGroup = new THREE.Group();
      travelerGroup.position.set(0, 0, -0.75);
      scene.add(travelerGroup);

      const legGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.78, 8));
      const legL = new THREE.Mesh(legGeo, obsidianMat);
      legL.position.set(-0.18, 0.39, 0);
      legL.castShadow = true;
      const legR = new THREE.Mesh(legGeo, obsidianMat);
      legR.position.set(0.18, 0.39, 0);
      legR.castShadow = true;
      travelerGroup.add(legL, legR);

      const pelvis = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.27, 0.24, 0.28, 8)),
        obsidianMat
      );
      pelvis.position.y = 0.88;
      const beltBuckle = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.1, 0)), goldGlowMat);
      beltBuckle.position.set(0, 0.9, 0.26);
      travelerGroup.add(pelvis, beltBuckle);

      const torso = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.36, 0.26, 0.78, 8)),
        armorCyanMat
      );
      torso.position.y = 1.38;
      torso.castShadow = true;
      const chestSigil = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.13, 0)), cyanGlowMat);
      chestSigil.position.set(0, 1.44, 0.32);
      travelerGroup.add(torso, chestSigil);

      const cloakShape = new THREE.Shape();
      cloakShape.moveTo(-0.42, 0);
      cloakShape.lineTo(0.42, 0);
      cloakShape.lineTo(0.72, -1.45);
      cloakShape.lineTo(0, -1.62);
      cloakShape.lineTo(-0.72, -1.45);
      cloakShape.closePath();
      const cloakGeo = trackGeo(
        new THREE.ExtrudeGeometry(cloakShape, { depth: 0.04, bevelEnabled: false })
      );
      const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
      cloakMesh.position.set(0, 1.7, -0.26);
      cloakMesh.rotation.x = 0.22;
      travelerGroup.add(cloakMesh);

      const pauldronGeo = trackGeo(new THREE.DodecahedronGeometry(0.21, 0));
      const pauldronL = new THREE.Mesh(pauldronGeo, goldTrimMat);
      pauldronL.position.set(-0.44, 1.66, 0);
      pauldronL.scale.set(1.15, 0.75, 1.0);
      const pauldronR = pauldronL.clone();
      pauldronR.position.x = 0.44;
      travelerGroup.add(pauldronL, pauldronR);

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.98, 0.03);
      const hoodMesh = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.28, 0.48, 7)), cloakMat);
      hoodMesh.position.set(0, 0.1, -0.04);
      hoodMesh.rotation.x = -0.24;
      const faceHelm = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.2, 0)), obsidianMat);
      const visor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.26, 0.06, 0.14)), cyanGlowMat);
      visor.position.set(0, 0.01, 0.15);
      headGroup.add(hoodMesh, faceHelm, visor);
      travelerGroup.add(headGroup);

      // Articulated Chanting Arms + Glowing Spell Orbs + Additive Halo Sprites
      const armGeo = trackGeo(new THREE.CylinderGeometry(0.085, 0.07, 0.68, 8));
      const handOrbGeo = trackGeo(new THREE.SphereGeometry(0.11, 14, 14));

      const leftArmPivot = new THREE.Group();
      leftArmPivot.position.set(-0.42, 1.62, 0.04);
      const leftArmMesh = new THREE.Mesh(armGeo, armorCyanMat);
      leftArmMesh.position.set(0, -0.32, 0);
      const leftHandOrb = new THREE.Mesh(handOrbGeo, cyanGlowMat);
      leftHandOrb.position.set(0, -0.68, 0);
      const leftHandGlow = new THREE.Sprite(
        trackMat(
          new THREE.SpriteMaterial({
            map: cyanGlowTex,
            color: 0x67e8f9,
            transparent: true,
            opacity: 0.45,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        )
      );
      leftHandGlow.scale.set(0.46, 0.46, 1);
      leftHandOrb.add(leftHandGlow);
      leftArmPivot.add(leftArmMesh, leftHandOrb);

      const rightArmPivot = new THREE.Group();
      rightArmPivot.position.set(0.42, 1.62, 0.04);
      const rightArmMesh = new THREE.Mesh(armGeo, armorCyanMat);
      rightArmMesh.position.set(0, -0.32, 0);
      const rightHandOrb = new THREE.Mesh(handOrbGeo, goldGlowMat);
      rightHandOrb.position.set(0, -0.68, 0);
      const rightHandGlow = new THREE.Sprite(
        trackMat(
          new THREE.SpriteMaterial({
            map: goldGlowTex,
            color: 0xfde047,
            transparent: true,
            opacity: 0.45,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        )
      );
      rightHandGlow.scale.set(0.46, 0.46, 1);
      rightHandOrb.add(rightHandGlow);
      rightArmPivot.add(rightArmMesh, rightHandOrb);
      travelerGroup.add(leftArmPivot, rightArmPivot);

      // Floating Chrono-Blade orbiting behind Traveler's right shoulder
      const chronoBladeGroup = new THREE.Group();
      chronoBladeGroup.position.set(0.75, 1.85, -0.15);
      const bladeEdge = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.08, 1.55, 4)), cyanGlowMat);
      bladeEdge.position.y = 0.72;
      const bladeGuard = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.14, 0)), goldTrimMat);
      bladeGuard.scale.set(2.2, 0.65, 0.65);
      const bladeGrip = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.42, 8)), obsidianMat);
      bladeGrip.position.y = -0.22;
      chronoBladeGroup.add(bladeEdge, bladeGuard, bladeGrip);
      travelerGroup.add(chronoBladeGroup);

      // Floating Chrono Halo behind Traveler (lights up during Time Stop)
      const travelerHalo = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.74, 0.018, 8, 48)),
        goldGlowMat
      );
      travelerHalo.position.set(0, 1.72, -0.38);
      travelerHalo.visible = false;
      travelerGroup.add(travelerHalo);

      // 3. Lingkaran Rapalan Mantra (Incantation Circle at z = 1.65)
      const rapalanGroup = new THREE.Group();
      rapalanGroup.position.set(0, 0.03, 1.65);
      scene.add(rapalanGroup);

      const rapalanMat = trackMat(
        new THREE.MeshBasicMaterial({
          map: sealTex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      const rapalanDisc = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(2.2, 48)), rapalanMat);
      rapalanDisc.rotation.x = -Math.PI / 2;
      rapalanGroup.add(rapalanDisc);

      const rapalanRingOuter = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(2.22, 0.024, 10, 64)),
        cyanGlowMat
      );
      rapalanRingOuter.rotation.x = Math.PI / 2;
      rapalanRingOuter.position.y = 0.03;

      const rapalanRingInner = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(1.44, 0.018, 8, 48)),
        goldGlowMat
      );
      rapalanRingInner.rotation.x = Math.PI / 2;
      rapalanRingInner.position.y = 0.06;
      rapalanGroup.add(rapalanRingOuter, rapalanRingInner);

      // Chronos Vortex Spiral Funnel (ShaderMaterial) rising as fine energy filaments
      const vortexUniforms = {
        uTime: { value: 0 },
        uAlpha: { value: 0 }
      };
      const vortexMat = trackMat(
        new THREE.ShaderMaterial({
          uniforms: vortexUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uAlpha;
            void main() {
              float spiralA = sin((vUv.x * 6.28318 * 4.0) - vUv.y * 14.0 + uTime * 7.5);
              float spiralB = sin((vUv.x * 6.28318 * 6.0) + vUv.y * 10.0 - uTime * 5.0);
              float band = smoothstep(0.74, 0.98, spiralA * 0.6 + spiralB * 0.4);
              float fadeV = sin(vUv.y * 3.14159);
              vec3 col = mix(vec3(0.05, 0.72, 0.92), vec3(0.98, 0.75, 0.18), pow(vUv.y, 1.5) * 0.5);
              gl_FragColor = vec4(col * band, band * fadeV * uAlpha);
            }
          `
        })
      );
      const summonVortex = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.72, 1.38, 3.3, 36, 1, true)),
        vortexMat
      );
      summonVortex.position.y = 1.65;
      rapalanGroup.add(summonVortex);

      // Floating ascending Runic Ring Halo inside Rapalan Beam
      const risingHaloMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      const risingHalos: THREE.Mesh[] = [];
      const risingHaloGeo = trackGeo(new THREE.RingGeometry(1.24, 1.28, 48));
      for (let i = 0; i < 3; i++) {
        const rh = new THREE.Mesh(risingHaloGeo, risingHaloMat);
        rh.rotation.x = -Math.PI / 2;
        rapalanGroup.add(rh);
        risingHalos.push(rh);
      }

      // 4. Composite 3D Jam Pasir Chronos (Rises from the Rapalan Circle at z = 1.65)
      const hourglassGroup = new THREE.Group();
      hourglassGroup.position.set(0, -1.6, 1.65);
      hourglassGroup.visible = false;
      scene.add(hourglassGroup);

      const capMainGeo = trackGeo(new THREE.CylinderGeometry(0.92, 0.96, 0.16, 12));
      const capRimGeo = trackGeo(new THREE.TorusGeometry(0.95, 0.055, 10, 48));
      const hgTopCap = new THREE.Mesh(capMainGeo, obsidianMat);
      hgTopCap.position.y = 1.42;
      const hgTopRim = new THREE.Mesh(capRimGeo, goldTrimMat);
      hgTopRim.rotation.x = Math.PI / 2;
      hgTopRim.position.y = 1.42;

      const hgBotCap = new THREE.Mesh(capMainGeo, obsidianMat);
      hgBotCap.position.y = -1.42;
      const hgBotRim = new THREE.Mesh(capRimGeo, goldTrimMat);
      hgBotRim.rotation.x = Math.PI / 2;
      hgBotRim.position.y = -1.42;

      const hgCrownSpike = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.22, 0)), cyanGlowMat);
      hgCrownSpike.position.y = 1.68;
      const hgBaseSpike = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.22, 0)), goldGlowMat);
      hgBaseSpike.position.y = -1.68;

      const hgPillarGeo = trackGeo(new THREE.CylinderGeometry(0.052, 0.052, 2.84, 8));
      const hgPillarRingGeo = trackGeo(new THREE.TorusGeometry(0.085, 0.025, 8, 16));
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const px = Math.cos(a) * 0.82;
        const pz = Math.sin(a) * 0.82;
        const pillar = new THREE.Mesh(hgPillarGeo, goldTrimMat);
        pillar.position.set(px, 0, pz);
        const midBand = new THREE.Mesh(hgPillarRingGeo, cyanGlowMat);
        midBand.rotation.x = Math.PI / 2;
        midBand.position.set(px, 0, pz);
        hourglassGroup.add(pillar, midBand);
      }

      const bulbGeo = trackGeo(new THREE.ConeGeometry(0.72, 1.32, 20, 1, true));
      const hgTopBulb = new THREE.Mesh(bulbGeo, glassBulbMat);
      hgTopBulb.rotation.x = Math.PI;
      hgTopBulb.position.y = 0.68;
      const hgBotBulb = new THREE.Mesh(bulbGeo, glassBulbMat);
      hgBotBulb.position.y = -0.68;

      const waistCollar = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(0.18, 0.05, 10, 32)),
        goldTrimMat
      );
      waistCollar.rotation.x = Math.PI / 2;

      const topSandMesh = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.56, 0.85, 16)),
        goldGlowMat
      );
      topSandMesh.rotation.x = Math.PI;
      topSandMesh.position.y = 0.56;

      const botSandMesh = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.58, 0.9, 16)),
        cyanGlowMat
      );
      botSandMesh.position.y = -0.92;

      const sandStream = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 1.05, 8)),
        goldGlowMat
      );
      sandStream.position.y = -0.22;

      const hgOrbitRingA = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(1.38, 0.02, 10, 56)),
        cyanGlowMat
      );
      const hgOrbitRingB = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(1.62, 0.018, 10, 56)),
        goldTrimMat
      );
      hgOrbitRingB.rotation.x = Math.PI / 3;

      // Hourglass Waist Singularity Glow Sprite
      const hgWaistGlow = new THREE.Sprite(
        trackMat(
          new THREE.SpriteMaterial({
            map: cyanGlowTex,
            color: 0x67e8f9,
            transparent: true,
            opacity: 0.36,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        )
      );
      hgWaistGlow.scale.set(0.95, 0.95, 1);

      hourglassGroup.add(
        hgTopCap,
        hgTopRim,
        hgBotCap,
        hgBotRim,
        hgCrownSpike,
        hgBaseSpike,
        hgTopBulb,
        hgBotBulb,
        waistCollar,
        topSandMesh,
        botSandMesh,
        sandStream,
        hgOrbitRingA,
        hgOrbitRingB,
        hgWaistGlow
      );

      // =========================================================================
      // 4B. Chronos Energy Conduit Arcs (Hands -> Hourglass Core)
      // =========================================================================
      const arcSegs = 14;
      const arcCount = 6;
      const arcLines: THREE.Line[] = [];
      const arcPosAttrs: THREE.BufferAttribute[] = [];
      const arcMatCyan = trackMat(
        new THREE.LineBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      const arcMatGold = trackMat(
        new THREE.LineBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      for (let i = 0; i < arcCount; i++) {
        const arr = new Float32Array(arcSegs * 3);
        const geo = trackGeo(new THREE.BufferGeometry());
        const attr = new THREE.BufferAttribute(arr, 3);
        geo.setAttribute('position', attr);
        const line = new THREE.Line(geo, i % 2 === 0 ? arcMatCyan : arcMatGold);
        line.frustumCulled = false;
        line.visible = false;
        scene.add(line);
        arcLines.push(line);
        arcPosAttrs.push(attr);
      }

      // =========================================================================
      // 5. Phase III: Chronos Fracture Dome, Shockwaves & Volumetric Light Rays
      // =========================================================================
      const domeUniforms = {
        uTime: { value: 0 },
        uAlpha: { value: 0 }
      };
      const areaDomeMat = trackMat(
        new THREE.ShaderMaterial({
          uniforms: domeUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPos;
            varying vec2 vUv;
            void main() {
              vUv = uv;
              vNormal = normalize(normalMatrix * normal);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vViewPos = -mv.xyz;
              gl_Position = projectionMatrix * mv;
            }
          `,
          fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vViewPos;
            varying vec2 vUv;
            uniform float uTime;
            uniform float uAlpha;
            void main() {
              float ndv = abs(dot(normalize(vNormal), normalize(vViewPos)));
              float fresnel = pow(1.0 - ndv, 2.8);
              float latLine = smoothstep(0.968, 0.998, abs(sin(vUv.y * 36.0 - uTime * 2.5)));
              float lonLine = smoothstep(0.972, 0.998, abs(sin(vUv.x * 48.0)));
              float grid = max(latLine, lonLine) * 0.48;
              vec3 col = mix(vec3(0.05, 0.72, 0.94), vec3(0.98, 0.78, 0.24), grid);
              float alpha = (fresnel * 0.34 + grid * 0.42) * uAlpha;
              gl_FragColor = vec4(col, alpha);
            }
          `
        })
      );
      const areaDome = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56)),
        areaDomeMat
      );
      areaDome.position.set(0, 0.02, 1.65);
      areaDome.visible = false;
      scene.add(areaDome);

      const shockwaveCyanMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      const shockwaveGoldMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );

      const shockwaveCyan = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(1, 0.02, 10, 64)),
        shockwaveCyanMat
      );
      shockwaveCyan.rotation.x = Math.PI / 2;
      shockwaveCyan.position.set(0, 0.14, 1.65);
      shockwaveCyan.visible = false;
      scene.add(shockwaveCyan);

      const shockwaveGold = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(1, 0.015, 10, 64)),
        shockwaveGoldMat
      );
      shockwaveGold.rotation.x = Math.PI / 2;
      shockwaveGold.position.set(0, 0.22, 1.65);
      shockwaveGold.visible = false;
      scene.add(shockwaveGold);

      const shockwaveOuter = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(1, 0.01, 8, 64)),
        shockwaveCyanMat
      );
      shockwaveOuter.rotation.x = Math.PI / 2;
      shockwaveOuter.position.set(0, 0.3, 1.65);
      shockwaveOuter.visible = false;
      scene.add(shockwaveOuter);

      // Volumetric Time-Stop Light Cones bursting radially from the Hourglass
      const rayGroup = new THREE.Group();
      rayGroup.position.set(0, 2.0, 1.65);
      rayGroup.visible = false;
      scene.add(rayGroup);
      const rayMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x67e8f9,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      const rayGeo = trackGeo(new THREE.CylinderGeometry(0.012, 0.14, 5.4, 8, 1, true));
      rayGeo.translate(0, 2.7, 0);
      for (let i = 0; i < 10; i++) {
        const ray = new THREE.Mesh(rayGeo, rayMat);
        const phi = Math.acos(1 - (2 * (i + 0.5)) / 10);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        _tmpVecA.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.5 + 0.15, Math.sin(phi) * Math.sin(theta)).normalize();
        ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _tmpVecA);
        rayGroup.add(ray);
      }

      // Instanced Chronos Shards (Spiral Mantra Sparks -> Mid-Air Frozen Time-Stop Crystals)
      const shardCount = 96;
      const shardGeo = trackGeo(new THREE.OctahedronGeometry(0.065, 0));
      const shardMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x22d3ee,
          emissiveIntensity: 0.92,
          roughness: 0.14,
          metalness: 0.45
        })
      );
      const shardInstanced = new THREE.InstancedMesh(shardGeo, shardMat, shardCount);
      shardInstanced.frustumCulled = false;
      scene.add(shardInstanced);

      const shardDirs: THREE.Vector3[] = [];
      const shardSpeeds: number[] = [];
      const mantraAngles: number[] = [];
      for (let i = 0; i < shardCount; i++) {
        const phi = Math.acos(1 - (2 * (i + 0.5)) / shardCount);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        shardDirs.push(
          new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta),
            Math.abs(Math.cos(phi)) * 0.68 + 0.14,
            Math.sin(phi) * Math.sin(theta)
          ).normalize()
        );
        shardSpeeds.push(4.2 + (i % 7) * 0.92);
        mantraAngles.push((i * Math.PI * 2) / shardCount);
        _tmpColor.setHex(i % 3 === 0 ? 0x22d3ee : i % 3 === 1 ? 0xfbbf24 : 0xa5f3fc);
        shardInstanced.setColorAt(i, _tmpColor);
      }
      if (shardInstanced.instanceColor) shardInstanced.instanceColor.needsUpdate = true;

      // Ambient & Burst Chronos Dust Motes (with additive soft glow sprite texture)
      const dustCount = 240;
      const dustPositions = new Float32Array(dustCount * 3);
      const dustBasePos = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 1.3 + Math.random() * 7.8;
        const x = Math.cos(ang) * rad;
        const y = 0.25 + Math.random() * 5.2;
        const z = 0.8 + Math.sin(ang) * rad;
        dustPositions[i * 3] = x;
        dustPositions[i * 3 + 1] = y;
        dustPositions[i * 3 + 2] = z;
        dustBasePos[i * 3] = x;
        dustBasePos[i * 3 + 1] = y;
        dustBasePos[i * 3 + 2] = z;
      }
      const dustGeo = trackGeo(new THREE.BufferGeometry());
      const dustPosAttr = new THREE.BufferAttribute(dustPositions, 3);
      dustGeo.setAttribute('position', dustPosAttr);
      const dustMat = trackMat(
        new THREE.PointsMaterial({
          map: cyanGlowTex,
          color: 0x67e8f9,
          size: 0.085,
          transparent: true,
          opacity: 0.48,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      const dustPoints = new THREE.Points(dustGeo, dustMat);
      scene.add(dustPoints);

      // =========================================================================
      // POST-PROCESSING PIPELINE (GPU Only: Bloom + Time-Stop Shock Shader + Output)
      // =========================================================================
      let composer: EffectComposer | null = null;
      let renderPass: RenderPass | null = null;
      let bloomPass: UnrealBloomPass | null = null;
      let shockPass: ShaderPass | null = null;
      let outputPass: OutputPass | null = null;

      const shockUniforms = {
        tDiffuse: { value: null as THREE.Texture | null },
        uAberration: { value: 0.0006 },
        uShockWave: { value: 0 },
        uShockRadius: { value: 0 },
        uFreezeDesat: { value: 0 },
        uAnamorphic: { value: 0.02 },
        uFlash: { value: 0 },
        uVignette: { value: 0.38 }
      };

      if (!isSoftwareGl) {
        composer = new EffectComposer(renderer);
        renderPass = new RenderPass(scene, camera);
        bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, Math.max(1, window.innerHeight)),
          0.22,
          0.26,
          0.84
        );
        shockPass = new ShaderPass({
          uniforms: shockUniforms,
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float uAberration;
            uniform float uShockWave;
            uniform float uShockRadius;
            uniform float uFreezeDesat;
            uniform float uAnamorphic;
            uniform float uFlash;
            uniform float uVignette;
            varying vec2 vUv;

            void main() {
              vec2 center = vec2(0.5, 0.5);
              vec2 toCenter = vUv - center;
              float dist = length(toCenter);
              vec2 dir = dist > 0.0001 ? toCenter / dist : vec2(0.0);

              // Radial Time-Stop Ripple Ring
              float ringDiff = dist - uShockRadius;
              float ringBand = exp(-ringDiff * ringDiff * 165.0) * uShockWave;
              vec2 uv = clamp(vUv - dir * ringBand * 0.028, 0.001, 0.999);

              // Radial Chromatic Aberration
              vec2 caOffset = dir * uAberration * (0.4 + dist * 1.2 + ringBand * 1.8);
              float r = texture2D(tDiffuse, clamp(uv + caOffset, 0.001, 0.999)).r;
              float g = texture2D(tDiffuse, uv).g;
              float b = texture2D(tDiffuse, clamp(uv - caOffset, 0.001, 0.999)).b;
              vec3 col = vec3(r, g, b);

              // Time-Stop Temporal Color Chill (keeps cyan & gold crisp, cools background)
              float lum = dot(col, vec3(0.299, 0.587, 0.114));
              vec3 frozenTint = vec3(lum * 0.72, lum * 0.96, lum * 1.18);
              col = mix(col, frozenTint, uFreezeDesat);

              // Crisp Horizontal Chronos-Cyan Anamorphic Lens Flare
              float hBand = exp(-abs(vUv.y - 0.5) * 44.0) * exp(-abs(vUv.x - 0.5) * 2.8);
              col += vec3(0.18, 0.78, 0.96) * hBand * uAnamorphic;

              // Shockwave Rim Tint (Cyan + Astral Gold)
              col += vec3(0.32, 0.86, 0.98) * ringBand * 0.20;

              // Brief Controlled Detonation Flash
              col += vec3(0.45, 0.82, 0.98) * uFlash;

              // Cinematic Vignette
              float vig = smoothstep(0.36, 0.96, dist);
              col *= 1.0 - vig * uVignette;

              gl_FragColor = vec4(col, 1.0);
            }
          `
        });
        outputPass = new OutputPass();

        composer.addPass(renderPass);
        composer.addPass(bloomPass);
        composer.addPass(shockPass);
        composer.addPass(outputPass);

        renderer.compile(scene, camera);
      }

      const handleResize = () => {
        if (!renderer) return;
        const w = window.innerWidth;
        const h = Math.max(1, window.innerHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        composer?.setSize(w, h);
        bloomPass?.resolution.set(w, h);
      };
      window.addEventListener('resize', handleResize);

      let frameId = 0;
      let isDisposed = false;
      let lastFrameTime = performance.now();
      let lastPhase: CutscenePhase = 'rapalan';
      let lastUiPct = -1;
      let clockAngle = 0;

      const afterDraw = (cb: () => void) => {
        if (isDisposed || !renderer) return;
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (gl && typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (isDisposed) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
        } else {
          frameId = window.setTimeout(cb, 80);
        }
      };

      const tick = () => {
        if (isDisposed || !renderer) return;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
        lastFrameTime = now;
        const elapsedSec = now * 0.001;

        const elapsedSinceSync = (now - lastSyncTimeRef.current) / 1000;
        const estRemaining = Math.max(0, remainingRef.current - elapsedSinceSync);
        const p = Math.max(0, Math.min(1, 1 - estRemaining / Math.max(0.1, totalDuration)));

        const pct = Math.round(p * 100);
        if (pct !== lastUiPct) {
          lastUiPct = pct;
          setUiProgress(pct);
        }

        const nextPhase: CutscenePhase =
          p < 0.34 ? 'rapalan' : p < 0.64 ? 'hourglass' : 'timestop';
        if (nextPhase !== lastPhase) {
          lastPhase = nextPhase;
          setPhase(nextPhase);
        }

        // Time-Stop Freeze Factor: 1.0 normally -> snaps to 0.02 once Time Stop locks (p >= 0.72)
        const timeStopFreezeFactor = p < 0.64 ? 1.0 : p < 0.72 ? 1 - (p - 0.64) / 0.08 : 0.02;
        const isFrozen = p >= 0.72;

        // Sky Shader & Background Giant Clockwork Animation
        skyUniforms.uTime.value += dt * timeStopFreezeFactor;
        skyUniforms.uEnergy.value = p < 0.64 ? 0.25 + p * 0.85 : 0.75;
        skyUniforms.uFreeze.value = p < 0.64 ? 0 : Math.min(1, (p - 0.64) / 0.14);

        const clockSpeed = p < 0.34 ? 1.2 : p < 0.64 ? 4.8 : timeStopFreezeFactor * 0.5;
        clockAngle += dt * clockSpeed;
        minuteHandPivot.rotation.z = -clockAngle;
        hourHandPivot.rotation.z = -clockAngle * 0.18;
        clockOuterRing.rotation.z += dt * 0.18 * timeStopFreezeFactor;
        clockMidRing.rotation.z -= dt * 0.35 * timeStopFreezeFactor;

        dustPoints.rotation.y += dt * 0.28 * timeStopFreezeFactor;
        for (let i = 0; i < pylonCaps.length; i++) {
          pylonCaps[i].rotation.y += dt * 2.2 * timeStopFreezeFactor;
          pylonCaps[i].position.y = 1.2 + Math.sin(elapsedSec * 3.0 + i) * 0.08 * timeStopFreezeFactor;
        }

        // Chrono-blade idle/chant orbit
        chronoBladeGroup.position.set(
          0.74 + Math.cos(elapsedSec * 2.2) * 0.05 * timeStopFreezeFactor,
          1.82 + Math.sin(elapsedSec * 3.1) * 0.06,
          -0.12
        );
        chronoBladeGroup.rotation.z = -0.22 + (p >= 0.64 ? -0.45 : Math.sin(elapsedSec * 2.0) * 0.06);
        chronoBladeGroup.rotation.y += dt * 0.8 * timeStopFreezeFactor;

        // Default post-processing targets
        let targetFov = 45;
        let bloomStrength = 0.2;
        let aberration = 0.0006;
        let shockWave = 0;
        let shockRadius = 0;
        let freezeDesat = 0;
        let anamorphic = 0.02;
        let postFlash = 0;

        if (p < 0.34) {
          // =====================================================================
          // PHASE I: Traveler Mengeluarkan Rapalan Mantra & Conduit Energy
          // =====================================================================
          const rp = p / 0.34;
          const easeOut = 1 - Math.pow(1 - rp, 3);

          travelerGroup.position.y = Math.sin(rp * Math.PI * 3) * 0.025;
          leftArmPivot.rotation.set(-0.45 - easeOut * 1.15, 0.25, -0.22);
          rightArmPivot.rotation.set(-0.45 - easeOut * 1.15, -0.25, 0.22);
          headGroup.rotation.x = -0.06 + Math.sin(rp * Math.PI * 4) * 0.05;
          cloakMesh.rotation.x = 0.22 + Math.sin(rp * Math.PI * 5) * 0.08;
          travelerHalo.visible = false;

          rapalanGroup.scale.setScalar(0.15 + easeOut * 0.9);
          rapalanMat.opacity = Math.min(0.85, rp * 1.45);
          rapalanDisc.rotation.z = rp * Math.PI * 1.8;
          rapalanRingOuter.rotation.z = -rp * Math.PI * 2.4;
          rapalanRingInner.rotation.z = rp * Math.PI * 3.0;

          vortexUniforms.uTime.value = elapsedSec;
          vortexUniforms.uAlpha.value = rp * 0.2;
          risingHaloMat.opacity = rp * 0.28;
          for (let i = 0; i < risingHalos.length; i++) {
            const ht = (rp * 1.6 + i / risingHalos.length) % 1;
            risingHalos[i].position.y = 0.1 + ht * 2.7;
            risingHalos[i].scale.setScalar(1.0 - ht * 0.35);
          }

          pylonBeamMat.opacity = rp * 0.07;
          hourglassGroup.visible = false;
          areaDome.visible = false;
          rayGroup.visible = false;
          shockwaveCyan.visible = false;
          shockwaveGold.visible = false;
          shockwaveOuter.visible = false;
          for (let i = 0; i < arcLines.length; i++) arcLines[i].visible = false;

          // Rising mantra sparks spiraling up from the Rapalan circle
          shardInstanced.visible = true;
          for (let i = 0; i < shardCount; i++) {
            const loopT = (rp * 1.6 + i / shardCount) % 1;
            const ang = mantraAngles[i] + rp * Math.PI * 3;
            const rad = 0.6 + (1 - loopT) * 1.45;
            _dummy.position.set(
              Math.cos(ang) * rad,
              0.15 + loopT * 2.4,
              1.65 + Math.sin(ang) * rad
            );
            _dummy.rotation.set(loopT * 5, ang, i);
            const s = 0.42 + Math.sin(loopT * Math.PI) * 0.32;
            _dummy.scale.set(s * 0.7, s * 1.2, s * 0.7);
            _dummy.updateMatrix();
            shardInstanced.setMatrixAt(i, _dummy.matrix);
          }
          shardInstanced.instanceMatrix.needsUpdate = true;

          mantraLight.intensity = 6 + easeOut * 8;
          hourglassLight.intensity = 2;
          targetFov = 45 - rp * 2.0;
          bloomStrength = 0.2 + rp * 0.04;
          skyUniforms.uFlash.value = 0;
        } else if (p < 0.64) {
          // =====================================================================
          // PHASE II: Dari Rapalan Muncul Jam Pasir Chronos + Energy Conduit Arcs
          // =====================================================================
          const hp = (p - 0.34) / 0.3;
          const riseEase = 1 - Math.pow(1 - Math.min(1, hp * 1.25), 3);

          leftArmPivot.rotation.set(-1.65 - Math.sin(hp * Math.PI * 4) * 0.08, 0.32, -0.35);
          rightArmPivot.rotation.set(-1.65 - Math.sin(hp * Math.PI * 4) * 0.08, -0.32, 0.35);
          cloakMesh.rotation.x = 0.32 + Math.sin(hp * Math.PI * 6) * 0.1;

          rapalanGroup.scale.setScalar(1.05 + Math.sin(hp * Math.PI * 4) * 0.06);
          rapalanMat.opacity = 0.85;
          rapalanDisc.rotation.z += dt * 2.6;
          rapalanRingOuter.rotation.z -= dt * 3.4;
          rapalanRingInner.rotation.z += dt * 4.2;

          vortexUniforms.uTime.value = elapsedSec;
          vortexUniforms.uAlpha.value = 0.16 + Math.sin(hp * Math.PI) * 0.16;
          risingHaloMat.opacity = 0.28;
          for (let i = 0; i < risingHalos.length; i++) {
            const ht = (hp * 2.2 + i / risingHalos.length) % 1;
            risingHalos[i].position.y = 0.1 + ht * 2.9;
            risingHalos[i].scale.setScalar(1.05 - ht * 0.4);
          }
          pylonBeamMat.opacity = 0.08 + hp * 0.05;

          const hgY = -1.2 + riseEase * 3.15;
          hourglassGroup.visible = true;
          hourglassGroup.position.set(0, hgY, 1.65);
          const hgScale = 0.25 + riseEase * 0.78 + (hp > 0.75 ? ((hp - 0.75) / 0.25) * 0.18 : 0);
          hourglassGroup.scale.setScalar(hgScale);
          hourglassGroup.rotation.y = hp * Math.PI * 1.8;
          hourglassGroup.rotation.z = hp > 0.7 ? Math.sin(hp * 48) * 0.07 : 0;

          hgOrbitRingA.rotation.x = hp * Math.PI * 4.2;
          hgOrbitRingA.rotation.y = hp * Math.PI * 3.2;
          hgOrbitRingB.rotation.z = -hp * Math.PI * 4.8;
          hgWaistGlow.scale.setScalar(0.85 + hp * 0.55 + Math.sin(hp * 24) * 0.12);

          const sandTransfer = Math.min(1, hp * 1.15);
          topSandMesh.scale.setScalar(Math.max(0.18, 1 - sandTransfer * 0.7));
          botSandMesh.scale.setScalar(0.35 + sandTransfer * 0.7);
          sandStream.scale.set(1 + Math.sin(hp * 20) * 0.25, 1, 1 + Math.sin(hp * 20) * 0.25);

          // Update Lightning Conduit Arcs from Traveler's Hands into the Hourglass Core!
          leftHandOrb.getWorldPosition(_tmpVecA);
          rightHandOrb.getWorldPosition(_tmpVecB);
          _tmpVecC.set(0, hgY, 1.65);
          arcMatCyan.opacity = 0.52;
          arcMatGold.opacity = 0.48;
          for (let i = 0; i < arcCount; i++) {
            arcLines[i].visible = true;
            const src = i % 2 === 0 ? _tmpVecA : _tmpVecB;
            const arr = arcPosAttrs[i].array as Float32Array;
            for (let s = 0; s < arcSegs; s++) {
              const t = s / (arcSegs - 1);
              const env = Math.sin(t * Math.PI);
              const jx = Math.sin(elapsedSec * 42 + i * 2.7 + s * 2.3) * 0.18 * env;
              const jy = Math.cos(elapsedSec * 38 + i * 3.9 + s * 2.6) * 0.2 * env;
              const jz = Math.sin(elapsedSec * 35 + i * 4.7 + s * 2.1) * 0.18 * env;
              arr[s * 3] = src.x + (_tmpVecC.x - src.x) * t + jx;
              arr[s * 3 + 1] = src.y + (_tmpVecC.y - src.y) * t + jy;
              arr[s * 3 + 2] = src.z + (_tmpVecC.z - src.z) * t + jz;
            }
            arcPosAttrs[i].needsUpdate = true;
          }

          // Converge mantra sparks into the Hourglass waist
          for (let i = 0; i < shardCount; i++) {
            const loopT = (hp * 2.2 + i / shardCount) % 1;
            const ang = mantraAngles[i] - hp * Math.PI * 4;
            const rad = 1.95 * (1 - loopT);
            _dummy.position.set(
              Math.cos(ang) * rad,
              0.2 + loopT * 1.75,
              1.65 + Math.sin(ang) * rad
            );
            _dummy.rotation.set(hp * 6 + i, ang, i);
            const s = 0.52 * (1 - loopT * 0.45);
            _dummy.scale.set(s * 0.7, s * 1.25, s * 0.7);
            _dummy.updateMatrix();
            shardInstanced.setMatrixAt(i, _dummy.matrix);
          }
          shardInstanced.instanceMatrix.needsUpdate = true;

          areaDome.visible = false;
          rayGroup.visible = false;
          shockwaveCyan.visible = false;
          shockwaveGold.visible = false;
          shockwaveOuter.visible = false;

          mantraLight.intensity = 12;
          hourglassLight.intensity = 5 + hp * 13;
          targetFov = 43 + hp * 4.5;
          bloomStrength = 0.23 + hp * 0.05;
          aberration = 0.0007 + hp * 0.0007;
          anamorphic = 0.03 + hp * 0.04;
          skyUniforms.uFlash.value = 0;
        } else {
          // =====================================================================
          // PHASE III: Ledakan Area & Time Stop Freeze!
          // =====================================================================
          const ep = (p - 0.64) / 0.36;
          const implosionT = Math.min(1, ep / 0.14);
          const blastT = Math.max(0, Math.min(1, (ep - 0.1) / 0.36));
          const blastEase = 1 - Math.pow(1 - blastT, 3);

          for (let i = 0; i < arcLines.length; i++) arcLines[i].visible = false;

          leftArmPivot.rotation.set(-1.1, 0.45, -0.45);
          rightArmPivot.rotation.set(-1.1, -0.45, 0.45);
          travelerHalo.visible = true;
          travelerHalo.rotation.z = ep * Math.PI * 0.55;

          rapalanMat.opacity = Math.max(0.28, 0.85 - ep * 0.48);
          vortexUniforms.uTime.value += dt * timeStopFreezeFactor * 0.4;
          vortexUniforms.uAlpha.value = Math.max(0, (1 - blastT) * 0.2);
          risingHaloMat.opacity = Math.max(0, (1 - blastT) * 0.22);
          pylonBeamMat.opacity = Math.max(0.05, 0.14 * (1 - ep * 0.55));

          // Hourglass contracts briefly before exploding into Time Stop hover
          hourglassGroup.visible = true;
          hourglassGroup.position.set(0, 2.05 + Math.sin(ep * Math.PI) * 0.1, 1.65);
          const hgPulseScale =
            ep < 0.12
              ? 1.15 - implosionT * 0.25
              : 1.08 + Math.sin(Math.min(1, (ep - 0.12) / 0.2) * Math.PI) * 0.24;
          hourglassGroup.scale.setScalar(hgPulseScale);
          hourglassGroup.rotation.z = 0;
          hourglassGroup.rotation.y += dt * 1.4 * timeStopFreezeFactor;
          hgOrbitRingA.rotation.x += dt * 3.0 * timeStopFreezeFactor;
          hgOrbitRingB.rotation.z -= dt * 3.0 * timeStopFreezeFactor;
          hgWaistGlow.scale.setScalar(ep < 0.22 ? 1.35 : 0.95);
          sandStream.scale.setScalar(ep < 0.2 ? 1 : Math.max(0.05, 1 - (ep - 0.2) * 4));

          // Expanding Chronos Fresnel Fracture Dome + Triple Ground Shockwaves + Volumetric Light Rays
          if (ep >= 0.08) {
            areaDome.visible = true;
            areaDome.scale.setScalar(0.8 + blastEase * 9.8);
            domeUniforms.uTime.value = isFrozen ? 1.5 : elapsedSec;
            domeUniforms.uAlpha.value = ep < 0.4 ? 0.44 : Math.max(0.12, 0.44 - (ep - 0.4) * 0.5);

            shockwaveCyan.visible = true;
            shockwaveGold.visible = true;
            shockwaveOuter.visible = true;
            shockwaveCyan.scale.setScalar(0.8 + blastEase * 10.8);
            shockwaveGold.scale.setScalar(0.5 + blastEase * 8.2);
            shockwaveOuter.scale.setScalar(1.2 + blastEase * 12.2);
            const ringFade = ep < 0.45 ? 1 : Math.max(0.15, 1 - (ep - 0.45) * 1.1);
            shockwaveCyanMat.opacity = ringFade * 0.55;
            shockwaveGoldMat.opacity = ringFade * 0.5;

            rayGroup.visible = ep < 0.44;
            rayMat.opacity = ep < 0.2 ? ((ep - 0.08) / 0.12) * 0.11 : Math.max(0, 0.11 * (1 - (ep - 0.2) / 0.24));
            rayGroup.scale.setScalar(0.6 + blastEase * 1.15);
          }

          // Radial Shards burst outward from the Hourglass then FREEZE dead in mid-air!
          shardInstanced.visible = true;
          const frozenDist = blastT < 1 ? blastEase : 1 + (ep - 0.46) * 0.015;
          for (let i = 0; i < shardCount; i++) {
            const dist = frozenDist * shardSpeeds[i];
            _dummy.position.set(
              shardDirs[i].x * dist,
              Math.max(0.16, 1.95 + shardDirs[i].y * dist * 0.85),
              1.65 + shardDirs[i].z * dist
            );
            _dummy.rotation.set(frozenDist * 5 + i, frozenDist * 4, i * 0.6);
            _dummy.scale.set(0.7, 1.25, 0.7);
            _dummy.updateMatrix();
            shardInstanced.setMatrixAt(i, _dummy.matrix);
          }
          shardInstanced.instanceMatrix.needsUpdate = true;

          // Subtle background flash then cool deep freeze
          const impactPulse = ep > 0.08 && ep < 0.45 ? 1 - (ep - 0.08) / 0.37 : 0;
          targetFov = ep < 0.12 ? 47.5 - implosionT * 5.0 : 42.5 + blastEase * 11.5 - ep * 3.0;
          bloomStrength = 0.24 + impactPulse * 0.1;
          aberration = 0.0007 + impactPulse * 0.0022;
          shockWave = ep >= 0.08 && ep < 0.52 ? Math.max(0, 0.65 * (1 - (ep - 0.08) / 0.44)) : 0;
          shockRadius = Math.max(0, (ep - 0.08) * 1.45);
          freezeDesat = ep < 0.12 ? 0 : Math.min(0.24, (ep - 0.12) * 0.8);
          anamorphic = 0.03 + impactPulse * 0.09;
          postFlash = ep > 0.09 && ep < 0.18 ? (1 - Math.abs(ep - 0.13) / 0.05) * 0.07 : 0;
          skyUniforms.uFlash.value = postFlash;

          mantraLight.intensity = 7;
          hourglassLight.intensity = Math.max(6, 18 * (1 - blastT * 0.55));
          cyanRim.intensity = Math.max(9, 18 * (1 - blastT * 0.4));
        }

        // Dynamic 3D Camera Choreography
        if (p < 0.34) {
          const rp = p / 0.34;
          _camTarget.set(2.35 - rp * 0.55, 2.05 - rp * 0.25, 5.4 - rp * 0.4);
          _lookTarget.set(0, 1.25, 0.45);
        } else if (p < 0.64) {
          const hp = (p - 0.34) / 0.3;
          const camAng = 0.36 - hp * 0.92;
          const camDist = 5.4 + hp * 1.4;
          _camTarget.set(
            Math.sin(camAng) * camDist,
            1.75 + hp * 0.95,
            Math.cos(camAng) * camDist + 0.6
          );
          _lookTarget.set(0, 1.4 + hp * 0.45, 1.25);
        } else {
          const ep = (p - 0.64) / 0.36;
          const shakeMag = ep >= 0.09 && ep < 0.32 ? (1 - (ep - 0.09) / 0.23) * 0.28 : 0;
          const shakeX = Math.sin(now * 0.09) * shakeMag;
          const shakeY = Math.cos(now * 0.12) * shakeMag;
          const camAng = -0.56 + ep * 1.05;
          const camDist = 6.9 + Math.min(1, ep * 1.4) * 2.4;
          _camTarget.set(
            Math.sin(camAng) * camDist + shakeX,
            2.65 + ep * 0.85 + shakeY,
            Math.cos(camAng) * camDist + 0.6
          );
          _lookTarget.set(0, 1.62, 1.05);
        }

        const dampFactor = 1 - Math.exp(-7.2 * dt);
        camera.position.lerp(_camTarget, dampFactor);
        _currentLook.lerp(_lookTarget, dampFactor);
        camera.lookAt(_currentLook);

        const nextFov = camera.fov + (targetFov - camera.fov) * dampFactor;
        if (Math.abs(nextFov - camera.fov) > 0.015) {
          camera.fov = nextFov;
          camera.updateProjectionMatrix();
        }

        if (composer && bloomPass) {
          bloomPass.strength = bloomStrength;
          shockUniforms.uAberration.value = aberration;
          shockUniforms.uShockWave.value = shockWave;
          shockUniforms.uShockRadius.value = shockRadius;
          shockUniforms.uFreezeDesat.value = freezeDesat;
          shockUniforms.uAnamorphic.value = anamorphic;
          shockUniforms.uFlash.value = postFlash;
          composer.render();
        } else {
          renderer.render(scene, camera);
        }

        if (isSoftwareGl) afterDraw(tick);
        else frameId = requestAnimationFrame(tick);
      };

      tick();

      return () => {
        isDisposed = true;
        cancelAnimationFrame(frameId);
        window.clearTimeout(frameId);
        window.removeEventListener('resize', handleResize);
        renderPass?.dispose();
        bloomPass?.dispose();
        shockPass?.dispose();
        outputPass?.dispose();
        composer?.dispose();
        for (const item of disposables) {
          try {
            item.dispose();
          } catch {
            // ignore disposal errors
          }
        }
        renderer?.dispose();
      };
    } catch {
      renderer?.dispose();
      onFallbackRef.current?.();
      return undefined;
    }
  }, [totalDuration]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#020915] overflow-hidden select-none"
      role="dialog"
      aria-label="Cutscene 3D Time Stop Berserk"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Top Cinematic Letterbox Bar (solid dark fill, no backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-[#020913]/92 border-b border-cyan-500/40 px-5 py-3.5 sm:px-8 sm:py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs font-game tracking-[0.24em] uppercase text-cyan-300 flex items-center gap-2 truncate">
            <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>TRAVELER · RAPALAN JAM PASIR 3D</span>
          </p>
          <h2 className="font-title text-base sm:text-2xl font-black tracking-wider text-amber-300 truncate">
            TIME STOP BERSERK
          </h2>
        </div>
        <div className="hidden sm:block text-right shrink-0">
          <span className="inline-block px-2.5 py-1 rounded border border-cyan-400/40 bg-cyan-950/75 text-[11px] font-game tracking-wider text-cyan-200">
            {phase === 'rapalan'
              ? 'FASE I · RAPALAN MANTRA'
              : phase === 'hourglass'
                ? 'FASE II · JAM PASIR MUNCUL'
                : 'FASE III · LEDAKAN TIME STOP'}
          </span>
        </div>
      </div>

      {/* Bottom Cinematic Letterbox Bar */}
      <div className="absolute inset-x-0 bottom-0 bg-[#020913]/92 border-t border-cyan-500/40 px-5 py-3 sm:px-8 sm:py-4 flex items-center justify-between gap-4">
        <p className="pointer-events-none text-[11px] sm:text-xs font-game tracking-wider text-cyan-200/90 truncate">
          {PHASE_LABELS[phase]}
        </p>

        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-400/60 hover:border-amber-300 text-cyan-50 font-game font-semibold text-xs sm:text-sm tracking-wide transition-colors cursor-pointer shrink-0 whitespace-nowrap"
        >
          <span>Lewati Cutscene</span>
          <FastForward className="w-4 h-4 text-amber-300" />
        </button>

        {/* Bottom Progress Strip */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-slate-900">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-sky-300 to-amber-300 transition-[width] duration-75"
            style={{ width: `${uiProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
