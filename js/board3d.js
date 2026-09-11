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
  // Cristal ámbar/azul: piedra de vidrio de verdad (transmission), no una
  // textura opaca — ver el flag `vidrio` en _materialPiedra()/
  // materialPiezaAjedrez() en board3d.js/chess3d.js. base/veta1/veta2 acá
  // sólo se usan para la vista previa chica del swatch (dibujarMarmol),
  // la pieza/piedra real en 3D usa `colorVidrio`.
  cristalAmbar: { nombre: "Cristal Ámbar", base: "#4a2e10", veta1: "#ffb35c", veta2: "#7a4010", metal: 0.05, rough: 0.05, vidrio: true, colorVidrio: "#e8963a" },
  cristalAzul:  { nombre: "Cristal Azul",  base: "#0e2a4a", veta1: "#6cc4ff", veta2: "#123a6b", metal: 0.05, rough: 0.05, vidrio: true, colorVidrio: "#2f8fe0" },
  // Negro/Blanco y Oro: sólo tiene el efecto de dos tonos (cuerpo + herrajes
  // dorados) en las piezas de ajedrez, que sí tienen partes separadas para
  // pintar distinto (ver `trimOro` en materialPiezaAjedrez, chess3d.js). En
  // las piedras de Go (una esfera sola, sin partes) cae de vuelta a un
  // negro/blanco con un toque cálido de más, sin herraje separado posible.
  negroOro: { nombre: "Negro y Oro",   base: "#0c0a08", veta1: "#5a4420", veta2: "#050403", metal: 0.35, rough: 0.22, trimOro: true },
  blancoOro: { nombre: "Blanco y Oro", base: "#f3ecd9", veta1: "#e4d8ba", veta2: "#c2a565", metal: 0.15, rough: 0.26, trimOro: true },
  // Paleta "dos tonos + oro" para TEG (pedido explícito: fichas con la
  // misma onda que las de Damas, no piedras/gemas lisas como las de Go).
  rojoOscuroOro: { nombre: "Rojo Oscuro y Oro", base: "#3d0d12", veta1: "#9c2530", veta2: "#1c0508", metal: 0.32, rough: 0.24, trimOro: true },
  turquesaOro:   { nombre: "Turquesa y Oro",    base: "#0b3d3a", veta1: "#4fe0d0", veta2: "#052220", metal: 0.32, rough: 0.22, trimOro: true },
  verdeOro:      { nombre: "Verde y Oro",       base: "#123a1e", veta1: "#4fcf7a", veta2: "#081f10", metal: 0.32, rough: 0.24, trimOro: true },
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

    // far en 240 (era 100): el domo de estrellas vive en un radio de ~88 y
    // con far=100 la mitad lejana del domo quedaba recortada por el
    // frustum — el cielo se veía negro vacío aunque las estrellas existían.
    this.camara = new THREE.PerspectiveCamera(38, 1, 0.1, 240);
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
    // linternas de piedra decorativas en las 4 esquinas: opcionales (sólo
    // en el tablero de juego real, no en la vista previa chica del modal
    // de configuración — ver habilitarLinternas()), y el modelo se carga
    // una sola vez y se clona, no una carga por instancia.
    this._linternasHabilitadas = false;
    this._grupoLinternas = null;
    this._linternasLuces = [];
    this._linternaGLTFCache = null;
    // linternas chicas de papel: sólo 2, no en las esquinas sino centradas
    // en el medio de dos lados opuestos (entre cada par de linternas de
    // piedra) — ver _actualizarLinternasChicas().
    this._grupoLinternasChicas = null;
    this._linternasChicasLuces = [];
    this._linternaChicaGLTFCache = null;
    // árboles decorativos lejos del tablero (sakuras + arces alternados)
    // — sólo de fondo (no interactúan, no dan luz) — ver
    // _actualizarArboles(). El caché es un mapa id→gltf porque hay más de
    // una especie.
    this._grupoArboles = null;
    this._arbolGLTFCache = {};
    // terreno de jardín (meseta de césped elevada + falda que baja hasta el
    // piso de la sala) y pasto instanciado encima — rehecho de cero: antes
    // era un aro de conos a la altura del tablero más un campo de conos en
    // el piso, y se veía como espinas flotando en dos capas (pedido
    // explícito: "es mejor rehacer que reparar") — ver _actualizarTerreno()
    // y _actualizarPasto().
    this._terreno = null;
    this._pastoInst = null;
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
    // Cielo nocturno azulado arriba, rebote cálido de tierra abajo: ahora
    // la escena es un jardín de noche (terreno de césped + faroles), no un
    // estudio cerrado — un ambiente 100% cálido como el de antes aplastaba
    // el verde del pasto y dejaba todo del mismo marrón.
    const hemi = new THREE.HemisphereLight(0x4a5f8a, 0x1d1810, 0.8);
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
    this._pisoY = PISO_Y; // nivel del suelo lejano; el terreno de césped (_actualizarTerreno) baja hasta acá
    // Azul-negro profundo en vez de negro puro, y la niebla bastante más
    // lejos que antes (12→16 de arranque, 34→55 de final): ahora hay un
    // jardín entero para mostrar (terreno, árboles, cielo) y la niebla
    // vieja se comía los árboles a media distancia.
    this.escena.background = new THREE.Color(0x05070d);
    this.escena.fog = new THREE.Fog(0x06080f, 16, 55);

    // Piso base mate y oscuro, casi invisible: es sólo el "fondo" para la
    // vista previa chica del modal (que no arma terreno) y para lo que
    // asome más allá del borde del terreno, ya hundido en la niebla.
    const geoPiso = new THREE.PlaneGeometry(200, 200);
    geoPiso.rotateX(-Math.PI / 2);
    const matPiso = new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.95, metalness: 0.02 });
    const piso = new THREE.Mesh(geoPiso, matPiso);
    // bien por debajo del terreno: la ondulación del campo baja hasta
    // ~0.1 por debajo de PISO_Y y este plano no tiene que asomar por ahí.
    piso.position.y = PISO_Y - 0.3;
    piso.receiveShadow = true;
    this.escena.add(piso);

    const acento = new THREE.PointLight(0x5b6f9c, 0.9, 24, 2);
    acento.position.set(-9, 2.6, -7);
    this.escena.add(acento);

    // -- cielo estrellado: dos nubes de puntos (muchas estrellas tenues +
    //    pocas brillantes) sobre una cúpula lejana, fuera de la niebla.
    //    Barato (un draw call por nube) y llena el negro vacío de arriba,
    //    que era gran parte de por qué la escena se veía "pobre" de lejos.
    const crearEstrellas = (cantidad, tam, opacidad) => {
      const posiciones = new Float32Array(cantidad * 3);
      for (let i = 0; i < cantidad; i++) {
        // MUY sesgado al cielo bajo (pow 2.4): la cámara del juego mira el
        // tablero desde arriba, así que la única franja de cielo que entra
        // en cuadro es la pegada al horizonte — comprobado empíricamente:
        // con las estrellas repartidas parejo por el domo, que alguna
        // cayera en esa franja angosta era pura suerte del sorteo y la
        // mayoría de las cargas mostraban un cielo negro vacío. Un anillo
        // denso de estrellas alrededor del horizonte se ve desde cualquier
        // ángulo de cámara.
        const u = Math.random() * Math.PI * 2;
        const v = 0.005 + Math.pow(Math.random(), 2.4) * 0.9;
        const r = 100;
        posiciones[i * 3] = r * Math.cos(u) * Math.cos(v * Math.PI / 2);
        posiciones[i * 3 + 1] = 2 + r * Math.sin(v * Math.PI / 2) * 0.8;
        posiciones[i * 3 + 2] = r * Math.sin(u) * Math.cos(v * Math.PI / 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(posiciones, 3));
      // textura radial suave: sin map, los Points se dibujan como
      // cuadraditos duros — con el degradado se ven como puntos de luz.
      if (!this._texEstrella) {
        const T = 32;
        const cvE = document.createElement("canvas");
        cvE.width = cvE.height = T;
        const ectx = cvE.getContext("2d");
        const ge = ectx.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
        ge.addColorStop(0, "rgba(255,255,255,1)");
        ge.addColorStop(0.4, "rgba(255,255,255,0.55)");
        ge.addColorStop(1, "rgba(255,255,255,0)");
        ectx.fillStyle = ge;
        ectx.fillRect(0, 0, T, T);
        this._texEstrella = new THREE.CanvasTexture(cvE);
      }
      const mat = new THREE.PointsMaterial({
        color: 0xc9d6ff, size: tam, sizeAttenuation: true, map: this._texEstrella,
        transparent: true, opacity: opacidad, fog: false, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const estrellas = new THREE.Points(geo, mat);
      this.escena.add(estrellas);
      return estrellas;
    };
    crearEstrellas(340, 0.9, 0.6);
    crearEstrellas(110, 1.6, 0.95);

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

    // (El "haz" de manchas borrosas que bajaba de la luna al tablero se
    // quitó: contra el estudio negro vacío funcionaba, pero con el jardín
    // nuevo de fondo esas manchas grises flotando se leían como suciedad
    // en el lente, no como luz — la luz de luna real del SpotLight ya
    // pinta el charco frío sobre el tablero por sí sola.)

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
    let mat;
    if (cfg.vidrio) {
      // piedra de vidrio de verdad (misma receta que las piezas de ajedrez
      // y las fichas de TEG): transmission en vez de una textura opaca.
      mat = new THREE.MeshPhysicalMaterial({
        color: cfg.colorVidrio, roughness: 0.06, transmission: 0.7, thickness: 0.35,
        ior: 1.9, attenuationColor: cfg.colorVidrio, attenuationDistance: 0.5,
        clearcoat: 1, clearcoatRoughness: 0.05,
        emissive: cfg.colorVidrio, emissiveIntensity: 0.12,
      });
    } else {
      const N = 256;
      const cv = document.createElement("canvas");
      cv.width = cv.height = N;
      dibujarMarmol(cv.getContext("2d"), N, cfg);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshPhysicalMaterial({
        map: tex, roughness: cfg.rough, metalness: cfg.metal,
        clearcoat: cfg.metal > 0.4 ? 0.45 : 1, clearcoatRoughness: 0.14, reflectivity: 0.55,
      });
    }
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
    // recibía sombra ni, en algunos casos, se leía tan iluminado. Ahora
    // además cubre la meseta entera (linternas incluidas), para que
    // faroles y pasto cercano también proyecten/reciban sombra del key.
    const mitad = (this.mundoLado / 2 + this.mundoLado * 0.07 + 0.5) * Math.SQRT2 + 1.6;
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
    const anchoPedestal = this.mundoLado * 0.94;
    const techoHueco = -grosor;
    const pisoHueco = techoHueco - HUECO;

    // -- terreno: meseta de césped elevada sobre la que se planta todo --
    // La superficie del jardín inmediato queda BASTANTE por debajo de la
    // cara de arriba del tablero (~1.1 unidades en un 9x9): el tablero se
    // lee como una tarima alta sobre el césped (pedido explícito: "elevar
    // la altura del tablero"), y ya no existe ninguna capa de pasto a la
    // altura del tablero que pueda atravesarlo o dejarlo "hundido".
    const mitadLinternas = this.mundoLado / 2 + this.mundoLado * 0.07 + 0.5;
    // -0.55 (era -0.3): el tablero queda ~1.35 sobre el césped en un 9x9
    // — pedido explícito: "elevar un poquito más la altura del tablero".
    this._alturaMeseta = pisoHueco - 0.55;
    // ×√2: las linternas van en las ESQUINAS (distancia diagonal), la
    // meseta tiene que llegar más allá de esa diagonal o quedarían en la
    // pendiente de la falda.
    this._radioMeseta = mitadLinternas * Math.SQRT2 + 1.2;
    this._radioFalda = this._radioMeseta + this.mundoLado * 0.85 + 4;

    // Pedestal: antes era una losa finita flotando en el aire (con el piso
    // muy abajo se veía el tablero como una isla voladora en un pozo);
    // ahora es un plinto que baja hasta enterrarse en la meseta de césped,
    // así toda la mesa queda apoyada en el suelo de verdad. En la vista
    // previa del modal (sin terreno) mantiene el alto corto de siempre.
    const ALTURA_PEDESTAL = this._linternasHabilitadas
      ? pisoHueco - (this._alturaMeseta - 0.35)
      : this.mundoLado * 0.015 + 0.22;
    const matPedestal = new THREE.MeshStandardMaterial({ color: cfgTablero.lateral, roughness: 0.7, metalness: 0.08 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(anchoPedestal, ALTURA_PEDESTAL, anchoPedestal), matPedestal);
    pedestal.position.y = pisoHueco - ALTURA_PEDESTAL / 2;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    this._grupoTablero.add(pedestal);

    // zócalo: un escalón un poco más ancho al ras del césped, como la
    // base de un monumento — remata el plinto contra el pasto en vez de
    // que la columna entre "clavada" seca en el suelo.
    if (this._linternasHabilitadas) {
      const zocalo = new THREE.Mesh(
        new THREE.BoxGeometry(anchoPedestal * 1.12, 0.34, anchoPedestal * 1.12),
        matPedestal
      );
      zocalo.position.y = this._alturaMeseta + 0.03;
      zocalo.receiveShadow = true;
      zocalo.castShadow = true;
      this._grupoTablero.add(zocalo);
    }

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
    // 1.75 → 1.45: con el césped nuevo alrededor, el resplandor tan ancho
    // teñía de azul media meseta; más angosto queda como un bleed de led
    // pegado al plinto, no como una inundación de color.
    const escalaPlanoTira = 1.45;
    const margenTira = N_TIRA * (1 - 1 / escalaPlanoTira) / 2;
    ctxGlowInferior.filter = `blur(${N_TIRA * 0.065}px)`;
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
      this.luzInferior = new THREE.PointLight(this._colorLuzInferior, this._intensidadLuzInferiorBase, this.mundoLado * 3.2, 1.7);
      this.escena.add(this.luzInferior);
    } else {
      this.luzInferior.color.set(this._colorLuzInferior);
      this.luzInferior.distance = this.mundoLado * 3.2;
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

    this._actualizarTerreno();
    this._actualizarPasto();
    this._actualizarLinternas();
    this._actualizarLinternasChicas();
    this._actualizarArboles();
  }

  // Sólo el tablero de juego real llama esto (ver inicializarTablero3d()
  // en app.js) — la vista previa chica del modal de configuración usa la
  // misma clase pero sin linternas, para no recargar un modelo de más en
  // una escena que ya se reconstruye seguido al tocar cada swatch.
  habilitarLinternas() { this._linternasHabilitadas = true; }

  // ---- terreno de jardín: meseta + falda + campo, una sola superficie ----
  // Altura del suelo en (x, z): meseta plana (donde viven el tablero y las
  // linternas), una falda suave que baja hasta el piso de la sala, y campo
  // ondulado a partir de ahí. Es la ÚNICA fuente de verdad de la altura del
  // suelo: la malla del terreno, cada brizna de pasto, los pads de las
  // linternas y los árboles preguntan todos acá — así nada flota ni queda
  // enterrado (que era exactamente el problema del sistema anterior de
  // capas sueltas a alturas distintas).
  _alturaTerreno(x, z) {
    const r = Math.hypot(x, z);
    const R1 = this._radioMeseta, R2 = this._radioFalda;
    let y;
    if (r <= R1) y = this._alturaMeseta;
    else if (r >= R2) y = this._pisoY;
    else {
      const t = (r - R1) / (R2 - R1);
      const s = t * t * (3 - 2 * t); // smoothstep: la loma baja redondeada, sin quiebres
      y = this._alturaMeseta + (this._pisoY - this._alturaMeseta) * s;
    }
    // ondulación orgánica determinista (nada de Math.random acá: la misma
    // fórmula tiene que dar lo mismo para la malla y para plantar cosas),
    // que aparece recién fuera de la meseta — la meseta queda plana de
    // verdad para que linternas y plinto asienten perfecto.
    const fade = Math.min(1, Math.max(0, (r - R1) / 2.5));
    y += fade * 0.07 * (Math.sin(x * 0.55 + 1.3) * Math.sin(z * 0.62 + 0.7) + Math.sin(x * 1.7) * Math.sin(z * 1.35) * 0.4);
    return y;
  }

  // Textura de césped procedural (canvas): base verde musgo con manchas
  // orgánicas de varios verdes y puntitos finos. Reemplaza la foto de
  // tierra del zip: esa imagen única tileada se veía manchada/"sucia" y
  // marrón — el suelo tiene que leerse como CÉSPED con las briznas 3D
  // creciendo encima del mismo color, no como tierra pelada con espinas.
  _texturaTerreno() {
    if (this._texTerrenoCache) return this._texTerrenoCache;
    const N = 512;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#243818";
    ctx.fillRect(0, 0, N, N);
    const tonos = ["#1b2b11", "#2c451c", "#365224", "#1f3014", "#3d5c26"];
    ctx.filter = `blur(${N * 0.012}px)`;
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = tonos[i % tonos.length];
      ctx.globalAlpha = 0.1 + Math.random() * 0.16;
      const cx = Math.random() * N, cy = Math.random() * N;
      const rad = N * (0.02 + Math.random() * 0.055);
      const ry = rad * (0.5 + Math.random());
      const rot = Math.random() * Math.PI;
      // dibujada también en los 8 bordes espejados para que la textura
      // tilee sin costuras (el canvas no envuelve solo).
      for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, rad, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.filter = "none";
    for (let i = 0; i < 1500; i++) {
      ctx.globalAlpha = 0.05 + Math.random() * 0.1;
      ctx.fillStyle = Math.random() < 0.5 ? "#141f0c" : "#4d6b30";
      ctx.fillRect(Math.random() * N, Math.random() * N, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    this._texTerrenoCache = tex;
    return tex;
  }

  // Malla del terreno: un plano grande subdividido, con cada vértice a la
  // altura que dicta _alturaTerreno y UV planos (mundo/TILE) para que el
  // césped tilee derecho. Sólo en el tablero de juego real.
  _actualizarTerreno() {
    if (this._terreno) {
      this.escena.remove(this._terreno);
      this._terreno.geometry.dispose();
      this._terreno = null;
    }
    if (!this._linternasHabilitadas) return;
    const RADIO = 60;
    const SEG = 140;
    const geo = new THREE.PlaneGeometry(RADIO * 2, RADIO * 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const TILE = 5.2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this._alturaTerreno(x, z));
      uv.setXY(i, x / TILE, z / TILE);
    }
    geo.computeVertexNormals();
    if (!this._matTerreno) {
      this._matTerreno = new THREE.MeshStandardMaterial({ map: this._texturaTerreno(), roughness: 0.95, metalness: 0 });
    }
    const terreno = new THREE.Mesh(geo, this._matTerreno);
    terreno.receiveShadow = true;
    this._terreno = terreno;
    this.escena.add(terreno);
  }

  // Geometría de UNA brizna de pasto: una cinta ahusada de varios
  // segmentos que se dobla hacia adelante, con gradiente de color por
  // vértice (raíz oscura → punta clara, el truco estándar de pasto
  // estilizado en juegos). Los conos de antes se veían como espinas de
  // plástico: silueta rígida, un solo verde chillón parejo, sin gradiente.
  _geoBriznaPasto() {
    if (this._geoBriznaCache) return this._geoBriznaCache;
    const SEG = 4;
    const ANCHO = 0.055;
    const pos = [], col = [], idx = [];
    const cRaiz = new THREE.Color(0x16250d);
    const cMedio = new THREE.Color(0x36561c);
    const cPunta = new THREE.Color(0x7ea23d);
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const w = ANCHO * (1 - t * 0.8);
      const curva = t * t * 0.3; // arqueada como brizna real, no palo recto
      const c = t < 0.55
        ? cRaiz.clone().lerp(cMedio, t / 0.55)
        : cMedio.clone().lerp(cPunta, (t - 0.55) / 0.45);
      pos.push(-w, t, curva, w, t, curva);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    pos.push(0, 1.05, 0.36); // punta
    col.push(cPunta.r, cPunta.g, cPunta.b);
    for (let i = 0; i < SEG; i++) {
      const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      idx.push(a, b, c2, b, d, c2);
    }
    idx.push(SEG * 2, SEG * 2 + 1, (SEG + 1) * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this._geoBriznaCache = geo;
    return geo;
  }

  // Todo el pasto de la escena en UN InstancedMesh (un draw call): denso
  // en la meseta alrededor del tablero, parejo en la falda, y en matas
  // sueltas por el campo lejano (espolvorear parejo algo tan ralo se veía
  // artificial; el pasto real crece en matas). Cada brizna toma su altura
  // del terreno (_alturaTerreno), su propia rotación/inclinación/escala y
  // un tinte propio (setColorAt) para que el manto no sea un verde único.
  _actualizarPasto() {
    if (this._pastoInst) {
      this.escena.remove(this._pastoInst);
      this._pastoInst.dispose();
      this._pastoInst = null;
    }
    if (!this._linternasHabilitadas) return;
    if (!this._matBriznaPasto) {
      this._matBriznaPasto = new THREE.MeshStandardMaterial({
        vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
      });
    }
    // Densidad alta (pedido explícito: "no hay tanta densidad"): ~21 mil
    // briznas — sigue siendo UN solo draw call instanciado, el costo por
    // brizna extra es casi nulo.
    const CERCA = 12000;
    const MATAS = 340, POR_MATA = 18;
    const SUELTAS = 2600;
    const TOTAL = CERCA + MATAS * POR_MATA + SUELTAS;
    const inst = new THREE.InstancedMesh(this._geoBriznaPasto(), this._matBriznaPasto, TOTAL);
    inst.castShadow = true;
    inst.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const esc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const euler = new THREE.Euler();
    const tinte = new THREE.Color();
    // dentro del zócalo del plinto no crece pasto (lo atravesaría)
    const medioPlinto = (this.mundoLado * 0.94 * 1.12) / 2 + 0.05;
    let n = 0;
    const plantar = (x, z, escalaExtra) => {
      if (Math.abs(x) < medioPlinto && Math.abs(z) < medioPlinto) return;
      // pasto crecido (pedido explícito, dos veces: "más largo"): briznas
      // de ~0.32 a ~0.7 — sigue bien por debajo de la cara del tablero
      // (~1.35 sobre el césped), así que no tapa nada del juego.
      const alto = (0.32 + Math.random() * 0.38) * escalaExtra;
      p.set(x, this._alturaTerreno(x, z) - 0.015, z);
      euler.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5, "YXZ");
      q.setFromEuler(euler);
      esc.set(0.9 + Math.random() * 0.7, alto, 1);
      m.compose(p, q, esc);
      inst.setMatrixAt(n, m);
      // variación de tinte por brizna: brillo ±, con corrimientos sutiles
      // hacia amarillo o azul — un césped real nunca es un solo verde.
      const brillo = 0.7 + Math.random() * 0.55;
      tinte.setRGB(brillo * (0.92 + Math.random() * 0.16), brillo, brillo * (0.85 + Math.random() * 0.15));
      inst.setColorAt(n, tinte);
      n++;
    };
    // 1) meseta + falda: el grueso de las briznas, con la meseta (la zona
    //    héroe, la que se ve de cerca junto al tablero) al doble de densidad.
    const R2 = this._radioFalda;
    for (let i = 0; i < CERCA; i++) {
      const enMeseta = i < CERCA * 0.45;
      const rMin = enMeseta ? 0 : this._radioMeseta;
      const rMax = enMeseta ? this._radioMeseta + 1.5 : R2;
      const r = Math.sqrt(rMin * rMin + Math.random() * (rMax * rMax - rMin * rMin));
      const ang = Math.random() * Math.PI * 2;
      plantar(Math.cos(ang) * r, Math.sin(ang) * r, 1);
    }
    // 2) campo lejano: matas
    const R_CAMPO = 46;
    for (let i = 0; i < MATAS; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(R2 * R2 + Math.random() * (R_CAMPO * R_CAMPO - R2 * R2));
      const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r;
      for (let j = 0; j < POR_MATA; j++) {
        const dr = Math.random() * 0.9;
        const da = Math.random() * Math.PI * 2;
        plantar(cx + Math.cos(da) * dr, cz + Math.sin(da) * dr, 1.15);
      }
    }
    // 3) briznas sueltas entre las matas, para que no floten en el vacío
    for (let i = 0; i < SUELTAS; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(R2 * R2 + Math.random() * (R_CAMPO * R_CAMPO - R2 * R2));
      plantar(Math.cos(ang) * r, Math.sin(ang) * r, 1);
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this._pastoInst = inst;
    this.escena.add(inst);
  }

  // Base física para cada farol: pad de piedra chato sobre el césped más
  // una sombra de contacto suave (disco oscuro degradado). Las dos cosas
  // que hacen que un objeto se lea APOYADO en el suelo en vez de flotando
  // — que era exactamente la queja: "las lámparas parece que están
  // flotando". Devuelve la altura de la cara de arriba del pad, donde
  // asienta el farol.
  _crearBaseFarol(grupoDestino, x, z, radioPad) {
    const baseY = this._alturaTerreno(x, z);
    if (!this._matPadPiedra) {
      this._matPadPiedra = new THREE.MeshStandardMaterial({ color: 0x565851, roughness: 0.95, metalness: 0.02 });
    }
    if (!this._texSombraBlob) {
      const N = 128;
      const cv = document.createElement("canvas");
      cv.width = cv.height = N;
      const ctx = cv.getContext("2d");
      const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
      g.addColorStop(0, "rgba(0,0,0,0.75)");
      g.addColorStop(0.6, "rgba(0,0,0,0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, N, N);
      this._texSombraBlob = new THREE.CanvasTexture(cv);
    }
    const sombra = new THREE.Mesh(
      new THREE.PlaneGeometry(radioPad * 3.4, radioPad * 3.4),
      new THREE.MeshBasicMaterial({ map: this._texSombraBlob, transparent: true, depthWrite: false })
    );
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.set(x, baseY + 0.02, z);
    grupoDestino.add(sombra);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(radioPad, radioPad * 1.18, 0.16, 22), this._matPadPiedra);
    pad.position.set(x, baseY + 0.04, z); // media altura enterrada en el césped
    pad.receiveShadow = true;
    pad.castShadow = true;
    grupoDestino.add(pad);
    return baseY + 0.12;
  }

  // Cuatro linternas de piedra japonesas, una en cada esquina exterior del
  // tablero — modelo real (stone-japanese-lantern), no geometría genérica.
  // Se reposicionan solas cada vez que construir() arma un tablero de otro
  // tamaño (9/13/19), porque las esquinas dependen de mundoLado. Asientan
  // sobre la meseta de césped (bien por debajo del tablero), cada una en
  // su pad de piedra con sombra de contacto.
  _actualizarLinternas() {
    if (this._grupoLinternas) { this.escena.remove(this._grupoLinternas); this._grupoLinternas = null; }
    this._linternasLuces = [];
    if (!this._linternasHabilitadas) return;

    const grupoActual = new THREE.Group();
    this._grupoLinternas = grupoActual;
    this.escena.add(grupoActual);

    const mitad = this.mundoLado / 2 + this.mundoLado * 0.07 + 0.5;
    const esquinas = [[-mitad, -mitad], [mitad, -mitad], [-mitad, mitad], [mitad, mitad]];
    // más grandes (pedido explícito): ~3 unidades en un 9x9 — presencia de
    // farol de jardín de verdad, no de adorno de mesa. El pad de piedra y
    // el glow escalan solos porque derivan de `altura`.
    const altura = THREE.MathUtils.clamp(this.mundoLado * 0.32, 1.6, 3.1);
    // fracción de la altura total donde está el hueco con la llama (el
    // "hibukuro" del farol) — medido a ojo renderizando el modelo solo：
    // queda debajo del techo, a mitad de camino más o menos.
    const ALTURA_FUEGO_FRAC = 0.5;

    // brillo del hueco: un sprite aditivo (mismo truco que la luna, las
    // antorchas y las bayas de la enredadera en ajedrez2_3d.js) en vez de
    // depender sólo de la textura emisiva del modelo — el emissive solo,
    // con el tone mapping de la escena, se veía apagado y no leía como
    // "hay luz adentro" a la distancia (pedido explícito: se notaba el
    // farol como una silueta oscura, sin nada prendido).
    if (!this._texGlowLinterna) {
      const N = 64;
      const cv = document.createElement("canvas");
      cv.width = cv.height = N;
      const ctx = cv.getContext("2d");
      // mezcla amarillo -> naranja -> rojo de adentro hacia afuera, como
      // una llama de verdad (un solo color parejo se leía "de linterna
      // eléctrica" en vez de fuego).
      const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
      g.addColorStop(0, "rgba(255,247,214,0.95)");
      g.addColorStop(0.28, "rgba(255,190,70,0.85)");
      g.addColorStop(0.6, "rgba(255,110,35,0.55)");
      g.addColorStop(1, "rgba(200,35,15,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, N, N);
      this._texGlowLinterna = new THREE.CanvasTexture(cv);
    }

    const construirEn = (gltf) => {
      // el tablero puede haberse reconstruido (otro tamaño) mientras el
      // modelo todavía estaba cargando — si ya no es el grupo vigente, no
      // sumar linternas viejas a la escena actual.
      if (this._grupoLinternas !== grupoActual) return;
      const caja = new THREE.Box3().setFromObject(gltf.scene);
      const alto = caja.max.y - caja.min.y || 1;
      const centroX = (caja.max.x + caja.min.x) / 2;
      const centroZ = (caja.max.z + caja.min.z) / 2;
      const pisoY = caja.min.y;
      const escala = altura / alto;
      const alturaFuego = altura * ALTURA_FUEGO_FRAC;
      esquinas.forEach(([ex, ez]) => {
        // pad de piedra + sombra de contacto en el césped; el farol asienta
        // sobre la cara de arriba del pad, no flota a la altura del tablero.
        const topePad = this._crearBaseFarol(grupoActual, ex, ez, altura * 0.34);
        const modelo = gltf.scene.clone(true);
        modelo.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          // clon propio del material: si no, las 4 linternas (y el modelo
          // cacheado original) comparten una sola instancia y tocar
          // emissiveIntensity en una las cambia a todas.
          o.material = o.material.clone();
          o.material.emissiveIntensity = 2.4;
        });
        const grupo = new THREE.Group();
        modelo.position.set(-centroX, -pisoY, -centroZ);
        grupo.add(modelo);
        grupo.scale.setScalar(escala);
        grupo.position.set(ex, topePad, ez);
        grupoActual.add(grupo);

        // núcleo brillante + halo aditivo, metidos en el hueco del farol —
        // esto es lo que de verdad se ve "prendido" desde lejos, la luz
        // real (de abajo) sólo ilumina el entorno.
        const nucleo = new THREE.Mesh(
          new THREE.SphereGeometry(altura * 0.05, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xfff2cf, toneMapped: false, fog: false })
        );
        nucleo.position.set(ex, topePad + alturaFuego, ez);
        grupoActual.add(nucleo);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._texGlowLinterna, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, opacity: 0.95, fog: false,
        }));
        halo.userData.escalaBase = altura * 0.8;
        halo.scale.setScalar(halo.userData.escalaBase);
        halo.position.set(ex, topePad + alturaFuego, ez);
        grupoActual.add(halo);

        // luz cálida saliendo del hueco de la linterna, con parpadeo sutil
        // (ver _loop) — como si hubiera una llama de verdad adentro. Ahora
        // que el farol está sobre el césped, esta luz pinta un charco
        // cálido de luz en el pasto de alrededor — clave para que el
        // jardín nocturno se vea vivo y no una escena negra con puntitos.
        const luz = new THREE.PointLight(0xffb066, 2.4, this.mundoLado * 1.7 + 3, 2);
        luz.position.set(ex, topePad + alturaFuego, ez);
        grupoActual.add(luz);
        this._linternasLuces.push({ luz, halo, fase: Math.random() * 10 });
      });
    };

    if (this._linternaGLTFCache) construirEn(this._linternaGLTFCache);
    else if (window.cargarPersonajeGLTF) {
      window.cargarPersonajeGLTF("linternaPiedra", (gltf) => {
        this._linternaGLTFCache = gltf;
        construirEn(gltf);
      }, (err) => console.error("No se pudo cargar la linterna de piedra", err));
    }
  }

  // Dos linternas de papel chicas (little-lantern), no en las esquinas
  // sino centradas en el medio de dos lados opuestos del tablero — entre
  // cada par de linternas de piedra, pedido explícito ("una atrás de
  // donde arrancarían los jugadores blancos y otra atrás de los negros").
  // Mismo criterio de habilitación que las de piedra (sólo tablero real,
  // ver habilitarLinternas()) — no hace falta un método aparte para
  // habilitarlas, viven bajo el mismo flag.
  _actualizarLinternasChicas() {
    if (this._grupoLinternasChicas) { this.escena.remove(this._grupoLinternasChicas); this._grupoLinternasChicas = null; }
    this._linternasChicasLuces = [];
    if (!this._linternasHabilitadas) return;

    const grupoActual = new THREE.Group();
    this._grupoLinternasChicas = grupoActual;
    this.escena.add(grupoActual);

    // mismo "mitad" que usan las linternas de piedra para las esquinas,
    // así estas quedan justo en el medio de cada par (ver _actualizarLinternas).
    const mitad = this.mundoLado / 2 + this.mundoLado * 0.07 + 0.5;
    const posiciones = [[0, -mitad], [0, mitad]];
    const altura = THREE.MathUtils.clamp(this.mundoLado * 0.11, 0.5, 1.0);
    const alturaLuz = altura * 0.55;

    const construirEn = (gltf) => {
      if (this._grupoLinternasChicas !== grupoActual) return;
      const caja = new THREE.Box3().setFromObject(gltf.scene);
      const alto = caja.max.y - caja.min.y || 1;
      const centroX = (caja.max.x + caja.min.x) / 2;
      const centroZ = (caja.max.z + caja.min.z) / 2;
      const pisoY = caja.min.y;
      const escala = altura / alto;
      posiciones.forEach(([ex, ez]) => {
        // mismo asiento que las linternas de piedra: pad + sombra de
        // contacto sobre el césped de la meseta.
        const topePad = this._crearBaseFarol(grupoActual, ex, ez, altura * 0.42);
        const modelo = gltf.scene.clone(true);
        modelo.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          o.material = o.material.clone();
          o.material.emissiveIntensity = 2.2;
        });
        const grupo = new THREE.Group();
        modelo.position.set(-centroX, -pisoY, -centroZ);
        grupo.add(modelo);
        grupo.scale.setScalar(escala);
        grupo.position.set(ex, topePad, ez);
        grupoActual.add(grupo);

        // mismo truco de brillo que las linternas de piedra (halo aditivo
        // + luz cálida), pero más chico y más tenue — es un detalle
        // secundario, no otra fuente de luz protagonista del tablero.
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._texGlowLinterna, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, opacity: 0.95, fog: false,
        }));
        halo.userData.escalaBase = altura * 1.5;
        halo.scale.setScalar(halo.userData.escalaBase);
        halo.position.set(ex, topePad + alturaLuz, ez);
        grupoActual.add(halo);

        const luz = new THREE.PointLight(0xffb066, 2.3, this.mundoLado * 1.2 + 2, 2);
        luz.position.set(ex, topePad + alturaLuz, ez);
        grupoActual.add(luz);
        this._linternasChicasLuces.push({ luz, halo, fase: Math.random() * 10 });
      });
    };

    if (this._linternaChicaGLTFCache) construirEn(this._linternaChicaGLTFCache);
    else if (window.cargarPersonajeGLTF) {
      window.cargarPersonajeGLTF("linternaChica", (gltf) => {
        this._linternaChicaGLTFCache = gltf;
        construirEn(gltf);
      }, (err) => console.error("No se pudo cargar la linterna chica", err));
    }
  }

  // Sakuras de fondo, lejos del tablero (pedido explícito: "no tienen que
  // estar cerca") — plantadas en el piso de la sala, no sobre la mesa
  // flotante del tablero, así se leen como un jardín visto de fondo, no
  // como decoración pegada a la mesa. Ángulo/radio/escala fijos (no
  // aleatorios) para que el jardín no cambie de forma entre partidas.
  _actualizarArboles() {
    if (this._grupoArboles) { this.escena.remove(this._grupoArboles); this._grupoArboles = null; }
    if (!this._linternasHabilitadas) return;

    const grupoActual = new THREE.Group();
    this._grupoArboles = grupoActual;
    this.escena.add(grupoActual);

    // Bien lejos del tablero (pedido explícito original, y además con la
    // cámara alta una copa cercana tapaba medio tablero): quedan en el
    // campo, más abajo que la meseta, enmarcando sin invadir.
    const radioBase = this.mundoLado * 1.15 + 9;
    // [ángulo en grados, factor de radio, escala relativa, giro extra, modelo]
    // Todos cerezos: se probó alternar con un arce otoñal (procesado y
    // funcionando, quedó en js/personajes/arce.js por si se quiere volver
    // a probar) pero el usuario prefirió sólo sakuras — el arce de colores
    // desentonaba con la paleta rosa del jardín.
    const ARBOLES = [
      [25, 1.0, 1.15, 10, "sakuraChica"],
      [80, 1.08, 0.9, -20, "sakuraChica"],
      [150, 0.92, 1.05, 40, "sakuraChica"],
      [210, 1.12, 1.0, -10, "sakuraChica"],
      [275, 0.98, 0.85, 25, "sakuraChica"],
      [335, 1.05, 0.95, -35, "sakuraChica"],
    ];
    // Altura objetivo por especie: el arce es mucho más ancho que alto
    // (copa de ~24 x 16 de alto en crudo) — a la altura del sakura su
    // copa quedaría desproporcionada al lado de los demás.
    const ALTURAS = { sakuraChica: 16, arce: 12 }; // más imponentes (pedido explícito: "árboles más grandes")
    // Cuánto se entierra cada especie: el arce tiene raíces largas que
    // bajan bastante más que el pie del tronco — apoyado por bbox quedaría
    // parado "en puntas de raíz", flotando sobre el pasto.
    const HUNDIR = { sakuraChica: 0.06, arce: 0.75 };

    const construirDe = (idModelo, gltf) => {
      if (this._grupoArboles !== grupoActual) return;
      // brillo propio sutil (una sola vez, en el material compartido por
      // todos los clones): a la distancia, dependiendo sólo de la luz de
      // la escena los árboles se apagaban demasiado — un emissiveMap tenue
      // (sigue la propia textura, no un tinte parejo) los mantiene
      // legibles sin verse "iluminados de más" ni planos.
      if (!gltf.scene.userData.brilloAplicado) {
        gltf.scene.userData.brilloAplicado = true;
        gltf.scene.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          // sin niebla: están lejos del tablero a propósito, y con la
          // niebla completa se apagaban casi del todo a esa distancia.
          o.material.fog = false;
          if (o.material.map) {
            o.material.emissiveMap = o.material.map;
            o.material.emissive.set(0xffffff);
            o.material.emissiveIntensity = 0.35;
          }
        });
      }
      const caja = new THREE.Box3().setFromObject(gltf.scene);
      const alto = caja.max.y - caja.min.y || 1;
      const centroX = (caja.max.x + caja.min.x) / 2;
      const centroZ = (caja.max.z + caja.min.z) / 2;
      const pisoY = caja.min.y;
      const escalaBase = (ALTURAS[idModelo] || 12) / alto;
      ARBOLES.forEach(([angDeg, factorRadio, factorEscala, giro, idEntrada]) => {
        if (idEntrada !== idModelo) return;
        const ang = (angDeg * Math.PI) / 180;
        const radio = radioBase * factorRadio;
        const ex = Math.cos(ang) * radio, ez = Math.sin(ang) * radio;

        const modelo = gltf.scene.clone(true);
        modelo.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
        });
        const grupo = new THREE.Group();
        modelo.position.set(-centroX, -pisoY, -centroZ);
        modelo.rotation.y = (giro * Math.PI) / 180;
        grupo.add(modelo);
        grupo.scale.setScalar(escalaBase * factorEscala);
        // plantado sobre el terreno real (la falda de la loma), enterrado
        // lo que pida la especie para que la base asiente en el pasto.
        grupo.position.set(ex, this._alturaTerreno(ex, ez) - (HUNDIR[idModelo] || 0.06), ez);
        grupoActual.add(grupo);
      });
    };

    ["sakuraChica"].forEach((idModelo) => {
      if (this._arbolGLTFCache[idModelo]) construirDe(idModelo, this._arbolGLTFCache[idModelo]);
      else if (window.cargarPersonajeGLTF && window.PERSONAJES_DATA && window.PERSONAJES_DATA[idModelo]) {
        window.cargarPersonajeGLTF(idModelo, (gltf) => {
          this._arbolGLTFCache[idModelo] = gltf;
          construirDe(idModelo, gltf);
        }, (err) => console.error("No se pudo cargar el árbol " + idModelo, err));
      }
    });
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
          this._azimut -= dx * 0.006; // sin límite: se puede dar toda la vuelta, 360°
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

    if (this._linternasLuces.length) {
      this._linternasLuces.forEach((o) => {
        const p = Math.sin(this._tiempo * 2.3 + o.fase) * 0.3 + Math.sin(this._tiempo * 7.1 + o.fase) * 0.15;
        o.luz.intensity = 2.4 + p * 1.6;
        if (o.halo) {
          o.halo.material.opacity = 0.8 + p * 0.35;
          o.halo.scale.setScalar(o.halo.userData.escalaBase * (1 + p * 0.12));
        }
      });
    }
    if (this._linternasChicasLuces.length) {
      this._linternasChicasLuces.forEach((o) => {
        const p = Math.sin(this._tiempo * 2.3 + o.fase) * 0.3 + Math.sin(this._tiempo * 7.1 + o.fase) * 0.15;
        o.luz.intensity = 2.3 + p * 1.0;
        if (o.halo) {
          o.halo.material.opacity = 0.95 + p * 0.3;
          o.halo.scale.setScalar(o.halo.userData.escalaBase * (1 + p * 0.12));
        }
      });
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
