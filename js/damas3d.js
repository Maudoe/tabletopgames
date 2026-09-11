// ============ Tablero de Damas en 3D (Three.js) ============
// Mismo estudio oscuro + pedestal + tira LED que Go/Ajedrez (código de sala
// y cámara copiado de chess3d.js casi sin cambios — misma escena, sólo
// cambia el tablero y las piezas). Reutiliza directamente
// materialPiezaAjedrez() de chess3d.js (ese script se carga antes, ver
// index.html) para el color/material de las fichas — es genérica (toma un
// id de PALETA_PIEDRAS y devuelve {cuerpo, trim}), así las damas también
// tienen disponibles los colores "gema" (Cristal Ámbar/Azul) y "Negro/
// Blanco y Oro" que ya existen para el ajedrez, sin duplicar ese código.
//
// Paleta de tableros propia: además de un tablero clásico, dos estilos
// "luxury" pedidos explícitamente — Rojo y Negro, y Blanco y Azul, los dos
// con mármol de verdad (mismo tipo de veteado con manchas borrosas que ya
// usa dibujarMarmol() para las piedras/piezas) y borde + detalles dorados.
const PALETA_TABLEROS_DAMAS = {
  clasico: {
    nombre: "Clásico", c1: "#c9a15c", c2: "#8a6c3c", c3: "#5c3d1f",
    vetaClara: "#e8c988", vetaOscura: "#2a1a0d", lateral: "#3a2413",
  },
  rojoNegro: {
    nombre: "Rojo y Negro", c1: "#7a1018", c2: "#40100f", c3: "#0c0a0a",
    vetaClara: "#c23a3a", vetaOscura: "#000000", lateral: "#8a6a2c",
    oro: "#e8c877", marmol: true,
  },
  blancoAzul: {
    nombre: "Blanco y Azul", c1: "#eef1f6", c2: "#8fa9c4", c3: "#12305c",
    vetaClara: "#ffffff", vetaOscura: "#0a1c3a", lateral: "#c9a34a",
    oro: "#f0d99a", marmol: true,
  },
};

class DamasTablero3D {
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

    // linternas de piedra decorativas en las 4 esquinas — ver
    // habilitarLinternas()/_actualizarLinternas() más abajo (mismo modelo
    // y técnica que el Go, ver js/board3d.js).
    this._linternasHabilitadas = false;
    this._grupoLinternas = null;
    this._linternasLuces = [];
    this._linternaGLTFCache = null;
    this._texGlowLinterna = null;

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
    this._piezasListo = false;
    this._ultimoMovKey = null;

    this._rtCubo = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this._cuboCamara = new THREE.CubeCamera(0.05, 50, this._rtCubo);
    this._cuboCamara.position.set(0, 0.06, 0);
    this._frameCubo = 0;

    this._crearLuces();
    this._crearHabitacion();
    this.escena.add(this._cuboCamara);
    this._crearTableroBase("clasico");
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

