// ============ Mapa de TEG en 3D (Three.js) ============
// Antes esto era un mapa Leaflet con tiles reales y fichas HTML planas —
// visualmente de otra familia que Go y Ajedrez. Ahora es la misma sala
// oscura con luna + pedestal con luz LED (calcada de board3d.js/chess3d.js
// a propósito, sin extraer un módulo común, mismo criterio que se usó entre
// esos dos), con el mapa dibujado en un canvas sobre un tablero 3D y las
// fichas como piedras pulidas de verdad (mismo perfil que las de Go).
//
// La API pública (constructor, onTerritorio, actualizar, resize, dispose)
// es idéntica a la versión Leaflet anterior, así que app.js no tiene que
// cambiar salvo por sacar la carga de Leaflet en index.html.

const PALETA_JUGADORES_TEG = {
  azul:    { nombre: "Azul",    color: "#4a7fd6" },
  rojo:    { nombre: "Rojo",    color: "#e0483a" },
  verde:   { nombre: "Verde",   color: "#4ad68f" },
  dorado:  { nombre: "Dorado",  color: "#e8b84b" },
  violeta: { nombre: "Violeta", color: "#9a5fe0" },
  blanco:  { nombre: "Blanco",  color: "#eef0f2" },
};
const ORDEN_COLORES_TEG = ["azul", "rojo", "verde", "dorado", "violeta", "blanco"];

// Color de las líneas de adyacencia según el continente del país de origen
// — así de un vistazo se nota qué conexiones son "internas" a un
// continente (todas del mismo color) y cuáles cruzan a otro (cambian de
// color a mitad de camino, porque el destino tiene el suyo propio).
const COLOR_CONTINENTE_TEG = {
  america_norte: "#4a7fd6", america_central: "#4ad68f", america_sur: "#e8b84b",
  europa: "#9a5fe0", africa: "#e0483a", asia_oceania: "#eef0f2",
};

// Aclara/oscurece un color hex mezclándolo hacia blanco (cantidad > 0) o
// negro (cantidad < 0) — para el moteado de las piedras y los tintes de
// continente a partir de un único color base.
function _mezclarColorTeg(hex, cantidad) {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const hacia = cantidad > 0 ? 255 : 0;
  const t = Math.abs(cantidad);
  r = Math.round(r + (hacia - r) * t);
  g = Math.round(g + (hacia - g) * t);
  b = Math.round(b + (hacia - b) * t);
  return `rgb(${r},${g},${b})`;
}
// El mapa mundi real (un <path> por país, provisto por el usuario) vive
// pre-procesado en js/worldpaises.js (PAISES_SVG / PAISES_SVG_TAM, cargado
// antes que este script) en vez de leerse en tiempo de ejecución desde
// assets/world.svg: cargar ese .svg por file:// con <img> mancha (taint)
// el canvas por la política de seguridad de Chrome sobre recursos locales,
// y un canvas manchado ni se puede subir como textura de WebGL (quedaba en
// negro sin ningún error visible); intentarlo con <object> para leer su DOM
// en cambio resultó poco confiable en este Chrome (a veces no expone
// contentDocument). Tenerlo ya como datos evita el problema de raíz y de
// paso no depende de ninguna carga asíncrona. Devuelve tanto el path
// combinado (para el relleno de "toda la tierra" de un saque) como un
// Path2D por país (para el halo de hover de un país puntual).
function _combinarPathsMundo(destX, destY, destW, destH) {
  const { w, h } = PAISES_SVG_TAM;
  const matriz = new DOMMatrix().translate(destX, destY).scale(destW / w, destH / h);
  const combinado = new Path2D();
  const porPais = {};
  for (const id in PAISES_SVG) {
    try {
      const p = new Path2D(PAISES_SVG[id].d);
      combinado.addPath(p, matriz);
      const individual = new Path2D();
      individual.addPath(p, matriz);
      porPais[id] = individual;
    } catch (e) { /* un país con `d` raro no debería tirar abajo el resto */ }
  }
  return { combinado, porPais };
}

class TegMapa {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.anchoMundo = 16;
    this.profMundo = 9;

    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dom = this.renderer.domElement;
    contenedor.appendChild(this.dom);

    this._raycaster = new THREE.Raycaster();
    this._puntero = new THREE.Vector2();
    this._onTerritorio = null;
    this._fichas = {};
    this._posiciones = {}; // territorioId -> {x, z}
    this._continenteResaltado = null;
    this._territorioHover = null;

    this._azimut = 0.05;
    this._elevacion = 0.98; // más "de arriba" que Go: un mapa se lee mejor así
    this._distancia = 17;
    this._zoomMin = 9; this._zoomMax = 30;
    this._arrastrando = false;
    this._tiempo = 0;
    this._ultimoFrameLineas = 0;

