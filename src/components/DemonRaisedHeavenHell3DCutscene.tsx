import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FastForward } from 'lucide-react';
import {
  computeHeavenHellHeight,
  create3DAngelRig,
  create3DDemonRig,
  createHeavenHellSkyTexture,
  createHeavenMarbleTexture,
  createHellLavaTexture,
  Summon3DRig
} from '../game/demonRaisedHeavenHellWorld';

interface DemonRaisedHeavenHell3DCutsceneProps {
  remainingTime: number;
  totalDuration?: number;
  onSkip: () => void;
  onWebGLUnavailable?: () => void;
}

type CutscenePhase = 'awakening' | 'shaping' | 'summoning';

const PHASE_LABELS: Record<CutscenePhase, string> = {
  awakening: 'FASE I · PEMBELAHAN DUALITAS — MEMBUKA GERBANG SURGA & NERAKA',
  shaping: 'FASE II · KEBANGKITAN SANCTUM SURGA & JURANG NERAKA',
  summoning: 'FASE III · PEMANGGILAN PASUKAN 3D MALAIKAT & IBLIS!'
};

const _camTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _currentLook = new THREE.Vector3(0, 1.4, 0);
const _tmpColor = new THREE.Color();

export const DemonRaisedHeavenHell3DCutscene: React.FC<DemonRaisedHeavenHell3DCutsceneProps> = ({
  remainingTime,
  totalDuration = 5.6,
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
      renderer.toneMappingExposure = 1.06;
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

      const scene = new THREE.Scene();
      const skyVoidColor = new THREE.Color(0x06040d);
      const skyDualityColor = new THREE.Color(0x130a1c);
      scene.background = skyVoidColor.clone();
      scene.fog = new THREE.FogExp2(0x0b0714, 0.016);

      const camera = new THREE.PerspectiveCamera(
        48,
        window.innerWidth / Math.max(1, window.innerHeight),
        0.1,
        160
      );
      camera.position.set(0, 3.0, 9.5);
      _currentLook.set(0, 1.4, 0);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      disposables.push(envRT, roomEnv, pmrem);

      // Balanced Warm Heaven / Crimson Hell Lighting Rig
      const hemiLight = new THREE.HemisphereLight(0xfef08a, 0x7f1d1d, 0.85);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.9);
      keyLight.position.set(-10, 22, 14);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.near = 2;
        keyLight.shadow.camera.far = 70;
        keyLight.shadow.camera.left = -24;
        keyLight.shadow.camera.right = 24;
        keyLight.shadow.camera.top = 24;
        keyLight.shadow.camera.bottom = -24;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.02;
      }
      scene.add(keyLight);

      const heavenLight = new THREE.PointLight(0xfde047, 12, 32, 1.3);
      heavenLight.position.set(-8.5, 4.2, 0);
      scene.add(heavenLight);

      const hellLight = new THREE.PointLight(0xf43f5e, 14, 32, 1.3);
      hellLight.position.set(8.5, 3.6, 2.0);
      scene.add(hellLight);

      const skyTex = createHeavenHellSkyTexture();
      const marbleTex = createHeavenMarbleTexture(renderer);
      const lavaTex = createHellLavaTexture(renderer);
      disposables.push(skyTex, marbleTex, lavaTex);

      const skyMat = trackMat(
        new THREE.MeshBasicMaterial({
          map: skyTex,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.16,
          depthWrite: false
        })
      );
      scene.add(new THREE.Mesh(trackGeo(new THREE.SphereGeometry(85, 32, 24)), skyMat));

      // 1. Dynamic Morphing Heaven & Hell Terrain
      const terrainSize = 54;
      const terrainSegs = 84;
      const terrainGeo = trackGeo(
        new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs)
      );
      terrainGeo.rotateX(-Math.PI / 2);

      const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
      const vertCount = posAttr.count;
      const targetHeights = new Float32Array(vertCount);
      const vertRadii = new Float32Array(vertCount);
      const splitColors = new Float32Array(vertCount * 3);

      const cMarble = new THREE.Color(0xdbeafe);
      const cGoldStone = new THREE.Color(0xfef08a);
      const cObsidian = new THREE.Color(0x1f1419);
      const cCharred = new THREE.Color(0x3b1219);
      const cMagma = new THREE.Color(0xdc2626);
      const cSeam = new THREE.Color(0x312e81);

      for (let i = 0; i < vertCount; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const h = computeHeavenHellHeight(vx, vz);
        targetHeights[i] = h;
        vertRadii[i] = Math.hypot(vx, vz);
        posAttr.setY(i, 0);

        if (vx < -1.2) {
          const blend = THREE.MathUtils.clamp((-vx - 1.2) / 10, 0, 1);
          _tmpColor.copy(cSeam).lerp(cMarble, blend);
          if (h > 1.2) _tmpColor.lerp(cGoldStone, 0.35);
        } else if (vx > 1.2) {
          const blend = THREE.MathUtils.clamp((vx - 1.2) / 10, 0, 1);
          _tmpColor.copy(cSeam).lerp(cObsidian, blend);
          if (h < -0.5) _tmpColor.lerp(cMagma, 0.72);
          else if (h > 1.2) _tmpColor.lerp(cCharred, 0.65);
        } else {
          _tmpColor.copy(cSeam);
        }

        splitColors[i * 3] = _tmpColor.r;
        splitColors[i * 3 + 1] = _tmpColor.g;
        splitColors[i * 3 + 2] = _tmpColor.b;
      }

      terrainGeo.setAttribute('color', new THREE.BufferAttribute(splitColors, 3));
      terrainGeo.setAttribute('aTargetHeight', new THREE.BufferAttribute(targetHeights, 1));

      const terrainUniforms = {
        uWaveRadius: { value: -2.5 },
        uWaveActive: { value: 0.0 },
        uTime: { value: 0.0 }
      };

      const terrainMat = trackMat(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.72,
          metalness: 0.16
        })
      );
      terrainMat.customProgramCacheKey = () => 'demon-raised-hh-cutscene-terrain-v1';
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
            varying float vTargetHeight;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float vDist = length(transformed.xz);
            float rippleEnv = exp(-pow((vDist - uWaveRadius) / 1.9, 2.0)) * uWaveActive;
            transformed.y += rippleEnv * (0.28 + 0.12 * sin(vDist * 2.3 - uTime * 7.0));
            vTerrainPos = transformed;
            vTargetHeight = aTargetHeight;`
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

            float hhHash21(vec2 p) {
              p = fract(p * vec2(123.34, 456.21));
              p += dot(p, p + 45.32);
              return fract(p.x * p.y);
            }
            float hhNoise(vec2 p) {
              vec2 i = floor(p);
              vec2 f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              return mix(
                mix(hhHash21(i), hhHash21(i + vec2(1.0, 0.0)), f.x),
                mix(hhHash21(i + vec2(0.0, 1.0)), hhHash21(i + vec2(1.0, 1.0)), f.x),
                f.y
              );
            }`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float n = hhNoise(vTerrainPos.xz * 0.45);
            float warp = (n - 0.5) * 3.2;
            float radialDist = length(vTerrainPos.xz) + warp;
            float landMask = 1.0 - smoothstep(uWaveRadius - 1.4, uWaveRadius + 0.7, radialDist);
            float frontier = exp(-pow((radialDist - uWaveRadius) / 1.15, 2.0)) * uWaveActive;

            // Arena initial state
            vec2 tileFract = fract(vTerrainPos.xz * 0.85);
            float edgeDist = min(min(tileFract.x, 1.0 - tileFract.x), min(tileFract.y, 1.0 - tileFract.y));
            float grout = 1.0 - smoothstep(0.02, 0.055, edgeDist);
            vec3 arenaBase = mix(vec3(0.015, 0.015, 0.032), vec3(0.005, 0.006, 0.014), grout);

            float seamMask = exp(-pow(vTerrainPos.x / 0.52, 2.0));
            float heavenSide = 1.0 - smoothstep(-1.4, 1.4, vTerrainPos.x);
            float hellSide = smoothstep(-1.4, 1.4, vTerrainPos.x);

            vec3 transformedColor = diffuseColor.rgb;
            // Subtle magma cracks on hell side
            float lavaCrack = smoothstep(0.68, 0.94, hhNoise(vTerrainPos.xz * 1.4 + vec2(uTime * 0.15))) * hellSide;
            transformedColor = mix(transformedColor, vec3(0.95, 0.25, 0.08), lavaCrack * 0.55);

            diffuseColor.rgb = mix(arenaBase, transformedColor, landMask);
            vec3 seamCol = mix(vec3(0.98, 0.88, 0.28), vec3(0.92, 0.18, 0.36), hellSide);
            diffuseColor.rgb = mix(diffuseColor.rgb, seamCol, frontier * 0.55);`
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float crackGlow = lavaCrack * landMask * 0.65;
            float centerSeamGlow = seamMask * landMask * (0.45 + 0.25 * sin(uTime * 4.0 + vTerrainPos.z * 0.5));
            vec3 seamTint = mix(vec3(0.98, 0.85, 0.25), vec3(0.92, 0.15, 0.35), smoothstep(-0.35, 0.35, vTerrainPos.x));
            totalEmissiveRadiance += seamTint * (centerSeamGlow + frontier * 1.1) + vec3(1.0, 0.32, 0.08) * crackGlow;`
          );
      };

      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
      terrainMesh.receiveShadow = !isSoftwareGl;
      scene.add(terrainMesh);

      // 2. Central Split Duality Altar (Left Gold Marble / Right Obsidian Crimson)
      const altarGroup = new THREE.Group();
      const heavenMarbleMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: marbleTex,
          color: 0xfef9c3,
          emissive: 0x0ea5e9,
          emissiveIntensity: 0.18,
          roughness: 0.26,
          metalness: 0.25
        })
      );
      const hellObsidianMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x1c1016,
          emissive: 0x450a0a,
          emissiveIntensity: 0.3,
          roughness: 0.45,
          metalness: 0.58
        })
      );
      const goldMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfde047,
          emissive: 0xd97706,
          emissiveIntensity: 0.75,
          roughness: 0.2,
          metalness: 0.88
        })
      );
      const crimsonGlowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xfb7185,
          emissive: 0xe11d48,
          emissiveIntensity: 1.25,
          roughness: 0.2,
          metalness: 0.45
        })
      );
      const azureGlowMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x7dd3fc,
          emissive: 0x38bdf8,
          emissiveIntensity: 1.25,
          roughness: 0.2,
          metalness: 0.4
        })
      );

      const dais = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.6, 3.05, 0.26, 16)), hellObsidianMat);
      dais.position.y = 0.13;
      altarGroup.add(dais);

      const leftArcRing = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(2.85, 0.05, 10, 32, Math.PI)),
        goldMat
      );
      leftArcRing.rotation.x = Math.PI / 2;
      leftArcRing.rotation.z = Math.PI / 2;
      leftArcRing.position.y = 0.08;
      altarGroup.add(leftArcRing);

      const rightArcRing = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(2.85, 0.05, 10, 32, Math.PI)),
        crimsonGlowMat
      );
      rightArcRing.rotation.x = Math.PI / 2;
      rightArcRing.rotation.z = -Math.PI / 2;
      rightArcRing.position.y = 0.08;
      altarGroup.add(rightArcRing);

      // Center Dividing Twilight Energy Pillar Seam
      const riftBeam = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(0.18, 28)),
        trackMat(
          new THREE.MeshBasicMaterial({
            color: 0xfef08a,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        )
      );
      riftBeam.rotation.x = -Math.PI / 2;
      riftBeam.position.y = 0.06;
      altarGroup.add(riftBeam);
      scene.add(altarGroup);

      // 3. Demon Raised Hero Avatar (Split Celestial-Infernal Duality Form)
      const heroGroup = new THREE.Group();
      heroGroup.position.set(0, 0.4, 0);

      const robeMesh = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.52, 1.25, 10)), hellObsidianMat);
      robeMesh.position.y = 0.62;
      heroGroup.add(robeMesh);

      const torsoMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.23, 0.68, 8)), hellObsidianMat);
      torsoMesh.position.y = 1.32;
      heroGroup.add(torsoMesh);

      const heartCore = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.16, 0)), goldMat);
      heartCore.position.set(0, 1.36, 0.28);
      heroGroup.add(heartCore);

      const headHelm = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.22, 0)), hellObsidianMat);
      headHelm.position.y = 1.88;
      heroGroup.add(headHelm);

      const visorL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.05, 0.08)), azureGlowMat);
      visorL.position.set(-0.07, 1.9, 0.17);
      const visorR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.05, 0.08)), crimsonGlowMat);
      visorR.position.set(0.07, 1.9, 0.17);
      heroGroup.add(visorL, visorR);

      // Left Half-Halo + Right Demon Horn
      const heroHalo = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.36, 0.025, 8, 24, Math.PI)), goldMat);
      heroHalo.position.set(-0.05, 2.25, 0);
      heroHalo.rotation.x = Math.PI / 2;
      heroHalo.rotation.z = Math.PI / 2;
      heroGroup.add(heroHalo);

      const heroHorn = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.06, 0.42, 6)), crimsonGlowMat);
      heroHorn.position.set(0.18, 2.15, 0);
      heroHorn.rotation.z = -0.5;
      heroGroup.add(heroHorn);

      // Asymmetrical Split Wings (Left Seraphic Gold Wing / Right Infernal Crimson Wing)
      const angelWingPivot = new THREE.Group();
      angelWingPivot.position.set(-0.22, 1.5, -0.2);
      const aBladeGeo = trackGeo(new THREE.BoxGeometry(0.85, 0.16, 0.04));
      for (let k = 0; k < 4; k++) {
        const w = new THREE.Mesh(aBladeGeo, k % 2 === 0 ? goldMat : azureGlowMat);
        w.position.set(-0.48 + k * 0.06, 0.35 - k * 0.24, -0.06);
        w.rotation.z = 0.55 - k * 0.26;
        w.scale.set(1.15 - k * 0.14, 1, 1);
        angelWingPivot.add(w);
      }

      const demonWingPivot = new THREE.Group();
      demonWingPivot.position.set(0.22, 1.5, -0.2);
      const dPlateGeo = trackGeo(new THREE.ConeGeometry(0.28, 0.92, 4));
      for (let k = 0; k < 3; k++) {
        const w = new THREE.Mesh(dPlateGeo, k === 0 ? crimsonGlowMat : hellObsidianMat);
        w.position.set(0.46 - k * 0.05, 0.28 - k * 0.24, -0.06);
        w.rotation.z = -1.1 - k * 0.25;
        w.scale.set(0.55, 1.05 - k * 0.14, 0.25);
        demonWingPivot.add(w);
      }
      heroGroup.add(angelWingPivot, demonWingPivot);

      // Twin Orbiting Duality Weapons
      const seraphLance = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.08, 1.35, 4)), goldMat);
      seraphLance.position.set(-0.78, 1.35, 0.2);
      const hellBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 1.3, 0.04)), crimsonGlowMat);
      hellBlade.position.set(0.78, 1.35, 0.2);
      heroGroup.add(seraphLance, hellBlade);
      scene.add(heroGroup);

      // 4. Left Side Structures (Surga): Celestial Marble Sanctum Pillars, Crystal Spires & Halo Bridge
      const heavenPropsGroup = new THREE.Group();
      const pillarRecords: Array<{ group: THREE.Group; targetY: number; delay: number }> = [];
      for (let i = 0; i < 8; i++) {
        const ang = Math.PI * 0.65 + (i / 7) * Math.PI * 0.7;
        const dist = 8.2 + (i % 3) * 3.6;
        const px = Math.cos(ang) * dist;
        const pz = Math.sin(ang) * dist;
        const baseGroundY = computeHeavenHellHeight(px, pz) - 0.35;
        const colH = 3.2 + (i % 3) * 1.4;

        const colGroup = new THREE.Group();
        colGroup.position.set(px, baseGroundY - 7.5, pz);

        const shaft = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.42, 0.56, colH, 8)),
          heavenMarbleMat
        );
        shaft.position.y = colH * 0.5;
        shaft.castShadow = !isSoftwareGl;
        colGroup.add(shaft);

        const capRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.7, 0.06, 8, 24)), goldMat);
        capRing.rotation.x = Math.PI / 2;
        capRing.position.y = colH + 0.25;
        colGroup.add(capRing);

        const crystal = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.42, 0)), azureGlowMat);
        crystal.position.y = colH + 0.95;
        crystal.scale.set(0.75, 1.5, 0.75);
        colGroup.add(crystal);

        heavenPropsGroup.add(colGroup);
        pillarRecords.push({ group: colGroup, targetY: baseGroundY, delay: (i % 4) * 0.04 });
      }
      scene.add(heavenPropsGroup);

      // Heaven Sanctuary Radiant Pool on front-left (-x, +z)
      const heavenPoolMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: marbleTex,
          color: 0xbae6fd,
          emissive: 0x0284c7,
          emissiveIntensity: 0.42,
          roughness: 0.14,
          metalness: 0.35,
          transparent: true,
          opacity: 0
        })
      );
      const heavenPool = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(5.6, 36)), heavenPoolMat);
      heavenPool.rotation.x = -Math.PI / 2;
      heavenPool.position.set(-7.6, -0.18, 4.8);
      scene.add(heavenPool);

      // 5. Right Side Structures (Neraka): Jagged Obsidian Volcanic Spires & Molten Lava Pool
      const hellPropsGroup = new THREE.Group();
      const spireRecords: Array<{ group: THREE.Group; targetY: number; delay: number }> = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI * 0.38 + (i / 9) * Math.PI * 0.76;
        const dist = 8.4 + (i % 3) * 3.8;
        const sx = Math.cos(ang) * dist;
        const sz = Math.sin(ang) * dist;
        const baseGroundY = computeHeavenHellHeight(sx, sz) - 0.45;
        const spireH = 3.8 + (i % 4) * 1.65;

        const spGroup = new THREE.Group();
        spGroup.position.set(sx, baseGroundY - 8.5, sz);
        spGroup.rotation.y = i * 0.7;

        const mainCrag = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.45, spireH, 6)), hellObsidianMat);
        mainCrag.position.y = spireH * 0.5;
        mainCrag.castShadow = !isSoftwareGl;
        spGroup.add(mainCrag);

        const magmaVein = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.45, 0)), crimsonGlowMat);
        magmaVein.scale.set(0.45, 2.4, 0.45);
        magmaVein.position.set(0, spireH * 0.45, 0.7);
        magmaVein.rotation.x = 0.28;
        spGroup.add(magmaVein);

        hellPropsGroup.add(spGroup);
        spireRecords.push({ group: spGroup, targetY: baseGroundY, delay: (i % 4) * 0.04 });
      }
      scene.add(hellPropsGroup);

      // Molten Lava Pool on front-right (+x, +z)
      const lavaPoolMat = trackMat(
        new THREE.MeshStandardMaterial({
          map: lavaTex,
          color: 0xf97316,
          emissive: 0xdc2626,
          emissiveIntensity: 0.75,
          roughness: 0.25,
          metalness: 0.15,
          transparent: true,
          opacity: 0
        })
      );
      const lavaPool = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(5.8, 36)), lavaPoolMat);
      lavaPool.rotation.x = -Math.PI / 2;
      lavaPool.position.set(7.4, -0.34, 4.8);
      lavaPool.scale.set(1.05, 1, 0.85);
      scene.add(lavaPool);

      // 6. Phase III: Summoning Portals & 3D Angel + 3D Demon Legion (4 Angels + 4 Demons)
      const portalRingGeo = trackGeo(new THREE.TorusGeometry(1.45, 0.055, 10, 42));
      const heavenPortal = new THREE.Mesh(portalRingGeo, goldMat);
      heavenPortal.position.set(-4.8, 2.2, 0.4);
      heavenPortal.rotation.y = Math.PI / 3;
      heavenPortal.scale.setScalar(0.001);
      scene.add(heavenPortal);

      const hellPortal = new THREE.Mesh(portalRingGeo, crimsonGlowMat);
      hellPortal.position.set(4.8, 2.2, 0.4);
      hellPortal.rotation.y = -Math.PI / 3;
      hellPortal.scale.setScalar(0.001);
      scene.add(hellPortal);

      const angelTargets = [
        new THREE.Vector3(-4.6, 0.4, -2.6),
        new THREE.Vector3(-5.8, 0.3, 0.2),
        new THREE.Vector3(-4.4, 0.4, 2.9),
        new THREE.Vector3(-3.0, 0.6, -1.3)
      ];
      const demonTargets = [
        new THREE.Vector3(4.6, 0.3, -2.6),
        new THREE.Vector3(5.8, 0.2, 0.2),
        new THREE.Vector3(4.4, 0.3, 2.9),
        new THREE.Vector3(3.0, 0.5, -1.3)
      ];

      const angelRigs: Summon3DRig[] = [];
      const demonRigs: Summon3DRig[] = [];
      for (let i = 0; i < 4; i++) {
        const aRig = create3DAngelRig(trackGeo, trackMat);
        aRig.root.position.set(-4.8, 4.5, 0.4);
        aRig.root.scale.setScalar(0.001);
        aRig.root.lookAt(0, 0.5, 2.5);
        scene.add(aRig.root);
        angelRigs.push(aRig);

        const dRig = create3DDemonRig(trackGeo, trackMat);
        dRig.root.position.set(4.8, -1.5, 0.4);
        dRig.root.scale.setScalar(0.001);
        dRig.root.lookAt(0, 0.5, 2.5);
        scene.add(dRig.root);
        demonRigs.push(dRig);
      }

      // 7. Split Heaven Light Motes & Hell Embers (280 Points)
      const moteCount = 280;
      const motePos = new Float32Array(moteCount * 3);
      const moteCol = new Float32Array(moteCount * 3);
      const moteSeeds = new Float32Array(moteCount);
      for (let i = 0; i < moteCount; i++) {
        const isAngelSide = i % 2 === 0;
        const x = (isAngelSide ? -1 : 1) * (0.8 + Math.random() * 14.5);
        const z = (Math.random() - 0.5) * 24;
        motePos[i * 3] = x;
        motePos[i * 3 + 1] = 0.2 + Math.random() * 6.5;
        motePos[i * 3 + 2] = z;
        moteSeeds[i] = Math.random() * Math.PI * 2;
        _tmpColor.setHex(
          isAngelSide ? (i % 4 === 0 ? 0xfde047 : 0x7dd3fc) : i % 4 === 1 ? 0xf97316 : 0xf43f5e
        );
        moteCol[i * 3] = _tmpColor.r;
        moteCol[i * 3 + 1] = _tmpColor.g;
        moteCol[i * 3 + 2] = _tmpColor.b;
      }
      const moteGeo = trackGeo(new THREE.BufferGeometry());
      moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
      moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
      const moteMat = trackMat(
        new THREE.PointsMaterial({
          size: 0.16,
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      scene.add(new THREE.Points(moteGeo, moteMat));

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
          progress < 0.32 ? 'awakening' : progress < 0.66 ? 'shaping' : 'summoning';
        if (nextPhase !== lastUiStage) {
          lastUiStage = nextPhase;
          setPhase(nextPhase);
        }
        const pctInt = Math.round(progress * 100);
        if (Math.abs(pctInt - lastUiPct) >= 1) {
          lastUiPct = pctInt;
          setUiProgress(pctInt);
        }

        const elapsed = progress * totalDuration;
        const realmT = THREE.MathUtils.smoothstep(progress, 0.14, 0.64);
        const poolT = THREE.MathUtils.smoothstep(progress, 0.32, 0.66);
        const summonT = THREE.MathUtils.smoothstep(progress, 0.62, 0.92);

        // 1. Wavefront & Terrain Elevation
        const waveProgress = THREE.MathUtils.smoothstep(progress, 0.08, 0.68);
        const waveRadius = THREE.MathUtils.lerp(-2.5, 36.5, waveProgress);
        const waveActive =
          THREE.MathUtils.smoothstep(progress, 0.04, 0.12) *
          (1 - THREE.MathUtils.smoothstep(progress, 0.64, 0.76));
        terrainUniforms.uWaveRadius.value = waveRadius;
        terrainUniforms.uWaveActive.value = waveActive;
        terrainUniforms.uTime.value = elapsed;

        const globalSettle = THREE.MathUtils.smoothstep(progress, 0.5, 0.74);
        const pArr = posAttr.array as Float32Array;
        for (let i = 0; i < vertCount; i++) {
          const localW = THREE.MathUtils.clamp((waveRadius + 0.8 - vertRadii[i]) / 5.5, 0, 1);
          const factor = Math.max(localW * localW * (3 - 2 * localW), globalSettle);
          pArr[i * 3 + 1] = targetHeights[i] * factor;
        }
        posAttr.needsUpdate = true;
        terrainGeo.computeVertexNormals();

        // 2. Rise Heaven Columns & Hell Volcanic Spires
        for (const rec of pillarRecords) {
          const mT = THREE.MathUtils.smoothstep(progress, 0.24 + rec.delay, 0.6 + rec.delay);
          rec.group.position.y = THREE.MathUtils.lerp(rec.targetY - 7.5, rec.targetY, mT);
        }
        for (const rec of spireRecords) {
          const mT = THREE.MathUtils.smoothstep(progress, 0.24 + rec.delay, 0.6 + rec.delay);
          rec.group.position.y = THREE.MathUtils.lerp(rec.targetY - 8.5, rec.targetY, mT);
        }

        // 3. Pools & Texture Animation
        heavenPoolMat.opacity = poolT * 0.78;
        lavaPoolMat.opacity = poolT * 0.9;
        marbleTex.offset.x = elapsed * 0.025;
        lavaTex.offset.y = -elapsed * 0.06;

        // 4. Demon Raised Duality Ascension Animation
        heroGroup.position.y = 0.45 + Math.sin(elapsed * 2.8) * 0.16 + Math.sin(progress * Math.PI) * 0.4;
        heroGroup.rotation.y = Math.sin(elapsed * 1.2) * 0.28;
        angelWingPivot.rotation.y = 0.22 + Math.sin(elapsed * 5.2) * 0.22;
        demonWingPivot.rotation.y = -0.22 - Math.sin(elapsed * 5.2) * 0.22;
        seraphLance.position.y = 1.35 + Math.sin(elapsed * 3.4) * 0.1;
        hellBlade.position.y = 1.35 - Math.sin(elapsed * 3.4) * 0.1;

        // 5. Twin Portals & 3D Summoned Angel/Demon Army Emergence
        const portalScale = Math.sin(THREE.MathUtils.smoothstep(progress, 0.56, 0.98) * Math.PI);
        heavenPortal.scale.setScalar(Math.max(0.001, portalScale * 1.25));
        heavenPortal.rotation.z = elapsed * 2.4;
        hellPortal.scale.setScalar(Math.max(0.001, portalScale * 1.25));
        hellPortal.rotation.z = -elapsed * 2.4;

        for (let i = 0; i < 4; i++) {
          const tUnit = THREE.MathUtils.smoothstep(progress, 0.6 + i * 0.045, 0.84 + i * 0.035);
          const aRig = angelRigs[i];
          const aGoal = angelTargets[i];
          aRig.root.position.set(
            THREE.MathUtils.lerp(-4.8, aGoal.x, tUnit),
            THREE.MathUtils.lerp(3.8, computeHeavenHellHeight(aGoal.x, aGoal.z), tUnit),
            THREE.MathUtils.lerp(0.4, aGoal.z, tUnit)
          );
          aRig.root.scale.setScalar(Math.max(0.001, tUnit * 1.35));
          aRig.body.position.y = 0.52 + Math.sin(elapsed * 4.2 + i) * 0.08;
          aRig.leftWingPivot.rotation.y = 0.25 + Math.sin(elapsed * 8.5 + i) * 0.35;
          aRig.rightWingPivot.rotation.y = -0.25 - Math.sin(elapsed * 8.5 + i) * 0.35;
          aRig.weaponPivot.rotation.x = Math.sin(elapsed * 3.6 + i) * 0.25;

          const dRig = demonRigs[i];
          const dGoal = demonTargets[i];
          dRig.root.position.set(
            THREE.MathUtils.lerp(4.8, dGoal.x, tUnit),
            THREE.MathUtils.lerp(-1.2, computeHeavenHellHeight(dGoal.x, dGoal.z), tUnit),
            THREE.MathUtils.lerp(0.4, dGoal.z, tUnit)
          );
          dRig.root.scale.setScalar(Math.max(0.001, tUnit * 1.38));
          dRig.body.position.y = 0.45 + Math.sin(elapsed * 4.5 + i + 1) * 0.07;
          dRig.leftWingPivot.rotation.y = 0.2 + Math.sin(elapsed * 9.0 + i) * 0.38;
          dRig.rightWingPivot.rotation.y = -0.2 - Math.sin(elapsed * 9.0 + i) * 0.38;
          dRig.weaponPivot.rotation.x = Math.sin(elapsed * 4.0 + i) * 0.3;
        }

        // 6. Sky & Floating Dual Motes
        skyMat.opacity = 0.16 + realmT * 0.82;
        if (scene.background instanceof THREE.Color) {
          scene.background.copy(skyVoidColor).lerp(skyDualityColor, realmT);
        }
        const mPosAttr = moteGeo.attributes.position as THREE.BufferAttribute;
        const mArr = mPosAttr.array as Float32Array;
        for (let i = 0; i < moteCount; i++) {
          const s = moteSeeds[i];
          mArr[i * 3 + 1] += dt * (0.48 + (i % 3) * 0.22);
          mArr[i * 3] += Math.sin(elapsed * 1.8 + s) * dt * 0.28;
          if (mArr[i * 3 + 1] > 7.2) mArr[i * 3 + 1] = 0.2;
        }
        mPosAttr.needsUpdate = true;

        // 7. Smooth 3-Phase Cinematic Camera Choreography
        if (progress < 0.34) {
          const t1 = progress / 0.34;
          const ang = 0.2 + t1 * 0.55;
          _camTarget.set(Math.sin(ang) * 6.6, 2.3 + t1 * 1.6, Math.cos(ang) * 6.6);
          _lookTarget.set(0, 1.45, 0);
        } else if (progress < 0.68) {
          const t2 = (progress - 0.34) / 0.34;
          const ang = 0.75 - t2 * 1.3;
          _camTarget.set(
            Math.sin(ang) * THREE.MathUtils.lerp(6.6, 14.2, t2),
            THREE.MathUtils.lerp(3.9, 8.6, t2),
            Math.cos(ang) * THREE.MathUtils.lerp(6.6, 14.2, t2)
          );
          _lookTarget.set(0, 1.0, 0);
        } else {
          const t3 = (progress - 0.68) / 0.32;
          const ang = -0.55 + t3 * 0.55;
          _camTarget.set(
            Math.sin(ang) * THREE.MathUtils.lerp(14.2, 12.2, t3),
            THREE.MathUtils.lerp(8.6, 6.8, t3),
            Math.cos(ang) * THREE.MathUtils.lerp(14.2, 12.2, t3)
          );
          _lookTarget.set(0, 1.15, 0.2);
        }

        const dampAlpha = 1 - Math.exp(-5.4 * dt);
        camera.position.lerp(_camTarget, dampAlpha);
        _currentLook.lerp(_lookTarget, dampAlpha);
        camera.lookAt(_currentLook);

        heavenLight.intensity = 10 + summonT * 8;
        hellLight.intensity = 11 + summonT * 9;

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
      return undefined;
    }
  }, [totalDuration]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950 overflow-hidden select-none"
      role="dialog"
      aria-label="Cutscene 3D Demon Raised Angel and Demon"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Top Cinematic Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-5 sm:p-8 bg-gradient-to-b from-slate-950/88 via-slate-950/38 to-transparent flex items-start justify-between">
        <div>
          <p className="text-[11px] font-game tracking-[0.22em] uppercase text-amber-300/95">
            Demon Raised · Celestial-Infernal Duality
          </p>
          <h2 className="font-title text-xl sm:text-3xl font-black tracking-wider text-white drop-shadow">
            SURGA &amp; NERAKA: ANGEL &amp; DEMON
          </h2>
          <p className="mt-1 text-xs sm:text-sm font-game font-semibold text-rose-200/95 tracking-wide">
            {PHASE_LABELS[phase]}
          </p>
        </div>
      </div>

      {/* Bottom Controls & Progress */}
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent flex items-end justify-between gap-4">
        <div className="pointer-events-none text-xs font-game text-amber-100/85 tracking-wide">
          Membuka Medan Surga &amp; Neraka 3D serta Memanggil Pasukan Malaikat &amp; Iblis · {uiProgress}%
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-amber-400/60 hover:border-rose-400 text-slate-100 font-game font-semibold text-sm tracking-wide transition-colors cursor-pointer whitespace-nowrap"
        >
          <span>Lewati Cutscene</span>
          <FastForward className="w-4 h-4 text-amber-300" />
        </button>
      </div>

      {/* Bottom Progress Bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-slate-900">
        <div
          className="h-full bg-gradient-to-r from-amber-300 via-sky-300 to-rose-500 transition-[width] duration-100"
          style={{ width: `${uiProgress}%` }}
        />
      </div>
    </div>
  );
};
