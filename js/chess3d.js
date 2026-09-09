// ============ Tablero de Ajedrez en 3D (Three.js) ============
// Estudio oscuro propio (ver _crearHabitacion) con un tablero de 8x8
// casillas y piezas geométricas estilizadas. Reutiliza PALETA_PIEDRAS y
// dibujarMarmol de board3d.js (ese script se carga antes que este, ver
// index.html), pero NO su PALETA_TABLEROS: el ajedrez tiene su propia
// paleta de tableros, más acotada a propósito (pedido explícito: "menos
// tableros para elegir" que en Go) y con un tipo especial (cristal) que
// además cambia el material, no sólo el color.
const PALETA_TABLEROS_AJEDREZ = {
  madera:      { nombre: "Madera", c1: "#7a5230", c2: "#644023", c3: "#4a2e18", vetaClara: "#a8815a", vetaOscura: "#2a1a0d", lateral: "#3a2413" },
  blanconegro: { nombre: "Blanco y Negro", c1: "#f1e9d6", c2: "#a89a80", c3: "#221d18", vetaClara: "#ffffff", vetaOscura: "#000000", lateral: "#171310" },
  grisoscuro:  { nombre: "Gris y Blanco", c1: "#e9e6df", c2: "#9a9a96", c3: "#3c3c40", vetaClara: "#ffffff", vetaOscura: "#242428", lateral: "#26262a" },
  cemento:     { nombre: "Cemento", c1: "#a8a8a2", c2: "#8c8c86", c3: "#57574f", vetaClara: "#c4c4bc", vetaOscura: "#3c3c36", lateral: "#3a3a35" },
  cristal:     { nombre: "Cristal", c1: "#dce8ef", c2: "#b9ccd6", c3: "#5c7a8a", vetaClara: "#ffffff", vetaOscura: "#0a1a22", lateral: "#0e1b22", vidrio: true },
};

// ---------------- material de pieza, por color (cacheado) ----------------
const _cacheMatPiezas = {};
function materialPiezaAjedrez(colorId) {
  if (_cacheMatPiezas[colorId]) return _cacheMatPiezas[colorId];
  const cfg = PALETA_PIEDRAS[colorId] || PALETA_PIEDRAS.blanco;
  const N = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  dibujarMarmol(cv.getContext("2d"), N, cfg);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex, roughness: cfg.rough, metalness: cfg.metal,
    clearcoat: cfg.metal > 0.4 ? 0.45 : 1, clearcoatRoughness: 0.14, reflectivity: 0.55,
    // brillo propio muy leve, con el tono claro de la propia veta (no el
    // color base): así una pieza negra también recibe un poquito de luz
    // propia, útil sobre todo en el tablero "Clásico B/N" donde una pieza
    // negra sobre casilla negra casi no se distinguía del fondo.
    emissive: new THREE.Color(cfg.veta1), emissiveIntensity: 0.14,
  });
  _cacheMatPiezas[colorId] = mat;
  return mat;
}

// ---------------- aura/destello sutil bajo cada pieza ----------------
// Un sprite (siempre de frente a cámara) con un degradado radial aditivo
// cálido, igual para todas las piezas independientemente de su color: si el
// halo usara el propio color de la piedra, una pieza negra tendría un halo
// oscuro y no ayudaría en nada a separarla del tablero — con un tono cálido
// fijo, funciona igual de bien para piezas negras que para piezas blancas.
let _materialAuraPieza = null;
function materialAuraPieza() {
  if (_materialAuraPieza) return _materialAuraPieza;
  const N = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d");
  const grad = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0, "rgba(255,238,205,0.9)");
  grad.addColorStop(0.55, "rgba(255,214,150,0.35)");
  grad.addColorStop(1, "rgba(255,200,130,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, N, N);
  const tex = new THREE.CanvasTexture(cv);
  _materialAuraPieza = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  return _materialAuraPieza;
}

// ---------------- geometría de piezas ----------------
// Set estilizado/geométrico (no realista pieza por pieza): formas simples
// combinadas (cilindros, conos, esferas) que se leen bien a distancia y
// distinguen claramente cada tipo, como un set de ajedrez moderno de
// diseño en vez de uno tallado a mano.
function _malla(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function _crearPeon(mat) {
  const g = new THREE.Group();
  const base = _malla(new THREE.CylinderGeometry(0.30, 0.34, 0.07, 24), mat); base.position.y = 0.035; g.add(base);
  const cuerpo = _malla(new THREE.CylinderGeometry(0.13, 0.22, 0.28, 20), mat); cuerpo.position.y = 0.07 + 0.14; g.add(cuerpo);
  const collar = _malla(new THREE.CylinderGeometry(0.18, 0.16, 0.05, 20), mat); collar.position.y = 0.07 + 0.28 + 0.025; g.add(collar);
  const cabeza = _malla(new THREE.SphereGeometry(0.16, 18, 14), mat); cabeza.position.y = 0.07 + 0.28 + 0.05 + 0.15; g.add(cabeza);
  g.userData.altura = 0.07 + 0.28 + 0.05 + 0.30;
  return g;
}

function _crearTorre(mat) {
  const g = new THREE.Group();
  const base = _malla(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 24), mat); base.position.y = 0.04; g.add(base);
  const cuerpo = _malla(new THREE.CylinderGeometry(0.28, 0.30, 0.42, 24), mat); cuerpo.position.y = 0.08 + 0.21; g.add(cuerpo);
  const remate = _malla(new THREE.CylinderGeometry(0.33, 0.29, 0.07, 24), mat); remate.position.y = 0.08 + 0.42 + 0.035; g.add(remate);
  // almenas: anillo de pequeños bloques arriba, como una torreta de castillo.
  const yAlmena = 0.08 + 0.42 + 0.07 + 0.05;
  const n = 8;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) continue; // huecos alternados, silueta de almena real
    const ang = (i / n) * Math.PI * 2;
    const bloque = _malla(new THREE.BoxGeometry(0.12, 0.1, 0.09), mat);
    bloque.position.set(Math.cos(ang) * 0.28, yAlmena, Math.sin(ang) * 0.28);
    bloque.rotation.y = -ang;
    g.add(bloque);
  }
  g.userData.altura = yAlmena + 0.05;
  return g;
}

