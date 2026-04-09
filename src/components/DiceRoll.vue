<template>
  <!-- Зовнішній контейнер компонента: займає весь екран і містить UI + canvas -->
  <div class="dice-container">
    <!-- Блок з керуванням (кнопка кидка) -->
    <div id="ui">
      <!-- Кнопка запускає rollDice; вимикається під час анімації кидка -->
      <button @click="rollDice" :disabled="isRolling">Кинути к20</button>
    </div>
    <!-- Сюди монтується renderer.domElement (WebGL canvas) -->
    <div ref="canvasContainer" class="canvas-wrapper"></div>
  </div>
</template>

<script setup>
// Імпорт lifecycle-хуків Vue та ref для реактивних значень.
import { onMounted, onUnmounted, ref } from 'vue';
// Імпорт Three.js для 3D-сцени.
import * as THREE from 'three';

// Посилання на DOM-контейнер, куди вставляється canvas рендерера.
const canvasContainer = ref(null);
// Прапорець активного кидка: true => кістка крутиться.
const isRolling = ref(false);

// Основні змінні Three.js (нереактивні, щоб не створювати зайві перерендери Vue).
let scene, camera, renderer, dice, animationId;
// Геометрія/матеріали, які треба вручну звільнити в onUnmounted.
let geometry, material, edges, lineMaterial;
// Масиви для зберігання текстур та матеріалів чисел (потрібно для dispose).
let labelTextures = [];
let labelMaterials = [];
let labelGeometry;
let faceLabels = [];
let topFaceHighlightGeometry;
let topFaceHighlightMaterial;
let topFaceHighlightMesh;
// Поточна швидкість обертання по осях X та Y.
let rotationSpeed = { x: 0, y: 0 };
// Прапорець фази плавного довертання до цільової грані.
let isSettlingToTargetFace = false;
// Кватерніон кінцевої орієнтації куба.
const settleTargetQuaternion = new THREE.Quaternion();
// Грань, до якої зараз плавно доводимо орієнтацію.
let settlingFace = null;

// Створює "плоску" мітку-число для грані (plane, а не sprite).
const createNumberFaceMesh = (value) => {
  // Розмір canvas для малювання тексту.
  const size = 120;
  // Створюємо оффскрін canvas.
  const canvas = document.createElement('canvas');
  // Ширина canvas.
  canvas.width = size;
  // Висота canvas.
  canvas.height = size;
  // 2D-контекст для малювання тексту.
  const ctx = canvas.getContext('2d');
  // Якщо контекст не створився, повертаємо null.
  if (!ctx) return null;

  // Очищаємо canvas перед малюванням.
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(255, 255, 255, 0)'; // повністю прозорий фон
  ctx.beginPath();
  ctx.fill(); // заливаємо круг прозорим — у підсумку його не видно, лиш цифра

  // Колір цифри.
  ctx.fillStyle = '#FFFFFF';
  // Менший шрифт, щоб число вміщалося всередині трикутної грані.
  ctx.font = 'bold 88px Arial';
  // Вирівнювання тексту по горизонталі.
  ctx.textAlign = 'center';
  // Вирівнювання тексту по вертикалі.
  ctx.textBaseline = 'middle';
  // Малюємо номер у центрі canvas.
  ctx.fillText(String(value), size / 2, size / 2);

  // Конвертуємо canvas у текстуру Three.js.
  const texture = new THREE.CanvasTexture(canvas);
  // Гарантуємо оновлення текстури на GPU.
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (renderer) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Матеріал для "наклейки" на грань.
  const faceMaterial = new THREE.MeshBasicMaterial({
    // Карта (текстура) з намальованою цифрою.
    map: texture,
    // Прозорість включена (бо фон прозорий).
    transparent: true,
    // Обидві сторони видимі, щоб цифра не пропадала при обертанні.
    side: THREE.DoubleSide,
    // Полігон-офсет трохи піднімає мітку в рендері, щоб уникнути мерехтіння з гранню.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2
  });
  // Створюємо геометрію plane один раз і перевикористовуємо для всіх чисел.
  if (!labelGeometry) labelGeometry = new THREE.PlaneGeometry(0.16, 0.16);
  // Створюємо mesh числа.
  const labelMesh = new THREE.Mesh(labelGeometry, faceMaterial);

  // Зберігаємо текстуру для майбутнього dispose().
  labelTextures.push(texture);
  // Зберігаємо матеріал для майбутнього dispose().
  labelMaterials.push(faceMaterial);

  // Повертаємо готовий mesh.
  return labelMesh;
};