  _crearHabitacion() {
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

    const acento = new THREE.PointLight(0x5b6f9c, 1.1, 16, 2);
    acento.position.set(-6, 1.4, -5);
    this.escena.add(acento);

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

    this.luzLuna = new THREE.SpotLight(0xcfe0ff, 2.6, 42, Math.PI / 6, 0.92, 1.7);
    this.luzLuna.position.copy(posLuna);
    this.luzLuna.target.position.set(0, 0, 0);
    this.luzLuna.castShadow = true;
    this.luzLuna.shadow.mapSize.set(1024, 1024);
    this.luzLuna.shadow.camera.near = 4;
    this.luzLuna.shadow.camera.far = 24;
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

  // ---- tablero: 8x8 casillas alternadas, veteado de mármol de verdad en
  // vez de vetas de madera (mismo tipo de manchas borrosas que dibujarMarmol
  // usa para las piedras, sólo que acá por casilla) — y para los estilos
  // "luxury" (cfg.marmol), una grilla dorada fina superpuesta marcando cada
  // casilla, como una incrustación de metal entre las baldosas. ----
  _texturaCasillas(tipo) {
    const cfg = PALETA_TABLEROS_DAMAS[tipo] || PALETA_TABLEROS_DAMAS.clasico;
    const N = 1024, cell = N / 8;
    const cv = document.createElement("canvas");
    cv.width = cv.height = N;
    const ctx = cv.getContext("2d");
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const clara = (x + y) % 2 === 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x * cell, y * cell, cell, cell);
        ctx.clip();
        ctx.fillStyle = clara ? cfg.c1 : cfg.c3;
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.filter = `blur(${cell * 0.12}px)`;
        const manchas = 5;
        for (let i = 0; i < manchas; i++) {
          ctx.fillStyle = i % 2 === 0 ? (clara ? cfg.vetaOscura : cfg.vetaClara) : (clara ? cfg.vetaClara : cfg.vetaOscura);
          ctx.globalAlpha = 0.16 + Math.random() * 0.16;
          const cx = x * cell + Math.random() * cell, cy = y * cell + Math.random() * cell;
          const r = cell * (0.18 + Math.random() * 0.26);
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * (0.5 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    if (cfg.marmol && cfg.oro) {
      ctx.strokeStyle = cfg.oro;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = N * 0.0026;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, N); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(N, i * cell); ctx.stroke();
      }
      ctx.globalAlpha = 1;
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
    const cfg = PALETA_TABLEROS_DAMAS[tipoTablero] || PALETA_TABLEROS_DAMAS.clasico;
    const grosor = 0.3;
    const geoBase = new THREE.BoxGeometry(8, grosor, 8);
    const texTop = this._texturaCasillas(tipoTablero);
    // luxury (mármol + oro): laterales/marco bien metálicos y dorados de
    // verdad (metalness alto), no sólo un color parecido — el "Clásico" se
    // queda con el mismo laqueado de madera de siempre.
    const dorado = !!cfg.marmol;
    const matLateral = new THREE.MeshPhysicalMaterial({
      color: cfg.lateral, roughness: dorado ? 0.22 : 0.35, metalness: dorado ? 0.85 : 0.1,
      clearcoat: 0.85, clearcoatRoughness: 0.1,
      envMap: this._rtCubo.texture, envMapIntensity: dorado ? 1.1 : 0.5,
    });
    const matTop = new THREE.MeshPhysicalMaterial({
      map: texTop, roughness: 0.1, metalness: dorado ? 0.12 : 0.05,
      clearcoat: 1, clearcoatRoughness: 0.04,
      envMap: this._rtCubo.texture, envMapIntensity: 0.9,
    });
    const base = new THREE.Mesh(geoBase, [matLateral, matLateral, matTop, matLateral, matLateral, matLateral]);
    base.position.y = -grosor / 2;
    base.receiveShadow = true;
    base.castShadow = true;

    const matMarco = matLateral;
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

    // -- pedestal + hueco con luz led (idéntico a Go/Ajedrez) --
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

    this._piezasListo = false;
    this._animaciones = [];
    this._ultimoMovKey = null;

    this._actualizarLinternas();
  }

  // Sólo el tablero de juego real llama esto (ver inicializarTablero3dDamas()
  // en app.js) — la vista previa chica del modal de configuración usa la
  // misma clase pero sin linternas.
  habilitarLinternas() { this._linternasHabilitadas = true; }

  // Cuatro linternas de piedra japonesas en las esquinas — mismo modelo y
  // técnica que en el Go/Ajedrez (ver board3d.js/chess3d.js): tablero fijo
  // de 8x8, así que las esquinas y la altura son constantes.
  _actualizarLinternas() {
    if (this._grupoLinternas) { this.escena.remove(this._grupoLinternas); this._grupoLinternas = null; }
    this._linternasLuces = [];
    if (!this._linternasHabilitadas) return;

    const grupoActual = new THREE.Group();
    this._grupoLinternas = grupoActual;
    this.escena.add(grupoActual);

    const mitad = 4.34 + 1.3;
    const esquinas = [[-mitad, -mitad], [mitad, -mitad], [-mitad, mitad], [mitad, mitad]];
    const altura = 2.2;
    const ALTURA_FUEGO_FRAC = 0.5;

    if (!this._texGlowLinterna) {
      const N = 64;
      const cv = document.createElement("canvas");
      cv.width = cv.height = N;
      const ctx = cv.getContext("2d");
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
      if (this._grupoLinternas !== grupoActual) return;
      const caja = new THREE.Box3().setFromObject(gltf.scene);
      const alto = caja.max.y - caja.min.y || 1;
      const centroX = (caja.max.x + caja.min.x) / 2;
      const centroZ = (caja.max.z + caja.min.z) / 2;
      const pisoY = caja.min.y;
      const escala = altura / alto;
      const alturaFuego = altura * ALTURA_FUEGO_FRAC;
      esquinas.forEach(([ex, ez]) => {
        const modelo = gltf.scene.clone(true);
        modelo.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          o.material = o.material.clone();
          o.material.emissiveIntensity = 2.4;
        });
        const grupo = new THREE.Group();
        modelo.position.set(-centroX, -pisoY, -centroZ);
        grupo.add(modelo);
        grupo.scale.setScalar(escala);
        grupo.position.set(ex, 0, ez);
        grupoActual.add(grupo);

        const nucleo = new THREE.Mesh(
          new THREE.SphereGeometry(altura * 0.05, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xfff2cf, toneMapped: false, fog: false })
        );
        nucleo.position.set(ex, alturaFuego, ez);
        grupoActual.add(nucleo);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this._texGlowLinterna, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, opacity: 0.95, fog: false,
        }));
        halo.userData.escalaBase = altura * 0.8;
        halo.scale.setScalar(halo.userData.escalaBase);
        halo.position.set(ex, alturaFuego, ez);
        grupoActual.add(halo);

        const luz = new THREE.PointLight(0xffb066, 2.4, 18, 2);
        luz.position.set(ex, alturaFuego, ez);
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

  cambiarTablero(tipoTablero) { this._crearTableroBase(tipoTablero); }

  _mundoDesdeCasilla(x, y) { return [x - 3.5, y - 3.5]; }
  _casillaDesdeMundo(wx, wz) {
    const x = Math.round(wx + 3.5), y = Math.round(wz + 3.5);
    if (x < 0 || y < 0 || x > 7 || y > 7) return null;
    if (Math.abs(wx + 3.5 - x) > 0.46 || Math.abs(wz + 3.5 - y) > 0.46) return null;
    return { x, y };
  }

  // ---- geometría de una ficha: un disco con un aro/sello del material
  // "trim" incrustado arriba (para los colores de dos tonos, como Negro y
  // Oro, ese sello se ve dorado; para el resto, trim===cuerpo y el sello
  // no se nota como algo aparte, sigue siendo un detalle sutil). La dama
  // es una segunda ficha más chica apilada encima — la lectura visual
  // clásica de "esto es una dama" en damas de mesa reales. ----
  _crearDisco(mats, radio, alturaBase, yBase) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio * 1.04, alturaBase, 32), mats.cuerpo);
    base.position.y = yBase + alturaBase / 2;
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(radio * 0.92, radio * 0.05, 10, 32), mats.trim);
    aro.rotation.x = Math.PI / 2;
    aro.position.y = yBase + alturaBase - 0.005;
    g.add(aro);
    const sello = new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.5, radio * 0.5, 0.014, 28), mats.trim);
    sello.position.y = yBase + alturaBase + 0.006;
    g.add(sello);
    return g;
  }

  _crearFicha(mats, esDama) {
    const g = new THREE.Group();
    const RADIO = 0.32, ALTURA = 0.13;
    g.add(this._crearDisco(mats, RADIO, ALTURA, 0));
    if (esDama) {
      g.add(this._crearDisco(mats, RADIO * 0.88, ALTURA * 0.85, ALTURA));
      g.userData.altura = ALTURA * 1.85;
    } else {
      g.userData.altura = ALTURA;
    }
    return g;
  }

  // `tablero` es una matriz [y][x] con null o { color:'blanco'|'negro', dama:bool }.
  // `opciones`: { seleccion:{x,y}, legales:[{x,y}...], capturas:[{x,y}...],
  //   ultimoMovimiento:{desde,hasta,tipo,comida}, colorBlanco, colorNegro }
  actualizar(tablero, opciones = {}) {
    this._grupoMarcas.clear();
    const colorBlanco = opciones.colorBlanco || "blanco";
    const colorNegro = opciones.colorNegro || "negro";

    const movKey = opciones.ultimoMovimiento ? JSON.stringify(opciones.ultimoMovimiento) : null;
    const esMovimientoNuevo = movKey && movKey !== this._ultimoMovKey && this._piezasListo;
    this._ultimoMovKey = movKey;
    const origen = esMovimientoNuevo ? opciones.ultimoMovimiento : null;

    this._grupoPiezas.clear();
    this._animaciones = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = tablero[y][x];
        if (!p) continue;
        const colorId = p.color === "blanco" ? colorBlanco : colorNegro;
        const mats = materialPiezaAjedrez(colorId);
        if (!mats.cuerpo.envMap) { mats.cuerpo.envMap = this._rtCubo.texture; mats.cuerpo.envMapIntensity = mats.cuerpo.transmission ? 0.9 : 0.55; mats.cuerpo.needsUpdate = true; }
        if (mats.trim !== mats.cuerpo && !mats.trim.envMap) { mats.trim.envMap = this._rtCubo.texture; mats.trim.envMapIntensity = 1.1; mats.trim.needsUpdate = true; }
        const grupo = this._crearFicha(mats, !!p.dama);

        const [wxFinal, wzFinal] = this._mundoDesdeCasilla(x, y);
        if (origen && origen.hasta.x === x && origen.hasta.y === y) {
          const [wxInicial, wzInicial] = this._mundoDesdeCasilla(origen.desde.x, origen.desde.y);
          grupo.position.set(wxInicial, 0, wzInicial);
          this._animaciones.push({ grupo, x0: wxInicial, z0: wzInicial, x1: wxFinal, z1: wzFinal, inicio: this._tiempo, duracion: 0.3, salto: origen.tipo === "captura" });
        } else {
          grupo.position.set(wxFinal, 0, wzFinal);
        }
        this._grupoPiezas.add(grupo);
      }
    }
    this._piezasListo = true;

    if (opciones.seleccion) {
      this._grupoMarcas.add(this._anillo(opciones.seleccion.x, opciones.seleccion.y, 0xe8b84b, 0.34));
    }
    if (opciones.legales) {
      for (const { x, y } of opciones.legales) this._grupoMarcas.add(this._punto(x, y, false));
    }
    if (opciones.capturas) {
      for (const { x, y } of opciones.capturas) this._grupoMarcas.add(this._punto(x, y, true));
    }
    if (opciones.ultimoMovimiento) {
      const { desde, hasta, comida } = opciones.ultimoMovimiento;
      this._grupoMarcas.add(this._anillo(desde.x, desde.y, 0xd1483a, 0.15, true));
      this._grupoMarcas.add(this._anillo(hasta.x, hasta.y, 0xd1483a, 0.15, true));
      if (comida) this._grupoMarcas.add(this._anillo(comida.x, comida.y, 0xff2a2a, 0.2, false, true));
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

  // Punto de movimiento posible: dorado normal, carmesí y un poco más
  // grande si es una casilla de captura — así se ve a simple vista dónde
  // hay que jugar cuando la captura es obligatoria.
  _punto(x, y, esCaptura) {
    const [wx, wz] = this._mundoDesdeCasilla(x, y);
    const geo = new THREE.CylinderGeometry(esCaptura ? 0.13 : 0.1, esCaptura ? 0.13 : 0.1, 0.02, 20);
    const mat = new THREE.MeshBasicMaterial({ color: esCaptura ? 0xd1483a : 0xe8b84b, toneMapped: false, transparent: true, opacity: 0.6 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(wx, 0.015, wz);
    return m;
  }

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
        const distTotal = Math.abs(e.clientX - this._inicioArrastre.x) + Math.abs(e.clientY - this._inicioArrastre.y);
        if (distTotal > 6) {
          this._movio = true;
          if (!this._vista2D) {
            const dx = e.clientX - this._ultimoPuntero.x;
            const dy = e.clientY - this._ultimoPuntero.y;
            this._azimut -= dx * 0.006; // sin límite: se puede dar toda la vuelta, 360°
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

  setColorLuzInferior(hex) {
    this._colorLuzInferior = hex;
    if (this.luzInferior) this.luzInferior.color.set(hex);
    if (this._discoGlowInferior) this._discoGlowInferior.material.color.set(hex);
    if (this._tirasSolidasInferior) this._tirasSolidasInferior.forEach((t) => t.material.color.set(hex));
  }

  _avanzarAnimaciones() {
    if (!this._animaciones.length) return;
    const vivas = [];
    for (const a of this._animaciones) {
      const t = Math.min(1, (this._tiempo - a.inicio) / a.duracion);
      const suave = 1 - Math.pow(1 - t, 3);
      a.grupo.position.x = a.x0 + (a.x1 - a.x0) * suave;
      a.grupo.position.z = a.z0 + (a.z1 - a.z0) * suave;
      // salto un poco más alto en una captura (comiendo "por arriba" de la
      // ficha comida) que en un movimiento simple, sólo para diferenciarlas
      // a simple vista.
      a.grupo.position.y = Math.sin(Math.min(1, t) * Math.PI) * (a.salto ? 0.32 : 0.2);
      if (t < 1) vivas.push(a);
      else a.grupo.position.y = 0;
    }
    this._animaciones = vivas;
  }

  resize() {
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

    const r = this._distancia;
    const cx = r * Math.sin(this._elevacion) * Math.sin(this._azimut);
    const cz = r * Math.sin(this._elevacion) * Math.cos(this._azimut);
    const cy = r * Math.cos(this._elevacion);
    this.camara.position.set(cx, cy, cz);
    this.camara.lookAt(0, 0, 0);

    this._frameCubo = (this._frameCubo + 1) % 3;
    if (this._frameCubo === 0 && this._grupoTablero) {
      this._grupoTablero.visible = false;
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
