import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RotateCcw, Maximize, Move3D } from 'lucide-react';
import { assetUrl } from '../api/client';

export function ModelViewer({ assetId, compact = false }: { assetId?: string; compact?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<() => void>(() => {});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!host.current) return;
    setError('');
    const node = host.current;
    let disposed = false;
    let model: THREE.Object3D | null = null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#fffdf7');
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 3000);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError('这台设备暂时无法显示 3D，可继续导出模型。');
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    node.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 30;
    controls.maxDistance = 800;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd6cba5, 1.8));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(-80, 160, 130);
    light.castShadow = true;
    light.shadow.normalBias = 0.15;
    light.shadow.bias = -0.0001;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -150;
    light.shadow.camera.right = 150;
    light.shadow.camera.top = 150;
    light.shadow.camera.bottom = -150;
    scene.add(light);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShadowMaterial({ opacity: 0.13 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(180, 18, '#d6d4c2', '#e7e6db');
    grid.position.y = 0.03;
    scene.add(grid);
    const fit = (height = 80) => {
      camera.position.set(height * 0.8, height * 0.9, height * 2.15);
      controls.target.set(0, height * 0.46, 0);
      controls.update();
    };
    fit();
    reset.current = () =>
      fit(model ? new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y : 80);
    if (assetId)
      new GLTFLoader().load(
        assetUrl(assetId),
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }
          model = gltf.scene;
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              // 只让地板接收投影，避免细小刻线上的自阴影噪点。
              child.receiveShadow = false;
              (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) =>
                m.dispose(),
              );
              const old = child.geometry;
              old.deleteAttribute('normal');
              old.deleteAttribute('color');
              child.geometry = mergeVertices(old);
              old.dispose();
              child.geometry.computeVertexNormals();
              child.material = new THREE.MeshStandardMaterial({
                color: '#fff0c8',
                roughness: 0.68,
              });
            }
          });
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.set(-center.x, -box.min.y, -center.z);
          scene.add(model);
          reset.current();
        },
        undefined,
        () => !disposed && setError('模型预览加载失败，请重新打开作品。'),
      );
    const observer = new ResizeObserver(() => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    observer.observe(node);
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      disposed = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse(disposeObjectSingle);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [assetId]);
  return (
    <div className={`viewer ${compact ? 'compact' : ''}`}>
      <div ref={host} className="viewer-canvas" data-testid="model-viewer" />
      {(!assetId || error) && (
        <div className="viewer-empty">{error || '把想法告诉乌萨奇，模型会出现在这里 ✨'}</div>
      )}
      <div className="viewer-tools">
        <button title="回到初始视角" onClick={() => reset.current()}>
          <RotateCcw size={17} />
        </button>
        <button title="全屏预览" onClick={() => host.current?.parentElement?.requestFullscreen()}>
          <Maximize size={17} />
        </button>
      </div>
      {!compact && (
        <div className="viewer-help">
          <Move3D size={14} /> 拖动旋转 · 滚轮缩放 · 右键平移 <span>180 × 180 mm</span>
        </div>
      )}
    </div>
  );
}
function disposeObjectSingle(object: THREE.Object3D) {
  if (object instanceof THREE.Mesh) {
    object.geometry.dispose();
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
      m.dispose(),
    );
  }
}
function disposeObject(object: THREE.Object3D) {
  object.traverse(disposeObjectSingle);
}