// Додає числа на всі 20 трикутних граней ікосаедра.
const addFaceLabels = () => {
  // Очищаємо масив метаданих міток перед створенням.
  faceLabels = [];
  // Перетворюємо геометрію в non-indexed, щоб іти по трикутниках послідовно.
  const nonIndexed = geometry.toNonIndexed();
  // Атрибут позицій вершин.
  const position = nonIndexed.getAttribute('position');
  // Тимчасовий вектор для першої вершини трикутника.
  const v1 = new THREE.Vector3();
  // Тимчасовий вектор для другої вершини трикутника.
  const v2 = new THREE.Vector3();
  // Тимчасовий вектор для третьої вершини трикутника.
  const v3 = new THREE.Vector3();
  // Вектор центру грані.
  const center = new THREE.Vector3();
  // Нормаль грані (напрям назовні).
  const normal = new THREE.Vector3();

  // Починаємо нумерацію граней з 1.
  let faceNumber = 1;
  // Кожні 3 вершини = 1 трикутна грань.
  for (let i = 0; i < position.count; i += 3) {
    // Читаємо координати першої вершини.
    v1.fromBufferAttribute(position, i);
    // Читаємо координати другої вершини.
    v2.fromBufferAttribute(position, i + 1);
    // Читаємо координати третьої вершини.
    v3.fromBufferAttribute(position, i + 2);

    // Центр грані = середнє значення трьох вершин.
    center.copy(v1).add(v2).add(v3).divideScalar(3);
    // Нормаль беремо як нормалізований вектор від центру фігури до центру грані.
    normal.copy(center).normalize();

    // Створюємо мітку з поточним номером грані.
    const label = createNumberFaceMesh(faceNumber);
    // Якщо створити не вдалося — пропускаємо грань.
    if (!label) continue;

    // Орієнтуємо площину мітки так, щоб вона лежала на площині грані.
    label.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    // Ставимо мітку в центр грані + мінімальний відступ по нормалі.
    label.position.copy(center).addScaledVector(normal, 0.012);
    // Додаємо мітку до кістки, щоб крутилась разом із нею.
    dice.add(label);
    // Зберігаємо мітку, нормаль і вершини грані для підсвітки/орієнтації.
    faceLabels.push({
      label,
      normal: normal.clone(),
      value: faceNumber,
      vertices: [v1.clone(), v2.clone(), v3.clone()]
    });
    // Переходимо до наступного номера.
    faceNumber += 1;
  }

  // Звільняємо тимчасову геометрію.
  nonIndexed.dispose();
};

// Довертає цифру в площині грані, щоб вона читалась горизонтально для користувача.
const orientFaceLabelUpright = (face) => {
  if (!camera || !dice || !face?.label) return;

  const worldNormal = face.normal.clone().transformDirection(dice.matrixWorld).normalize();
  const labelWorldQuaternion = new THREE.Quaternion();
  face.label.getWorldQuaternion(labelWorldQuaternion);

  // Поточний "up" цифри у world-space.
  const labelUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(labelWorldQuaternion);
  // "Up" камери, спроєктований на площину грані.
  const cameraUpWorld = camera.up
    .clone()
    .applyQuaternion(camera.quaternion)
    .clone();
  cameraUpWorld.addScaledVector(worldNormal, -cameraUpWorld.dot(worldNormal)).normalize();
  // Також проєктуємо поточний up цифри в площину грані.
  labelUpWorld.addScaledVector(worldNormal, -labelUpWorld.dot(worldNormal)).normalize();

  if (cameraUpWorld.lengthSq() < 1e-6 || labelUpWorld.lengthSq() < 1e-6) return;

  const cos = THREE.MathUtils.clamp(labelUpWorld.dot(cameraUpWorld), -1, 1);
  const angle = Math.acos(cos);
  const cross = new THREE.Vector3().crossVectors(labelUpWorld, cameraUpWorld);
  const sign = Math.sign(cross.dot(worldNormal)) || 1;

  // Обертаємо тільки мітку в площині грані: навколо її ЛОКАЛЬНОЇ осі Z.
  face.label.rotateOnAxis(new THREE.Vector3(0, 0, 1), angle * sign);
};

