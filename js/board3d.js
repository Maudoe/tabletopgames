// ============ Tablero de Go en 3D (Three.js) ============
// Piedras con material físico (clearcoat, como piedra pulida real), tablero
// de madera con vetas generadas por canvas, e iluminación de tres puntos
// (key + fill + rim dorado) con sombras suaves. THREE se carga por CDN
// antes de este script (ver index.html).

// ---------------- paleta de piedras ----------------
// Cada color es "piedra natural", no plástico liso: base + un par de vetas
// más claras/oscuras, pintadas como manchas irregulares y desenfocadas
// (mismo look que jade, coral o cuarzo pulido). dorado y plata llevan más
// metalness para leerse como metal en vez de piedra.
const PALETA_PIEDRAS = {
  negro:   { nombre: "Negro",   base: "#141210", veta1: "#2c2820", veta2: "#050403", metal: 0.08, rough: 0.26 },
  blanco:  { nombre: "Blanco",  base: "#f3ecd9", veta1: "#e4d8ba", veta2: "#c9bda0", metal: 0.02, rough: 0.32 },
  jade:    { nombre: "Jade",    base: "#3f6b4a", veta1: "#a9c9a0", veta2: "#e8ecd8", metal: 0.03, rough: 0.3 },
  carmesi: { nombre: "Carmesí", base: "#5c1018", veta1: "#b0342a", veta2: "#2a0508", metal: 0.04, rough: 0.28 },
  coral:   { nombre: "Coral",   base: "#d9694f", veta1: "#ffd9c4", veta2: "#a8402a", metal: 0.02, rough: 0.32 },
  naranja: { nombre: "Naranja", base: "#c96a24", veta1: "#ffce8a", veta2: "#7a3d10", metal: 0.03, rough: 0.3 },
  azul:    { nombre: "Azul",    base: "#1c3460", veta1: "#6c93c9", veta2: "#0c1830", metal: 0.05, rough: 0.28 },
  violeta: { nombre: "Violeta", base: "#4a2a5c", veta1: "#b48ad1", veta2: "#200f2a", metal: 0.04, rough: 0.3 },
  dorado:  { nombre: "Dorado",  base: "#a97f3c", veta1: "#f0d9a0", veta2: "#5c431f", metal: 0.65, rough: 0.28 },
  plata:   { nombre: "Plata",   base: "#9aa0a6", veta1: "#eef0f2", veta2: "#4a4e52", metal: 0.7, rough: 0.24 },
};

// ---------------- paleta de tableros ----------------
// Sólo el Estándar (madera clara) lleva línea oscura tradicional; en las
// tres maderas más oscuras la línea oscura se pierde contra el fondo, así
// que todas esas van con línea blanca.
const LINEA_BLANCA = "rgba(240,234,220,0.88)";
const PALETA_TABLEROS = {
  estandar: { nombre: "Estándar", c1: "#c9a15c", c2: "#b8934f", c3: "#a67f3f", vetaClara: "#e8c988", vetaOscura: "#7a5c2a", lateral: "#6d5127", linea: "rgba(35,24,8,0.82)" },
  palorosa: { nombre: "Palo Rosa", c1: "#a85a4a", c2: "#8f463a", c3: "#6e3229", vetaClara: "#d99e88", vetaOscura: "#4a1f18", lateral: "#4a231c", linea: LINEA_BLANCA },
  nogal:    { nombre: "Nogal", c1: "#7a5230", c2: "#644023", c3: "#4a2e18", vetaClara: "#a8815a", vetaOscura: "#2a1a0d", lateral: "#3a2413", linea: LINEA_BLANCA },
  wengue:   { nombre: "Wengué", c1: "#3a2c22", c2: "#2a1f18", c3: "#1a120d", vetaClara: "#8a7360", vetaOscura: "#0a0705", lateral: "#160f0a", linea: LINEA_BLANCA },
  clasico:  { nombre: "Clásico B/N", c1: "#f1e9d6", c2: "#a89a80", c3: "#221d18", vetaClara: "#ffffff", vetaOscura: "#000000", lateral: "#171310", linea: LINEA_BLANCA },
  cemento:  { nombre: "Cemento", c1: "#a8a8a2", c2: "#8c8c86", c3: "#57574f", vetaClara: "#c4c4bc", vetaOscura: "#3c3c36", lateral: "#3a3a35", linea: LINEA_BLANCA },
  cristal:  { nombre: "Cristal", c1: "#dce8ef", c2: "#b9ccd6", c3: "#8fa8b4", vetaClara: "#ffffff", vetaOscura: "#2a3d46", lateral: "#0e1b22", linea: LINEA_BLANCA, vidrio: true },
};