function _crearAlfil(mat) {
  const g = new THREE.Group();
  const base = _malla(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 24), mat); base.position.y = 0.04; g.add(base);
  const cuerpo = _malla(new THREE.CylinderGeometry(0.09, 0.26, 0.52, 22), mat); cuerpo.position.y = 0.08 + 0.26; g.add(cuerpo);
  const collar = _malla(new THREE.CylinderGeometry(0.15, 0.12, 0.04, 20), mat); collar.position.y = 0.08 + 0.52 + 0.02; g.add(collar);
  const cabeza = _malla(new THREE.SphereGeometry(0.135, 18, 14), mat); cabeza.position.y = 0.08 + 0.52 + 0.04 + 0.12; g.add(cabeza);
  const punta = _malla(new THREE.ConeGeometry(0.035, 0.09, 12), mat); punta.position.y = 0.08 + 0.52 + 0.04 + 0.24 + 0.045; g.add(punta);
  g.userData.altura = 0.08 + 0.52 + 0.04 + 0.24 + 0.09;
  return g;
}

function _crearCaballo(mat) {
  // Estilizado y abstracto (no un caballo tallado realista): base + cuello
  // curvo sugerido con dos bloques angulados + "cabeza" en cuña con orejas,
  // suficiente para distinguirse claramente del resto del set a simple vista.
  const g = new THREE.Group();
  const base = _malla(new THREE.CylinderGeometry(0.33, 0.37, 0.08, 24), mat); base.position.y = 0.04; g.add(base);
  const zocalo = _malla(new THREE.CylinderGeometry(0.22, 0.26, 0.16, 20), mat); zocalo.position.y = 0.08 + 0.08; g.add(zocalo);

  const cuello = _malla(new THREE.BoxGeometry(0.20, 0.4, 0.16), mat);
  cuello.position.set(0, 0.08 + 0.16 + 0.19, -0.02);
  cuello.rotation.x = -0.34;
  g.add(cuello);

  const testuz = _malla(new THREE.BoxGeometry(0.19, 0.24, 0.30), mat);
  testuz.position.set(0, 0.08 + 0.16 + 0.4 + 0.05, 0.14);
  testuz.rotation.x = 0.42;
  g.add(testuz);

  const hocico = _malla(new THREE.BoxGeometry(0.14, 0.13, 0.2), mat);
  hocico.position.set(0, 0.08 + 0.16 + 0.4 - 0.02, 0.30);
  hocico.rotation.x = 0.42;
  g.add(hocico);

  const oreja1 = _malla(new THREE.ConeGeometry(0.045, 0.14, 10), mat);
  oreja1.position.set(-0.08, 0.08 + 0.16 + 0.4 + 0.22, 0.02);
  oreja1.rotation.z = 0.18;
  g.add(oreja1);
  const oreja2 = oreja1.clone(); oreja2.material = mat; oreja2.position.x = 0.08; oreja2.rotation.z = -0.18; g.add(oreja2);

  g.userData.altura = 0.08 + 0.16 + 0.4 + 0.30;
  return g;
}

function _crearReina(mat) {
  const g = new THREE.Group();
  const base = _malla(new THREE.CylinderGeometry(0.36, 0.40, 0.09, 24), mat); base.position.y = 0.045; g.add(base);
  const cuerpo = _malla(new THREE.CylinderGeometry(0.14, 0.30, 0.62, 24), mat); cuerpo.position.y = 0.09 + 0.31; g.add(cuerpo);
  const collar = _malla(new THREE.TorusGeometry(0.19, 0.028, 10, 24), mat); collar.position.y = 0.09 + 0.62 + 0.02; collar.rotation.x = Math.PI / 2; g.add(collar);
  const corona = _malla(new THREE.CylinderGeometry(0.20, 0.17, 0.10, 20, 1, true), mat); corona.position.y = 0.09 + 0.62 + 0.02 + 0.05; g.add(corona);
  // puntas de la corona: pequeñas esferas en anillo, en vez de picos rectos.
  const yPuntas = 0.09 + 0.62 + 0.02 + 0.10;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const punta = _malla(new THREE.SphereGeometry(0.035, 10, 8), mat);
    punta.position.set(Math.cos(ang) * 0.185, yPuntas, Math.sin(ang) * 0.185);
    g.add(punta);
  }
  const remate = _malla(new THREE.SphereGeometry(0.075, 16, 12), mat); remate.position.y = yPuntas + 0.06; g.add(remate);
  g.userData.altura = yPuntas + 0.12;
  return g;
}