// Довертає куб навколо нормалі грані, щоб "вершина" трикутника дивилась рівно вгору на екрані.
const alignFaceTrianglePointUp = (face) => {
  if (!camera || !dice || !face || !face.vertices) return;

  const worldNormal = face.normal.clone().transformDirection(dice.matrixWorld).normalize();
  const cameraUpWorld = camera.up.clone().applyQuaternion(camera.quaternion);
  const targetUpOnFace = cameraUpWorld
    .clone()
    .addScaledVector(worldNormal, -cameraUpWorld.dot(worldNormal))
    .normalize();

  if (targetUpOnFace.lengthSq() < 1e-6) return;

  const centerLocal = face.vertices[0]
    .clone()
    .add(face.vertices[1])
    .add(face.vertices[2])
    .divideScalar(3);
  const centerWorld = centerLocal.clone().applyMatrix4(dice.matrixWorld);

  // Беремо вершину, яка вже найближча до "верху" в площині грані,
  // і докручуємо тільки на мінімальний кут.
  let bestDir = null;
  let bestScore = -Infinity;
  for (const vertex of face.vertices) {
    const worldVertex = vertex.clone().applyMatrix4(dice.matrixWorld);
    const dir = worldVertex.sub(centerWorld);
    dir.addScaledVector(worldNormal, -dir.dot(worldNormal)).normalize();
    const score = dir.dot(targetUpOnFace);
    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  if (!bestDir || bestDir.lengthSq() < 1e-6) return;

  const cos = THREE.MathUtils.clamp(bestDir.dot(targetUpOnFace), -1, 1);
  const angle = Math.acos(cos);
  const cross = new THREE.Vector3().crossVectors(bestDir, targetUpOnFace);
  const sign = Math.sign(cross.dot(worldNormal)) || 1;

  const worldAxisRotation = new THREE.Quaternion().setFromAxisAngle(worldNormal, angle * sign);
  dice.quaternion.premultiply(worldAxisRotation);
  dice.updateMatrixWorld(true);
};

// Знаходить грань, яка найбільше "дивиться вгору" у world-space.
const getTopFace = () => {
  if (!dice || faceLabels.length === 0) return null;
  const worldUp = new THREE.Vector3(0, 1, 0);
  const worldNormal = new THREE.Vector3();
  let topFace = null;
  let maxDot = -Infinity;

  for (const face of faceLabels) {
    worldNormal.copy(face.normal).transformDirection(dice.matrixWorld);
    const dot = worldNormal.dot(worldUp);
    if (dot > maxDot) {
      maxDot = dot;
      topFace = face;
    }
  }

  return topFace;
};

// Знаходить грань, яка найбільше дивиться в камеру (результат кидка для користувача).
const getFrontFace = () => {
  if (!camera || !dice || faceLabels.length === 0) return null;
  const worldNormal = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);
  const toUser = cameraForward.clone().negate().normalize();

  let frontFace = null;
  let maxDot = -Infinity;
  for (const face of faceLabels) {
    worldNormal.copy(face.normal).transformDirection(dice.matrixWorld);
    const dot = worldNormal.dot(toUser);
    if (dot > maxDot) {
      maxDot = dot;
      frontFace = face;
    }
  }

  return frontFace;
};

