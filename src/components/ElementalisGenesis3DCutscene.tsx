import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FastForward } from 'lucide-react';
import {
  computeSanctuaryHeight,
  createSanctuarySkyTexture,
  createSanctuaryWaterTexture,
  createSanctuaryWaterfallTexture
} from '../game/elementalisSanctuaryWorld';

interface ElementalisGenesis3DCutsceneProps {
  remainingTime: number;
  totalDuration?: number;
  onSkip: () => void;
  onWebGLUnavailable?: () => void;
}

type CutscenePhase = 'awakening' | 'shaping' | 'bloom';

const PHASE_LABELS: Record<CutscenePhase, string> = {
  awakening: 'FASE I · PENYATUAN EMPAT ELEMEN PURBA — MEMBELAH KEHAMPAAN',
  shaping: 'FASE II · KEBANGKITAN GUNUNG, DATARAN HIJAU, & DANAU KEHIDUPAN',
  bloom: 'FASE III · MEKARNYA HUTAN PURBA — PRIMORDIAL SANCTUARY TERCIPTA!'
};

const _camTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _currentLook = new THREE.Vector3(0, 1.4, 0);
const _dummy = new THREE.Object3D();
const _tmpColor = new THREE.Color();

export const ElementalisGenesis3DCutscene: React.FC<ElementalisGenesis3DCutsceneProps> = ({
  remainingTime,
  totalDuration = 5.8,
  onSkip,
  onWebGLUnavailable
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const remainingRef = useRef<number>(remainingTime);
  const lastSyncTimeRef = useRef<number>(performance.now());
  const onSkipRef = useRef(onSkip);
  const onFallbackRef = useRef(onWebGLUnavailable);

  const [phase, setPhase] = useState<CutscenePhase>('awakening');
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
      renderer.toneMappingExposure = 1.15;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.setSize(window.innerWidth, window.innerHeight, false);

      const disposables: Array<{ dispose: () => void }> = [];
      const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
        disposables.push(g);
        return g;
      };
      const trackMat = <T extends THREE.Material>(m: T): T => {
        disposables.push(m);
        return m;
      };

      const scene = new THREE.Scene();
      const skyVoidColor = new THREE.Color(0x041114);
      const skySanctuaryColor = new THREE.Color(0x0f2f38);
      scene.background = skyVoidColor.clone();
      scene.fog = new THREE.FogExp2(0x06191e, 0.017);

      const camera = new THREE.PerspectiveCamera(
        48,
        window.innerWidth / Math.max(1, window.innerHeight),
        0.1,
        160
      );
      camera.position.set(3.2, 2.1, 7.6);
      _currentLook.set(0, 1.4, 0);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      disposables.push(envRT, roomEnv, pmrem);

      // Lighting Rig: Warm Sun Key + Cool Teal/Emerald Sky Hemisphere + Elemental Accent Lights
      const hemiLight = new THREE.HemisphereLight(0x67e8f9, 0x14532d, 0.9);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xfff1c9, 2.2);
      sunLight.position.set(16, 24, 14);
      if (!isSoftwareGl) {
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(1024, 1024);
        sunLight.shadow.camera.near = 2;
        sunLight.shadow.camera.far = 70;
        sunLight.shadow.camera.left = -24;
        sunLight.shadow.camera.right = 24;
        sunLight.shadow.camera.top = 24;
        sunLight.shadow.camera.bottom = -24;
        sunLight.shadow.bias = -0.0005;
        sunLight.shadow.normalBias = 0.02;
      }
      scene.add(sunLight);

      const rimLight = new THREE.DirectionalLight(0x2dd4bf, 0.85);
      rimLight.position.set(-14, 10, -16);
      scene.add(rimLight);

      const coreLight = new THREE.PointLight(0x14b8a6, 12, 26, 1.3);
      coreLight.position.set(0, 2.2, 0);
      scene.add(coreLight);

      const lakeGlowLight = new THREE.PointLight(0x38bdf8, 0, 22, 1.4);
      lakeGlowLight.position.set(-6.8, 1.0, 5.2);
      scene.add(lakeGlowLight);

      // Procedural Canvas Texture 1: Gradient Twilight-Dawn Sky Dome
      const skyTex = createSanctuarySkyTexture();
      disposables.push(skyTex);

      const skyMat = trackMat(
        new THREE.MeshBasicMaterial({
          map: skyTex,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.15,
          depthWrite: false
        })
      );
      const skyDome = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(85, 32, 24)), skyMat);
      scene.add(skyDome);

      // Procedural Canvas Texture 2: Shimmering Lake Caustics & Ripples
      const waterTex = createSanctuaryWaterTexture(renderer);
      disposables.push(waterTex);

      // Procedural Canvas Texture 3: Cascading Waterfall Foam
      const fallTex = createSanctuaryWaterfallTexture();
      disposables.push(fallTex);

      // 1. Dynamic Morphing Terrain (Plains, Valley, Lake Basin, Foothills)
      const terrainSize = 54;
      const terrainSegs = 84;
      const terrainGeo = trackGeo(new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs));
      terrainGeo.rotateX(-Math.PI / 2);

      const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
      const vertCount = posAttr.count;
      const targetHeights = new Float32Array(vertCount);
      const vertRadii = new Float32Array(vertCount);
      const lushColors = new Float32Array(vertCount * 3);

      const cGrass = new THREE.Color(0x16a34a);
      const cMeadow = new THREE.Color(0x22c55e);
      const cMoss = new THREE.Color(0x15803d);
      const cSand = new THREE.Color(0x9a8c67);
      const cLakeBed = new THREE.Color(0x0c4a6e);
      const cRock = new THREE.Color(0x3f4c45);
      const cPeak = new THREE.Color(0x64748b);

      for (let i = 0; i < vertCount; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const h = computeSanctuaryHeight(vx, vz);
        targetHeights[i] = h;
        const r = Math.hypot(vx, vz);
        vertRadii[i] = r;
        posAttr.setY(i, 0);

        const noise = Math.sin(vx * 0.7) * Math.cos(vz * 0.7) * 0.5 + 0.5;

        if (h < -0.55) {
          _tmpColor.copy(cLakeBed);
        } else if (h < -0.05) {
          _tmpColor.copy(cSand).lerp(cMoss, (h + 0.55) / 0.5);
        } else if (h > 2.2) {
          _tmpColor.copy(cRock).lerp(cPeak, Math.min(1, (h - 2.2) / 2.8));
        } else if (h > 1.0) {
          _tmpColor.copy(cMoss).lerp(cRock, (h - 1.0) / 1.2);
        } else {
          _tmpColor.copy(cMoss).lerp(cGrass, noise * 0.7).lerp(cMeadow, r < 7.5 ? 0.35 : 0.12);
        }

        lushColors[i * 3] = _tmpColor.r;
        lushColors[i * 3 + 1] = _tmpColor.g;
        lushColors[i * 3 + 2] = _tmpColor.b;
      }

      terrainGeo.setAttribute('color', new THREE.BufferAttribute(lushColors, 3));
      terrainGeo.setAttribute('aTargetHeight', new THREE.BufferAttribute(targetHeights, 1));

      const terrainUniforms = {
        uWaveRadius: { value: -2.5 },
        uWaveActive: { value: 0.0 },
        uTime: { value: 0.0 }
      };

      const terrainMat = trackMat(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.86,
          metalness: 0.08
        })
      );
      terrainMat.customProgramCacheKey = () => 'elementalis-genesis-terrain-v1';
      terrainMat.onBeforeCompile = (shader) => {
        shader.uniforms.uWaveRadius = terrainUniforms.uWaveRadius;
        shader.uniforms.uWaveActive = terrainUniforms.uWaveActive;
        shader.uniforms.uTime = terrainUniforms.uTime;

        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            attribute float aTargetHeight;
            uniform float uWaveRadius;
            uniform float uWaveActive;
            uniform float uTime;
            varying vec3 vTerrainPos;
            varying float vTargetHeight;
            varying float vSlope;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float vDist = length(transformed.xz);
            float rippleEnv = exp(-pow((vDist - uWaveRadius) / 1.85, 2.0)) * uWaveActive;
            transformed.y += rippleEnv * (0.26 + 0.12 * sin(vDist * 2.4 - uTime * 7.5));
            vTerrainPos = transformed;
            vTargetHeight = aTargetHeight;
            vSlope = 1.0 - clamp(objectNormal.y, 0.0, 1.0);`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            uniform float uWaveRadius;
            uniform float uWaveActive;
            uniform float uTime;
            varying vec3 vTerrainPos;
            varying float vTargetHeight;
            varying float vSlope;

            float genesisHash21(vec2 p) {
              p = fract(p * vec2(123.34, 456.21));
              p += dot(p, p + 45.32);
              return fract(p.x * p.y);
            }

            float genesisVNoise(vec2 p) {
              vec2 i = floor(p);
              vec2 f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              float a = genesisHash21(i);
              float b = genesisHash21(i + vec2(1.0, 0.0));
              float c = genesisHash21(i + vec2(0.0, 1.0));
              float d = genesisHash21(i + vec2(1.0, 1.0));
              return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float genesisFbm(vec2 p) {
              float v = 0.0;
              float amp = 0.5;
              for (int i = 0; i < 4; i++) {
                v += amp * genesisVNoise(p);
                p = p * 2.03 + vec2(17.1, 31.7);
                amp *= 0.5;
              }
              return v;
            }`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float warp = (genesisFbm(vTerrainPos.xz * 0.24) - 0.5) * 3.8 + sin(atan(vTerrainPos.z, vTerrainPos.x) * 5.0 + uTime * 0.6) * 0.45;
            float radialDist = length(vTerrainPos.xz) + warp;
            float landMask = 1.0 - smoothstep(uWaveRadius - 1.4, uWaveRadius + 0.7, radialDist);
            float frontier = exp(-pow((radialDist - uWaveRadius) / 1.15, 2.0)) * uWaveActive;
            float innerCrackBand = exp(-pow((radialDist - (uWaveRadius + 1.7)) / 1.4, 2.0)) * uWaveActive;

            // State A: Dark Cyber/Runic Arena Tiles matching GameEngine's arena floor
            vec2 tileCoord = vTerrainPos.xz * 0.85;
            vec2 tileId = floor(tileCoord);
            vec2 tileFract = fract(tileCoord);
            float tileHash = genesisHash21(tileId);
            float edgeDist = min(min(tileFract.x, 1.0 - tileFract.x), min(tileFract.y, 1.0 - tileFract.y));
            float groutMask = 1.0 - smoothstep(0.018, 0.055, edgeDist);
            float bevelHighlight = smoothstep(0.05, 0.09, edgeDist) * (1.0 - smoothstep(0.09, 0.15, edgeDist));
            float tileGrain = genesisVNoise(vTerrainPos.xz * 4.5 + tileHash * 17.0);

            vec3 arenaBase = mix(vec3(0.005, 0.010, 0.026), vec3(0.015, 0.025, 0.058), tileHash * 0.55 + tileGrain * 0.35);
            arenaBase += vec3(0.014, 0.024, 0.048) * bevelHighlight;
            arenaBase = mix(arenaBase, vec3(0.002, 0.004, 0.010), groutMask * 0.85);

            float rFlat = length(vTerrainPos.xz);
            float ring1 = exp(-pow((rFlat - 3.6) / 0.10, 2.0));
            float ring2 = exp(-pow((rFlat - 7.4) / 0.11, 2.0));
            float ring3 = exp(-pow((rFlat - 12.2) / 0.13, 2.0));
            float ring4 = exp(-pow((rFlat - 18.0) / 0.14, 2.0));
            float crossHair = exp(-pow(min(abs(vTerrainPos.x), abs(vTerrainPos.z)) / 0.06, 2.0)) * smoothstep(24.0, 3.0, rFlat);
            float runeMask = clamp(ring1 + ring2 + ring3 + ring4 + crossHair * 0.35, 0.0, 1.0);
            float runePulse = 0.72 + 0.28 * sin(uTime * 2.4 - rFlat * 0.5);
            arenaBase = mix(arenaBase, vec3(0.035, 0.42, 0.78), runeMask * 0.45 * runePulse);

            // State B: Procedurally Generated Sanctuary Lore Terrain
            float detailLow = genesisFbm(vTerrainPos.xz * 0.42);
            float detailHigh = genesisVNoise(vTerrainPos.xz * 3.8);
            float microGrain = genesisVNoise(vTerrainPos.xz * 11.5);

            vec3 natureColor = diffuseColor.rgb;
            float grassZone = smoothstep(-0.08, 0.25, vTargetHeight) * (1.0 - smoothstep(0.95, 1.55, vTargetHeight));
            natureColor = mix(natureColor, natureColor * (0.78 + 0.48 * detailLow) + vec3(0.012, 0.035, 0.008) * detailHigh, grassZone);

            float shoreZone = smoothstep(-0.62, -0.25, vTargetHeight) * (1.0 - smoothstep(-0.05, 0.24, vTargetHeight));
            vec3 sandTone = mix(vec3(0.24, 0.20, 0.12), vec3(0.38, 0.32, 0.20), microGrain);
            float wetDarken = mix(0.55, 1.0, smoothstep(-0.32, 0.08, vTargetHeight));
            natureColor = mix(natureColor, sandTone * wetDarken, shoreZone * 0.75);

            float lakeZone = 1.0 - smoothstep(-0.58, -0.22, vTargetHeight);
            float caustic = pow(abs(sin(vTerrainPos.x * 1.9 + detailLow * 4.5 + uTime * 0.7) * cos(vTerrainPos.z * 1.9 - detailHigh * 3.0 - uTime * 0.5)), 2.5);
            vec3 lakeTone = mix(vec3(0.012, 0.09, 0.16), vec3(0.03, 0.24, 0.36), detailLow) + vec3(0.06, 0.28, 0.36) * caustic;
            natureColor = mix(natureColor, lakeTone, lakeZone * 0.85);

            float rockZone = clamp(smoothstep(0.85, 2.0, vTargetHeight) + smoothstep(0.22, 0.52, vSlope) * 0.75, 0.0, 1.0);
            float strata = 0.5 + 0.5 * sin(vTargetHeight * 7.5 + detailLow * 5.0);
            vec3 rockTone = mix(vec3(0.055, 0.072, 0.065), vec3(0.14, 0.16, 0.17), strata * 0.65 + detailHigh * 0.35);
            natureColor = mix(natureColor, rockTone, rockZone * 0.78);

            float peakFrost = smoothstep(2.65, 4.1, vTargetHeight + (detailHigh - 0.5) * 0.55);
            natureColor = mix(natureColor, vec3(0.48, 0.56, 0.62), peakFrost * 0.68);

            diffuseColor.rgb = mix(arenaBase, natureColor, landMask);
            vec3 seamTint = mix(vec3(0.08, 0.68, 0.62), vec3(0.85, 0.62, 0.14), clamp(detailHigh * 1.1, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, seamTint, frontier * 0.55);`
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            float arenaRough = mix(0.36, 0.74, groutMask);
            float wetSandFactor = shoreZone * (1.0 - smoothstep(-0.35, 0.04, vTargetHeight));
            float natureRough = mix(0.86, 0.24, clamp(lakeZone + wetSandFactor, 0.0, 1.0));
            roughnessFactor = mix(arenaRough, natureRough, landMask);`
          )
          .replace(
            '#include <metalnessmap_fragment>',
            `#include <metalnessmap_fragment>
            metalnessFactor = mix(mix(0.32, 0.08, groutMask), 0.04, landMask);`
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            vec3 runeGlow = vec3(0.04, 0.52, 0.92) * runeMask * (0.28 + 0.35 * innerCrackBand) * (1.0 - landMask);
            vec3 groutCrackGlow = vec3(0.08, 0.82, 0.72) * groutMask * innerCrackBand * 1.45;
            vec3 frontierGlow = mix(vec3(0.08, 0.85, 0.74), vec3(0.98, 0.72, 0.18), detailHigh) * frontier * 1.85;
            vec3 causticGlow = vec3(0.03, 0.22, 0.34) * caustic * lakeZone * landMask * 0.55;
            totalEmissiveRadiance += runeGlow + groutCrackGlow + frontierGlow + causticGlow;`
          );
      };

      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
      terrainMesh.receiveShadow = !isSoftwareGl;
      scene.add(terrainMesh);

      // 2. Central Mossy Stone Sanctuary Altar & Glowing Leyline Ring (Ground Anchor)
      const altarGroup = new THREE.Group();
      const stoneMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x334155,
          roughness: 0.78,
          metalness: 0.18
        })
      );
      const leylineMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x2dd4bf,
          emissive: 0x14b8a6,
          emissiveIntensity: 1.5,
          roughness: 0.25,
          metalness: 0.6
        })
      );

      const dais = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.6, 3.1, 0.28, 12)), stoneMat);
      dais.position.y = 0.14;
      dais.receiveShadow = !isSoftwareGl;
      altarGroup.add(dais);

      const altarRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.85, 0.07, 10, 48)), leylineMat);
      altarRing.rotation.x = Math.PI / 2;
      altarRing.position.y = 0.08;
      altarGroup.add(altarRing);

      // 4 Elemental Standing Monoliths around the center clearing
      const elementColors = [0xf97316, 0x34d399, 0x38bdf8, 0xf59e0b];
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2 + Math.PI / 4;
        const pillarGroup = new THREE.Group();
        pillarGroup.position.set(Math.cos(ang) * 4.2, 0, Math.sin(ang) * 4.2);
        pillarGroup.rotation.y = -ang;

        const baseStone = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 1.35, 0.45)), stoneMat);
        baseStone.position.y = 0.67;
        baseStone.castShadow = !isSoftwareGl;
        pillarGroup.add(baseStone);

        const runeCore = new THREE.Mesh(
          trackGeo(new THREE.OctahedronGeometry(0.24, 0)),
          trackMat(
            new THREE.MeshStandardMaterial({
              color: elementColors[i],
              emissive: elementColors[i],
              emissiveIntensity: 1.8,
              roughness: 0.2,
              metalness: 0.4
            })
          )
        );
        runeCore.position.y = 1.65;
        pillarGroup.add(runeCore);

        altarGroup.add(pillarGroup);
      }
      scene.add(altarGroup);

      // 3. Elementalis 3D Avatar + 4 Orbiting Primordial Constructs
      const heroGroup = new THREE.Group();
      heroGroup.position.set(0, 0.35, 0);

      const robeMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0f766e,
          emissive: 0x042f2e,
          emissiveIntensity: 0.35,
          roughness: 0.42,
          metalness: 0.35
        })
      );
      const goldTrimMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0x78350f,
          emissiveIntensity: 0.3,
          roughness: 0.22,
          metalness: 0.88
        })
      );
      const spiritCoreMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x5eead4,
          emissive: 0x14b8a6,
          emissiveIntensity: 2.2,
          roughness: 0.15,
          metalness: 0.3
        })
      );

      // Lower cloak + torso + pauldrons + head + floating halo
      const lowerRobe = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.56, 1.25, 10)), robeMat);
      lowerRobe.position.y = 0.62;
      heroGroup.add(lowerRobe);

      const chestArmor = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.24, 0.65, 8)), goldTrimMat);
      chestArmor.position.y = 1.32;
      heroGroup.add(chestArmor);

      const heartGem = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.18, 0)), spiritCoreMat);
      heartGem.position.set(0, 1.35, 0.28);
      heroGroup.add(heartGem);

      const headSphere = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.24, 16, 16)), spiritCoreMat);
      headSphere.position.y = 1.88;
      heroGroup.add(headSphere);

      const hoodHelm = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.34, 0.54, 8)),
        robeMat
      );
      hoodHelm.position.set(0, 2.02, -0.04);
      hoodHelm.rotation.x = -0.18;
      heroGroup.add(hoodHelm);

      const crownHalo = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.65, 0.045, 10, 36)), goldTrimMat);
      crownHalo.position.set(0, 1.85, -0.12);
      heroGroup.add(crownHalo);

      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.18, 0.32)), goldTrimMat);
        pauldron.position.set(side * 0.44, 1.56, 0);
        pauldron.rotation.z = side * -0.35;
        heroGroup.add(pauldron);

        const arm = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.07, 0.055, 0.72, 8)), robeMat);
        arm.position.set(side * 0.68, 1.58, 0.22);
        arm.rotation.z = side * -1.05;
        arm.rotation.x = -0.45;
        heroGroup.add(arm);
      }

      // 4 Distinct Orbiting Primordial Element Orbs around Elementalis
      const orbGroup = new THREE.Group();
      orbGroup.position.y = 1.45;
      const orbMeshes: THREE.Group[] = [];
      for (let i = 0; i < 4; i++) {
        const subOrb = new THREE.Group();
        const col = elementColors[i];
        const oMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 1.9,
            roughness: 0.2,
            metalness: 0.4
          })
        );
        const core = new THREE.Mesh(
          trackGeo(i === 3 ? new THREE.DodecahedronGeometry(0.22, 0) : new THREE.SphereGeometry(0.2, 16, 16)),
          oMat
        );
        const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.32, 0.028, 8, 24)), oMat);
        ring.rotation.x = Math.PI / 2.4;
        subOrb.add(core, ring);
        orbGroup.add(subOrb);
        orbMeshes.push(subOrb);
      }
      heroGroup.add(orbGroup);
      scene.add(heroGroup);

      // 4. Shimmering Turquoise Lake & Floating Lily Pads + Waterfall
      const lakeGeo = trackGeo(new THREE.CircleGeometry(7.2, 48));
      lakeGeo.rotateX(-Math.PI / 2);
      const lakeMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: waterTex,
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.28,
          roughness: 0.12,
          metalness: 0.35,
          transparent: true,
          opacity: 0
        })
      );
      const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
      lakeMesh.position.set(-6.8, -0.38, 5.2);
      lakeMesh.scale.set(1.15, 1, 0.85);
      scene.add(lakeMesh);

      // Lily pads & glowing lotus flowers on the lake
      const lilyGroup = new THREE.Group();
      const lilyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.65 }));
      const lotusMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xf9a8d4,
          emissive: 0xf472b6,
          emissiveIntensity: 0.7,
          roughness: 0.35
        })
      );
      for (let i = 0; i < 12; i++) {
        const ang = i * 1.17;
        const rad = 1.1 + (i % 4) * 1.15;
        const pad = new THREE.Group();
        pad.position.set(-6.8 + Math.cos(ang) * rad * 1.1, -0.34, 5.2 + Math.sin(ang) * rad * 0.78);
        const leaf = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12, 1, false, 0, Math.PI * 1.8)), lilyMat);
        pad.add(leaf);
        if (i % 3 === 0) {
          const lotus = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.14, 0)), lotusMat);
          lotus.position.y = 0.1;
          pad.add(lotus);
        }
        lilyGroup.add(pad);
      }
      lilyGroup.scale.setScalar(0.001);
      scene.add(lilyGroup);

      // Waterfall Ribbon cascading from cliff (+x, -z) into upper stream
      const fallCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(9.4, 3.6, -8.2),
        new THREE.Vector3(8.1, 2.2, -6.9),
        new THREE.Vector3(7.1, 0.4, -5.6),
        new THREE.Vector3(6.6, -0.35, -4.8)
      ]);
      const fallGeo = trackGeo(new THREE.TubeGeometry(fallCurve, 24, 0.85, 8, false));
      fallGeo.scale(1.4, 1, 0.35);
      const fallMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: fallTex,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.45,
          roughness: 0.15,
          transparent: true,
          opacity: 0
        })
      );
      const waterfallMesh = new THREE.Mesh(fallGeo, fallMat);
      scene.add(waterfallMesh);

      // 5. Towering Multi-Part Mountains (Gunung) with Snow Caps & Glowing Mineral Veins
      const mountainsGroup = new THREE.Group();
      const rockMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9, metalness: 0.08, flatShading: true }));
      const snowMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.55, metalness: 0.05, flatShading: true }));
      const veinTealMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2dd4bf, emissive: 0x14b8a6, emissiveIntensity: 1.6, roughness: 0.3 }));
      const veinAmberMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 1.4, roughness: 0.3 }));

      const mountainRecords: Array<{ group: THREE.Group; targetY: number; delay: number }> = [];
      const mountainCount = 16;
      for (let i = 0; i < mountainCount; i++) {
        const ang = (i / mountainCount) * Math.PI * 2 + 0.15;
        // Leave slight camera gap toward front-right so camera view into the lake & valley stays open
        const dist = 17.5 + (i % 3) * 3.2;
        const mx = Math.cos(ang) * dist;
        const mz = Math.sin(ang) * dist;
        const mScale = 1.0 + ((i * 37) % 10) * 0.09;
        const peakH = (5.4 + (i % 4) * 2.1) * mScale;

        const mGroup = new THREE.Group();
        mGroup.position.set(mx, -peakH, mz);
        mGroup.rotation.y = ang + i * 0.5;

        // Primary Peak
        const mainPeak = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(3.4 * mScale, peakH, 7)), rockMat);
        mainPeak.position.y = peakH * 0.5;
        mainPeak.castShadow = !isSoftwareGl;
        mGroup.add(mainPeak);

        // Secondary Ridge Crag
        const ridge = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(2.3 * mScale, peakH * 0.68, 6)), rockMat);
        ridge.position.set(1.6 * mScale, peakH * 0.34, 0.7 * mScale);
        mGroup.add(ridge);

        // Snow Cap
        const snowCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.18 * mScale, peakH * 0.32, 7)), snowMat);
        snowCap.position.y = peakH * 0.845;
        mGroup.add(snowCap);

        // Glowing Elemental Leyline Crystal Vein on the mountain slope
        const vein = new THREE.Mesh(
          trackGeo(new THREE.OctahedronGeometry(0.55 * mScale, 0)),
          i % 3 === 0 ? veinAmberMat : veinTealMat
        );
        vein.scale.set(0.5, 2.6, 0.5);
        vein.position.set(0, peakH * 0.42, 1.55 * mScale);
        vein.rotation.x = 0.32;
        mGroup.add(vein);

        mountainsGroup.add(mGroup);
        const baseGroundY = computeSanctuaryHeight(mx, mz) - 0.6;
        mountainRecords.push({
          group: mGroup,
          targetY: baseGroundY,
          delay: (i % 5) * 0.04
        });
      }
      scene.add(mountainsGroup);

      // 6. Ancient Primordial Spirit Tree on the Cliff Promontory (Multi-part Hero Tree)
      const spiritTreeGroup = new THREE.Group();
      const stX = 8.4;
      const stZ = -7.8;
      const stGround = computeSanctuaryHeight(stX, stZ);
      spiritTreeGroup.position.set(stX, stGround - 0.2, stZ);

      const barkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x452719, roughness: 0.92 }));
      const spiritLeafMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.35,
          roughness: 0.65
        })
      );
      const sakuraLeafMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xf472b6,
          emissive: 0xbe185d,
          emissiveIntensity: 0.32,
          roughness: 0.6
        })
      );

      const trunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.38, 0.72, 3.2, 8)), barkMat);
      trunk.position.y = 1.6;
      spiritTreeGroup.add(trunk);

      const canopyOffsets: Array<[number, number, number, number, boolean]> = [
        [0, 3.5, 0, 1.65, false],
        [-1.05, 3.05, 0.65, 1.15, true],
        [1.1, 3.15, -0.5, 1.2, false],
        [0.2, 4.15, 0.4, 1.15, true],
        [-0.35, 2.85, -0.95, 1.05, false]
      ];
      for (const [cx, cy, cz, cr, isPink] of canopyOffsets) {
        const crown = new THREE.Mesh(
          trackGeo(new THREE.IcosahedronGeometry(cr, 1)),
          isPink ? sakuraLeafMat : spiritLeafMat
        );
        crown.position.set(cx, cy, cz);
        crown.scale.y = 0.72;
        spiritTreeGroup.add(crown);
      }
      spiritTreeGroup.scale.setScalar(0.001);
      scene.add(spiritTreeGroup);

      // 7. Instanced Forest Groves (72 Pine Trees + 24 Blossom Trees + 40 Boulders/Crystals)
      const pineCount = 72;
      const pinePositions: Array<{ x: number; y: number; z: number; s: number; rot: number }> = [];
      for (let i = 0; i < pineCount * 2 && pinePositions.length < pineCount; i++) {
        const ang = (i * 2.39996) % (Math.PI * 2);
        const rad = 7.4 + ((i * 19) % 100) / 100 * 8.6;
        const tx = Math.cos(ang) * rad;
        const tz = Math.sin(ang) * rad;
        const ty = computeSanctuaryHeight(tx, tz);
        // Keep out of the lake & central altar
        if (ty < 0.02) continue;
        pinePositions.push({
          x: tx,
          y: ty - 0.12,
          z: tz,
          s: 0.72 + ((i * 31) % 10) * 0.075,
          rot: i * 0.8
        });
      }

      const pineTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.18, 0.9, 6));
      pineTrunkGeo.translate(0, 0.45, 0);
      const pineCone1Geo = trackGeo(new THREE.ConeGeometry(0.68, 1.15, 7));
      pineCone1Geo.translate(0, 1.25, 0);
      const pineCone2Geo = trackGeo(new THREE.ConeGeometry(0.5, 1.0, 7));
      pineCone2Geo.translate(0, 1.85, 0);

      const pineFoliageMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, flatShading: true }));
      const pineTrunks = new THREE.InstancedMesh(pineTrunkGeo, barkMat, pinePositions.length);
      const pineLowerCones = new THREE.InstancedMesh(pineCone1Geo, pineFoliageMat, pinePositions.length);
      const pineUpperCones = new THREE.InstancedMesh(pineCone2Geo, pineFoliageMat, pinePositions.length);
      pineLowerCones.frustumCulled = false;
      pineUpperCones.frustumCulled = false;
      pineTrunks.frustumCulled = false;

      const pinePalette = [0x15803d, 0x166534, 0x0f766e, 0x22c55e];
      for (let i = 0; i < pinePositions.length; i++) {
        _tmpColor.setHex(pinePalette[i % pinePalette.length]);
        pineLowerCones.setColorAt(i, _tmpColor);
        _tmpColor.offsetHSL(0, 0, 0.05);
        pineUpperCones.setColorAt(i, _tmpColor);
      }
      if (pineLowerCones.instanceColor) pineLowerCones.instanceColor.needsUpdate = true;
      if (pineUpperCones.instanceColor) pineUpperCones.instanceColor.needsUpdate = true;
      scene.add(pineTrunks, pineLowerCones, pineUpperCones);

      // Blossom Trees (24 instanced)
      const blossomCount = 24;
      const blossomPositions: Array<{ x: number; y: number; z: number; s: number }> = [];
      for (let i = 0; i < 60 && blossomPositions.length < blossomCount; i++) {
        const ang = (i * 1.81 + 0.4) % (Math.PI * 2);
        const rad = 6.2 + ((i * 23) % 100) / 100 * 6.5;
        const bx = Math.cos(ang) * rad;
        const bz = Math.sin(ang) * rad;
        const by = computeSanctuaryHeight(bx, bz);
        if (by < 0.04) continue;
        blossomPositions.push({ x: bx, y: by - 0.1, z: bz, s: 0.75 + (i % 5) * 0.12 });
      }
      const blossomTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.2, 1.1, 6));
      blossomTrunkGeo.translate(0, 0.55, 0);
      const blossomCrownGeo = trackGeo(new THREE.IcosahedronGeometry(0.75, 1));
      blossomCrownGeo.translate(0, 1.45, 0);
      const blossomMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }));
      const blossomTrunks = new THREE.InstancedMesh(blossomTrunkGeo, barkMat, blossomPositions.length);
      const blossomCrowns = new THREE.InstancedMesh(blossomCrownGeo, blossomMat, blossomPositions.length);
      blossomTrunks.frustumCulled = false;
      blossomCrowns.frustumCulled = false;
      for (let i = 0; i < blossomPositions.length; i++) {
        _tmpColor.setHex(i % 2 === 0 ? 0xf9a8d4 : 0xfde68a);
        blossomCrowns.setColorAt(i, _tmpColor);
      }
      if (blossomCrowns.instanceColor) blossomCrowns.instanceColor.needsUpdate = true;
      scene.add(blossomTrunks, blossomCrowns);

      // Instanced Mossy Boulders (36)
      const rockPositions: Array<{ x: number; y: number; z: number; s: number; rot: number }> = [];
      for (let i = 0; i < 36; i++) {
        const ang = i * 2.13;
        const rad = 5.2 + (i % 9) * 1.35;
        const rx = Math.cos(ang) * rad;
        const rz = Math.sin(ang) * rad;
        const ry = computeSanctuaryHeight(rx, rz);
        rockPositions.push({ x: rx, y: ry + 0.05, z: rz, s: 0.35 + (i % 4) * 0.2, rot: i * 0.9 });
      }
      const boulderGeo = trackGeo(new THREE.DodecahedronGeometry(0.65, 0));
      const bouldersMesh = new THREE.InstancedMesh(boulderGeo, stoneMat, rockPositions.length);
      bouldersMesh.frustumCulled = false;
      scene.add(bouldersMesh);

      // 8. Drifting 3D Fluffy Clouds high above the mountain rim
      const cloudsGroup = new THREE.Group();
      const cloudMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xe0f2fe,
          emissive: 0x0f172a,
          emissiveIntensity: 0.12,
          roughness: 0.95,
          transparent: true,
          opacity: 0
        })
      );
      const cloudPuffGeo = trackGeo(new THREE.SphereGeometry(1.4, 12, 10));
      const clouds: THREE.Group[] = [];
      for (let c = 0; c < 8; c++) {
        const cg = new THREE.Group();
        const ang = (c / 8) * Math.PI * 2;
        cg.position.set(Math.cos(ang) * 18, 9.5 + (c % 3) * 1.4, Math.sin(ang) * 18);
        for (let p = 0; p < 4; p++) {
          const puff = new THREE.Mesh(cloudPuffGeo, cloudMat);
          puff.position.set((p - 1.5) * 1.2, (p % 2) * 0.45, ((p * 3) % 2 - 0.5) * 0.7);
          puff.scale.set(1.1 + (p % 2) * 0.35, 0.68, 0.9);
          cg.add(puff);
        }
        cloudsGroup.add(cg);
        clouds.push(cg);
      }
      scene.add(cloudsGroup);

      // 9. Swirling Elemental Fireflies & Blossom Petals (320 Points)
      const moteCount = 320;
      const motePos = new Float32Array(moteCount * 3);
      const moteCol = new Float32Array(moteCount * 3);
      const moteSeeds = new Float32Array(moteCount);
      const mPalette = [0x2dd4bf, 0x38bdf8, 0xfbbf24, 0x4ade80, 0xf472b6];
      for (let i = 0; i < moteCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 1.5 + Math.random() * 17;
        motePos[i * 3] = Math.cos(ang) * rad;
        motePos[i * 3 + 1] = 0.2 + Math.random() * 6.5;
        motePos[i * 3 + 2] = Math.sin(ang) * rad;
        moteSeeds[i] = Math.random() * Math.PI * 2;
        _tmpColor.setHex(mPalette[i % mPalette.length]);
        moteCol[i * 3] = _tmpColor.r;
        moteCol[i * 3 + 1] = _tmpColor.g;
        moteCol[i * 3 + 2] = _tmpColor.b;
      }
      const moteGeo = trackGeo(new THREE.BufferGeometry());
      moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
      moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
      const moteMat = trackMat(
        new THREE.PointsMaterial({
          size: 0.2,
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      const motes = new THREE.Points(moteGeo, moteMat);
      scene.add(motes);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      const handleResize = () => {
        if (!renderer) return;
        const w = window.innerWidth;
        const h = Math.max(1, window.innerHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      window.addEventListener('resize', handleResize);

      let frameId = 0;
      let isDisposed = false;
      let lastTime = performance.now();
      let lastUiStage: CutscenePhase = 'awakening';
      let lastUiPct = -1;

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
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        const sinceSync = (now - lastSyncTimeRef.current) / 1000;
        const liveRemaining = Math.max(0, remainingRef.current - sinceSync);
        const progress = Math.max(0, Math.min(1, 1 - liveRemaining / totalDuration));

        const nextPhase: CutscenePhase =
          progress < 0.32 ? 'awakening' : progress < 0.68 ? 'shaping' : 'bloom';
        if (nextPhase !== lastUiStage) {
          lastUiStage = nextPhase;
          setPhase(nextPhase);
        }
        const pctInt = Math.round(progress * 100);
        if (Math.abs(pctInt - lastUiPct) >= 1) {
          lastUiPct = pctInt;
          setUiProgress(pctInt);
        }

        // Phase weights
        const terrainT = THREE.MathUtils.smoothstep(progress, 0.18, 0.62);
        const waterT = THREE.MathUtils.smoothstep(progress, 0.34, 0.68);
        const forestT = THREE.MathUtils.smoothstep(progress, 0.56, 0.88);
        const elapsed = progress * totalDuration;

        // 1. Shader Transition Wavefront + Radial Terrain Elevation Morph
        const waveProgress = THREE.MathUtils.smoothstep(progress, 0.08, 0.72);
        const waveRadius = THREE.MathUtils.lerp(-2.5, 36.5, waveProgress);
        const waveActive =
          THREE.MathUtils.smoothstep(progress, 0.05, 0.12) *
          (1 - THREE.MathUtils.smoothstep(progress, 0.68, 0.78));
        terrainUniforms.uWaveRadius.value = waveRadius;
        terrainUniforms.uWaveActive.value = waveActive;
        terrainUniforms.uTime.value = elapsed;

        const globalSettle = THREE.MathUtils.smoothstep(progress, 0.52, 0.78);
        const getHeightFactor = (r: number) => {
          const localW = THREE.MathUtils.clamp((waveRadius + 0.8 - r) / 5.5, 0, 1);
          return Math.max(localW * localW * (3 - 2 * localW), globalSettle);
        };

        const pArr = posAttr.array as Float32Array;
        for (let i = 0; i < vertCount; i++) {
          pArr[i * 3 + 1] = targetHeights[i] * getHeightFactor(vertRadii[i]);
        }
        posAttr.needsUpdate = true;
        terrainGeo.computeVertexNormals();

        // 2. Rise Mountains
        for (const rec of mountainRecords) {
          const mT = THREE.MathUtils.smoothstep(progress, 0.22 + rec.delay, 0.62 + rec.delay);
          rec.group.position.y = THREE.MathUtils.lerp(rec.targetY - 8.5, rec.targetY, mT);
        }

        // 3. Lake & Waterfall emergence + animated water flow
        lakeMat.opacity = waterT * 0.92;
        fallMat.opacity = waterT * 0.88;
        waterTex.offset.x = elapsed * 0.05;
        waterTex.offset.y = elapsed * 0.035;
        fallTex.offset.y = -elapsed * 1.4;
        lakeMesh.position.y = -0.38 + Math.sin(elapsed * 2.1) * 0.025;
        lakeGlowLight.intensity = waterT * 9.5;

        const lilyScale = THREE.MathUtils.smoothstep(progress, 0.55, 0.84);
        lilyGroup.scale.setScalar(Math.max(0.001, lilyScale));

        // 4. Forest & Flora Sprouting
        spiritTreeGroup.scale.setScalar(Math.max(0.001, forestT));
        for (let i = 0; i < pinePositions.length; i++) {
          const p = pinePositions[i];
          const localDelay = (i % 6) * 0.03;
          const t = THREE.MathUtils.smoothstep(progress, 0.54 + localDelay, 0.84 + localDelay);
          const sc = Math.max(0.001, p.s * t);
          _dummy.position.set(p.x, p.y * getHeightFactor(Math.hypot(p.x, p.z)), p.z);
          _dummy.rotation.set(0, p.rot, 0);
          _dummy.scale.setScalar(sc);
          _dummy.updateMatrix();
          pineTrunks.setMatrixAt(i, _dummy.matrix);
          pineLowerCones.setMatrixAt(i, _dummy.matrix);
          pineUpperCones.setMatrixAt(i, _dummy.matrix);
        }
        pineTrunks.instanceMatrix.needsUpdate = true;
        pineLowerCones.instanceMatrix.needsUpdate = true;
        pineUpperCones.instanceMatrix.needsUpdate = true;

        for (let i = 0; i < blossomPositions.length; i++) {
          const b = blossomPositions[i];
          const t = THREE.MathUtils.smoothstep(progress, 0.6 + (i % 4) * 0.03, 0.9 + (i % 4) * 0.02);
          _dummy.position.set(b.x, b.y * getHeightFactor(Math.hypot(b.x, b.z)), b.z);
          _dummy.rotation.set(0, i * 0.7, 0);
          _dummy.scale.setScalar(Math.max(0.001, b.s * t));
          _dummy.updateMatrix();
          blossomTrunks.setMatrixAt(i, _dummy.matrix);
          blossomCrowns.setMatrixAt(i, _dummy.matrix);
        }
        blossomTrunks.instanceMatrix.needsUpdate = true;
        blossomCrowns.instanceMatrix.needsUpdate = true;

        for (let i = 0; i < rockPositions.length; i++) {
          const r = rockPositions[i];
          const t = THREE.MathUtils.smoothstep(progress, 0.3 + (i % 5) * 0.03, 0.65);
          _dummy.position.set(r.x, r.y * getHeightFactor(Math.hypot(r.x, r.z)), r.z);
          _dummy.rotation.set(0.2, r.rot, 0.15);
          _dummy.scale.setScalar(Math.max(0.001, r.s * t));
          _dummy.updateMatrix();
          bouldersMesh.setMatrixAt(i, _dummy.matrix);
        }
        bouldersMesh.instanceMatrix.needsUpdate = true;

        // 5. Sky, Clouds & Elementalis Channeling Animation
        skyMat.opacity = 0.15 + terrainT * 0.85;
        if (scene.background instanceof THREE.Color) {
          scene.background.copy(skyVoidColor).lerp(skySanctuaryColor, terrainT);
        }
        cloudMat.opacity = forestT * 0.78;
        for (let c = 0; c < clouds.length; c++) {
          clouds[c].rotation.y = elapsed * 0.04;
          clouds[c].position.y = 9.4 + (c % 3) * 1.4 + Math.sin(elapsed * 0.8 + c) * 0.25;
        }

        // Levitating Elementalis & 4 Orbiting Element Orbs
        heroGroup.position.y = 0.45 + Math.sin(elapsed * 2.5) * 0.18 + Math.sin(progress * Math.PI) * 0.45;
        heroGroup.rotation.y = elapsed * 0.35;
        crownHalo.rotation.z = elapsed * 1.1;
        const orbRad = 1.45 + Math.sin(progress * Math.PI) * 1.05;
        for (let i = 0; i < orbMeshes.length; i++) {
          const ang = elapsed * 2.4 + (i * Math.PI) / 2;
          orbMeshes[i].position.set(
            Math.cos(ang) * orbRad,
            Math.sin(elapsed * 3.0 + i) * 0.38,
            Math.sin(ang) * orbRad
          );
          orbMeshes[i].rotation.y = elapsed * 2.2;
          orbMeshes[i].rotation.x = elapsed * 1.5;
        }

        // Animate swirling fireflies / petals
        const mPosAttr = moteGeo.attributes.position as THREE.BufferAttribute;
        const mArr = mPosAttr.array as Float32Array;
        for (let i = 0; i < moteCount; i++) {
          const s = moteSeeds[i];
          mArr[i * 3 + 1] += dt * (0.45 + (i % 3) * 0.22);
          mArr[i * 3] += Math.sin(elapsed * 1.8 + s) * dt * 0.35;
          mArr[i * 3 + 2] += Math.cos(elapsed * 1.6 + s) * dt * 0.35;
          if (mArr[i * 3 + 1] > 7.5) mArr[i * 3 + 1] = 0.2;
        }
        mPosAttr.needsUpdate = true;

        // 6. Smooth 3-Phase Cinematic Camera Choreography
        if (progress < 0.34) {
          const t1 = progress / 0.34;
          const orbitAng = 0.65 + t1 * 0.85;
          _camTarget.set(Math.cos(orbitAng) * 6.4, 2.2 + t1 * 2.0, Math.sin(orbitAng) * 6.4);
          _lookTarget.set(0, 1.5, 0);
        } else if (progress < 0.7) {
          const t2 = (progress - 0.34) / 0.36;
          const orbitAng = 1.5 + t2 * 1.25;
          _camTarget.set(
            Math.cos(orbitAng) * THREE.MathUtils.lerp(6.4, 15.8, t2),
            THREE.MathUtils.lerp(4.2, 9.2, t2),
            Math.sin(orbitAng) * THREE.MathUtils.lerp(6.4, 15.8, t2)
          );
          _lookTarget.set(-1.5 * t2, 1.0, 1.2 * t2);
        } else {
          const t3 = (progress - 0.7) / 0.3;
          const orbitAng = 2.75 + t3 * 0.75;
          _camTarget.set(
            Math.cos(orbitAng) * THREE.MathUtils.lerp(15.8, 13.5, t3),
            THREE.MathUtils.lerp(9.2, 7.6, t3),
            Math.sin(orbitAng) * THREE.MathUtils.lerp(15.8, 13.5, t3)
          );
          _lookTarget.set(0, 1.1, 0);
        }

        const dampAlpha = 1 - Math.exp(-5.2 * dt);
        camera.position.lerp(_camTarget, dampAlpha);
        _currentLook.lerp(_lookTarget, dampAlpha);
        camera.lookAt(_currentLook);

        renderer.render(scene, camera);

        if (isSoftwareGl) afterDraw(tick);
        else frameId = requestAnimationFrame(tick);
      };

      tick();

      return () => {
        isDisposed = true;
        cancelAnimationFrame(frameId);
        window.clearTimeout(frameId);
        window.removeEventListener('resize', handleResize);
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
    }
  }, [totalDuration]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950 overflow-hidden select-none"
      role="dialog"
      aria-label="Cutscene 3D Elementalis Primordial Genesis"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Top Cinematic Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-5 sm:p-8 bg-gradient-to-b from-slate-950/85 via-slate-950/35 to-transparent flex items-start justify-between">
        <div>
          <p className="text-[11px] font-game tracking-[0.22em] uppercase text-teal-300/95">
            Elementalis · Primordial Genesis
          </p>
          <h2 className="font-title text-xl sm:text-3xl font-black tracking-wider text-white drop-shadow">
            SANCTUARY OF THE FOUR ELEMENTS
          </h2>
          <p className="mt-1 text-xs sm:text-sm font-game font-semibold text-emerald-200/90 tracking-wide">
            {PHASE_LABELS[phase]}
          </p>
        </div>
      </div>

      {/* Bottom Controls & Progress */}
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent flex items-end justify-between gap-4">
        <div className="pointer-events-none text-xs font-game text-teal-100/80 tracking-wide">
          Menciptakan Gunung, Dataran Hijau, Danau, &amp; Hutan Purba · {uiProgress}%
        </div>
        <button
          onClick={onSkip}
          className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-teal-400/60 hover:border-teal-300 text-slate-100 font-game font-semibold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap"
        >
          <span>Lewati Cutscene</span>
          <FastForward className="w-4 h-4 text-teal-300" />
        </button>
      </div>

      {/* Bottom Progress Bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-slate-900">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400 transition-[width] duration-100"
          style={{ width: `${uiProgress}%` }}
        />
      </div>
    </div>
  );
};
