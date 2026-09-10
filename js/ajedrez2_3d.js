// ============ "Ajedrez 2.0" — ajedrez jugable con personajes 3D ============
// Motor de reglas real (js/chess.js, el mismo que usa el Ajedrez de
// siempre — se DUPLICA la capa de interacción/UI en js/app.js, no se toca
// ni se comparte estado con el ajedrez original, así los dos conviven).
// Esta clase es sólo la vista: sala/pedestal/luz LED (mismo patrón que
// Go/Ajedrez/Damas) y los tableros de mármol + oro de Damas
// (PALETA_TABLEROS_DAMAS — pedido explícito: "reutiliza esos tableros").
// Las piezas son los personajes 3D reales (ver js/personajes/*.js) en vez
// de geometría procedural.
class Ajedrez2Tablero3D {
  constructor(contenedor) {
    this.contenedor = contenedor;

    this.escena = new THREE.Scene();
    this.escena.background = null;

    this.camara = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dom = this.renderer.domElement;
    contenedor.appendChild(this.dom);

    this._grupoPiezas = new THREE.Group();
    this._grupoMarcas = new THREE.Group();
    this._raycaster = new THREE.Raycaster();
    this._puntero = new THREE.Vector2();
    this._onCasilla = null;
    this._planoClick = null;

    this._azimut = 0.08;
    this._elevacion = 0.78;
    this._distancia = 15;
    this._zoomMin = 8.5;
    this._zoomMax = 34;
    this._arrastrando = false;
    this._ultimoPuntero = { x: 0, y: 0 };
    this._tiempo = 0;

    this._rtCubo = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this._cuboCamara = new THREE.CubeCamera(0.05, 50, this._rtCubo);
    this._cuboCamara.position.set(0, 0.06, 0);
    this._frameCubo = 0;

    this._crearLuces();
    this._crearHabitacion();
    this.escena.add(this._cuboCamara);
    this._crearTableroBase("rojoNegro");
    this.escena.add(this._grupoPiezas);
    this.escena.add(this._grupoMarcas);
    this._eventos();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  _crearLuces() {
    // Pasada de luz mucho más generosa que el resto de la casa a propósito
    // — pedido explícito y repetido ("sigo sintiendo el tablero muy oscuro,
    // cuesta distinguir a las fichas"): acá las piezas SON el contenido
    // (personajes con detalle real, no geometría simple), así que se
    // prioriza que se vean claramente por sobre el clima de estudio oscuro
    // que sí tiene sentido en Go/Ajedrez/Damas.
    const hemi = new THREE.HemisphereLight(0xaab4d6, 0x14100c, 1.1);
    this.escena.add(hemi);
    this.key = new THREE.DirectionalLight(0xfff2d8, 3.4);
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
    const fill = new THREE.DirectionalLight(0x9db4d9, 1.2);
    fill.position.set(5, 3, -4);
    this.escena.add(fill);
    // Relleno frontal suave, de frente a la cámara por defecto: sin esto
    // las piezas (sobre todo las negras, ya oscuras de por sí) se
    // comían casi toda la luz en su propia sombra frontal.
    const frente = new THREE.DirectionalLight(0xd8e4ff, 1.3);
    frente.position.set(0, 4, 14);
    this.escena.add(frente);
    // Relleno cenital, derecho de arriba: los otros focos son todos
    // laterales/frontales, así que la parte de ARRIBA de cada personaje
    // (cascos, hombros, alas) se quedaba en sombra propia — este es el que
    // más se nota cuando "cuesta distinguir a las fichas" desde la cámara
    // por default, que mira el tablero un poco desde arriba.
    const cenital = new THREE.DirectionalLight(0xf5f0e6, 1.1);
    cenital.position.set(0, 9, 0);
    this.escena.add(cenital);

    // "Luz de contra" — un par de focos cálidos detrás de cada fila de
    // piezas (no del tablero: de las piezas), apuntando hacia la cámara,
    // para separarlas del fondo oscuro con un borde de luz — pedido
    // explícito: "simular una luz atrás de las fichas negras". Se hace
    // para las dos filas (no sólo negras) porque blancas está igual de
    // lejos de la luna en la fila opuesta y se beneficia igual.
    this.contraNegras = new THREE.SpotLight(0xbfd4ff, 9, 22, Math.PI / 2.8, 0.6, 1.1);
    this.contraNegras.position.set(0, 2.6, 7.2);
    this.contraNegras.target.position.set(0, 1, 3.5);
    this.escena.add(this.contraNegras, this.contraNegras.target);

    this.contraBlancas = new THREE.SpotLight(0xffe6bf, 7.5, 22, Math.PI / 2.8, 0.6, 1.1);
    this.contraBlancas.position.set(0, 2.6, -7.2);
    this.contraBlancas.target.position.set(0, 1, -3.5);
    this.escena.add(this.contraBlancas, this.contraBlancas.target);
  }

  _crearHabitacion() {
    const PISO_Y = -1.6;
    this.escena.background = new THREE.Color(0x08080a);
    // Arranca bien más lejos que en el resto de la casa (12→22): con la
    // cámara por default a distancia 15, la fila de atrás quedaba adentro
    // de la niebla y se apagaba sola — acá no hay que perder detalle de
    // las piezas por eso.
    this.escena.fog = new THREE.Fog(0x08080a, 22, 46);

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
  }

  _texturaCasillas(tipo) {
    // idéntica a DamasTablero3D._texturaCasillas — mismo mármol/oro.
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
        for (let i = 0; i < 5; i++) {
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

    const grosorMarco = 0.34;
    const marcoGeo = new THREE.BoxGeometry(8 + grosorMarco * 2, grosor * 0.85, grosorMarco);
    const marcoN = new THREE.Mesh(marcoGeo, matLateral); marcoN.position.set(0, -grosor * 0.42, -4 - grosorMarco / 2);
    const marcoS = marcoN.clone(); marcoS.position.z = 4 + grosorMarco / 2;
    const marcoLGeo = new THREE.BoxGeometry(grosorMarco, grosor * 0.85, 8);
    const marcoE = new THREE.Mesh(marcoLGeo, matLateral); marcoE.position.set(-4 - grosorMarco / 2, -grosor * 0.42, 0);
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

    // pedestal + hueco con luz led (mismo criterio que el resto de la casa).
    const anchoTableroTotal = 8 + grosorMarco * 2;
    const HUECO = 0.55;
    const ALTURA_PEDESTAL = 0.4;
    const anchoPedestal = anchoTableroTotal * 0.94;
    const techoHueco = -grosor;
    const pisoHueco = techoHueco - HUECO;
    const colorLuz = 0x4a7fd6;

    const matPedestal = new THREE.MeshStandardMaterial({ color: cfg.lateral, roughness: 0.7, metalness: 0.08 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(anchoPedestal, ALTURA_PEDESTAL, anchoPedestal), matPedestal);
    pedestal.position.y = pisoHueco - ALTURA_PEDESTAL / 2;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    this._grupoTablero.add(pedestal);

    // -- tira de neón en el hueco (idéntica a Go/Ajedrez/Damas: un "tubo"
    // sólido nítido + un resplandor difuso encima) — se había perdido al
    // armar este archivo copiando de damas3d.js, el hueco quedaba sin luz
    // propia adentro, sólo con la luz puntual invisible. --
    if (!this._colorLuzInferior) this._colorLuzInferior = colorLuz;
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

    this._grupoPiezas.clear();
    this._piezasColocadas = null;
  }

  setColorLuzInferior(hex) {
    this._colorLuzInferior = hex;
    if (this.luzInferior) this.luzInferior.color.set(hex);
    if (this._discoGlowInferior) this._discoGlowInferior.material.color.set(hex);
    if (this._tirasSolidasInferior) this._tirasSolidasInferior.forEach((t) => t.material.color.set(hex));
  }

  cambiarTablero(tipoTablero) { this._crearTableroBase(tipoTablero); this._recolocarSiHabia(); }
  _recolocarSiHabia() { if (this._piezasColocadas) this.actualizar(this._piezasColocadas, this._opcionesActuales || {}); }

  _mundoDesdeCasilla(x, y) { return [x - 3.5, y - 3.5]; }
  _casillaDesdeMundo(wx, wz) {
    const x = Math.round(wx + 3.5), y = Math.round(wz + 3.5);
    if (x < 0 || y < 0 || x > 7 || y > 7) return null;
    if (Math.abs(wx + 3.5 - x) > 0.46 || Math.abs(wz + 3.5 - y) > 0.46) return null;
    return { x, y };
  }

  // `lista`: [{ id:'medievalKnight', x, y, equipo:'blanco'|'negro', altura, rol, giroExtra }, ...]
  // `opciones`: { seleccion:{x,y}, legales:[{x,y}...], jaqueCasilla:{x,y}|null,
  //   ultimoMovimiento:{desde:{x,y},hasta:{x,y}}|null } — mismo esquema que
  //   chess3d.js, para que el motor de reglas de js/chess.js (compartido con
  //   el ajedrez original) no tenga que saber nada de cómo se dibuja esto.
  // Cada personaje lleva un disco de color bajo los pies marcando el equipo
  // (el modelo en sí no se retiñe — son texturas pintadas a mano, cambiarles
  // el color a lo bruto se ve mal).
  actualizar(lista, opciones = {}) {
    this._piezasColocadas = lista;
    this._opcionesActuales = opciones;
    this._grupoPiezas.clear();
    this._grupoMarcas.clear();
    const ALTURA_DEFECTO = 1.05;

    const porId = {};
    lista.forEach((p) => { (porId[p.id] = porId[p.id] || []).push(p); });

    Object.keys(porId).forEach((id) => {
      window.cargarPersonajeGLTF(id, (gltf) => {
        const caja = new THREE.Box3().setFromObject(gltf.scene);
        const alto = caja.max.y - caja.min.y || 1;
        const centroX = (caja.max.x + caja.min.x) / 2;
        const pisoY = caja.min.y;

        porId[id].forEach((p) => {
          const escala = (p.altura || ALTURA_DEFECTO) / alto;
          const modelo = gltf.scene.clone(true);
          modelo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          const grupo = new THREE.Group();
          modelo.position.set(-centroX, -pisoY, 0);
          grupo.add(modelo);
          grupo.scale.setScalar(escala);

          const [wx, wz] = this._mundoDesdeCasilla(p.x, p.y);
          grupo.position.set(wx, 0, wz);
          if (p.equipo === "negro") grupo.rotation.y = Math.PI;
          // Corrección de orientación por personaje: cada .fbx de origen
          // trae su propio "frente" (no todos los exports de Tripo3D usan
          // la misma convención), así que algunos quedan de costado en vez
          // de mirar al frente con la lógica de arriba sola — `giroExtra`
          // (grados) es ese ajuste, medido a mano personaje por personaje.
          if (p.giroExtra) grupo.rotation.y += (p.giroExtra * Math.PI) / 180;
          grupo.userData.piezaInfo = { id, x: p.x, y: p.y, equipo: p.equipo, rol: p.rol };
          this._grupoPiezas.add(grupo);

          const colorEquipo = p.equipo === "negro" ? 0x1a1512 : 0xf0e6cf;
          const discoGeo = new THREE.CylinderGeometry(0.34, 0.36, 0.03, 28);
          const discoMat = new THREE.MeshPhysicalMaterial({
            color: colorEquipo, roughness: 0.25, metalness: 0.3,
            emissive: colorEquipo, emissiveIntensity: 0.12,
            envMap: this._rtCubo.texture, envMapIntensity: 0.6,
          });
          const disco = new THREE.Mesh(discoGeo, discoMat);
          disco.position.set(wx, 0.016, wz);
          disco.receiveShadow = true;
          this._grupoPiezas.add(disco);
        });
      }, (err) => console.error("No se pudo cargar el personaje " + id, err));
    });

    if (opciones.seleccion) this._grupoMarcas.add(this._anillo(opciones.seleccion.x, opciones.seleccion.y, 0xe8b84b, 0.34));
    if (opciones.legales) for (const { x, y } of opciones.legales) this._grupoMarcas.add(this._punto(x, y));
    if (opciones.ultimoMovimiento) {
      const { desde, hasta } = opciones.ultimoMovimiento;
      this._grupoMarcas.add(this._anillo(desde.x, desde.y, 0xd1483a, 0.15, true));
      this._grupoMarcas.add(this._anillo(hasta.x, hasta.y, 0xd1483a, 0.15, true));
    }
    if (opciones.jaqueCasilla) this._grupoMarcas.add(this._anillo(opciones.jaqueCasilla.x, opciones.jaqueCasilla.y, 0xff2a2a, 0.4, false, true));
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

  // Click en cualquier casilla del tablero → onCasilla(x,y). Se raycastea
  // primero contra las piezas (así clickear una pieza elevada/con partes
  // que sobresalen de su casilla sigue acertando) y si no hay nada, contra
  // el plano invisible del tablero (casilla vacía). Quién puede jugar cada
  // clic (selección propia, destino legal, deselección) lo decide
  // js/app.js — acá sólo se reporta la coordenada.
  onCasilla(cb) { this._onCasilla = cb; }

  _casillaBajoPuntero(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._puntero.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._puntero.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._puntero, this.camara);
    const hitsPiezas = this._raycaster.intersectObjects(this._grupoPiezas.children, true);
    for (const h of hitsPiezas) {
      let o = h.object;
      while (o && !o.userData.piezaInfo) o = o.parent;
      if (o) return { x: o.userData.piezaInfo.x, y: o.userData.piezaInfo.y };
    }
    if (!this._planoClick) return null;
    const hits = this._raycaster.intersectObject(this._planoClick, false);
    if (!hits.length) return null;
    const { x: wx, z: wz } = hits[0].point;
    return this._casillaDesdeMundo(wx, wz);
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
      if (!this._arrastrando) return;
      const distTotal = Math.abs(e.clientX - this._inicioArrastre.x) + Math.abs(e.clientY - this._inicioArrastre.y);
      if (distTotal > 6) {
        this._movio = true;
        const dx = e.clientX - this._ultimoPuntero.x;
        const dy = e.clientY - this._ultimoPuntero.y;
        this._azimut = Math.min(1.15, Math.max(-1.15, this._azimut - dx * 0.006));
        this._elevacion = Math.min(1.35, Math.max(0.55, this._elevacion - dy * 0.004));
      }
      this._ultimoPuntero = { x: e.clientX, y: e.clientY };
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
    this.camara.lookAt(0, 0.4, 0);

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

// ============ Visor de inspección 360° (drawer lateral) ============
// Escena chica aparte, propia, sin tablero ni pedestal: sólo el personaje
// girando sobre un pedestal simple con luz de estudio — mismo esquema de
// cámara orbital manual (arrastrar/rueda) que el resto de la casa, para
// que se sienta consistente.
class AjedrezInspector3D {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(0x0a0a0c);
    this.camara = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    contenedor.appendChild(this.renderer.domElement);

    this.escena.add(new THREE.HemisphereLight(0x9aa6c8, 0x0a0806, 0.55));
    const key = new THREE.DirectionalLight(0xfff2d8, 1.7);
    key.position.set(-3, 4, 3);
    this.escena.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 1.3);
    rim.position.set(2, 2, -4);
    this.escena.add(rim);

    // Foco cenital, como el de una vitrina de museo: un haz nítido cayendo
    // derecho de arriba sobre la pieza — pedido explícito ("luz de arriba
    // como si fuese una vitrina de colección"). Cono angosto + penumbra
    // baja para que se note como un haz definido, no una luz ambiente más.
    this.focoVitrina = new THREE.SpotLight(0xf5f2ea, 40, 9, Math.PI / 7, 0.4, 1.1);
    this.focoVitrina.position.set(0, 4.2, 0.3);
    this.focoVitrina.target.position.set(0, 0.8, 0);
    this.focoVitrina.castShadow = true;
    this.focoVitrina.shadow.mapSize.set(1024, 1024);
    this.focoVitrina.shadow.camera.near = 1;
    this.focoVitrina.shadow.camera.far = 8;
    this.focoVitrina.shadow.bias = -0.0015;
    this.escena.add(this.focoVitrina, this.focoVitrina.target);

    const pedestalGeo = new THREE.CylinderGeometry(0.9, 1, 0.15, 40);
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 0.5, metalness: 0.3 });
    this.pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    this.pedestal.position.y = -0.075;
    this.pedestal.receiveShadow = true;
    this.escena.add(this.pedestal);

    this._grupo = new THREE.Group();
    this.escena.add(this._grupo);

    this._azimut = 0.4;
    this._elevacion = 1.0;
    this._distancia = 3;
    this._zoomMin = 1.4;
    this._zoomMax = 7;
    this._autoRotar = true;
    this._arrastrando = false;
    this._ultimoPuntero = { x: 0, y: 0 };

    this._eventos();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  mostrar(id) {
    this._grupo.clear();
    window.cargarPersonajeGLTF(id, (gltf) => {
      const modelo = gltf.scene.clone(true);
      modelo.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const caja = new THREE.Box3().setFromObject(modelo);
      const size = new THREE.Vector3(); caja.getSize(size);
      const center = new THREE.Vector3(); caja.getCenter(center);
      const escala = 1.7 / (size.y || 1);
      modelo.position.set(-center.x, -caja.min.y, -center.z);
      modelo.scale.setScalar(1);
      const envoltura = new THREE.Group();
      envoltura.add(modelo);
      envoltura.scale.setScalar(escala);
      this._grupo.add(envoltura);
      this._distancia = 3;
      this._autoRotar = true;
    }, (err) => console.error("No se pudo cargar el personaje para inspección: " + id, err));
  }

  _eventos() {
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", (e) => {
      this._arrastrando = true;
      this._autoRotar = false;
      this._ultimoPuntero = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", () => { this._arrastrando = false; });
    window.addEventListener("pointermove", (e) => {
      if (!this._arrastrando) return;
      const dx = e.clientX - this._ultimoPuntero.x;
      const dy = e.clientY - this._ultimoPuntero.y;
      this._azimut -= dx * 0.007;
      this._elevacion = Math.min(1.5, Math.max(0.35, this._elevacion - dy * 0.005));
      this._ultimoPuntero = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      this._distancia = Math.min(this._zoomMax, Math.max(this._zoomMin, this._distancia + e.deltaY * 0.003));
    }, { passive: false });
  }

  resize() {
    const w = this.contenedor.clientWidth || 320;
    const h = this.contenedor.clientHeight || 320;
    this.renderer.setSize(w, h, false);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
  }

  _loop(t) {
    requestAnimationFrame(this._loop);
    if (this._autoRotar) this._azimut += 0.0035;
    const r = this._distancia;
    const cx = r * Math.sin(this._elevacion) * Math.sin(this._azimut);
    const cz = r * Math.sin(this._elevacion) * Math.cos(this._azimut);
    const cy = r * Math.cos(this._elevacion);
    this.camara.position.set(cx, cy, cz);
    this.camara.lookAt(0, 0.85, 0);
    this.renderer.render(this.escena, this.camara);
  }

  dispose() {
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }
}