// Оновлює трикутну підсвітку на грані, яка зараз дивиться в камеру.
const updateTopFaceHighlight = (face = null) => {
  if (!dice || !topFaceHighlightGeometry || !topFaceHighlightMesh) return;
  const frontFace = face ?? getFrontFace();
  if (!frontFace || !frontFace.vertices) return;

  const normalOffset = frontFace.normal.clone().multiplyScalar(0.014);
  const [a, b, c] = frontFace.vertices;
  const positions = topFaceHighlightGeometry.getAttribute('position');

  const va = a.clone().add(normalOffset);
  const vb = b.clone().add(normalOffset);
  const vc = c.clone().add(normalOffset);

  positions.setXYZ(0, va.x, va.y, va.z);
  positions.setXYZ(1, vb.x, vb.y, vb.z);
  positions.setXYZ(2, vc.x, vc.y, vc.z);
  positions.needsUpdate = true;
};

// Обчислює цільову орієнтацію куба так, щоб задана грань дивилась у камеру.
const prepareSettleForFace = (face) => {
  if (!camera || !dice || faceLabels.length === 0) return;
  if (!face) return;

  // Нормаль цільової грані в world-space до довертання.
  const currentFaceNormalWorld = face.normal.clone().transformDirection(dice.matrixWorld).normalize();
  // Напрям "на користувача": протилежний до напряму погляду камери.
  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);
  const desiredFaceNormalWorld = cameraForward.clone().negate().normalize();

  // Поворот, який переводить поточну нормаль грані в напрямок на камеру.
  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(currentFaceNormalWorld, desiredFaceNormalWorld);
  // Обмежуємо доводку, щоб уникнути різкого перескоку між далекими гранями.
  const maxSettleAngle = 0.55; // ~31.5°
  const fullAngle = 2 * Math.acos(THREE.MathUtils.clamp(alignQuaternion.w, -1, 1));
  const t = fullAngle > 1e-6 ? Math.min(1, maxSettleAngle / fullAngle) : 1;
  const limitedAlign = new THREE.Quaternion().identity().slerp(alignQuaternion, t);
  settleTargetQuaternion.copy(limitedAlign.multiply(dice.quaternion));

  settlingFace = face;
  isSettlingToTargetFace = true;
};

// Ініціалізація всієї 3D-сцени.
const initScene = () => {
  // Створюємо Three.js сцену.
  scene = new THREE.Scene();
  // Створюємо перспективну камеру: FOV, aspect, near, far.
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  // Відсуваємо камеру по Z, щоб бачити кістку.
  camera.position.z = 5;

  // Створюємо WebGL рендерер з антиаліасингом і прозорим фоном.
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // Встановлюємо розмір рендеру під вікно.
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Встановлюємо pixel ratio для чіткості на Retina/HiDPI екранах.
  renderer.setPixelRatio(window.devicePixelRatio);
  // Вставляємо canvas рендерера у контейнер компонента.
  canvasContainer.value.appendChild(renderer.domElement);

  // Основне напрямлене світло для об'єму.
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
  // Розміщення головного світла.
  mainLight.position.set(5, 5, 5);
  // Додаємо головне світло у сцену.
  scene.add(mainLight);
  // Додаємо фонове (ambient) світло, щоб тіні не були занадто темними.
  scene.add(new THREE.AmbientLight(0x404040, 2));

  // Геометрія d20: radius=0.5, detail=0.
  geometry = new THREE.IcosahedronGeometry(0.5, 0);
  // Матеріал кістки з Phong-освітленням.
  material = new THREE.MeshPhongMaterial({
    // Базовий синій колір кістки.
    color: 0x3498db,
    // Flat shading підкреслює ребра та окремі грані.
    flatShading: true,
    // Рівень блиску.
    shininess: 20
  });

  // Створюємо mesh кістки.
  dice = new THREE.Mesh(geometry, material);

  // Створюємо geometry/material для підсвітки верхньої грані.
  topFaceHighlightGeometry = new THREE.BufferGeometry();
  topFaceHighlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  topFaceHighlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  topFaceHighlightMesh = new THREE.Mesh(topFaceHighlightGeometry, topFaceHighlightMaterial);
  topFaceHighlightMesh.visible = false;
  dice.add(topFaceHighlightMesh);

  // Геометрія ребер для видимого контуру.
  edges = new THREE.EdgesGeometry(geometry);
  // Матеріал ліній ребер (білий колір).
  lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  // Об'єкт ліній з ребрами.
  const line = new THREE.LineSegments(edges, lineMaterial);
  // Додаємо контури до кістки.
  dice.add(line);
  // Додаємо номери граней на кістку.
  addFaceLabels();
  // Стартова орієнтація: грань 20 дивиться на користувача.
  const startFace = faceLabels.find((f) => f.value === 20);
  if (startFace) {
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    const toUser = cameraForward.clone().negate().normalize();
    const alignToStartFace = new THREE.Quaternion().setFromUnitVectors(
      startFace.normal.clone().normalize(),
      toUser
    );
    dice.quaternion.copy(alignToStartFace);
    dice.updateMatrixWorld(true);
    alignFaceTrianglePointUp(startFace);
    orientFaceLabelUpright(startFace);
  }
  // Додаємо кістку на сцену.
  scene.add(dice);
};