    this._crearLuces();
    this._crearHabitacion();
    this._crearTableroYMapa();
    this._crearFichas();
    this._crearOverlayLineas();
    this._eventos();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  // ---- posición de un país en el plano del tablero (x,z) o en la textura
  // del mapa (uv), a partir de su centroide en el espacio del propio SVG
  // (PAISES_SVG[id].x/y) — la MISMA transformación que usa el dibujo del
  // país en sí, así la ficha cae siempre exactamente donde se ve el país,
  // sin ningún desfase de proyección posible.
  _fraccionSvg(id) {
    const p = PAISES_SVG[id];
    const { w, h } = PAISES_SVG_TAM;
    return [p.x / w, p.y / h];
  }
  _mundoDesdePais(id) {
    const [fx, fy] = this._fraccionSvg(id);
    const x = (fx - 0.5) * (this.anchoMundo * 0.92);
    const z = (fy - 0.5) * (this.profMundo * 0.86);
    return [x, z];
  }
  _uvPais(id, W, H) {
    const marX = W * (1 - 0.92) / 2, marY = H * (1 - 0.86) / 2;
    const [fx, fy] = this._fraccionSvg(id);
    return [marX + fx * (W - marX * 2), marY + fy * (H - marY * 2)];
  }

  _crearLuces() {
    const hemi = new THREE.HemisphereLight(0x8a734a, 0x0a0806, 0.85);
    this.escena.add(hemi);
    this.key = new THREE.DirectionalLight(0xfff2d8, 2.6);
    this.key.position.set(-6, 9, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.left = -11; this.key.shadow.camera.right = 11;
    this.key.shadow.camera.top = 7; this.key.shadow.camera.bottom = -7;
    this.key.shadow.camera.near = 1; this.key.shadow.camera.far = 26;
    this.key.shadow.bias = -0.0018;
    this.key.shadow.radius = 4;
    this.escena.add(this.key);
    const fill = new THREE.DirectionalLight(0x9db4d9, 0.55);
    fill.position.set(7, 4, -5);
    this.escena.add(fill);
  }

  // Mismo estudio oscuro + luna con haz difuso que Go/Ajedrez (duplicado a
  // propósito, ver comentario arriba del archivo).
  _crearHabitacion() {
    const PISO_Y = -2.3;
    this.escena.background = new THREE.Color(0x08080a);
    this.escena.fog = new THREE.Fog(0x08080a, 14, 40);

    const geoPiso = new THREE.PlaneGeometry(180, 180);
    geoPiso.rotateX(-Math.PI / 2);
    const piso = new THREE.Mesh(geoPiso, new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.75, metalness: 0.15 }));
    piso.position.y = PISO_Y;
    piso.receiveShadow = true;
    this.escena.add(piso);

    const acento = new THREE.PointLight(0x5b6f9c, 1.2, 22, 2);
    acento.position.set(-8, 1.8, -7);
    this.escena.add(acento);

    const posLuna = new THREE.Vector3(-4.5, 11, -11);
    this._luna = new THREE.Mesh(new THREE.SphereGeometry(1.35, 32, 32), new THREE.MeshBasicMaterial({ color: 0xe8eefb, toneMapped: false, fog: false }));
    this._luna.position.copy(posLuna);
    this.escena.add(this._luna);

