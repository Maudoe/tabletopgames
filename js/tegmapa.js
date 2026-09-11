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

// Fichas "dos tonos + oro" — mismo estilo que las de Damas (ver
// materialPiezaAjedrez en chess3d.js), no piedras/gemas lisas como las de
// Go. `color` es sólo para la interfaz 2D (punto de color en la lista de
// jugadores, swatch de selección); `colorId` es la clave real en
// PALETA_PIEDRAS (board3d.js) que arma el material de la ficha 3D.
const PALETA_JUGADORES_TEG = {
  blanco:   { nombre: "Blanco y Oro",     colorId: "blancoOro",     color: "#f3ecd9" },
  negro:    { nombre: "Negro y Oro",      colorId: "negroOro",      color: "#3a3128" },
  rojo:     { nombre: "Rojo Oscuro y Oro", colorId: "rojoOscuroOro", color: "#9c2530" },
  turquesa: { nombre: "Turquesa y Oro",   colorId: "turquesaOro",   color: "#4fe0d0" },
  verde:    { nombre: "Verde y Oro",      colorId: "verdeOro",      color: "#4fcf7a" },
  dorado:   { nombre: "Dorado",           colorId: "dorado",        color: "#e8b84b" },
};
const ORDEN_COLORES_TEG = ["blanco", "negro", "rojo", "turquesa", "verde", "dorado"];

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

    this._proximoGlitch = 3 + Math.random() * 4;
    this._glitchHasta = 0;

    this._crearLuces();
    this._crearHabitacion();
    this._crearTableroYMapa();
    this._crearFichas();
    this._crearOverlayLineas();
    this._crearEscaner();
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
      // Terreno táctico tipo HUD militar (Battlefield/Medal of Honor,
      // pedido explícito), pero en gris pizarra frío en vez del
      // grafito-oliva + grilla ámbar de la primera versión: ese fondo
      // negro con líneas naranjas competía de igual a igual con las
      // propias fichas (varias son doradas/naranjas/rojas) y las tapaba
      // — un terreno más neutro y frío deja que cualquier color de ficha
      // se note por contraste, sin un tinte cálido propio peleándole.
      const terreno = ctx.createLinearGradient(0, 0, W, H);
      terreno.addColorStop(0, "#3c444c"); terreno.addColorStop(0.5, "#262c32"); terreno.addColorStop(1, "#14171b");
      ctx.fillStyle = terreno;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(170,195,215,0.1)";
      ctx.lineWidth = 1;
      const paso = W * 0.018;
      for (let x = 0; x < W; x += paso) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += paso) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      ctx.globalAlpha = 0.14;
      for (let i = 0; i < 50; i++) {
        ctx.strokeStyle = i % 3 === 0 ? "#bcd4e6" : i % 3 === 1 ? "#6a7a86" : "#8fa0ac";
        ctx.lineWidth = 1 + Math.random() * 1.3;
        const x0 = Math.random() * W, y0 = Math.random() * H;
        const largo = W * (0.025 + Math.random() * 0.06);
        const ang = Math.round(Math.random() * 8) * (Math.PI / 4); // ángulos rectos/diagonales, look "circuito"
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.cos(ang) * largo, y0 + Math.sin(ang) * largo);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.strokeStyle = "rgba(210,225,235,0.5)";
      ctx.lineWidth = 0.9;
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

    // "espuma": una línea blanca finita pegada al borde mismo, adentro de
    // todo lo demás — la marca de la ola rompiendo contra la costa, como
    // en la foto de la mesa con espuma blanca en la orilla. Sutil (alpha
    // bajo, casi sin blur) para que se lea como un detalle, no un borde
    // grueso tapando el mapa.
    ctx.filter = `blur(${W * 0.0006}px)`;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#eef8fb";
    ctx.lineWidth = W * 0.0007;
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

    // rosa de los vientos náutica en una esquina, sobre agua abierta — el
    // usuario pasó una referencia (estrella de 8 puntas + anillo de
    // grados + N/S/E/W); se recrea a mano en canvas, es un motivo
    // geométrico estándar, no hace falta el vector original.
    this._dibujarRosaVientos(ctx, W * 0.9, H * 0.84, W * 0.065);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _dibujarRosaVientos(ctx, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(190,230,255,0.5)";
    ctx.lineWidth = Math.max(1, r * 0.014);

    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();

    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg * Math.PI) / 180;
      const largo = deg % 30 === 0 ? r * 0.13 : r * 0.06;
      const x1 = Math.sin(a) * r, y1 = -Math.cos(a) * r;
      const x2 = Math.sin(a) * (r - largo), y2 = -Math.cos(a) * (r - largo);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    const punta = (grados, largo, ancho, relleno) => {
      const rad = (grados * Math.PI) / 180;
      const dx = Math.sin(rad), dy = -Math.cos(rad);
      const px = -dy, py = dx;
      ctx.beginPath();
      ctx.moveTo(px * ancho, py * ancho);
      ctx.lineTo(dx * largo, dy * largo);
      ctx.lineTo(-px * ancho, -py * ancho);
      ctx.closePath();
      ctx.fillStyle = relleno; ctx.fill();
      ctx.stroke();
    };
    for (const ang of [0, 90, 180, 270]) punta(ang, r * 0.78, r * 0.09, "rgba(190,230,255,0.55)");
    for (const ang of [45, 135, 225, 315]) punta(ang, r * 0.46, r * 0.06, "rgba(190,230,255,0.3)");
    const centro = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.09);
    centro.addColorStop(0, "rgba(230,246,255,0.8)"); centro.addColorStop(1, "rgba(230,246,255,0)");
    ctx.fillStyle = centro; ctx.beginPath(); ctx.arc(0, 0, r * 0.09, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(220,240,255,0.7)";
    ctx.font = `700 ${Math.round(r * 0.24)}px Georgia, serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("N", 0, -r * 1.18);
    ctx.fillText("S", 0, r * 1.18);
    ctx.fillText("E", r * 1.18, 0);
    ctx.fillText("O", -r * 1.18, 0);
    ctx.restore();
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

  // Crea, una sola vez, una ficha (cuerpo + remate dorado) + sprite de
  // número + anillo por territorio (actualizar() sólo les cambia color/
  // texto/visibilidad, nunca las reconstruye — en TEG todo territorio
  // siempre tiene dueño). Con 256 países en el mismo tablero, mucho más
  // chicas que las de Go/Ajedrez para que no se pisen entre sí ni se
  // salgan del país que representan. Mismo material "dos tonos + oro" que
  // las fichas de Damas (materialPiezaAjedrez, ver chess3d.js) en vez de
  // la gema translúcida de antes — pedido explícito: que se vean como las
  // de Damas, no como piedras/gemas de Go.
  _crearFichas() {
    this._radioFicha = 0.075;
    const geoPiedra = this._geometriaPiedra(this._radioFicha);
    const altoPiedra = this._radioFicha * 0.62;
    const geoCap = new THREE.SphereGeometry(this._radioFicha * 0.34, 10, 8);
    const altura = 0.05 + altoPiedra;
    for (const id of Object.keys(TERRITORIOS)) {
      const { x, z } = this._posiciones[id];
      const grupo = new THREE.Group();
      grupo.position.set(x, altura, z);

      // material placeholder sin importancia: actualizar() lo reemplaza
      // apenas arranca la partida (ver comentario arriba, todo territorio
      // siempre tiene dueño) con un CLON propio del material compartido
      // (ver actualizar() más abajo) — clon propio y no la instancia
      // compartida de materialPiezaAjedrez a propósito: el hover de acá
      // (_pintarEmissive) muta el emissive del material, y si todas las
      // fichas del mismo color compartieran una sola instancia (o encima
      // la MISMA que usan las piezas reales de Ajedrez/Damas, que sale del
      // mismo cache), iluminar una de más also iluminaría a todas las
      // demás con ese color en el mapa entero.
      const cuerpo = new THREE.Mesh(geoPiedra, new THREE.MeshStandardMaterial({ color: 0x666666 }));
      cuerpo.castShadow = true; cuerpo.receiveShadow = true;
      cuerpo.userData.territorioId = id;
      grupo.add(cuerpo);

      const cap = new THREE.Mesh(geoCap, new THREE.MeshStandardMaterial({ color: 0x666666 }));
      cap.position.y = altoPiedra * 0.82;
      grupo.add(cap);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._spriteNumero("0"), transparent: true, depthTest: false, fog: false }));
      sprite.scale.set(0.12, 0.12, 1);
      sprite.position.y = this._radioFicha * 0.62 + 0.06;
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
      this._fichas[id] = { grupo, cuerpo, cap, sprite, anillo, continente: TERRITORIOS[id].continente, alturaY: altura, hoverActual: 0 };
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

  // Sólo las conexiones que le sirven al jugador EN TURNO en la fase
  // actual — antes se dibujaban las 1317 aristas del mapa entero sin
  // importar de quién eran, un empaste. En ataque: fronteras propio→enemigo
  // (por dónde puede atacar). En fortificación: sólo entre territorios
  // propios (por dónde puede reagrupar). Se recalcula al cambiar de fase/
  // turno (ver actualizar()), no en cada frame — la animación del dash sí
  // es por frame, eso sigue en _actualizarLineas.
  _recalcularLineasVisibles(teg) {
    const esPropio = (id) => teg.board[id] && teg.board[id].dueno === teg.turno;
    if (teg.fase === "ataque") {
      this._aristasVisibles = this._aristasLineas.filter(([a, b]) => esPropio(a) !== esPropio(b));
      this._colorLineas = "#d1483a"; // carmesí
    } else if (teg.fase === "fortificacion") {
      this._aristasVisibles = this._aristasLineas.filter(([a, b]) => esPropio(a) && esPropio(b));
      this._colorLineas = "#3ecf6e"; // verde
    } else {
      this._aristasVisibles = [];
    }
    this._actualizarLineas();
  }

  _actualizarLineas() {
    const ctx = this._ctxLineas, W = this._wLineas, H = this._hLineas;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -this._tiempo * 5;
    ctx.strokeStyle = this._colorLineas || "#c9a961";
    ctx.globalAlpha = 0.6;
    for (const [a, b] of this._aristasVisibles || []) {
      const [x1, y1] = this._uvPais(a, W, H), [x2, y2] = this._uvPais(b, W, H);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this._texLineas.needsUpdate = true;
  }

  // Línea de "escaneo" tipo holograma (pedido explícito, inspirado en el
  // HUD de un radar militar): una franja angosta y suave que barre el
  // tablero de punta a punta muy lento — nada de sirena, apenas un brillo
  // frío que cruza y vuelve. Se anima en _loop (posición + opacidad), no
  // hace falta redibujar ningún canvas.
  _crearEscaner() {
    const cv = document.createElement("canvas");
    cv.width = 16; cv.height = 128;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "rgba(140,220,255,0)");
    g.addColorStop(0.5, "rgba(190,238,255,0.9)");
    g.addColorStop(1, "rgba(140,220,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 128);
    const tex = new THREE.CanvasTexture(cv);

    const geo = new THREE.PlaneGeometry(this.anchoMundo * 1.02, this.profMundo * 0.05);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    });
    this._planoEscaner = new THREE.Mesh(geo, mat);
    this._planoEscaner.position.y = 0.006; // encima del mapa y las líneas, debajo de las fichas
    this._grupoTablero.add(this._planoEscaner);
  }

  // Barrido del escáner (lento, va y viene) + un glitch sutil de vez en
  // cuando (un saltito de UV + parpadeo de opacidad de un par de décimas
  // de segundo, no todo el rato — así se lee como "detalle", no como
  // falla de video). Pedido explícito: "muy sutil así se ve más
  // profesional", ambos efectos están calibrados para eso.
  _actualizarHolograma() {
    if (this._planoEscaner) {
      const ciclo = 10; // segundos por barrido completo, ida y vuelta
      const t = (this._tiempo % ciclo) / ciclo;
      const ida = t < 0.5 ? t * 2 : 2 - t * 2; // 0→1→0, va y vuelve
      this._planoEscaner.position.z = -this.profMundo / 2 + ida * this.profMundo;
      this._planoEscaner.material.opacity = 0.16 + Math.sin(ida * Math.PI) * 0.12;
    }

    if (!this._planoTierra) return;
    if (this._glitchHasta === 0 && this._tiempo > this._proximoGlitch) {
      this._glitchHasta = this._tiempo + 0.12 + Math.random() * 0.1;
    }
    if (this._glitchHasta > 0) {
      if (this._tiempo < this._glitchHasta) {
        this._planoTierra.material.map.offset.x = (Math.random() - 0.5) * 0.006;
        this._planoTierra.material.opacity = 0.85 + Math.random() * 0.15;
      } else {
        this._planoTierra.material.map.offset.x = 0;
        this._planoTierra.material.opacity = 1;
        this._glitchHasta = 0;
        this._proximoGlitch = this._tiempo + 4 + Math.random() * 5;
      }
    }
  }

  onTerritorio(cb) { this._onTerritorio = cb; }

  // `coloresPorJugador`: array de colorId (claves de PALETA_PIEDRAS), uno
  // por índice de jugador — ver PALETA_JUGADORES_TEG.colorId en este mismo
  // archivo y materialPiezaAjedrez() en chess3d.js.
  // `opciones`: { seleccion: territorioId|null, resaltados: [territorioId,...] }
  actualizar(teg, coloresPorJugador, opciones = {}) {
    for (const id of Object.keys(TERRITORIOS)) {
      const info = teg.board[id];
      const f = this._fichas[id];
      if (!f) continue;
      const colorId = coloresPorJugador[info.dueno] || "plata";
      if (f.colorActual !== colorId) {
        f.colorActual = colorId;
        const mats = materialPiezaAjedrez(colorId);
        f.cuerpo.material.dispose();
        f.cuerpo.material = mats.cuerpo.clone();
        f.cap.material.dispose();
        f.cap.material = mats.trim.clone();
        // brillo propio "de fábrica" del material, para poder restaurarlo
        // después de un hover de continente (ver _pintarEmissive) sin
        // tener que reconstruirlo a partir de un color.
        f._emisivoBase = f.cuerpo.material.emissive
          ? { color: f.cuerpo.material.emissive.clone(), intensity: f.cuerpo.material.emissiveIntensity }
          : null;
      }
      if (f.sprite.material.map) f.sprite.material.map.dispose();
      f.sprite.material.map = this._spriteNumero(String(info.ejercitos));
      f.sprite.material.needsUpdate = true;

      const esSeleccion = opciones.seleccion === id;
      const esResaltado = !!(opciones.resaltados && opciones.resaltados.includes(id));
      // En refuerzo (antes de que aparezcan las líneas de ataque/
      // fortificación) los territorios propios brillan con un aura celeste
      // pulsante — así se ve de un vistazo dónde se puede colocar, sin
      // tener que leer los 256 números uno por uno. Se apaga sola apenas
      // cambia de fase (las líneas rojas/verdes la reemplazan).
      f.esAura = teg.fase === "refuerzo" && info.dueno === teg.turno && !esSeleccion;
      if (esSeleccion) { f.anillo.material.color.set(0xffe08a); f.anillo.material.opacity = 0.95; }
      else if (esResaltado) { f.anillo.material.color.set(0xff6a4a); f.anillo.material.opacity = 0.95; }
      else if (f.esAura) { f.anillo.material.color.set(0x7fe0ff); f.anillo.material.opacity = 0.35; }
      else { f.anillo.material.opacity = 0; }
      this._pintarEmissive(f);
    }
    // Las líneas de conexión sólo se muestran en ataque/fortificación —
    // ahí es cuando importa ver quién linda con quién; en refuerzo sólo
    // suman ruido visual sobre 256 fichas. Y sólo las del jugador en
    // turno (ver _recalcularLineasVisibles), no las 1317 del mapa entero.
    if (this._planoLineas) {
      this._planoLineas.visible = teg.fase === "ataque" || teg.fase === "fortificacion";
      this._recalcularLineasVisibles(teg);
    }
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
          this._azimut -= dx * 0.006; // sin límite: se puede dar toda la vuelta, 360°
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

  // El material de la ficha (materialPiezaAjedrez) ya trae su propio brillo
  // tenue "de fábrica" (guardado en f._emisivoBase al asignarlo, ver
  // actualizar()); acá sólo se sube a un naranja fuerte cuando el
  // continente de esta ficha está en hover, y si no, se restaura ese
  // brillo propio (nunca a negro puro, o la ficha se apaga del todo).
  _pintarEmissive(f) {
    const mat = f.cuerpo.material;
    if (!mat.emissive) return;
    const on = this._continenteResaltado && f.continente === this._continenteResaltado;
    if (on) { mat.emissive.set(0xff7a2c); mat.emissiveIntensity = 0.6; }
    else if (f._emisivoBase) { mat.emissive.copy(f._emisivoBase.color); mat.emissiveIntensity = f._emisivoBase.intensity; }
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
    const objetos = Object.values(this._fichas).map((f) => f.cuerpo);
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
    const pulsoAura = 0.32 + Math.sin(this._tiempo * 2.2) * 0.16;
    for (const id in this._fichas) {
      const f = this._fichas[id];
      const objetivo = id === this._territorioHover ? SUBIDA : 0;
      f.hoverActual += (objetivo - f.hoverActual) * VELOCIDAD;
      f.grupo.position.y = f.alturaY + f.hoverActual;
      if (f.esAura) f.anillo.material.opacity = pulsoAura;
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
    this._actualizarHolograma();
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