// Основний цикл анімації.
const animate = () => {
  // Плануємо наступний кадр.
  animationId = requestAnimationFrame(animate);

  // Логіка обертання виконується тільки якщо кидок активний.
  if (isRolling.value) {
    if (topFaceHighlightMesh) topFaceHighlightMesh.visible = false;
    // Обертання по осі X.
    dice.rotation.x += rotationSpeed.x;
    // Обертання по осі Y.
    dice.rotation.y += rotationSpeed.y;

    // Поступове затухання швидкості по X.
    rotationSpeed.x *= 0.97;
    // Поступове затухання швидкості по Y.
    rotationSpeed.y *= 0.97;

    // Коли швидкість мала — зупиняємо кидок.
    if (rotationSpeed.x < 0.005 && rotationSpeed.y < 0.005) {
      isRolling.value = false;
      prepareSettleForFace(getFrontFace());
    }
  }
  // Плавно доводимо куб до орієнтації, де targetFace дивиться на користувача.
  else if (isSettlingToTargetFace) {
    if (topFaceHighlightMesh) topFaceHighlightMesh.visible = false;
    dice.quaternion.slerp(settleTargetQuaternion, 0.08);
    if (dice.quaternion.angleTo(settleTargetQuaternion) < 0.002) {
      dice.quaternion.copy(settleTargetQuaternion);
      isSettlingToTargetFace = false;
      const frontFace = getFrontFace();
      alignFaceTrianglePointUp(frontFace);
      updateTopFaceHighlight(frontFace);
      if (topFaceHighlightMesh) topFaceHighlightMesh.visible = true;
      orientFaceLabelUpright(frontFace);
      settlingFace = null;
    }
  }
  else if (topFaceHighlightMesh && !topFaceHighlightMesh.visible) {
    const frontFace = getFrontFace();
    updateTopFaceHighlight(frontFace);
    topFaceHighlightMesh.visible = true;
  }

  // Рендеримо сцену в поточному кадрі.
  renderer.render(scene, camera);
};

// Запускає новий "кидок" кістки.
const rollDice = () => {
  // Скасовуємо попередню фазу довертання (якщо була).
  isSettlingToTargetFace = false;
  settlingFace = null;
  if (topFaceHighlightMesh) topFaceHighlightMesh.visible = false;
  // Увімкнути режим обертання.
  isRolling.value = true;
  // Встановити випадкову стартову швидкість по X.
  rotationSpeed.x = Math.random() * 0.4 + 0.2;
  // Встановити випадкову стартову швидкість по Y.
  rotationSpeed.y = Math.random() * 0.4 + 0.2;
};

// Обробник зміни розміру вікна.
const handleResize = () => {
  // Якщо камера або рендерер ще не ініціалізовані — виходимо.
  if (!camera || !renderer) return;
  // Оновлюємо аспект камери.
  camera.aspect = window.innerWidth / window.innerHeight;
  // Застосовуємо нову матрицю проєкції.
  camera.updateProjectionMatrix();
  // Оновлюємо розмір рендерера.
  renderer.setSize(window.innerWidth, window.innerHeight);
};

// Хук: компонент змонтовано.
onMounted(() => {
  // Ініціалізуємо сцену.
  initScene();
  // Запускаємо анімацію.
  animate();
  // Підписуємося на resize для адаптивності canvas.
  window.addEventListener('resize', handleResize);
});

