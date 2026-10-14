import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RotateCcw, Maximize, Move3D, Grid } from 'lucide-react';
import { assetUrl } from '../api/client';

const shapeNames: Record<string, string> = {
  box: '方块',
  cylinder: '圆柱',
  ellipsoid: '椭球',
  star: '五角星',
  polygon: '轮廓挤出',
  revolve: '轮廓旋转',
  loft: '截面放样',
  sweep: '曲面扫掠',
  cushion: '轮廓曲面',
  cup: '带壁厚圆筒',
  usagi: '乌萨奇',
};

const thumbnailCache = new Map<string, string>();
let activeRenders = 0;
const MAX_CONCURRENT_RENDERS = 1;
const renderQueue: Array<() => void> = [];

function requestRenderSlot(callback: () => void): () => void {
  let cancelled = false;
  const wrapped = () => {
    if (!cancelled) {
      activeRenders++;
      callback();
    } else {
      processNext();
    }
  };

  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders++;
    callback();
  } else {
    renderQueue.push(wrapped);
  }

  return () => {
    cancelled = true;
    const idx = renderQueue.indexOf(wrapped);
    if (idx !== -1) renderQueue.splice(idx, 1);
  };
}

function processNext() {
  if (renderQueue.length > 0) {
    const next = renderQueue.shift();
    if (next) next();
  }
}

function releaseRenderSlot() {
  activeRenders = Math.max(0, activeRenders - 1);
  processNext();
}