function _crearRey(mat) {
  const g = new THREE.Group();
  const base = _malla(new THREE.CylinderGeometry(0.37, 0.41, 0.09, 24), mat); base.position.y = 0.045; g.add(base);
  const cuerpo = _malla(new THREE.CylinderGeometry(0.15, 0.31, 0.68, 24), mat); cuerpo.position.y = 0.09 + 0.34; g.add(cuerpo);
  const collar = _malla(new THREE.TorusGeometry(0.20, 0.03, 10, 24), mat); collar.position.y = 0.09 + 0.68 + 0.02; collar.rotation.x = Math.PI / 2; g.add(collar);
  const corona = _malla(new THREE.CylinderGeometry(0.21, 0.18, 0.12, 20, 1, true), mat); corona.position.y = 0.09 + 0.68 + 0.02 + 0.06; g.add(corona);
  const yCruz = 0.09 + 0.68 + 0.02 + 0.12 + 0.04;
  const bulboCruz = _malla(new THREE.SphereGeometry(0.075, 16, 12), mat); bulboCruz.position.y = yCruz; g.add(bulboCruz);
  const cruzV = _malla(new THREE.BoxGeometry(0.045, 0.20, 0.045), mat); cruzV.position.y = yCruz + 0.13; g.add(cruzV);
  const cruzH = _malla(new THREE.BoxGeometry(0.14, 0.045, 0.045), mat); cruzH.position.y = yCruz + 0.10; g.add(cruzH);
  g.userData.altura = yCruz + 0.23;
  return g;
}

const CONSTRUCTORES_PIEZA = {
  peon: _crearPeon, torre: _crearTorre, alfil: _crearAlfil,
  caballo: _crearCaballo, reina: _crearReina, rey: _crearRey,
};