// Хук: компонент демонтується.
onUnmounted(() => {
  // Відписуємося від resize.
  window.removeEventListener('resize', handleResize);
  // Скасовуємо animation frame цикл.
  cancelAnimationFrame(animationId);
  // Звільняємо ресурси рендерера.
  if (renderer) renderer.dispose();
  // Звільняємо геометрію ребер.
  if (edges) edges.dispose();
  // Звільняємо геометрію кістки.
  if (geometry) geometry.dispose();
  // Звільняємо матеріал ліній.
  if (lineMaterial) lineMaterial.dispose();
  // Звільняємо матеріал кістки.
  if (material) material.dispose();
  if (topFaceHighlightGeometry) topFaceHighlightGeometry.dispose();
  if (topFaceHighlightMaterial) topFaceHighlightMaterial.dispose();
  // Звільняємо всі матеріали міток.
  labelMaterials.forEach((m) => m.dispose());
  // Звільняємо всі текстури міток.
  labelTextures.forEach((t) => t.dispose());
  if (labelGeometry) labelGeometry.dispose();
  // Очищаємо масив матеріалів.
  labelMaterials = [];
  // Очищаємо масив текстур.
  labelTextures = [];
  labelGeometry = null;
  faceLabels = [];
  isSettlingToTargetFace = false;
  settlingFace = null;
  topFaceHighlightGeometry = null;
  topFaceHighlightMaterial = null;
  topFaceHighlightMesh = null;
});
</script>

<style scoped>
/* Повноекранний контейнер для 3D-сцени. */
.dice-container {
  /* Ширина на всю ширину viewport. */
  width: 100vw;
  /* Висота на всю висоту viewport. */
  height: 100vh;
  /* Темний радіальний фон для контрасту з кісткою. */
  background: radial-gradient(circle, #2c3e50 0%, #000000 100%);
  /* Приховуємо все, що виходить за межі контейнера. */
  overflow: hidden;
  /* Створюємо контекст для абсолютного позиціювання UI. */
  position: relative;
}

/* Блок кнопки поверх canvas. */
#ui {
  /* Абсолютне позиціювання відносно .dice-container. */
  position: absolute;
  /* Відступ зверху. */
  top: 10%;
  /* Центруємо по горизонталі через left + transform. */
  left: 50%;
  /* Точне горизонтальне центрування. */
  transform: translateX(-50%);
  /* Підіймаємо UI над canvas. */
  z-index: 10;
}

/* Базовий стиль кнопки кидка. */
button {
  /* Внутрішні відступи кнопки. */
  padding: 12px 24px;
  /* Розмір тексту. */
  font-size: 1.2rem;
  /* Жирний текст кнопки. */
  font-weight: bold;
  /* Верхній регістр для акценту. */
  text-transform: uppercase;
  /* Колір тексту. */
  color: white;
  /* Базовий червоний фон. */
  background-color: #e74c3c;
  /* Прибираємо стандартну рамку. */
  border: none;
  /* Скругляємо кути. */
  border-radius: 8px;
  /* Курсор-рука при наведенні. */
  cursor: pointer;
  /* Плавна анімація hover-переходів. */
  transition: all 0.2s ease;
  /* Тінь для глибини. */
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

/* Hover-стан кнопки, коли вона активна. */
button:hover:not(:disabled) {
  /* Темніший відтінок при наведенні. */
  background-color: #c0392b;
  /* Легке збільшення для інтерактивного фідбеку. */
  transform: scale(1.05);
}

/* Стан неактивної кнопки під час обертання. */
button:disabled {
  /* Сірий фон для disabled-стану. */
  background-color: #7f8c8d;
  /* Заборонений курсор. */
  cursor: not-allowed;
  /* Напівпрозорість для візуального фідбеку. */
  opacity: 0.7;
}

/* Контейнер для canvas рендерера. */
.canvas-wrapper {
  /* На всю ширину батьківського контейнера. */
  width: 100%;
  /* На всю висоту батьківського контейнера. */
  height: 100%;
}
</style>