    const cvLuna = document.createElement("canvas");
    cvLuna.width = cvLuna.height = 256;
    const lctx = cvLuna.getContext("2d");
    const halo = lctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    halo.addColorStop(0, "rgba(215,228,255,0.75)");
    halo.addColorStop(0.4, "rgba(180,200,240,0.28)");
    halo.addColorStop(1, "rgba(160,190,230,0)");
    lctx.fillStyle = halo; lctx.fillRect(0, 0, 256, 256);
    this._haloLuna = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cvLuna), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8, fog: false }));
    this._haloLuna.scale.set(5, 5, 1);
    this._haloLuna.position.copy(posLuna);
    this.escena.add(this._haloLuna);

    this.luzLuna = new THREE.SpotLight(0xcfe0ff, 3.1, 68, Math.PI / 6, 0.92, 1.1);
    this.luzLuna.position.copy(posLuna);
    this.luzLuna.target.position.set(0, 0, 0);
    this.luzLuna.castShadow = true;
    this.luzLuna.shadow.mapSize.set(1024, 1024);
    this.luzLuna.shadow.camera.near = 4; this.luzLuna.shadow.camera.far = 34;
    this.luzLuna.shadow.bias = -0.002;
    this.escena.add(this.luzLuna, this.luzLuna.target);

    const cvHaz = document.createElement("canvas");
    cvHaz.width = cvHaz.height = 256;
    const hctx = cvHaz.getContext("2d");
    const gHaz = hctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gHaz.addColorStop(0, "rgba(216,229,255,0.85)");
    gHaz.addColorStop(0.4, "rgba(198,216,255,0.3)");
    gHaz.addColorStop(1, "rgba(190,210,255,0)");
    hctx.fillStyle = gHaz; hctx.fillRect(0, 0, 256, 256);
    const texHaz = new THREE.CanvasTexture(cvHaz);
    const pasos = [
      { t: 0.06, escala: 4.0, opacidad: 0.14 }, { t: 0.26, escala: 3.0, opacidad: 0.16 },
      { t: 0.48, escala: 2.2, opacidad: 0.18 }, { t: 0.7, escala: 1.6, opacidad: 0.22 },
      { t: 0.9, escala: 1.1, opacidad: 0.3 },
    ];
    const destino = new THREE.Vector3(0, 0.05, 0);
    pasos.forEach(({ t, escala, opacidad }) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHaz, transparent: true, opacity: opacidad, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      s.position.lerpVectors(posLuna, destino, t);
      s.scale.setScalar(escala);
      this.escena.add(s);
    });
  }

  // Dibuja la capa de TIERRA sola, con fondo transparente (el agua vive
  // aparte, ver _texturaAgua — esta capa flota como un plano encima de
  // ella, mismo patrón que _planoLineas). Los países van con veta de
  // madera de verdad (gradiente + vetas curvas, clipeadas a la silueta
  // real de cada país vía this._pathTierra), sólidos como pidió el
  // usuario — nada de vidrio acá, eso es sólo para el agua. Con 256
  // países no entra poner el nombre de todos a la vez (quedaba un
  // empaste ilegible) — el nombre sólo se muestra del país sobre el que
  // está el mouse (`idResaltado`), con un halo dorado alrededor de su
  // silueta real. Se llama una vez al armar la textura y de nuevo cada
  // vez que cambia el hover.
  _dibujarCapasMapa(ctx, W, H, idResaltado) {
    ctx.clearRect(0, 0, W, H);

    if (this._pathTierra) {
      ctx.save();
      ctx.clip(this._pathTierra);
      const madera = ctx.createLinearGradient(0, 0, W, H);
      madera.addColorStop(0, "#caa15c"); madera.addColorStop(0.5, "#a97f3c"); madera.addColorStop(1, "#7a5230");
      ctx.fillStyle = madera;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.1;
      for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = i % 2 ? "#e8c988" : "#4a3418";
        ctx.lineWidth = 1 + Math.random() * 1.8;
        ctx.beginPath();
        const y0 = Math.random() * H;
        ctx.moveTo(0, y0);
        ctx.bezierCurveTo(W * 0.33, y0 + (Math.random() - 0.5) * H * 0.12, W * 0.66, y0 + (Math.random() - 0.5) * H * 0.12, W, y0 + (Math.random() - 0.5) * H * 0.08);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.strokeStyle = "rgba(20,14,6,0.45)";
      ctx.lineWidth = 0.7;
      ctx.stroke(this._pathTierra);
    }

    if (idResaltado && this._pathsPorPais[idResaltado]) {
      const p = this._pathsPorPais[idResaltado];
      ctx.save();
      ctx.shadowColor = "#ffb347"; ctx.shadowBlur = W * 0.012;
      ctx.strokeStyle = "#ffd08a"; ctx.lineWidth = W * 0.0026;
      ctx.stroke(p); ctx.stroke(p); // dos pasadas: el halo se nota más
      ctx.restore();
      ctx.fillStyle = "#ffe9c2";
      const [x, y] = this._uvPais(idResaltado, W, H);
      ctx.font = `700 ${Math.round(W * 0.016)}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = W * 0.006;
      ctx.fillText(PAISES_SVG[idResaltado].nombre, x, y - W * 0.022);
      ctx.shadowBlur = 0;
    }

    ctx.strokeStyle = "rgba(201,169,97,0.5)"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.strokeStyle = "rgba(255,246,224,0.35)"; ctx.lineWidth = 2; ctx.strokeRect(10, 10, W - 20, H - 20);
  }

  // Textura del AGUA: gradiente tipo "resina/río de cristal" (turquesa
  // profundo con vetas más claras, como la mesa de epoxy que pidió de
  // referencia) — se usa como color Y como emissiveMap del material del
  // tablero, así el brillo interior sigue las mismas vetas en vez de
  // verse parejo; el pulso "se prende y apaga" lo anima
  // `_intensidadAguaBase` en _loop, sin redibujar nada (barato).
  _texturaAgua() {
    const W = 1024, H = 576;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    // La primera versión era un solo gradiente claro con vetas parejas y
    // quedaba "celeste lavado". En la mesa de referencia el agua es azul
    // PROFUNDO casi negro, y lo brillante son vetas angostas localizadas —
    // así que acá va por capas, de atrás hacia adelante:

    // capa 1 — base profunda, casi negra hacia los bordes.
    const base = ctx.createLinearGradient(0, 0, W * 0.4, H);
    base.addColorStop(0, "#071a30"); base.addColorStop(0.5, "#0a2036"); base.addColorStop(1, "#030b16");
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

    // capa 2 — manchas anchas de azul medio, desenfocadas: profundidades
    // desparejas, como resina vertida en tandas.
    ctx.filter = `blur(${W * 0.03}px)`;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#0e3a5c" : "#123152";
      ctx.globalAlpha = 0.4;
      const cx = Math.random() * W, cy = Math.random() * H;
      const r = W * (0.06 + Math.random() * 0.1);
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * (0.4 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }

    // capas 3 a 5 — el resplandor NO cruza el océano al azar: bordea la
    // COSTA de los continentes (la propia silueta del SVG), como en la
    // mesa de epoxy de referencia. Tres anillos concéntricos sobre el
    // mismo contorno, de afuera hacia adentro: primero un halo VERDE bien
    // ancho y difuso (el más lejos de la costa, mimetizándose con el azul
    // oscuro del océano de fondo), después el turquesa medio, y por
    // último el filamento casi blanco pegado al borde mismo de la tierra.
    const marX = W * (1 - 0.92) / 2, marY = H * (1 - 0.86) / 2;
    const costa = _combinarPathsMundo(marX, marY, W - marX * 2, H - marY * 2).combinado;

    ctx.filter = `blur(${W * 0.022}px)`;
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#1f8a5c";
    ctx.lineWidth = W * 0.02;
    ctx.stroke(costa);

    ctx.filter = `blur(${W * 0.012}px)`;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#1f7fa8";
    ctx.lineWidth = W * 0.009;
    ctx.stroke(costa);

    ctx.filter = `blur(${W * 0.005}px)`;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#3fb9d8";
    ctx.lineWidth = W * 0.004;
    ctx.stroke(costa);

    ctx.filter = `blur(${W * 0.0015}px)`;
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#9fe6f4";
    ctx.lineWidth = W * 0.0014;
    ctx.stroke(costa);
    ctx.filter = "none";

    // capa 5 — partículas en suspensión, apenas visibles.
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#7fd4e8";
    for (let i = 0; i < 130; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * W, Math.random() * H, 0.5 + Math.random() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(201,169,97,0.08)";
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 12; i++) { const x = (W / 12) * i; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let i = 1; i < 7; i++) { const y = (H / 7) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Capa de tierra: un plano transparente aparte (no la cara de arriba del
  // tablero — esa es el agua, ver _texturaAgua) apoyado apenas encima del
  // agua, mismo patrón que _planoLineas.
  _texturaMapa() {
    const W = 2048, H = 1152;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    this._cvMapa = cv; this._ctxMapa = ctx; this._wMapa = W; this._hMapa = H;

    const marX = W * (1 - 0.92) / 2, marY = H * (1 - 0.86) / 2;
    const { combinado, porPais } = _combinarPathsMundo(marX, marY, W - marX * 2, H - marY * 2);
    this._pathTierra = combinado;
    this._pathsPorPais = porPais;
    this._dibujarCapasMapa(ctx, W, H, null);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this._texMapa = tex;

    return tex;
  }

  _texturaLateralOscura() {
    const N = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, N, N);
    g.addColorStop(0, "#241c12"); g.addColorStop(1, "#120d08");
    ctx.fillStyle = g; ctx.fillRect(0, 0, N, N);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _crearTableroYMapa() {
    const grosor = 0.34;
    const geoBase = new THREE.BoxGeometry(this.anchoMundo, grosor, this.profMundo);
    // La cara de arriba del tablero es el AGUA (cristal con luz adentro que
    // pulsa, ver _texturaAgua/_loop) — los países van en un plano
    // transparente aparte, apoyado encima (ver más abajo), no acá.
    const texAgua = this._texturaAgua();
    // base baja: como el emissiveMap es la misma textura (mayormente
    // oscura), sólo las vetas claras brillan de verdad — las zonas
    // profundas se quedan oscuras, como en la mesa de referencia.
    this._intensidadAguaBase = 0.32;
    const matLateral = new THREE.MeshStandardMaterial({ map: this._texturaLateralOscura(), roughness: 0.75, metalness: 0.06 });
    const matAgua = new THREE.MeshPhysicalMaterial({
      map: texAgua, emissiveMap: texAgua, emissive: new THREE.Color(0x3fc6e0),
      emissiveIntensity: this._intensidadAguaBase, roughness: 0.12, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.06, reflectivity: 0.7,
    });
    this._matAgua = matAgua;
    const materiales = [matLateral, matLateral, matAgua, matLateral, matLateral, matLateral];
    const base = new THREE.Mesh(geoBase, materiales);
    base.position.y = -grosor / 2;
    base.receiveShadow = true; base.castShadow = true;

    this._grupoTablero = new THREE.Group();
    this._grupoTablero.add(base);
    this.escena.add(this._grupoTablero);

    // Los países, en un plano aparte flotando apenas encima del agua —
    // fondo transparente donde no hay tierra, así el brillo del agua se ve
    // por debajo (mismo patrón que _planoLineas, que va todavía más arriba).
    const texTierra = this._texturaMapa();
    const geoTierra = new THREE.PlaneGeometry(this.anchoMundo, this.profMundo);
    geoTierra.rotateX(-Math.PI / 2);
    const matTierra = new THREE.MeshStandardMaterial({ map: texTierra, transparent: true, roughness: 0.55, metalness: 0.04 });
    this._planoTierra = new THREE.Mesh(geoTierra, matTierra);
    this._planoTierra.position.y = 0.002;
    this._planoTierra.receiveShadow = true;
    this._grupoTablero.add(this._planoTierra);

    // pedestal + hueco + tira led, igual patrón que board3d.js/chess3d.js.
    if (!this._colorLuzInferior) this._colorLuzInferior = PALETA_LUCES_INFERIOR.azul.color;
    const HUECO = 0.5, ALTURA_PEDESTAL = 0.38;
    const anchoPedestal = this.anchoMundo * 0.95, profPedestal = this.profMundo * 0.92;
    const techoHueco = -grosor, pisoHueco = techoHueco - HUECO;

    const matPedestal = new THREE.MeshStandardMaterial({ color: 0x1c150e, roughness: 0.7, metalness: 0.08 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(anchoPedestal, ALTURA_PEDESTAL, profPedestal), matPedestal);
    pedestal.position.y = pisoHueco - ALTURA_PEDESTAL / 2;
    pedestal.receiveShadow = true; pedestal.castShadow = true;
    this._grupoTablero.add(pedestal);

    const grosorTira = 0.09;
    const matTira = new THREE.MeshBasicMaterial({ color: this._colorLuzInferior, toneMapped: false, fog: false });
    const largoNS = anchoPedestal - grosorTira * 1.6;
    const tiraN = new THREE.Mesh(new THREE.BoxGeometry(largoNS, grosorTira, grosorTira), matTira);
    tiraN.position.set(0, pisoHueco + grosorTira * 0.6, -profPedestal / 2 + grosorTira * 0.8);
    const tiraS = tiraN.clone(); tiraS.position.z = profPedestal / 2 - grosorTira * 0.8;
    const largoEO = profPedestal - grosorTira * 1.6;
    const tiraE = new THREE.Mesh(new THREE.BoxGeometry(grosorTira, grosorTira, largoEO), matTira);
    tiraE.position.set(-anchoPedestal / 2 + grosorTira * 0.8, pisoHueco + grosorTira * 0.6, 0);
    const tiraO = tiraE.clone(); tiraO.position.x = anchoPedestal / 2 - grosorTira * 0.8;
    this._tirasSolidasInferior = [tiraN, tiraS, tiraE, tiraO];
    this._tirasSolidasInferior.forEach((t) => this._grupoTablero.add(t));

    const N_TIRA = 512;
    const cvGlow = document.createElement("canvas");
    cvGlow.width = cvGlow.height = N_TIRA;
    const gctx = cvGlow.getContext("2d");
    const escalaPlano = 1.3;
    const margenTira = N_TIRA * (1 - 1 / escalaPlano) / 2;
    gctx.filter = `blur(${N_TIRA * 0.05}px)`;
    gctx.strokeStyle = "#ffffff"; gctx.lineWidth = N_TIRA * 0.032;
    gctx.strokeRect(margenTira, margenTira, N_TIRA - margenTira * 2, N_TIRA - margenTira * 2);
    gctx.filter = "none";
    const geoGlow = new THREE.PlaneGeometry(anchoPedestal * escalaPlano, profPedestal * escalaPlano);
    geoGlow.rotateX(-Math.PI / 2);
    this._opacidadGlowBase = 0.85;
    const matGlow = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cvGlow), color: this._colorLuzInferior, transparent: true, opacity: this._opacidadGlowBase, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this._discoGlow = new THREE.Mesh(geoGlow, matGlow);
    this._discoGlow.position.y = pisoHueco + 0.01;
    this._grupoTablero.add(this._discoGlow);

    this._intensidadLuzInferiorBase = 2.4;
    this.luzInferior = new THREE.PointLight(this._colorLuzInferior, this._intensidadLuzInferiorBase, 26, 2);
    this.luzInferior.position.set(0, (techoHueco + pisoHueco) / 2, 0);
    this.escena.add(this.luzInferior);

    // posiciones de cada territorio en el mundo, para fichas + clicks
    for (const id of Object.keys(TERRITORIOS)) {
      const [x, z] = this._mundoDesdePais(id);
      this._posiciones[id] = { x, z };
    }
  }

  setColorLuzInferior(hex) {
    this._colorLuzInferior = hex;
    if (this.luzInferior) this.luzInferior.color.set(hex);
    if (this._discoGlow) this._discoGlow.material.color.set(hex);
    if (this._tirasSolidasInferior) this._tirasSolidasInferior.forEach((t) => t.material.color.set(hex));
  }

  // ---- geometría de piedra: perfil biconvexo, igual que Go ----
  _geometriaPiedra(radio) {
    const puntos = [];
    const alto = radio * 0.62;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, ang = t * Math.PI;
      const x = Math.sin(ang) * radio;
      const y = -Math.cos(ang) * alto * (0.55 + 0.45 * Math.sin(ang));
      puntos.push(new THREE.Vector2(Math.max(x, 0.0001), y));
    }
    const geo = new THREE.LatheGeometry(puntos, 24);
    geo.computeVertexNormals();
    return geo;
  }

  // Ficha "gema": el intento anterior (mapa de mármol opaco + poca
  // transmisión) se leía como una bolita de plástico/caramelo, no como
  // piedra preciosa. Acá se saca el mapa de color por completo — nada de
  // textura pintada encima tapando la transparencia — y en cambio se
  // apoya todo en las propiedades físicas: transmisión bien alta (deja
  // pasar la luz de verdad), un índice de refracción de gema (más que el
  // 1.5 típico del vidrio) y un `attenuationColor` — el color no se pinta
  // en la superficie, se ve como si tiñera la luz que atraviesa la piedra,
  // más oscuro/saturado hacia el centro — que es justo el efecto "brilla
  // desde adentro" de una gema tallada de verdad.
  _materialFicha(hex) {
    this._cacheMateriales = this._cacheMateriales || {};
    if (this._cacheMateriales[hex]) return this._cacheMateriales[hex];
    const mat = new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.05, metalness: 0,
      transmission: 0.6, thickness: 0.35, ior: 1.8,
      attenuationColor: new THREE.Color(hex), attenuationDistance: 0.6,
      clearcoat: 1, clearcoatRoughness: 0.05,
      reflectivity: 1, specularIntensity: 1,
      emissive: new THREE.Color(hex), emissiveIntensity: 0.18,
    });
    this._cacheMateriales[hex] = mat;
    return mat;
  }

  _spriteNumero(texto) {
    const N = 128;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d");
    ctx.font = "800 72px Georgia, serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 10; ctx.strokeStyle = "rgba(10,8,5,0.9)";
    ctx.strokeText(texto, N / 2, N / 2 + 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(texto, N / 2, N / 2 + 4);
    return new THREE.CanvasTexture(cv);
  }

  // Crea, una sola vez, una piedra + sprite de número + anillo por
  // territorio (actualizar() sólo les cambia color/texto/visibilidad, nunca
  // las reconstruye — en TEG todo territorio siempre tiene dueño). Con 256
  // países en el mismo tablero, mucho más chicas que las de Go/Ajedrez para
  // que no se pisen entre sí ni se salgan del país que representan.
  _crearFichas() {
    this._radioFicha = 0.1;
    const geoPiedra = this._geometriaPiedra(this._radioFicha);
    const altura = 0.05 + this._radioFicha * 0.62;
    for (const id of Object.keys(TERRITORIOS)) {
      const { x, z } = this._posiciones[id];
      const grupo = new THREE.Group();
      grupo.position.set(x, altura, z);

      const piedra = new THREE.Mesh(geoPiedra, this._materialFicha("#666666"));
      piedra.castShadow = true; piedra.receiveShadow = true;
      piedra.userData.territorioId = id;
      grupo.add(piedra);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._spriteNumero("0"), transparent: true, depthTest: false, fog: false }));
      sprite.scale.set(0.16, 0.16, 1);
      sprite.position.y = this._radioFicha * 0.62 + 0.08;
      grupo.add(sprite);

      const geoAnillo = new THREE.TorusGeometry(this._radioFicha * 1.3, 0.015, 8, 24);
      geoAnillo.rotateX(-Math.PI / 2);
      const anillo = new THREE.Mesh(geoAnillo, new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false, transparent: true, opacity: 0 }));
      anillo.position.y = -altura + 0.015;
      grupo.add(anillo);

      this._grupoTablero.add(grupo);
      // `alturaY`: la altura "de reposo" del grupo (donde vuelve cuando no
      // hay hover); `hoverActual` es la elevación extra ya aplicada (se
      // anima hacia 0 o hacia el máximo en _loop, nunca salta de golpe).
      this._fichas[id] = { grupo, piedra, sprite, anillo, continente: TERRITORIOS[id].continente, alturaY: altura, hoverActual: 0 };
    }
  }

  // Las líneas de adyacencia viven en su propia capa (un plano transparente
  // apenas por encima del mapa) en vez de estar pintadas en la textura del
  // mapa en sí: se animan (dash-offset "fluyendo") a fuego lento en
  // _actualizarLineas, y repintar sólo esta capa liviana es mucho más
  // barato que repintar el mapa entero (océano + 256 países + marco) a
  // cada rato.
  _crearOverlayLineas() {
    const W = 1024, H = 576;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    this._cvLineas = cv; this._ctxLineas = cv.getContext("2d");
    this._wLineas = W; this._hLineas = H;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._texLineas = tex;

    const geo = new THREE.PlaneGeometry(this.anchoMundo, this.profMundo);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    this._planoLineas = new THREE.Mesh(geo, mat);
    this._planoLineas.position.y = 0.004;
    this._planoLineas.visible = false; // sólo se prenden en ataque/fortificación, ver actualizar()
    this._grupoTablero.add(this._planoLineas);

    this._aristasLineas = [];
    const vistos = new Set();
    for (const id in TERRITORIOS) {
      for (const v of TERRITORIOS[id].vecinos) {
        const clave = [id, v].sort().join("|");
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        this._aristasLineas.push([id, v]);
      }
    }
    this._actualizarLineas();
  }

  _actualizarLineas() {
    const ctx = this._ctxLineas, W = this._wLineas, H = this._hLineas;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -this._tiempo * 5;
    for (const [a, b] of this._aristasLineas) {
      ctx.strokeStyle = COLOR_CONTINENTE_TEG[TERRITORIOS[a].continente] || "#c9a961";
      ctx.globalAlpha = 0.55;
      const [x1, y1] = this._uvPais(a, W, H), [x2, y2] = this._uvPais(b, W, H);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this._texLineas.needsUpdate = true;
  }

  onTerritorio(cb) { this._onTerritorio = cb; }

  // `coloresPorJugador`: array de hex, uno por índice de jugador.
  // `opciones`: { seleccion: territorioId|null, resaltados: [territorioId,...] }
  actualizar(teg, coloresPorJugador, opciones = {}) {
    for (const id of Object.keys(TERRITORIOS)) {
      const info = teg.board[id];
      const f = this._fichas[id];
      if (!f) continue;
      const color = coloresPorJugador[info.dueno] || "#666666";
      f.colorActual = color;
      f.piedra.material = this._materialFicha(color);
      if (f.sprite.material.map) f.sprite.material.map.dispose();
      f.sprite.material.map = this._spriteNumero(String(info.ejercitos));
      f.sprite.material.needsUpdate = true;

      const esSeleccion = opciones.seleccion === id;
      const esResaltado = !!(opciones.resaltados && opciones.resaltados.includes(id));
      f.anillo.material.color.set(esSeleccion ? 0xffe08a : 0xff6a4a);
      f.anillo.material.opacity = esSeleccion || esResaltado ? 0.95 : 0;
      this._pintarEmissive(f);
    }
    // Las líneas de conexión sólo se muestran en ataque/fortificación —
    // ahí es cuando importa ver quién linda con quién; en refuerzo sólo
    // suman ruido visual sobre 256 fichas.
    if (this._planoLineas) this._planoLineas.visible = teg.fase === "ataque" || teg.fase === "fortificacion";
  }

  // ---- interacción ----
  _eventos() {
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", (e) => {
      this._arrastrando = true; this._movio = false;
      this._inicioArrastre = { x: e.clientX, y: e.clientY };
      this._ultimoPuntero = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", () => { this._arrastrando = false; });
    window.addEventListener("pointermove", (e) => {
      if (this._arrastrando) {
        const dist = Math.abs(e.clientX - this._inicioArrastre.x) + Math.abs(e.clientY - this._inicioArrastre.y);
        if (dist > 6) {
          this._movio = true;
          const dx = e.clientX - this._ultimoPuntero.x, dy = e.clientY - this._ultimoPuntero.y;
          this._azimut = Math.min(1.15, Math.max(-1.15, this._azimut - dx * 0.006));
          this._elevacion = Math.min(1.45, Math.max(0.6, this._elevacion - dy * 0.004));
        }
        this._ultimoPuntero = { x: e.clientX, y: e.clientY };
      }
      this._actualizarPuntero(e);
      const id = this._territorioBajoPuntero();
      const cont = id ? TERRITORIOS[id].continente : null;
      if (cont !== this._continenteResaltado) { this._continenteResaltado = cont; this._refrescarHover(); }
      if (id !== this._territorioHover) {
        this._territorioHover = id;
        this._dibujarCapasMapa(this._ctxMapa, this._wMapa, this._hMapa, id);
        this._texMapa.needsUpdate = true;
      }
      dom.style.cursor = id ? "pointer" : "grab";
    });
    dom.addEventListener("click", () => {
      if (this._movio) return;
      const id = this._territorioBajoPuntero();
      if (id && this._onTerritorio) this._onTerritorio(id);
    });
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      this._distancia = Math.min(this._zoomMax, Math.max(this._zoomMin, this._distancia + e.deltaY * 0.014));
    }, { passive: false });
  }

  _refrescarHover() {
    for (const id of Object.keys(this._fichas)) this._pintarEmissive(this._fichas[id]);
  }

  // El material "gema" ya trae su propio brillo interior tenue (emissive =
  // su propio color, a baja intensidad — ver _materialFicha); acá sólo se
  // sube a un naranja fuerte cuando el continente de esta ficha está en
  // hover, y si no, se restaura ese brillo propio (nunca a negro puro, o
  // la piedra se apaga del todo y vuelve a leerse como plástico opaco).
  _pintarEmissive(f) {
    if (!f.piedra.material.emissive) return;
    const on = this._continenteResaltado && f.continente === this._continenteResaltado;
    if (on) { f.piedra.material.emissive.set(0xff7a2c); f.piedra.material.emissiveIntensity = 0.6; }
    else { f.piedra.material.emissive.set(f.colorActual || "#666666"); f.piedra.material.emissiveIntensity = 0.18; }
  }

  _actualizarPuntero(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._puntero.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._puntero.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // Raycast directo contra las piedras (no contra un plano al ras del
  // tablero + "territorio más cercano"): las piedras están elevadas sobre
  // el tablero, así que con la cámara en ángulo un raycast contra el plano
  // aterriza en un punto (x,z) corrido del que se ve a simple vista —
  // pequeño en general, pero alcanzaba para que un click visualmente
  // preciso sobre una piedra fallara y agarrara a la vecina (o a ninguna).
  // Raycastear contra la geometría real de la piedra hace que el click
  // "sienta" exactamente donde se ve la piedra, sin ese paralaje.
  _territorioBajoPuntero() {
    this._raycaster.setFromCamera(this._puntero, this.camara);
    const objetos = Object.values(this._fichas).map((f) => f.piedra);
    const hits = this._raycaster.intersectObjects(objetos, false);
    return hits.length ? hits[0].object.userData.territorioId : null;
  }

  resize() {
    const w = this.contenedor.clientWidth || 480;
    const h = this.contenedor.clientHeight || Math.round(w * 0.6);
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  // La piedra bajo el mouse sube; el resto vuelve a su altura de reposo —
  // siempre animado (lerp), nunca un salto, para que se sienta "flotar" en
  // vez de tildarse arriba/abajo de golpe.
  _actualizarElevacion() {
    const SUBIDA = 0.13, VELOCIDAD = 0.09;
    for (const id in this._fichas) {
      const f = this._fichas[id];
      const objetivo = id === this._territorioHover ? SUBIDA : 0;
      f.hoverActual += (objetivo - f.hoverActual) * VELOCIDAD;
      f.grupo.position.y = f.alturaY + f.hoverActual;
    }
  }

  _loop(t) {
    requestAnimationFrame(this._loop);
    this._tiempo = t * 0.001;
    if (this.luzInferior) {
      const p = Math.sin(this._tiempo * 3.1) * 0.22 + Math.sin(this._tiempo * 11.3) * 0.1;
      this.luzInferior.intensity = this._intensidadLuzInferiorBase + p * (this._intensidadLuzInferiorBase / 2.8);
      if (this._discoGlow) this._discoGlow.material.opacity = Math.max(0.5, this._opacidadGlowBase + p * 0.12);
    }
    this._actualizarElevacion();
    if (t - this._ultimoFrameLineas > 60) { this._ultimoFrameLineas = t; this._actualizarLineas(); }
    // el agua "se prende y apaga" con un pulso lento y suave — mucho más
    // lento que el parpadeo tipo neón de la luz del pedestal de abajo.
    if (this._matAgua) this._matAgua.emissiveIntensity = this._intensidadAguaBase + Math.sin(this._tiempo * 0.6) * 0.14;
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