class ChessTablero3D {
  constructor(contenedor) {
    this.contenedor = contenedor;

    this.escena = new THREE.Scene();
    this.escena.background = null;

    this.camara = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dom = this.renderer.domElement;
    contenedor.appendChild(this.dom);

    this._grupoPiezas = new THREE.Group();
    this._grupoMarcas = new THREE.Group();
    this._raycaster = new THREE.Raycaster();
    this._puntero = new THREE.Vector2();
    this._planoClick = null;
    this._onCasilla = null;

    this._azimut = 0.08;
    this._elevacion = 0.78;
    this._distancia = 15;
    this._zoomMin = 8.5;
    this._zoomMax = 34;
    this._arrastrando = false;
    this._ultimoPuntero = { x: 0, y: 0 };
    this._tiempo = 0;
    this._vista2D = false;

    this._animaciones = [];
    this._piezasListo = false; // true después del primer actualizar(): recién ahí tiene sentido animar
    this._ultimoMovKey = null;

    // reflejo del tablero: una cámara cúbica parada casi sobre la superficie
    // que renderiza el entorno (piezas incluidas) a una textura cúbica chica,
    // usada como envMap del tablero — un reflejo real pero borroso/tenue, no
    // un espejo nítido.
    this._rtCubo = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this._cuboCamara = new THREE.CubeCamera(0.05, 50, this._rtCubo);
    this._cuboCamara.position.set(0, 0.06, 0);
    this._frameCubo = 0;

    this._crearLuces();
    this._crearHabitacion();
    this.escena.add(this._cuboCamara);
    this._crearTableroBase("madera");
    this.escena.add(this._grupoPiezas);
    this.escena.add(this._grupoMarcas);
    this._eventos();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  _crearLuces() {
    const hemi = new THREE.HemisphereLight(0x8a734a, 0x0a0806, 0.5);
    this.escena.add(hemi);
    this.key = new THREE.DirectionalLight(0xfff2d8, 1.7);
    this.key.position.set(-4.2, 6.5, 3.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.left = -6;
    this.key.shadow.camera.right = 6;
    this.key.shadow.camera.top = 6;
    this.key.shadow.camera.bottom = -6;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 20;
    this.key.shadow.bias = -0.0018;
    this.key.shadow.radius = 4;
    this.escena.add(this.key);
    const fill = new THREE.DirectionalLight(0x9db4d9, 0.35);
    fill.position.set(5, 3, -4);
    this.escena.add(fill);
  }

  // Antes era la misma habitación washitsu que Go (tatami + paredes shoji +
  // farol). Se sacó a pedido: en un cuarto lleno de madera clara, una pieza
  // negra sobre una casilla oscura ya competía contra mucho ambiente cálido
  // alrededor. Ahora es un estudio oscuro minimalista — un piso apenas
  // visible que se pierde en niebla negra — para que toda la atención (y el
  // contraste) quede en el tablero y las piezas.
  _crearHabitacion() {
    // Bien más abajo que el tablero: ahora hay un pedestal completo debajo
    // (ver _crearTableroBase) con un hueco real entre el tablero y el
    // pedestal donde vive la luz — como una mesa ratona con luz led en la
    // hendija entre el estante de arriba y la base.
    const PISO_Y = -1.6;
    this.escena.background = new THREE.Color(0x08080a);
    this.escena.fog = new THREE.Fog(0x08080a, 12, 30);

    const geoPiso = new THREE.PlaneGeometry(120, 120);
    geoPiso.rotateX(-Math.PI / 2);
    const matPiso = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.75, metalness: 0.15 });
    const piso = new THREE.Mesh(geoPiso, matPiso);
    piso.position.y = PISO_Y;
    piso.receiveShadow = true;
    this.escena.add(piso);

    // un aro de luz fría tenue apoyado en el piso, lejos del tablero: le da
    // algo de profundidad al estudio sin iluminar la escena de nuevo como
    // el farol/lámpara de antes (ver luces cálidas de acento más abajo).
    const acento = new THREE.PointLight(0x5b6f9c, 1.1, 16, 2);
    acento.position.set(-6, 1.4, -5);
    this.escena.add(acento);

    // -- luna: un disco que brilla arriba, con un haz de luz bajando hasta
    //    el tablero (efecto pedido explícitamente: "como si lo alumbrara
    //    una luna desde arriba"). El disco es sólo decorativo (material
    //    auto-iluminado); la luz de verdad es el SpotLight de abajo.
    // Bien adentro de la niebla (fog empieza a 12 unidades) si no se la
    // excluye a propósito (fog:false): sin eso, la luna se ve como una
    // mancha gris apagada en vez de un disco brillante nítido.
    const posLuna = new THREE.Vector3(-3.5, 9.5, -9);
    const luna = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xe8eefb, toneMapped: false, fog: false })
    );
    luna.position.copy(posLuna);
    this.escena.add(luna);

    const cvLuna = document.createElement("canvas");
    cvLuna.width = cvLuna.height = 256;
    const lctx = cvLuna.getContext("2d");
    const halo = lctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    halo.addColorStop(0, "rgba(215,228,255,0.75)");
    halo.addColorStop(0.4, "rgba(180,200,240,0.28)");
    halo.addColorStop(1, "rgba(160,190,230,0)");
    lctx.fillStyle = halo;
    lctx.fillRect(0, 0, 256, 256);
    const haloLuna = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cvLuna), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8, fog: false,
    }));
    haloLuna.scale.set(4.4, 4.4, 1);
    haloLuna.position.copy(posLuna);
    this.escena.add(haloLuna);

    // luz de luna real: fría, desde arriba, apuntando al centro del tablero.
    // Sale del mismo punto que el disco de la luna, para que el haz de abajo
    // se vea conectado a ella y no como un rayo saliendo de la nada. Ángulo
    // más abierto y penumbra casi total: un charco de luz de borde muy
    // suave sobre el tablero, no un círculo nítido recortado.
    this.luzLuna = new THREE.SpotLight(0xcfe0ff, 2.6, 42, Math.PI / 6, 0.92, 1.7);
    this.luzLuna.position.copy(posLuna);
    this.luzLuna.target.position.set(0, 0, 0);
    this.luzLuna.castShadow = true;
    this.luzLuna.shadow.mapSize.set(1024, 1024);
    this.luzLuna.shadow.camera.near = 4;
    this.luzLuna.shadow.camera.far = 24;
    this.luzLuna.shadow.bias = -0.002;
    this.escena.add(this.luzLuna, this.luzLuna.target);

    // haz de luz visible: antes era un cono (CylinderGeometry) con un borde
    // geométrico recto — por más aditivo y transparente que fuera, ese
    // borde se leía como "una línea", no como luz difusa. Ahora son varios
    // sprites redondos y borrosos (siempre de frente a cámara, sin bordes
    // rectos posibles) superpuestos en el camino luna→tablero, cada vez más
    // chicos y tenues hacia arriba: se lee como niebla luminosa, no como
    // una figura.
    const cvHaz = document.createElement("canvas");
    cvHaz.width = cvHaz.height = 256;
    const hctx = cvHaz.getContext("2d");
    const gHaz = hctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gHaz.addColorStop(0, "rgba(216,229,255,0.85)");
    gHaz.addColorStop(0.4, "rgba(198,216,255,0.3)");
    gHaz.addColorStop(1, "rgba(190,210,255,0)");
    hctx.fillStyle = gHaz;
    hctx.fillRect(0, 0, 256, 256);
    const texHaz = new THREE.CanvasTexture(cvHaz);

    const destinoHaz = new THREE.Vector3(0, 0.05, 0);
    const pasosHaz = [
      { t: 0.06, escala: 3.6, opacidad: 0.14 },
      { t: 0.26, escala: 2.7, opacidad: 0.16 },
      { t: 0.48, escala: 2.0, opacidad: 0.18 },
      { t: 0.7, escala: 1.5, opacidad: 0.22 },
      { t: 0.9, escala: 1.05, opacidad: 0.3 },
    ];
    for (const { t, escala, opacidad } of pasosHaz) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texHaz, transparent: true, opacity: opacidad,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      s.scale.set(escala, escala, 1);
      s.position.lerpVectors(posLuna, destinoHaz, t);
      this.escena.add(s);
    }
  }

  // ---- tablero de ajedrez: 8x8 casillas alternadas + marco de madera ----
  _texturaCasillas(tipo) {
    const cfg = PALETA_TABLEROS_AJEDREZ[tipo] || PALETA_TABLEROS_AJEDREZ.madera;
    const N = 1024, cell = N / 8;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d");
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const clara = (x + y) % 2 === 0;
        ctx.fillStyle = clara ? cfg.c1 : cfg.c3;
        ctx.fillRect(x * cell, y * cell, cell, cell);
        // veta suave dentro de cada casilla, para que no quede un color plano.
        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = clara ? cfg.vetaOscura : cfg.vetaClara;
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          const y0 = y * cell + (i + 0.5) * (cell / 3) + (Math.random() - 0.5) * 6;
          ctx.beginPath();
          ctx.moveTo(x * cell, y0);
          ctx.lineTo(x * cell + cell, y0 + (Math.random() - 0.5) * 8);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  _crearTableroBase(tipoTablero) {
    if (this._grupoTablero) {
      this.escena.remove(this._grupoTablero);
      this._grupoTablero.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => { m.map?.dispose(); m.dispose(); });
        else if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
      });
    }
    this.tipoTablero = tipoTablero;
    const cfg = PALETA_TABLEROS_AJEDREZ[tipoTablero] || PALETA_TABLEROS_AJEDREZ.madera;
    const grosor = 0.3;
    const geoBase = new THREE.BoxGeometry(8, grosor, 8);
    const texTop = this._texturaCasillas(tipoTablero);
    const matLateral = new THREE.MeshPhysicalMaterial({
      color: cfg.lateral, roughness: 0.35, metalness: 0.1,
      clearcoat: 0.8, clearcoatRoughness: 0.12,
      envMap: this._rtCubo.texture, envMapIntensity: 0.5,
    });
    // Muy laqueado a propósito (clearcoat alto + roughness bajo + envMap
    // fuerte): un reflejo real de las piezas, nítido pero no un espejo
    // perfecto. "Cristal" además es transmisivo (se ve "adentro" del
    // tablero, como vidrio de verdad) — el resto son maderas/piedras
    // pulidas y laqueadas, opacas pero muy brillantes.
    const esVidrio = !!cfg.vidrio;
    const matTop = new THREE.MeshPhysicalMaterial(esVidrio ? {
      map: texTop, roughness: 0.04, metalness: 0.05,
      transmission: 0.55, thickness: 0.5, ior: 1.5,
      envMap: this._rtCubo.texture, envMapIntensity: 1.1,
      clearcoat: 1, clearcoatRoughness: 0.02,
    } : {
      map: texTop, roughness: 0.16, metalness: 0.28,
      clearcoat: 0.95, clearcoatRoughness: 0.06,
      envMap: this._rtCubo.texture, envMapIntensity: 0.85,
    });
    const base = new THREE.Mesh(geoBase, [matLateral, matLateral, matTop, matLateral, matLateral, matLateral]);
    base.position.y = -grosor / 2;
    base.receiveShadow = true;
    base.castShadow = true;

    // marco decorativo alrededor, mismo tono y laqueado que el lateral.
    const matMarco = new THREE.MeshPhysicalMaterial({
      color: cfg.lateral, roughness: 0.35, metalness: 0.1,
      clearcoat: 0.8, clearcoatRoughness: 0.12,
      envMap: this._rtCubo.texture, envMapIntensity: 0.5,
    });
    const grosorMarco = 0.34;
    const marcoGeo = new THREE.BoxGeometry(8 + grosorMarco * 2, grosor * 0.85, grosorMarco);
    const marcoN = new THREE.Mesh(marcoGeo, matMarco); marcoN.position.set(0, -grosor * 0.42, -4 - grosorMarco / 2);
    const marcoS = marcoN.clone(); marcoS.position.z = 4 + grosorMarco / 2;
    const marcoLGeo = new THREE.BoxGeometry(grosorMarco, grosor * 0.85, 8);
    const marcoE = new THREE.Mesh(marcoLGeo, matMarco); marcoE.position.set(-4 - grosorMarco / 2, -grosor * 0.42, 0);
    const marcoO = marcoE.clone(); marcoO.position.x = 4 + grosorMarco / 2;
    [marcoN, marcoS, marcoE, marcoO].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });

    this._grupoTablero = new THREE.Group();
    this._grupoTablero.add(base, marcoN, marcoS, marcoE, marcoO);
    this.escena.add(this._grupoTablero);

    if (this._planoClick) this._planoClick.geometry.dispose();
    const geoPlano = new THREE.PlaneGeometry(8, 8);
    geoPlano.rotateX(-Math.PI / 2);
    this._planoClick = new THREE.Mesh(geoPlano, new THREE.MeshBasicMaterial({ visible: false }));
    this._planoClick.position.y = 0.001;
    this._grupoTablero.add(this._planoClick);

    // -- pedestal + hueco con luz led, de color elegible (setColorLuzInferior) --
    // Igual criterio que en board3d.js (mismo pedido para los dos
    // tableros): un pedestal sólido debajo, un hueco real entre el tablero
    // y ese pedestal, y ahí adentro la tira brillante nítida (el "tubo" de
    // luz en sí) más el resplandor difuso que ilumina las dos caras del
    // hueco — no sólo un resplandor flotando en el aire.
    if (!this._colorLuzInferior) this._colorLuzInferior = PALETA_LUCES_INFERIOR.azul.color;
    const anchoTableroTotal = 8 + grosorMarco * 2;
    const HUECO = 0.55;
    const ALTURA_PEDESTAL = 0.4;
    const anchoPedestal = anchoTableroTotal * 0.94;
    const techoHueco = -grosor;
    const pisoHueco = techoHueco - HUECO;

    const matPedestal = new THREE.MeshStandardMaterial({ color: cfg.lateral, roughness: 0.7, metalness: 0.08 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(anchoPedestal, ALTURA_PEDESTAL, anchoPedestal), matPedestal);
    pedestal.position.y = pisoHueco - ALTURA_PEDESTAL / 2;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    this._grupoTablero.add(pedestal);

    const grosorTiraSolida = 0.09;
    const matTiraSolida = new THREE.MeshBasicMaterial({ color: this._colorLuzInferior, toneMapped: false, fog: false });
    const largoTiraNS = anchoPedestal - grosorTiraSolida * 1.6;
    const tiraN = new THREE.Mesh(new THREE.BoxGeometry(largoTiraNS, grosorTiraSolida, grosorTiraSolida), matTiraSolida);
    tiraN.position.set(0, pisoHueco + grosorTiraSolida * 0.6, -anchoPedestal / 2 + grosorTiraSolida * 0.8);
    const tiraS = tiraN.clone(); tiraS.position.z = anchoPedestal / 2 - grosorTiraSolida * 0.8;
    const tiraE = new THREE.Mesh(new THREE.BoxGeometry(grosorTiraSolida, grosorTiraSolida, largoTiraNS), matTiraSolida);
    tiraE.position.set(-anchoPedestal / 2 + grosorTiraSolida * 0.8, pisoHueco + grosorTiraSolida * 0.6, 0);
    const tiraO = tiraE.clone(); tiraO.position.x = anchoPedestal / 2 - grosorTiraSolida * 0.8;
    this._tirasSolidasInferior = [tiraN, tiraS, tiraE, tiraO];
    this._tirasSolidasInferior.forEach((t) => this._grupoTablero.add(t));

    const N_TIRA = 512;
    const cvGlowInferior = document.createElement("canvas");
    cvGlowInferior.width = cvGlowInferior.height = N_TIRA;
    const ctxGlowInferior = cvGlowInferior.getContext("2d");
    const escalaPlanoTira = 1.35;
    const margenTira = N_TIRA * (1 - 1 / escalaPlanoTira) / 2;
    ctxGlowInferior.filter = `blur(${N_TIRA * 0.05}px)`;
    ctxGlowInferior.strokeStyle = "#ffffff";
    ctxGlowInferior.lineWidth = N_TIRA * 0.032;
    ctxGlowInferior.strokeRect(margenTira, margenTira, N_TIRA - margenTira * 2, N_TIRA - margenTira * 2);
    ctxGlowInferior.filter = "none";
    const texGlowInferior = new THREE.CanvasTexture(cvGlowInferior);

    const geoGlowInferior = new THREE.PlaneGeometry(anchoPedestal * escalaPlanoTira, anchoPedestal * escalaPlanoTira);
    geoGlowInferior.rotateX(-Math.PI / 2);
    this._opacidadGlowInferiorBase = 0.85;
    const matGlowInferior = new THREE.MeshBasicMaterial({
      map: texGlowInferior, color: this._colorLuzInferior, transparent: true,
      opacity: this._opacidadGlowInferiorBase,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    });
    this._discoGlowInferior = new THREE.Mesh(geoGlowInferior, matGlowInferior);
    this._discoGlowInferior.position.y = pisoHueco + 0.01;
    this._grupoTablero.add(this._discoGlowInferior);

    this._intensidadLuzInferiorBase = 2.4;
    if (!this.luzInferior) {
      this.luzInferior = new THREE.PointLight(this._colorLuzInferior, this._intensidadLuzInferiorBase, 22, 2);
      this.escena.add(this.luzInferior);
    } else {
      this.luzInferior.color.set(this._colorLuzInferior);
    }
    this.luzInferior.position.set(0, (techoHueco + pisoHueco) / 2, 0);

    // arranca (o reinicia) el tablero: la próxima actualizar() pone las
    // piezas directo en su lugar, sin animación de deslizamiento.
    this._piezasListo = false;
    this._animaciones = [];
    this._ultimoMovKey = null;
  }

  cambiarTablero(tipoTablero) {
    this._crearTableroBase(tipoTablero);
  }

  _mundoDesdeCasilla(x, y) { return [x - 3.5, y - 3.5]; }
  _casillaDesdeMundo(wx, wz) {
    const x = Math.round(wx + 3.5), y = Math.round(wz + 3.5);
    if (x < 0 || y < 0 || x > 7 || y > 7) return null;
    if (Math.abs(wx + 3.5 - x) > 0.46 || Math.abs(wz + 3.5 - y) > 0.46) return null;
    return { x, y };
  }

  // ---- redibuja todas las piezas a partir de un tablero 8x8 genérico ----
  // `tablero` es una matriz [y][x] (y=0..7, x=0..7) con null o
  // { tipo: 'peon'|'torre'|'caballo'|'alfil'|'reina'|'rey', color: 'blanco'|'negro' }.
  // `opciones`: { seleccion:{x,y}, legales:[{x,y}...], ultimoMovimiento:{desde:{x,y},hasta:{x,y},tipo}, jaqueCasilla:{x,y}|null, colorBlanco, colorNegro }
  actualizar(tablero, opciones = {}) {
    this._grupoMarcas.clear();
    const colorBlanco = opciones.colorBlanco || "blanco";
    const colorNegro = opciones.colorNegro || "negro";

    // Si esto es un movimiento nuevo de verdad (no sólo un redibujado por
    // haber cambiado la selección), la(s) pieza(s) que se movieron arrancan
    // en su casilla de origen y se deslizan hasta la de destino en vez de
    // aparecer ya puestas ahí — ver _avanzarAnimaciones(). El enroque mueve
    // dos piezas (rey + torre); todo lo demás, sólo una.
    const movKey = opciones.ultimoMovimiento ? JSON.stringify(opciones.ultimoMovimiento) : null;
    const esMovimientoNuevo = movKey && movKey !== this._ultimoMovKey && this._piezasListo;
    this._ultimoMovKey = movKey;

    const origenes = [];
    if (esMovimientoNuevo) {
      const um = opciones.ultimoMovimiento;
      origenes.push({ desde: um.desde, hasta: um.hasta });
      if (um.tipo === "enroqueCorto" || um.tipo === "enroqueLargo") {
        const fila = um.desde.y;
        const torreDesde = um.tipo === "enroqueCorto" ? { x: 7, y: fila } : { x: 0, y: fila };
        const torreHasta = um.tipo === "enroqueCorto" ? { x: um.hasta.x - 1, y: fila } : { x: um.hasta.x + 1, y: fila };
        origenes.push({ desde: torreDesde, hasta: torreHasta });
      }
    }

    this._grupoPiezas.clear();
    this._animaciones = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = tablero[y][x];
        if (!p) continue;
        const constructor = CONSTRUCTORES_PIEZA[p.tipo];
        if (!constructor) continue;
        const colorId = p.color === "blanco" ? colorBlanco : colorNegro;
        const grupo = constructor(materialPiezaAjedrez(colorId));
        const halo = new THREE.Sprite(materialAuraPieza());
        halo.scale.set(0.8, 0.8, 1);
        halo.position.set(0, 0.03, 0);
        grupo.add(halo);

        const [wxFinal, wzFinal] = this._mundoDesdeCasilla(x, y);
        const origen = origenes.find((o) => o.hasta.x === x && o.hasta.y === y);
        if (origen) {
          const [wxInicial, wzInicial] = this._mundoDesdeCasilla(origen.desde.x, origen.desde.y);
          grupo.position.set(wxInicial, 0, wzInicial);
          this._animaciones.push({ grupo, x0: wxInicial, z0: wzInicial, x1: wxFinal, z1: wzFinal, inicio: this._tiempo, duracion: 0.32 });
        } else {
          grupo.position.set(wxFinal, 0, wzFinal);
        }
        grupo.rotation.y = p.color === "blanco" ? 0 : Math.PI;
        this._grupoPiezas.add(grupo);
      }
    }
    this._piezasListo = true;

    // casilla seleccionada: anillo dorado.
    if (opciones.seleccion) {
      this._grupoMarcas.add(this._anillo(opciones.seleccion.x, opciones.seleccion.y, 0xe8b84b, 0.34));
    }
    // movimientos legales: puntos tenues en el centro de cada casilla destino.
    if (opciones.legales) {
      for (const { x, y } of opciones.legales) {
        this._grupoMarcas.add(this._punto(x, y));
      }
    }
    // último movimiento: dos anillos finos, origen y destino.
    if (opciones.ultimoMovimiento) {
      const { desde, hasta } = opciones.ultimoMovimiento;
      this._grupoMarcas.add(this._anillo(desde.x, desde.y, 0xd1483a, 0.15, true));
      this._grupoMarcas.add(this._anillo(hasta.x, hasta.y, 0xd1483a, 0.15, true));
    }
    // jaque: resplandor rojo bajo el rey amenazado.
    if (opciones.jaqueCasilla) {
      this._grupoMarcas.add(this._anillo(opciones.jaqueCasilla.x, opciones.jaqueCasilla.y, 0xff2a2a, 0.4, false, true));
    }
  }

  _anillo(x, y, color, radio, fino, relleno) {
    const [wx, wz] = this._mundoDesdeCasilla(x, y);
    const geo = fino
      ? new THREE.TorusGeometry(radio, 0.012, 8, 24)
      : new THREE.TorusGeometry(radio, relleno ? 0.05 : 0.03, 8, 28);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: relleno ? 0.85 : 1 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(wx, 0.02, wz);
    return m;
  }

  _punto(x, y) {
    const [wx, wz] = this._mundoDesdeCasilla(x, y);
    const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8b84b, toneMapped: false, transparent: true, opacity: 0.55 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(wx, 0.015, wz);
    return m;
  }

  // ---- interacción: click y arrastre de cámara (idéntico a board3d.js) ----
  _eventos() {
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", (e) => {
      this._arrastrando = true;
      this._movio = false;
      this._inicioArrastre = { x: e.clientX, y: e.clientY };
      this._ultimoPuntero = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", () => { this._arrastrando = false; });
    window.addEventListener("pointermove", (e) => {
      if (this._arrastrando) {
        // Zona muerta: hasta que el puntero no se alejó lo suficiente del
        // punto donde se apretó el botón, no rota la cámara ni cuenta como
        // arrastre. Antes se comparaba contra la posición del evento
        // anterior nomás, así que un solo salto de un par de píxeles entre
        // dos eventos (típico al hacer clic con mouse/trackpad) ya alcanzaba
        // para "perder" el clic y mover la cámara en su lugar — que era
        // justo lo que impedía seleccionar/mover piezas con clics normales.
        const distTotal = Math.abs(e.clientX - this._inicioArrastre.x) + Math.abs(e.clientY - this._inicioArrastre.y);
        if (distTotal > 6) {
          this._movio = true;
          // en vista 2D la cámara queda fija mirando derecho hacia abajo:
          // arrastrar sigue sirviendo para distinguir clic de arrastre (no
          // cuenta como jugada), pero no rota nada.
          if (!this._vista2D) {
            const dx = e.clientX - this._ultimoPuntero.x;
            const dy = e.clientY - this._ultimoPuntero.y;
            this._azimut = Math.min(1.15, Math.max(-1.15, this._azimut - dx * 0.006));
            this._elevacion = Math.min(1.35, Math.max(0.55, this._elevacion - dy * 0.004));
          }
        }
        this._ultimoPuntero = { x: e.clientX, y: e.clientY };
      }
    });
    dom.addEventListener("click", (e) => {
      if (this._movio) return;
      const casilla = this._casillaBajoPuntero(e);
      if (casilla && this._onCasilla) this._onCasilla(casilla.x, casilla.y);
    });
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      this._distancia = Math.min(this._zoomMax, Math.max(this._zoomMin, this._distancia + e.deltaY * 0.012));
    }, { passive: false });
  }

  _casillaBajoPuntero(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._puntero.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._puntero.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._puntero, this.camara);
    const hits = this._raycaster.intersectObject(this._planoClick, false);
    if (!hits.length) return null;
    const { x: wx, z: wz } = hits[0].point;
    return this._casillaDesdeMundo(wx, wz);
  }

  onCasilla(cb) { this._onCasilla = cb; }

  // Vista 2D: cámara casi vertical mirando el tablero de arriba (no es una
  // cámara ortográfica de verdad, pero a esa elevación la diferencia de
  // perspectiva es mínima y así no hace falta un segundo sistema de cámara
  // en paralelo). Guarda el ángulo de la vista 3D para poder volver tal
  // cual estaba al cambiar de nuevo.
  setVista(modo) {
    const es2D = modo === "2d";
    if (es2D === this._vista2D) return;
    if (es2D) {
      this._guardado3D = { azimut: this._azimut, elevacion: this._elevacion };
      this._azimut = 0;
      this._elevacion = 0.05;
    } else if (this._guardado3D) {
      this._azimut = this._guardado3D.azimut;
      this._elevacion = this._guardado3D.elevacion;
    }
    this._vista2D = es2D;
  }

  // Cambia el color de la luz bajo el tablero (y su resplandor) sin
  // reconstruir nada más — se puede llamar aunque ya haya una partida en
  // curso, no sólo al armar el tablero.
  setColorLuzInferior(hex) {
    this._colorLuzInferior = hex;
    if (this.luzInferior) this.luzInferior.color.set(hex);
    if (this._discoGlowInferior) this._discoGlowInferior.material.color.set(hex);
    if (this._tirasSolidasInferior) this._tirasSolidasInferior.forEach((t) => t.material.color.set(hex));
  }

  // Desliza cada pieza en movimiento de su casilla de origen a la de destino
  // (con un salto vertical sutil a mitad de camino, no una línea recta) en
  // vez de dejarla saltar directo — así se ve como una jugada, no un
  // teletransporte. Se llama una vez por cuadro desde _loop().
  _avanzarAnimaciones() {
    if (!this._animaciones.length) return;
    const vivas = [];
    for (const a of this._animaciones) {
      const t = Math.min(1, (this._tiempo - a.inicio) / a.duracion);
      const suave = 1 - Math.pow(1 - t, 3); // easeOutCubic
      a.grupo.position.x = a.x0 + (a.x1 - a.x0) * suave;
      a.grupo.position.z = a.z0 + (a.z1 - a.z0) * suave;
      a.grupo.position.y = Math.sin(Math.min(1, t) * Math.PI) * 0.22;
      if (t < 1) vivas.push(a);
      else a.grupo.position.y = 0;
    }
    this._animaciones = vivas;
  }

  resize() {
    // Igual que antes leía sólo el ancho e inventaba un alto (w*0.94): el
    // canvas nunca llenaba el panel si éste tenía otra proporción. Ahora
    // .tablero-envoltorio define su propio alto por CSS y acá se lee tal
    // cual, para que el canvas ocupe el panel entero de verdad.
    const w = this.contenedor.clientWidth || 480;
    const h = this.contenedor.clientHeight || Math.round(w * 0.94);
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  _loop(t) {
    requestAnimationFrame(this._loop);
    this._tiempo = t * 0.001;

    this._avanzarAnimaciones();

    // parpadeo sutil tipo neón en la luz de abajo y su resplandor (misma
    // fase en las dos, para que se vea como una sola fuente).
    if (this.luzInferior) {
      const p = Math.sin(this._tiempo * 3.1) * 0.22 + Math.sin(this._tiempo * 11.3) * 0.1;
      this.luzInferior.intensity = this._intensidadLuzInferiorBase + p * (this._intensidadLuzInferiorBase / 2.8);
      if (this._discoGlowInferior) this._discoGlowInferior.material.opacity = Math.max(0.5, this._opacidadGlowInferiorBase + p * 0.12);
    }

    const r = this._distancia;
    const cx = r * Math.sin(this._elevacion) * Math.sin(this._azimut);
    const cz = r * Math.sin(this._elevacion) * Math.cos(this._azimut);
    const cy = r * Math.cos(this._elevacion);
    this.camara.position.set(cx, cy, cz);
    this.camara.lookAt(0, 0, 0);

    // el reflejo del tablero no necesita actualizarse cada cuadro (es
    // borroso y "sutil" a propósito) — cada 3 cuadros alcanza y ahorra el
    // costo de las 6 pasadas extra de renderizado de la cámara cúbica.
    this._frameCubo = (this._frameCubo + 1) % 3;
    if (this._frameCubo === 0 && this._grupoTablero) {
      this._grupoTablero.visible = false; // que el tablero no se refleje a sí mismo
      this._cuboCamara.update(this.renderer, this.escena);
      this._grupoTablero.visible = true;
    }

    this.renderer.render(this.escena, this.camara);
  }

  dispose() {
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}