// ---------------- paleta de la luz bajo el tablero ----------------
// Colores simples, sin textura (son luces, no piedras) — el jugador elige
// uno y así queda tanto la luz de verdad como el resplandor visible debajo
// del tablero (ver construir()/setColorLuzInferior() en Tablero3D).
const PALETA_LUCES_INFERIOR = {
  azul:    { nombre: "Azul",    color: "#4a7fd6" },
  violeta: { nombre: "Violeta", color: "#9a5fe0" },
  dorado:  { nombre: "Dorado",  color: "#e8b84b" },
  rojo:    { nombre: "Rojo",    color: "#e0483a" },
  verde:   { nombre: "Verde",   color: "#4ad68f" },
  blanco:  { nombre: "Blanco",  color: "#dce8ff" },
};

// Dibuja el "moteado" de piedra natural: manchas irregulares desenfocadas
// sobre una base, en un <canvas> ya creado. Se usa tanto para la textura
// 3D de las piedras como para las muestras planas del selector de color.
function dibujarMarmol(ctx, N, cfg) {
  ctx.clearRect(0, 0, N, N);
  ctx.fillStyle = cfg.base;
  ctx.fillRect(0, 0, N, N);

  ctx.filter = `blur(${N * 0.045}px)`;
  const manchas = 10;
  for (let i = 0; i < manchas; i++) {
    const claro = i % 2 === 0;
    ctx.fillStyle = claro ? cfg.veta1 : cfg.veta2;
    ctx.globalAlpha = 0.22 + Math.random() * 0.2;
    const cx = Math.random() * N, cy = Math.random() * N;
    const r = N * (0.14 + Math.random() * 0.22);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * (0.6 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = "none";
  ctx.globalAlpha = 1;

  // un brillo suave arriba a la izquierda, como si ya estuviera pulida.
  const brillo = ctx.createRadialGradient(N * 0.32, N * 0.28, 0, N * 0.32, N * 0.28, N * 0.55);
  brillo.addColorStop(0, "rgba(255,255,255,0.22)");
  brillo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = brillo;
  ctx.fillRect(0, 0, N, N);
}

class Tablero3D {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.size = 9;
    this.cell = 1;

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

    this._grupoTablero = null;
    this._grupoPiedras = new THREE.Group();
    this._marcaUltima = null;
    this._fantasma = null;
    this._raycaster = new THREE.Raycaster();
    this._puntero = new THREE.Vector2();
    this._planoClick = null;
    this._onCelda = null;

    // órbita manual simple: arrastrar rota la cámara alrededor del tablero,
    // sin depender del addon OrbitControls.
    this._azimut = 0.08;   // radianes, arranca casi de frente
    this._elevacion = 0.78; // radianes desde el eje Y (más chico = más "de arriba"); más abierto para que entre la habitación
    this._distancia = 14;  // se recalcula bien en construir(), esto es sólo el arranque
    this._arrastrando = false;
    this._ultimoPuntero = { x: 0, y: 0 };
    this._tiempo = 0;

    this._crearLuces();
    this._crearHabitacion();
    this._eventos();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  _crearLuces() {
    // Más fuertes que antes: cuando la habitación era el washitsu (piso de
    // tatami claro, paredes de papel), esa misma luz rebotaba en todo eso y
    // el tablero se veía bien iluminado. Con el estudio oscuro nuevo no hay
    // nada que rebote luz de vuelta, así que si se dejaban los mismos
    // valores el tablero quedaba demasiado oscuro — sobre todo en 13x13/19x19,
    // donde además la luna (más lejos) aporta menos (ver _actualizarLuna()).
    const hemi = new THREE.HemisphereLight(0x8a734a, 0x0a0806, 0.85);
    this.escena.add(hemi);

    // key: la luz principal, cálida, con sombra suave. Antes iba más
    // fuerte y con un point light que seguía a la cámara (quedaba como una
    // luz molesta flotando siempre arriba del tablero); ahora esa función
    // la cumple la lámpara de techo fija (ver _crearHabitacion).
    this.key = new THREE.DirectionalLight(0xfff2d8, 2.6);
    this.key.position.set(-4.2, 6.5, 3.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.left = -7;
    this.key.shadow.camera.right = 7;
    this.key.shadow.camera.top = 7;
    this.key.shadow.camera.bottom = -7;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 20;
    this.key.shadow.bias = -0.0018;
    this.key.shadow.radius = 4;
    this.escena.add(this.key);

    // fill: apaga las sombras del key sin competir, fría y tenue.
    const fill = new THREE.DirectionalLight(0x9db4d9, 0.55);
    fill.position.set(5, 3, -4);
    this.escena.add(fill);
  }

  // Antes era una habitación washitsu (tatami + paredes shoji + farol de
  // piso + lámpara de techo). Se reemplazó por el mismo estudio oscuro
  // minimalista que se armó para el ajedrez (ver chess3d.js): fondo casi
  // negro con niebla, piso apenas visible, y el mismo efecto de luna con
  // haz de luz difuso bajando hasta el tablero. Acá además hay que
  // escalar la posición de la luna según el tamaño real del tablero (9,
  // 13 o 19 casillas): en ajedrez el tablero mide siempre 8 unidades, pero
  // acá `mundoLado` cambia con `construir()`, así que la luna se reubica
  // ahí (ver _actualizarLuna()) en vez de quedar fija.
  _crearHabitacion() {
    // Bien más abajo que el tablero: ahora hay un pedestal completo debajo
    // (ver construir()) con un hueco real entre el tablero y el pedestal
    // donde vive la luz — como una mesa ratona con luz led en la hendija
    // entre el estante de arriba y la base. Tiene que haber lugar de sobra
    // para todo ese armado sin que el piso opaco tape nada.
    const PISO_Y = -2.1;
    this.escena.background = new THREE.Color(0x08080a);
    this.escena.fog = new THREE.Fog(0x08080a, 12, 34);

    const geoPiso = new THREE.PlaneGeometry(160, 160);
    geoPiso.rotateX(-Math.PI / 2);
    const matPiso = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.75, metalness: 0.15 });
    const piso = new THREE.Mesh(geoPiso, matPiso);
    piso.position.y = PISO_Y;
    piso.receiveShadow = true;
    this.escena.add(piso);

    const acento = new THREE.PointLight(0x5b6f9c, 1.2, 20, 2);
    acento.position.set(-7, 1.6, -6);
    this.escena.add(acento);

    // -- luna: disco brillante + halo + luz fría real + haz difuso hecho de
    //    varias manchas borrosas superpuestas (no un cono geométrico: eso
    //    se ve como "una línea" en vez de luz difusa). Posición base
    //    pensada para un tablero de referencia de 8 unidades de lado
    //    (mismo tamaño que el de ajedrez); _actualizarLuna() la reescala.
    this._posLunaBase = new THREE.Vector3(-3.5, 9.5, -9);

    this._luna = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xe8eefb, toneMapped: false, fog: false })
    );
    this.escena.add(this._luna);

    const cvLuna = document.createElement("canvas");
    cvLuna.width = cvLuna.height = 256;
    const lctx = cvLuna.getContext("2d");
    const halo = lctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    halo.addColorStop(0, "rgba(215,228,255,0.75)");
    halo.addColorStop(0.4, "rgba(180,200,240,0.28)");
    halo.addColorStop(1, "rgba(160,190,230,0)");
    lctx.fillStyle = halo;
    lctx.fillRect(0, 0, 256, 256);
    this._haloLuna = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cvLuna), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8, fog: false,
    }));
    this._haloLuna.scale.set(4.4, 4.4, 1);
    this.escena.add(this._haloLuna);

    // decay más bajo que el del ajedrez (1.7 -> 1.1): acá la luna se aleja
    // mucho en tableros grandes (ver escala en _actualizarLuna) y con una
    // caída física completa la luz prácticamente no llegaba a iluminar
    // nada en un 19x19 — la intensidad de base también se compensa ahí
    // multiplicándola por la escala.
    this._intensidadLunaBase = 2.6;
    this.luzLuna = new THREE.SpotLight(0xcfe0ff, this._intensidadLunaBase, 60, Math.PI / 6, 0.92, 1.1);
    this.luzLuna.target.position.set(0, 0, 0);
    this.luzLuna.castShadow = true;
    this.luzLuna.shadow.mapSize.set(1024, 1024);
    this.luzLuna.shadow.camera.near = 4;
    this.luzLuna.shadow.camera.far = 30;
    this.luzLuna.shadow.bias = -0.002;
    this.escena.add(this.luzLuna, this.luzLuna.target);

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
    this._pasosHaz = [
      { t: 0.06, escala: 3.6, opacidad: 0.14 },
      { t: 0.26, escala: 2.7, opacidad: 0.16 },
      { t: 0.48, escala: 2.0, opacidad: 0.18 },
      { t: 0.7, escala: 1.5, opacidad: 0.22 },
      { t: 0.9, escala: 1.05, opacidad: 0.3 },
    ];
    this._blobsHaz = this._pasosHaz.map(({ opacidad }) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texHaz, transparent: true, opacity: opacidad,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      this.escena.add(s);
      return s;
    });

    this._actualizarLuna();
  }

  // Reubica y reescala la luna (y su haz) según el tamaño real del tablero
  // actual — se llama de nuevo cada vez que construir() cambia el tamaño
  // (9x9, 13x13, 19x19), para que la luna no quede desproporcionadamente
  // chica/cerca en un tablero grande.
  _actualizarLuna() {
    if (!this._luna) return;
    const escala = Math.max(0.85, (this.mundoLado || 8) / 8);
    const posLuna = this._posLunaBase.clone().multiplyScalar(escala);
    this._luna.scale.setScalar(escala);
    this._luna.position.copy(posLuna);
    this._haloLuna.scale.setScalar(4.4 * escala);
    this._haloLuna.position.copy(posLuna);
    this.luzLuna.position.copy(posLuna);
    this.luzLuna.distance = 60 * escala;
    // compensa a mano la caída con la distancia: sin esto, en un tablero
    // grande (luna mucho más lejos) la luz prácticamente no se notaba.
    this.luzLuna.intensity = this._intensidadLunaBase * escala;

    const destino = new THREE.Vector3(0, 0.05, 0);
    this._blobsHaz.forEach((sprite, i) => {
      const { t, escala: escalaBase } = this._pasosHaz[i];
      sprite.position.lerpVectors(posLuna, destino, t);
      sprite.scale.setScalar(escalaBase * escala);
    });
  }

  // ---- textura de madera + grilla, dibujada a mano en un canvas ----
  _texturaTablero(size, tipo) {
    const cfg = PALETA_TABLEROS[tipo] || PALETA_TABLEROS.estandar;
    const N = 1024;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d");

    // base de madera: degradado cálido + vetas suaves, según el tipo elegido.
    const base = ctx.createLinearGradient(0, 0, N, N);
    base.addColorStop(0, cfg.c1);
    base.addColorStop(0.5, cfg.c2);
    base.addColorStop(1, cfg.c3);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, N, N);

    ctx.globalAlpha = 0.10;
    for (let i = 0; i < 46; i++) {
      ctx.strokeStyle = i % 2 ? cfg.vetaOscura : cfg.vetaClara;
      ctx.lineWidth = 1 + Math.random() * 2.2;
      ctx.beginPath();
      const y0 = (i / 46) * N + (Math.random() - 0.5) * 30;
      ctx.moveTo(0, y0);
      ctx.bezierCurveTo(N * 0.33, y0 + (Math.random() - 0.5) * 50, N * 0.66, y0 + (Math.random() - 0.5) * 50, N, y0 + (Math.random() - 0.5) * 30);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // viñeta suave para que los bordes se hundan un poco.
    const vin = ctx.createRadialGradient(N / 2, N / 2, N * 0.32, N / 2, N / 2, N * 0.72);
    vin.addColorStop(0, "rgba(0,0,0,0)");
    vin.addColorStop(1, "rgba(20,14,4,0.28)");
    ctx.fillStyle = vin;
    ctx.fillRect(0, 0, N, N);

    // grilla + hoshi, alineadas con el margen que también usa el raycast.
    const margenFrac = 0.09;
    const activo = N * (1 - margenFrac * 2);
    const origen = N * margenFrac;
    const paso = activo / (size - 1);

    ctx.strokeStyle = cfg.linea;
    ctx.lineWidth = Math.max(1.6, N * 0.0016);
    ctx.lineCap = "square";
    for (let i = 0; i < size; i++) {
      const p = origen + i * paso;
      ctx.beginPath(); ctx.moveTo(origen, p); ctx.lineTo(origen + activo, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, origen); ctx.lineTo(p, origen + activo); ctx.stroke();
    }
    ctx.fillStyle = cfg.linea;
    for (const [hx, hy] of this._hoshi(size)) {
      const cx = origen + hx * paso, cy = origen + hy * paso;
      ctx.beginPath(); ctx.arc(cx, cy, N * 0.006, 0, Math.PI * 2); ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  _hoshi(size) {
    if (size === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    if (size === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
    if (size === 19) return [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]];
    return [];
  }

  // ---- geometría de piedra: perfil biconvexo, como una piedra real ----
  _geometriaPiedra(radio) {
    const puntos = [];
    const alto = radio * 0.62;
    const pasos = 14;
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos;
      const ang = t * Math.PI;
      const x = Math.sin(ang) * radio;
      const y = -Math.cos(ang) * alto * (0.55 + 0.45 * Math.sin(ang));
      puntos.push(new THREE.Vector2(Math.max(x, 0.0001), y));
    }
    const geo = new THREE.LatheGeometry(puntos, 28);
    geo.computeVertexNormals();
    return geo;
  }

  // Material de piedra por color, armado una sola vez por color y
  // reutilizado (la textura moteada no es gratis de generar). Sobrevive a
  // los construir() siguientes: el color de las piedras no depende del
  // tamaño ni del tipo de tablero.
  _materialPiedra(id) {
    this._cacheMateriales = this._cacheMateriales || {};
    if (this._cacheMateriales[id]) return this._cacheMateriales[id];
    const cfg = PALETA_PIEDRAS[id] || PALETA_PIEDRAS.negro;
    const N = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    dibujarMarmol(cv.getContext("2d"), N, cfg);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex, roughness: cfg.rough, metalness: cfg.metal,
      clearcoat: cfg.metal > 0.4 ? 0.45 : 1, clearcoatRoughness: 0.14, reflectivity: 0.55,
    });
    this._cacheMateriales[id] = mat;
    return mat;
  }

  construir(size, tipoTablero = "estandar") {
    this.size = size;
    this.tipoTablero = tipoTablero;
    if (this._grupoTablero) {
      this.escena.remove(this._grupoTablero);
      this._grupoTablero.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        // la base del tablero usa un array de materiales (uno por cara del
        // box); .dispose() no existe en arrays, hay que recorrerlo.
        if (Array.isArray(o.material)) o.material.forEach((m) => { m.map?.dispose(); m.dispose(); });
        else if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
      });
    }
    this.escena.remove(this._grupoPiedras);
    this._grupoPiedras = new THREE.Group();
    this.escena.add(this._grupoPiedras);
    if (this._marcaUltima) { this.escena.remove(this._marcaUltima); this._marcaUltima = null; }

    // el mundo mide (size-1) celdas de lado más un margen, igual que la
    // textura, así el raycast y el dibujo caen exactamente en el mismo sitio.
    const activo = size - 1;
    const margenFrac = 0.09;
    this.mundoLado = activo / (1 - margenFrac * 2);
    this.mundoMargen = (this.mundoLado - activo) / 2;
    this._actualizarLuna();

    // el frustum de sombra del key light estaba fijo en ±7 (bien para un
    // 9x9, que mide ~4.9 de radio) — en un 19x19 (~11 de radio) la mayor
    // parte del tablero quedaba afuera de esa cámara de sombra y no
    // recibía sombra ni, en algunos casos, se leía tan iluminado.
    const mitad = this.mundoLado / 2 + 0.6;
    this.key.shadow.camera.left = -mitad;
    this.key.shadow.camera.right = mitad;
    this.key.shadow.camera.top = mitad;
    this.key.shadow.camera.bottom = -mitad;
    this.key.shadow.camera.updateProjectionMatrix();

    const cfgTablero = PALETA_TABLEROS[tipoTablero] || PALETA_TABLEROS.estandar;
    const grosor = 0.34;
    const geoBase = new THREE.BoxGeometry(this.mundoLado, grosor, this.mundoLado, 1, 1, 1);
    const texTop = this._texturaTablero(size, tipoTablero);
    // "Cristal" usa un material transmisivo (se ve "adentro" del tablero,
    // como vidrio de verdad) en vez de la madera/piedra opaca de siempre.
    const esVidrio = !!cfgTablero.vidrio;
    const matLateral = esVidrio
      ? new THREE.MeshPhysicalMaterial({ color: cfgTablero.lateral, roughness: 0.1, metalness: 0.05, transmission: 0.35, thickness: 0.4, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.03 })
      : new THREE.MeshStandardMaterial({ color: cfgTablero.lateral, roughness: 0.75, metalness: 0.05 });
    const matTop = esVidrio
      ? new THREE.MeshPhysicalMaterial({ map: texTop, roughness: 0.04, metalness: 0.05, transmission: 0.55, thickness: 0.5, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.02 })
      : new THREE.MeshStandardMaterial({ map: texTop, roughness: 0.55, metalness: 0.04 });
    const materiales = [matLateral, matLateral, matTop, matLateral, matLateral, matLateral];
    const base = new THREE.Mesh(geoBase, materiales);
    base.position.y = -grosor / 2;
    base.receiveShadow = true;
    base.castShadow = true;

    this._grupoTablero = new THREE.Group();
    this._grupoTablero.add(base);
    this.escena.add(this._grupoTablero);

    // plano invisible exactamente sobre la superficie, para el raycast.
    if (this._planoClick) this._planoClick.geometry.dispose();
    const geoPlano = new THREE.PlaneGeometry(this.mundoLado, this.mundoLado);
    geoPlano.rotateX(-Math.PI / 2);
    this._planoClick = new THREE.Mesh(geoPlano, new THREE.MeshBasicMaterial({ visible: false }));
    this._planoClick.position.y = 0.001;
    this._grupoTablero.add(this._planoClick);

    // -- pedestal + hueco con luz led, de color elegible (setColorLuzInferior) --
    // Antes era sólo un resplandor flotando en el aire debajo del tablero,
    // sin nada que lo sostenga — pedido explícito: que se vea como una mesa
    // con un pedestal abajo y la luz metida en la hendija real entre los dos
    // niveles (como una mesa ratona con luz led en la base). Ahora hay un
    // bloque sólido de pedestal, un hueco de verdad entre el tablero y ese
    // pedestal, y ahí adentro: una tira brillante nítida (el "tubo" de luz
    // en sí) más el resplandor difuso de antes (para que ilumine la cara de
    // abajo del tablero y la de arriba del pedestal, no sólo brille solo).
    if (!this._colorLuzInferior) this._colorLuzInferior = PALETA_LUCES_INFERIOR.azul.color;
    // Crecen bastante menos que proporcional al tamaño del tablero (0.02 y
    // 0.015 en vez de 0.05/0.03): con la escala completa, un 19x19 (~22 de
    // lado) generaba un hueco tan alto que el pedestal terminaba más abajo
    // que el piso de la habitación — el piso opaco lo tapaba por completo
    // (mismo bug de antes, esta vez sólo en tableros grandes).
    const HUECO = this.mundoLado * 0.02 + 0.28;
    const ALTURA_PEDESTAL = this.mundoLado * 0.015 + 0.22;
    const anchoPedestal = this.mundoLado * 0.94;
    const techoHueco = -grosor;
    const pisoHueco = techoHueco - HUECO;

    const matPedestal = new THREE.MeshStandardMaterial({ color: cfgTablero.lateral, roughness: 0.7, metalness: 0.08 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(anchoPedestal, ALTURA_PEDESTAL, anchoPedestal), matPedestal);
    pedestal.position.y = pisoHueco - ALTURA_PEDESTAL / 2;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    this._grupoTablero.add(pedestal);

    // tira nítida: el "tubo" de luz en sí, pegada al borde superior del
    // pedestal, mirando hacia arriba/afuera — cuatro barras finas en vez de
    // un anillo circular, para que calce con el contorno cuadrado.
    const grosorTiraSolida = Math.max(0.05, this.mundoLado * 0.012);
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

    // resplandor difuso alrededor de esa tira, para que ilumine el hueco
    // (cara de abajo del tablero y de arriba del pedestal) y no sea sólo
    // una línea encendida sin bleed.
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
      this.luzInferior = new THREE.PointLight(this._colorLuzInferior, this._intensidadLuzInferiorBase, this.mundoLado * 2.6, 2);
      this.escena.add(this.luzInferior);
    } else {
      this.luzInferior.color.set(this._colorLuzInferior);
      this.luzInferior.distance = this.mundoLado * 2.6;
    }
    // adentro del hueco, no muy pegada al piso de éste, para que ilumine
    // bien las dos caras que lo forman (tablero arriba, pedestal abajo).
    this.luzInferior.position.set(0, (techoHueco + pisoHueco) / 2, 0);

    // radio de piedra en unidades de mundo, según separación real de celdas.
    const pasoMundo = activo / (size - 1);
    this._radioPiedra = pasoMundo * 0.47;
    this._geoPiedra = this._geometriaPiedra(this._radioPiedra);

    this._matFantasma = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, transparent: true, opacity: 0.28 });

    this._fantasma = new THREE.Mesh(this._geoPiedra, this._matFantasma);
    this._fantasma.visible = false;
    this._grupoTablero.add(this._fantasma);

    // Antes se alejaba bastante (x1.9) para que entrara la habitación
    // washitsu en cuadro. Ya no hay paredes que mostrar — con el estudio
    // oscuro, alejarse de más sólo hace que el tablero se vea chico y
    // perdido en un vacío negro enorme, que es justo lo que se veía "muy
    // oscuro". Más cerca por defecto.
    this._distancia = THREE.MathUtils.clamp(this.mundoLado * 1.5, 12, 24);
    this._zoomMin = this.mundoLado * 1.05;
    this._zoomMax = 30;
  }

  _mundoDesdeCelda(x, y) {
    const pasoMundo = (this.size - 1 === 0 ? 1 : (this.mundoLado - this.mundoMargen * 2) / (this.size - 1));
    const wx = -this.mundoLado / 2 + this.mundoMargen + x * pasoMundo;
    const wz = -this.mundoLado / 2 + this.mundoMargen + y * pasoMundo;
    return [wx, wz];
  }

  _celdaDesdeMundo(wx, wz) {
    const pasoMundo = (this.mundoLado - this.mundoMargen * 2) / (this.size - 1);
    const x = (wx + this.mundoLado / 2 - this.mundoMargen) / pasoMundo;
    const z = (wz + this.mundoLado / 2 - this.mundoMargen) / pasoMundo;
    return [x, z];
  }

  // ---- redibuja todas las piedras a partir del estado del motor ----
  actualizar(partida, opciones = {}) {
    this._grupoPiedras.clear();
    const alturaPiedra = 0.06 + this._radioPiedra * 0.62;
    for (let y = 0; y < partida.size; y++) {
      for (let x = 0; x < partida.size; x++) {
        const v = partida.board[partida.idx(x, y)];
        if (v === 0) continue;
        let colorId = v === 1 ? (opciones.colorNegro || "negro") : (opciones.colorBlanco || "blanco");
        if (opciones.unicolor) colorId = "dorado";
        const piedra = new THREE.Mesh(this._geoPiedra, this._materialPiedra(colorId));
        const [wx, wz] = this._mundoDesdeCelda(x, y);
        piedra.position.set(wx, alturaPiedra, wz);
        // rotación aleatoria sutil por piedra: no quedan todas "de fábrica".
        piedra.rotation.y = ((x * 7 + y * 13) % 10) / 10 * Math.PI * 2;
        piedra.castShadow = true;
        piedra.receiveShadow = true;
        this._grupoPiedras.add(piedra);
      }
    }

    if (this._marcaUltima) { this._grupoTablero.remove(this._marcaUltima); this._marcaUltima.geometry.dispose(); this._marcaUltima.material.dispose(); this._marcaUltima = null; }
    if (partida.ultimaJugada) {
      const { x, y } = partida.ultimaJugada;
      const [wx, wz] = this._mundoDesdeCelda(x, y);
      const geo = new THREE.TorusGeometry(this._radioPiedra * 0.4, this._radioPiedra * 0.045, 8, 24);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0xd1483a, toneMapped: false });
      this._marcaUltima = new THREE.Mesh(geo, mat);
      this._marcaUltima.position.set(wx, alturaPiedra + this._radioPiedra * 0.4, wz);
      this._grupoTablero.add(this._marcaUltima);
    }
  }

  // ---- interacción: click y hover con raycast ----
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
        // Zona muerta contra la posición donde se apretó el botón (no contra
        // el evento anterior): un solo salto de un par de píxeles entre dos
        // eventos de pointermove -normal al hacer clic con mouse/trackpad-
        // ya alcanzaba para "perder" el clic y rotar la cámara en su lugar.
        const distTotal = Math.abs(e.clientX - this._inicioArrastre.x) + Math.abs(e.clientY - this._inicioArrastre.y);
        if (distTotal > 6) {
          this._movio = true;
          const dx = e.clientX - this._ultimoPuntero.x;
          const dy = e.clientY - this._ultimoPuntero.y;
          // limitado a +/-66°: más que eso y la cámara empieza a asomarse por
          // el lado abierto de la habitación (el "cuarto muro" del living,
          // como en una maqueta) y se ve raro desde afuera.
          this._azimut = Math.min(1.15, Math.max(-1.15, this._azimut - dx * 0.006));
          this._elevacion = Math.min(1.35, Math.max(0.55, this._elevacion - dy * 0.004));
        }
        this._ultimoPuntero = { x: e.clientX, y: e.clientY };
      }
      this._actualizarPuntero(e);
    });

    dom.addEventListener("click", (e) => {
      if (this._movio) return; // fue un arrastre de cámara, no un click de jugada
      const celda = this._celdaBajoPuntero();
      if (celda && this._onCelda) this._onCelda(celda.x, celda.y);
    });

    // rueda del mouse: acercarse para jugar cómodo, alejarse para ver la
    // habitación. Los límites (_zoomMin/_zoomMax) se fijan en construir().
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      const min = this._zoomMin || 6, max = this._zoomMax || 30;
      this._distancia = Math.min(max, Math.max(min, this._distancia + e.deltaY * 0.012));
    }, { passive: false });
  }

  _actualizarPuntero(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._puntero.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._puntero.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._ultimoEvento = true;
  }

  _celdaBajoPuntero() {
    if (!this._planoClick) return null;
    this._raycaster.setFromCamera(this._puntero, this.camara);
    const hits = this._raycaster.intersectObject(this._planoClick, false);
    if (!hits.length) return null;
    const { x: wx, z: wz } = hits[0].point;
    const [fx, fz] = this._celdaDesdeMundo(wx, wz);
    const x = Math.round(fx), y = Math.round(fz);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
    if (Math.hypot(fx - x, fz - y) > 0.42) return null;
    return { x, y };
  }

  onCelda(cb) { this._onCelda = cb; }

  // Cambia el color de la luz bajo el tablero (y su resplandor) sin
  // reconstruir nada más — se puede llamar aunque ya haya una partida en
  // curso, no sólo al armar el tablero.
  setColorLuzInferior(hex) {
    this._colorLuzInferior = hex;
    if (this.luzInferior) this.luzInferior.color.set(hex);
    if (this._discoGlowInferior) this._discoGlowInferior.material.color.set(hex);
    if (this._tirasSolidasInferior) this._tirasSolidasInferior.forEach((t) => t.material.color.set(hex));
  }

  mostrarFantasma(colorId) {
    if (!this._fantasma) return;
    const celda = this._celdaBajoPuntero();
    if (!celda) { this._fantasma.visible = false; this._celdaFantasma = null; return; }
    this._celdaFantasma = celda;
    const [wx, wz] = this._mundoDesdeCelda(celda.x, celda.y);
    this._fantasma.position.set(wx, 0.06 + this._radioPiedra * 0.62, wz);
    const cfg = PALETA_PIEDRAS[colorId] || PALETA_PIEDRAS.negro;
    this._fantasma.material.color.set(cfg.base);
    this._fantasma.visible = true;
  }
  ocultarFantasma() { if (this._fantasma) this._fantasma.visible = false; }
  celdaFantasmaValida(ocupado) {
    return this._celdaFantasma && !ocupado(this._celdaFantasma.x, this._celdaFantasma.y) ? this._celdaFantasma : null;
  }

  resize() {
    // Antes la altura se calculaba como w*0.94 (un cuadrado aproximado) en
    // vez de leer el alto real del contenedor, así que el canvas nunca
    // llenaba el panel de verdad si éste tenía otra proporción — ahora el
    // panel (.tablero-envoltorio) define su propio alto por CSS y acá sólo
    // se lee, sin inventar una proporción propia.
    const w = this.contenedor.clientWidth || 480;
    const h = this.contenedor.clientHeight || Math.round(w * 0.94);
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  _loop(t) {
    requestAnimationFrame(this._loop);
    this._tiempo = t * 0.001;
    // La cámara sólo se mueve si el usuario arrastra (ver _eventos): sin
    // deriva automática, para no marear ni tapar la lectura del tablero.

    // parpadeo sutil tipo neón, en la luz de abajo y en su resplandor
    // (misma fase en las dos, para que se vea como una sola fuente).
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

    this.renderer.render(this.escena, this.camara);
  }

  dispose() {
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}