export function ModelViewer({
  assetId,
  selectionAssetId,
  compact = false,
  appearance = 'auto',
  onSelectPart,
  selectedPartId,
}: {
  assetId?: string;
  selectionAssetId?: string;
  compact?: boolean;
  appearance?: 'auto' | 'original' | 'solid';
  onSelectPart?: (partId: string | null, pointMm: [number, number, number]) => void;
  selectedPartId?: string | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onSelectPartRef = useRef(onSelectPart);
  onSelectPartRef.current = onSelectPart;
  const viewBookmark = useRef<{ direction: [number, number, number]; radiusScale: number } | null>(null);
  const reset = useRef<() => void>(() => {});
  const modelRef = useRef<THREE.Object3D | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const selectionMeshesRef = useRef<THREE.Mesh[]>([]);
  const hoveredMeshRef = useRef<THREE.Mesh | null>(null);
  const [hoveredPart, setHoveredPart] = useState<{
    id: string;
    name: string;
    shape?: string;
    x: number;
    y: number;
  } | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<string | null>(() =>
    compact && assetId ? thumbnailCache.get(assetId) || null : null,
  );
  const [hasSlot, setHasSlot] = useState<boolean>(!compact);

  useEffect(() => {
    if (!compact || snapshot || !assetId) return;
    const cancel = requestRenderSlot(() => {
      setHasSlot(true);
    });
    return () => {
      cancel();
    };
  }, [compact, snapshot, assetId]);

  useEffect(() => {
    if (!assetId || (compact && snapshot) || !hasSlot || !host.current) return;
    setError('');
    meshesRef.current = [];
    selectionMeshesRef.current = [];
    const node = host.current;
    let disposed = false;
    let model: THREE.Object3D | null = null;
    let slotReleased = false;
    const safeReleaseSlot = () => {
      if (compact && !slotReleased) {
        slotReleased = true;
        releaseRenderSlot();
      }
    };
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#fffdf7');
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 3000);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError('这台设备暂时无法显示 3D，可继续导出模型。');
      safeReleaseSlot();
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
    const selectionMarker = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ef4444', depthTest: false, depthWrite: false }),
    );
    selectionMarker.visible = false;
    selectionMarker.renderOrder = 1000;
    scene.add(selectionMarker);
    const fit = () => {
      const box = model
        ? new THREE.Box3().setFromObject(model)
        : new THREE.Box3(new THREE.Vector3(-25, 0, -20), new THREE.Vector3(25, 80, 20));
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const angle = Math.min(
        THREE.MathUtils.degToRad(camera.fov / 2),
        Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect),
      );
      const distance = viewBookmark.current
        ? Math.max(40, sphere.radius * viewBookmark.current.radiusScale)
        : Math.max(40, (sphere.radius / Math.sin(angle)) * 1.15);
      controls.target.copy(sphere.center);
      camera.position
        .copy(sphere.center)
        .add(
          (viewBookmark.current
            ? new THREE.Vector3(...viewBookmark.current.direction)
            : new THREE.Vector3(0.8, 0.9, 2.15).normalize()
          ).multiplyScalar(distance),
        );
      controls.minDistance = Math.max(1, sphere.radius * 0.3);
      controls.maxDistance = Math.max(800, distance * 4);
      camera.far = Math.max(3000, distance * 8);
      camera.updateProjectionMatrix();
      controls.update();
      renderer.render(scene, camera);
    };
    fit();
    reset.current = () => {
      viewBookmark.current = null;
      fit();
    };
    controls.addEventListener('change', () => {
      const offset = camera.position.clone().sub(controls.target);
      const radius = model ? new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere()).radius : 40;
      if (offset.lengthSq() > 0) {
        const direction = offset.clone().normalize();
        viewBookmark.current = {
          direction: [direction.x, direction.y, direction.z],
          radiusScale: offset.length() / Math.max(radius, 1),
        };
      }
    });
    if (assetId)
      new GLTFLoader().load(
        assetUrl(assetId),
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }
          model = gltf.scene;
          let meters = false;
          model.traverse((child) => {
            if (child.userData.yaha_units === 'm') meters = true;
          });
          if (meters) model.scale.multiplyScalar(1000);
          const meshList: THREE.Mesh[] = [];
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              // 只让地板接收投影，避免细小刻线上的自阴影噪点。
              child.receiveShadow = false;
              meshList.push(child);
              if (
                appearance === 'original' ||
                (appearance === 'auto' && child.userData.yaha_appearance === 'original')
              )
                return;
              (Array.isArray(child.material) ? child.material : [child.material]).forEach(
                disposeMaterial,
              );
              const old = child.geometry;
              old.deleteAttribute('normal');
              old.deleteAttribute('color');
              child.geometry = mergeVertices(old);
              old.dispose();
              child.geometry.computeVertexNormals();
              const mat = new THREE.MeshStandardMaterial({
                color: '#fff0c8',
                roughness: 0.68,
              });
              child.material = mat;
              child.userData.defaultColor = mat.color.clone();
              child.userData.defaultEmissive = mat.emissive.clone();
            }
          });
          meshesRef.current = meshList;
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.set(-center.x, -box.min.y, -center.z);
          modelRef.current = model;
          fit();
          if (compact) {
            renderer.render(scene, camera);
            try {
              const dataUrl = renderer.domElement.toDataURL('image/png');
              if (dataUrl && dataUrl.length > 200) {
                thumbnailCache.set(assetId, dataUrl);
                setSnapshot(dataUrl);
              }
            } catch {
              // fallback
            } finally {
              safeReleaseSlot();
            }
          }
        },
        undefined,
        () => {
          if (!disposed) {
            setError('模型预览加载失败，请重新打开作品。');
            safeReleaseSlot();
          }
        },
      );
    if (selectionAssetId && selectionAssetId !== assetId)
      new GLTFLoader().load(
        assetUrl(selectionAssetId),
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }
          const selectable = gltf.scene;
          let meters = false;
          selectable.traverse((child) => {
            if (child.userData.yaha_units === 'm') meters = true;
          });
          if (meters) selectable.scale.multiplyScalar(1000);
          const box = new THREE.Box3().setFromObject(selectable);
          const center = box.getCenter(new THREE.Vector3());
          selectable.position.set(-center.x, -box.min.y, -center.z);
          const meshList: THREE.Mesh[] = [];
          selectable.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            child.castShadow = false;
            child.receiveShadow = false;
            (Array.isArray(child.material) ? child.material : [child.material]).forEach(
              disposeMaterial,
            );
            child.material = new THREE.MeshBasicMaterial({
              colorWrite: false,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            meshList.push(child);
          });
          selectionMeshesRef.current = meshList;
          scene.add(selectable);
        },
        undefined,
        () => {},
      );
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: MouseEvent) => {
      if (compact || !meshesRef.current.length || !host.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const pickMeshes = selectionMeshesRef.current.length
        ? selectionMeshesRef.current
        : meshesRef.current;
      const intersects = raycaster.intersectObjects(pickMeshes, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitMesh = hit.object as THREE.Mesh;
        let partId = hitMesh.userData.yaha_part_id as string | undefined;
        let partName = hitMesh.userData.yaha_part_name as string | undefined;
        let partShape = hitMesh.userData.yaha_part_shape as string | undefined;

        if (!partName && hitMesh.name && hitMesh.name.includes(' · ')) {
          const parts = hitMesh.name.split(' · ');
          partId = parts[0];
          partName = parts[1];
        }

        if (partName) {
          setHoveredPart({
            id: partId || '',
            name: partName,
            shape: partShape,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });

          if (hoveredMeshRef.current && hoveredMeshRef.current !== hitMesh) {
            const prev = hoveredMeshRef.current;
            if (prev.material instanceof THREE.MeshStandardMaterial) {
              if (prev.userData.defaultColor) prev.material.color.copy(prev.userData.defaultColor);
              if (prev.userData.defaultEmissive) prev.material.emissive.copy(prev.userData.defaultEmissive);
            }
          }
          if (meshesRef.current.length > 1 && hitMesh.material instanceof THREE.MeshStandardMaterial) {
            hitMesh.material.color.set('#ffe58f');
            hitMesh.material.emissive.set('#593800');
            hoveredMeshRef.current = hitMesh;
          }
          return;
        }
      }

      if (hoveredMeshRef.current) {
        const prev = hoveredMeshRef.current;
        if (prev.material instanceof THREE.MeshStandardMaterial) {
          if (prev.userData.defaultColor) prev.material.color.copy(prev.userData.defaultColor);
          if (prev.userData.defaultEmissive) prev.material.emissive.copy(prev.userData.defaultEmissive);
        }
        hoveredMeshRef.current = null;
      }
      setHoveredPart(null);
    };

    const onPointerDown = (e: MouseEvent) => {
      if (e.button !== 0 || compact || !meshesRef.current.length || !host.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const pickMeshes = selectionMeshesRef.current.length
        ? selectionMeshesRef.current
        : meshesRef.current;
      const intersects = raycaster.intersectObjects(pickMeshes, false);
      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitMesh = hit.object as THREE.Mesh;
        let partId = hitMesh.userData.yaha_part_id as string | undefined;
        if (!partId && hitMesh.name && hitMesh.name.includes(' · ')) {
          partId = hitMesh.name.split(' · ')[0];
        }
        // GLB uses Y-up; translate the hit back to the design plan's X/Y/Z axes.
        selectionMarker.position.copy(hit.point);
        selectionMarker.visible = true;
        onSelectPartRef.current?.(partId || null, [hit.point.x, -hit.point.z, hit.point.y]);
      }
    };

    const onPointerLeave = () => {
      if (hoveredMeshRef.current) {
        const prev = hoveredMeshRef.current;
        if (prev.material instanceof THREE.MeshStandardMaterial) {
          if (prev.userData.defaultColor) prev.material.color.copy(prev.userData.defaultColor);
          if (prev.userData.defaultEmissive) prev.material.emissive.copy(prev.userData.defaultEmissive);
        }
        hoveredMeshRef.current = null;
      }
      setHoveredPart(null);
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerleave', onPointerLeave);

    const observer = new ResizeObserver(() => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fit();
    });
    observer.observe(node);
    if (!compact) {
      renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
      });
    } else {
      controls.addEventListener('change', () => {
        renderer.render(scene, camera);
      });
    }
    return () => {
      disposed = true;
      safeReleaseSlot();
      meshesRef.current = [];
      selectionMeshesRef.current = [];
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerleave', onPointerLeave);
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse(disposeObjectSingle);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    };
  }, [assetId, selectionAssetId, appearance, compact]);

  useEffect(() => {
    if (!modelRef.current) return;
    modelRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            m.wireframe = wireframe;
          });
        } else {
          child.material.wireframe = wireframe;
        }
      }
    });
  }, [wireframe]);

  useEffect(() => {
    if (meshesRef.current.length <= 1) return;
    meshesRef.current.forEach((mesh) => {
      const pId = (mesh.userData.yaha_part_id as string) || mesh.name.split(' · ')[0];
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        if (selectedPartId && pId === selectedPartId) {
          mesh.material.color.set('#ffd54f');
          mesh.material.emissive.set('#663d00');
        } else if (mesh !== hoveredMeshRef.current) {
          const defColor = mesh.userData.defaultColor as THREE.Color | undefined;
          const defEmissive = mesh.userData.defaultEmissive as THREE.Color | undefined;
          if (defColor) mesh.material.color.copy(defColor);
          if (defEmissive) mesh.material.emissive.copy(defEmissive);
        }
      }
    });
  }, [selectedPartId]);
  if (!assetId) {
    return (
      <div className={`viewer ${compact ? 'compact' : ''}`}>
        <div className="viewer-empty">{error || '把想法告诉乌萨奇，模型会出现在这里 ✨'}</div>
      </div>
    );
  }

  if (compact && snapshot) {
    return (
      <div className="viewer compact viewer-snapshot-container">
        <img src={snapshot} alt="模型预览" className="viewer-snapshot-img" />
      </div>
    );
  }

  if (compact && !hasSlot && !snapshot) {
    return (
      <div className="viewer compact viewer-snapshot-container">
        <div className="viewer-empty" style={{ opacity: 0.7 }}>✦ 正在加载预览…</div>
      </div>
    );
  }

  return (
    <div className={`viewer ${compact ? 'compact' : ''}`}>
      <div ref={host} className="viewer-canvas" data-testid="model-viewer" />
      {hoveredPart && (
        <div
          className="viewer-part-badge"
          style={{
            left: Math.min(Math.max(10, hoveredPart.x + 14), (host.current?.clientWidth || 300) - 160),
            top: Math.max(10, hoveredPart.y - 36),
          }}
        >
          <span className="badge-icon">🏷️</span>
          <strong>{hoveredPart.name}</strong>
          {hoveredPart.shape && <small>{shapeNames[hoveredPart.shape] || hoveredPart.shape}</small>}
        </div>
      )}
      {(!assetId || error) && (
        <div className="viewer-empty">{error || '把想法告诉乌萨奇，模型会出现在这里 ✨'}</div>
      )}
      <div className="viewer-tools">
        <button
          title={wireframe ? '切换为实体模式' : '切换为结构拓扑线框模式'}
          className={wireframe ? 'active' : ''}
          onClick={() => setWireframe(!wireframe)}
        >
          <Grid size={17} />
        </button>
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
  if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
    object.geometry.dispose();
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
      disposeMaterial(m),
    );
  }
}
function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
  material.dispose();
}
function disposeObject(object: THREE.Object3D) {
  object.traverse(disposeObjectSingle);
}
