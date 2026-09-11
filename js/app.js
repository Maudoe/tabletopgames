// ============ GAMEHUB — interfaz ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const SVG_NS = "http://www.w3.org/2000/svg";

// ---------------- estado del formulario de Go ----------------
const form = {
  variante: "go",
  rival: "bot",
  nivel: 1,
  color: "negro",
  tamano: 13,
  handicap: 0,
  noresign: false,
  unicolor: false,
  colorNegro: "negro",
  colorBlanco: "blanco",
  tablero: "estandar",
  luz: "azul",
};

const NIVELES = [
  "Nivel 1 · ~30 kyu", "Nivel 2 · ~25 kyu", "Nivel 3 · ~20 kyu",
  "Nivel 4 · ~15 kyu", "Nivel 5 · ~10 kyu", "Nivel 6 · ~5 kyu",
  "Nivel 7 · ~1 kyu", "Nivel 8 · ~1 dan", "Nivel 9 · ~3 dan",
];

const DESC_VARIANTE = {
  go: "El juego clásico — rodeá territorio para ganar.",
  atari: "Muerte súbita: el primero que captura una piedra gana.",
  survival: "Sobreviví el mayor número de rondas contra el bot.",
};

// ---------------- modal: configurar Go ----------------
function abrirModalGo() {
  $("#modal-go").classList.add("abierto");
  redibujarPreview();
}
function cerrarModalGo() { $("#modal-go").classList.remove("abierto"); }

$$(".tarjeta-juego").forEach((tarjeta) => {
  tarjeta.addEventListener("click", () => {
    const juego = tarjeta.dataset.juego;
    if (juego === "go") abrirModalGo();
    else if (juego === "ajedrez") abrirModalAjedrez();
    else if (juego === "teg") abrirModalTeg();
    else if (juego === "damas") abrirModalDamas();
    else if (juego === "ajedrez2") abrirModalAjedrez2();
    else abrirModalPronto(juego);
  });
});
$("#modal-go-cerrar").addEventListener("click", cerrarModalGo);
$("#modal-go").addEventListener("click", (e) => { if (e.target.id === "modal-go") cerrarModalGo(); });

// -- pestañas de variante --
$("#tabs-variante").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-variante]");
  if (!btn) return;
  form.variante = btn.dataset.variante;
  $$("#tabs-variante button").forEach((b) => b.classList.toggle("activo", b === btn));
  $("#variante-desc").textContent = DESC_VARIANTE[form.variante];
  const esGo = form.variante === "go";
  $("#variante-pronto").classList.toggle("oculto", esGo);
  $("#form-go").classList.toggle("oculto", !esGo);
  $("#btn-jugar").disabled = !esGo;
});

// -- vs Bot / Free play --
$("#seg-rival").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-rival]");
  if (!btn) return;
  form.rival = btn.dataset.rival;
  $$("#seg-rival button").forEach((b) => b.classList.toggle("activo", b === btn));
  $("#bloque-nivel").classList.toggle("oculto", form.rival !== "bot");
  actualizarToggleNoResign();
});

// -- slider de nivel --
$("#slider-nivel").addEventListener("input", (e) => {
  form.nivel = Number(e.target.value);
  $("#nivel-texto").textContent = NIVELES[form.nivel - 1];
  const pct = ((form.nivel - 1) / 8) * 100;
  e.target.style.setProperty("--pct", pct + "%");
});

// -- tu color --
$("#seg-color").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-color]");
  if (!btn) return;
  form.color = btn.dataset.color;
  $$("#seg-color button").forEach((b) => b.classList.toggle("activo", b === btn));
});

// -- tamaño de tablero --
$("#seg-tamano").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tamano]");
  if (!btn) return;
  form.tamano = Number(btn.dataset.tamano);
  $$("#seg-tamano button").forEach((b) => b.classList.toggle("activo", b === btn));
});

// -- handicap / komi --
function actualizarKomi() {
  // Convención habitual: con handicap puesto la komi baja a 0.5 (compensación
  // mínima por la última jugada), sin handicap queda la komi estándar 7.5.
  const komi = form.handicap > 0 ? 0.5 : 7.5;
  $("#komi-texto").textContent = komi.toFixed(1);
  return komi;
}
$("#handicap-menos").addEventListener("click", () => {
  form.handicap = Math.max(0, form.handicap - 1);
  $("#handicap-valor").textContent = form.handicap;
  actualizarKomi();
});
$("#handicap-mas").addEventListener("click", () => {
  form.handicap = Math.min(9, form.handicap + 1);
  $("#handicap-valor").textContent = form.handicap;
  actualizarKomi();
});

// -- toggles --
$("#toggle-noresign").addEventListener("change", (e) => { form.noresign = e.target.checked; });
$("#toggle-unicolor").addEventListener("change", (e) => { form.unicolor = e.target.checked; });
function actualizarToggleNoResign() {
  const fila = $("#toggle-noresign").closest(".campo-fila");
  fila.classList.toggle("oculto", form.rival !== "bot");
}

// ---------------- modal: juego "muy pronto" ----------------
const NOMBRES_PRONTO = {};
function abrirModalPronto(juego) {
  const info = NOMBRES_PRONTO[juego];
  $("#pronto-icono").textContent = info.icono;
  $("#pronto-titulo").textContent = info.titulo;
  $("#pronto-desc").textContent = info.desc;
  $("#modal-pronto").classList.add("abierto");
}
$("#modal-pronto-cerrar").addEventListener("click", () => $("#modal-pronto").classList.remove("abierto"));
$("#pronto-ok").addEventListener("click", () => $("#modal-pronto").classList.remove("abierto"));
$("#modal-pronto").addEventListener("click", (e) => { if (e.target.id === "modal-pronto") $("#modal-pronto").classList.remove("abierto"); });

// ================================================================
// PARTIDA
// ================================================================
let juegoActivo = null; // "go" | "ajedrez" — qué juego está mostrando #modal-resultado ahora mismo
let partida = null;   // instancia de Go
let miColor = NEGRO;  // color que controla el humano (o NEGRO en Free play, ambos)
let esFreePlay = false;
let unicolorActivo = false;
let noresignActivo = false;
let skillBot = 0.6;
let colorNegroActivo = "negro";
let colorBlancoActivo = "blanco";
let esperandoBot = false;

let tablero3d = null;

$("#btn-jugar").addEventListener("click", () => {
  juegoActivo = "go";
  const komi = actualizarKomi();
  partida = new Go(form.tamano, komi, form.handicap);

  esFreePlay = form.rival === "libre";
  unicolorActivo = form.unicolor;
  noresignActivo = form.noresign;
  skillBot = (form.nivel - 1) / 8;

  if (form.color === "nigiri") miColor = Math.random() < 0.5 ? NEGRO : BLANCO;
  else miColor = form.color === "negro" ? NEGRO : BLANCO;

  cerrarModalGo();
  $("#vista-juegos").classList.add("oculto");
  $("#vista-tablero").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.remove("menu-fondo");
  $("#btn-pasar").disabled = false;
  $("#btn-rendirse").disabled = false;

  colorNegroActivo = form.colorNegro;
  colorBlancoActivo = form.colorBlanco;

  inicializarTablero3d();
  tablero3d.construir(form.tamano, form.tablero);
  tablero3d.setColorLuzInferior(PALETA_LUCES_INFERIOR[form.luz].color);
  dibujarTablero();
  actualizarPanel();
  turnoBotSiCorresponde();
});

$("#btn-volver").addEventListener("click", () => {
  $("#vista-tablero").classList.add("oculto");
  $("#vista-juegos").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.add("menu-fondo");
  partida = null;
});
$("#btn-nueva").addEventListener("click", () => abrirModalGo());

// ---------------- pantalla completa ----------------
// Pide pantalla completa sobre el <html> entero, no sólo la sección del
// tablero: el modal de resultado ("¡Ganaste!") es un <div> hermano fuera de
// esa sección, así que si sólo ella entraba en pantalla completa el modal
// quedaba afuera del árbol en pantalla completa y no se veía nunca (la API
// de Fullscreen sólo pinta el elemento pedido y sus descendientes). Pidiendo
// el documento completo, todo (tablero y modales) sigue viéndose igual.
$("#btn-pantalla-completa").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.addEventListener("fullscreenchange", () => {
  const enPantallaCompleta = !!document.fullscreenElement;
  const texto = enPantallaCompleta ? "⛶ Salir de pantalla completa" : "⛶ Pantalla completa";
  $("#btn-pantalla-completa").textContent = texto;
  $("#btn-pantalla-completa-ajedrez").textContent = texto;
  $("#btn-pantalla-completa-teg").textContent = texto;
  $("#btn-pantalla-completa-damas").textContent = texto;
  document.documentElement.classList.toggle("pantalla-completa", enPantallaCompleta);
  // el contenedor cambia de tamaño al entrar/salir: el canvas de Three.js
  // (o el mapa de Leaflet) no se entera solo, hay que avisarle.
  if (tablero3d) setTimeout(() => tablero3d.resize(), 60);
  if (tablero3dAjedrez) setTimeout(() => tablero3dAjedrez.resize(), 60);
  if (tablero3dDamas) setTimeout(() => tablero3dDamas.resize(), 60);
  if (mapaTeg) setTimeout(() => mapaTeg.resize(), 60);
});
$("#resultado-volver").addEventListener("click", () => {
  $("#modal-resultado").classList.remove("abierto");
  if (juegoActivo === "ajedrez") {
    $("#vista-tablero-ajedrez").classList.add("oculto");
    partidaAjedrez = null;
  } else if (juegoActivo === "teg") {
    $("#vista-tablero-teg").classList.add("oculto");
    partidaTeg = null;
  } else if (juegoActivo === "damas") {
    $("#vista-tablero-damas").classList.add("oculto");
    partidaDamas = null;
  } else if (juegoActivo === "ajedrez2") {
    $("#vista-ajedrez2").classList.add("oculto");
    partidaAjedrez2 = null;
    cerrarInspectorAjedrez2();
  } else {
    $("#vista-tablero").classList.add("oculto");
    partida = null;
  }
  $("#vista-juegos").classList.remove("oculto");
  document.body.classList.add("menu-fondo");
});
$("#resultado-nueva").addEventListener("click", () => {
  $("#modal-resultado").classList.remove("abierto");
  if (juegoActivo === "ajedrez") abrirModalAjedrez();
  else if (juegoActivo === "teg") abrirModalTeg();
  else if (juegoActivo === "damas") abrirModalDamas();
  else if (juegoActivo === "ajedrez2") abrirModalAjedrez2();
  else abrirModalGo();
});
$("#modal-resultado-cerrar").addEventListener("click", () => $("#modal-resultado").classList.remove("abierto"));

$("#btn-pasar").addEventListener("click", () => {
  if (!partida || partida.terminado || esperandoBot) return;
  partida.pasar();
  dibujarTablero();
  actualizarPanel();
  turnoBotSiCorresponde();
});

$("#btn-rendirse").addEventListener("click", () => {
  if (!partida || partida.terminado) return;
  if (!esFreePlay && !esperandoBot) {
    partida.rendirse(miColor);
  } else if (esFreePlay) {
    partida.rendirse(partida.turno);
  } else {
    return; // no se puede rendir en medio del turno del bot
  }
  dibujarTablero();
  actualizarPanel();
});

function esTurnoDelHumano() {
  if (esFreePlay) return true;
  return partida.turno === miColor;
}

function turnoBotSiCorresponde() {
  if (!partida || partida.terminado || esFreePlay) return;
  if (partida.turno === miColor) return;
  esperandoBot = true;
  $("#btn-pasar").disabled = true;
  $("#btn-rendirse").disabled = true;
  actualizarPanel(); // ya puede mostrar "el bot está pensando…" acá
  (async () => {
    if (!partida || partida.terminado) { esperandoBot = false; return; }
    const colorBot = partida.turno;
    if (!noresignActivo && botDeberiaRendirse(partida, colorBot, skillBot)) {
      partida.rendirse(colorBot);
      esperandoBot = false;
      $("#btn-pasar").disabled = false;
      $("#btn-rendirse").disabled = false;
      dibujarTablero();
      actualizarPanel();
      return;
    }
    // jugadaDelBot ahora piensa de verdad (MCTS, ver js/gobot.js): tarda un
    // rato real, no hace falta simular una demora artificial encima. La
    // envuelve un techo de tiempo duro (ver motorbot.js): por más que la
    // búsqueda ceda el control seguido, algún tablero particular podría
    // hacer que tarde de más — así la UI nunca se queda esperando colgada,
    // en el peor caso el bot termina jugando una legal al azar.
    const jugada = await conTechoDeTiempo(
      jugadaDelBot(partida, colorBot, skillBot),
      presupuestoPensadaMs(skillBot) + 2000,
      () => jugadaDelBot(partida, colorBot, 0)
    );
    if (jugada) partida.jugar(jugada.x, jugada.y);
    else partida.pasar();
    esperandoBot = false;
    $("#btn-pasar").disabled = false;
    $("#btn-rendirse").disabled = false;
    dibujarTablero();
    actualizarPanel();
    // si el bot pasó y ahora sigue el bot de nuevo (no debería, pero por
    // las dudas) o si por algún motivo sigue sin ser el turno humano:
    if (!partida.terminado && partida.turno !== miColor && !esFreePlay) turnoBotSiCorresponde();
  })();
}

function alClickTablero(x, y) {
  if (!partida || partida.terminado) return;
  if (esperandoBot) return;
  if (!esTurnoDelHumano()) return;
  const r = partida.jugar(x, y);
  if (!r.ok) return; // jugada ilegal: no hace nada, sin pop-ups molestos
  dibujarTablero();
  actualizarPanel();
  turnoBotSiCorresponde();
}

function actualizarPanel() {
  const piedra = $("#turno-piedra");
  const texto = $("#turno-texto");
  if (partida.terminado) {
    texto.textContent = "Partida terminada";
    piedra.style.background = "linear-gradient(135deg, var(--oro-claro), var(--oro-oscuro))";
  } else {
    const esNegro = partida.turno === NEGRO;
    piedra.style.background = esNegro ? "radial-gradient(circle at 35% 30%, #3a352c, #050403)" : "radial-gradient(circle at 35% 30%, #ffffff, #d8cdb4)";
    const quien = esFreePlay ? (esNegro ? "Negro" : "Blanco") : (partida.turno === miColor ? "Tu turno" : (esperandoBot ? "El bot está pensando…" : "Turno del bot"));
    texto.textContent = esFreePlay ? `${quien} juega` : quien;
  }
  $("#cap-negro").textContent = partida.capturas[NEGRO];
  $("#cap-blanco").textContent = partida.capturas[BLANCO];
  $("#komi-chip").textContent = partida.komi.toFixed(1);
  $("#mov-chip").textContent = partida.movimientos;

  if (partida.terminado) {
    $("#btn-pasar").disabled = true;
    $("#btn-rendirse").disabled = true;
    mostrarResultado();
  }
}

function mostrarResultado() {
  const r = partida.resultado;
  const nombreGanador = r.ganador === NEGRO ? "Negro" : "Blanco";
  let titulo;
  if (esFreePlay) {
    titulo = `Gana ${nombreGanador}`;
  } else {
    titulo = r.ganador === miColor ? "¡Ganaste!" : "Perdiste";
  }
  let detalle;
  if (r.motivo === "renuncia") {
    detalle = esFreePlay
      ? "Partida ganada por renuncia del rival."
      : (r.ganador === miColor ? "El bot se rindió." : "Te rendiste.");
  } else {
    detalle = `Negro ${r.puntosNegro.toFixed(1)} — Blanco ${r.puntosBlanco.toFixed(1)} (incluye ${partida.komi.toFixed(1)} de komi)`;
  }
  if (!esFreePlay) detalle += ` · Jugaste con ${miColor === NEGRO ? "negro" : "blanco"}`;
  $("#mensaje-final-titulo").textContent = titulo;
  $("#mensaje-final-detalle").textContent = detalle;
  const piedraIcono = $("#resultado-piedra");
  piedraIcono.style.background = r.ganador === NEGRO
    ? "radial-gradient(circle at 35% 28%, #4a453a, #141210 55%, #000 100%)"
    : "radial-gradient(circle at 35% 28%, #ffffff, #eee4cf 60%, #c9bda0 100%)";
  // pequeño respiro antes de mostrar el modal: que se vea el tablero final
  // un instante y después aparezca el veredicto, no todo de golpe.
  setTimeout(() => $("#modal-resultado").classList.add("abierto"), 260);
}

// ================================================================
// TABLERO — Three.js (ver js/board3d.js)
// ================================================================
function inicializarTablero3d() {
  if (tablero3d) return;
  tablero3d = new Tablero3D($("#tablero-madera"));
  tablero3d.habilitarLinternas();
  tablero3d.onCelda((x, y) => alClickTablero(x, y));
  tablero3d.dom.addEventListener("pointermove", () => {
    if (!partida || partida.terminado || esperandoBot || !esTurnoDelHumano()) {
      tablero3d.ocultarFantasma();
      return;
    }
    const turnoActual = esFreePlay ? partida.turno : miColor;
    tablero3d.mostrarFantasma(turnoActual === NEGRO ? colorNegroActivo : colorBlancoActivo);
  });
  tablero3d.dom.addEventListener("pointerleave", () => tablero3d.ocultarFantasma());
}

function dibujarTablero() {
  tablero3d.actualizar(partida, { unicolor: unicolorActivo, colorNegro: colorNegroActivo, colorBlanco: colorBlancoActivo });
  tablero3d.resize();
}

// ================================================================
// SELECTOR DE COLORES DE PIEDRA Y TIPO DE TABLERO
// ================================================================
// Arma las filas de muestras (colores de piedra y tipos de tablero) y la
// vista previa grande, usando las mismas funciones de dibujo que el
// tablero 3D (dibujarMarmol, PALETA_PIEDRAS, PALETA_TABLEROS en board3d.js)
// para que la muestra sea fiel a como se va a ver de verdad.

function construirSwatchesPiedra(contenedorId, grupoForm, estado = form, alCambiar = redibujarPreview, claseExtra = "") {
  const cont = $("#" + contenedorId);
  Object.keys(PALETA_PIEDRAS).forEach((id) => {
    const cfg = PALETA_PIEDRAS[id];
    const btn = document.createElement("button");
    btn.className = "swatch-piedra" + (claseExtra ? " " + claseExtra : "") + (estado[grupoForm] === id ? " activo" : "");
    btn.title = cfg.nombre;
    btn.dataset.color = id;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 40;
    dibujarMarmol(cv.getContext("2d"), 40, cfg);
    btn.append(cv);
    btn.addEventListener("click", () => {
      estado[grupoForm] = id;
      $$("#" + contenedorId + " .swatch-piedra").forEach((b) => b.classList.toggle("activo", b === btn));
      alCambiar();
    });
    cont.append(btn);
  });
}

function construirSwatchesTablero(contenedorId = "swatches-tablero", estado = form, alCambiar = redibujarPreview, paleta = PALETA_TABLEROS) {
  const cont = $("#" + contenedorId);
  Object.keys(paleta).forEach((id) => {
    const cfg = paleta[id];
    const btn = document.createElement("button");
    btn.className = "swatch-tablero" + (estado.tablero === id ? " activo" : "");
    btn.dataset.tablero = id;
    const cv = document.createElement("canvas");
    cv.width = 116; cv.height = 80;
    dibujarSwatchTablero(cv.getContext("2d"), 116, 80, cfg);
    btn.append(cv);
    const etq = document.createElement("span");
    etq.className = "etiqueta";
    etq.textContent = cfg.nombre;
    btn.append(etq);
    btn.addEventListener("click", () => {
      estado.tablero = id;
      $$("#" + contenedorId + " .swatch-tablero").forEach((b) => b.classList.toggle("activo", b === btn));
      alCambiar();
    });
    cont.append(btn);
  });
}

// Fondo de madera simple para la muestra de tablero (sin grilla, se lee
// igual de bien y no depende de un tamaño de tablero particular).
function dibujarSwatchTablero(ctx, w, h, cfg) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, cfg.c1); grad.addColorStop(0.5, cfg.c2); grad.addColorStop(1, cfg.c3);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = i % 2 ? cfg.vetaOscura : cfg.vetaClara;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const y0 = (i / 6) * h + (Math.random() - 0.5) * 6;
    ctx.moveTo(0, y0);
    ctx.bezierCurveTo(w * 0.33, y0 + (Math.random() - 0.5) * 8, w * 0.66, y0 + (Math.random() - 0.5) * 8, w, y0 + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Vista previa: una instancia chica del tablero 3D de verdad (mismas luces,
// mismos materiales que el juego real), con un puñado de piedras de cada
// color — así se ve exactamente lo que se va a ver al jugar, no una
// aproximación plana. Se crea recién al abrir el modal la primera vez (no
// al cargar la página) para no tener una escena 3D de más corriendo sin
// que nadie la vea.
let previewGo3D = null;
function asegurarPreviewGo3D() {
  if (previewGo3D) return previewGo3D;
  previewGo3D = new Tablero3D($("#preview-tablero"));
  return previewGo3D;
}
function redibujarPreview() {
  const t3d = asegurarPreviewGo3D();
  const primerArmado = t3d.tipoTablero !== form.tablero;
  t3d.construir(5, form.tablero);
  // construir() recalcula la distancia/zoom por defecto pensados para el
  // tablero real (lejos, para que entre entero) — acá se pisa con un
  // encuadre cerrado de vitrina, pero sólo la primera vez que se arma este
  // tablero: si el usuario ya giró/acercó la cámara arrastrando, un cambio
  // de color de tablero no debería resetearle la vista.
  if (primerArmado) {
    t3d._distancia = 5.6;
    t3d._elevacion = 0.85;
    t3d._azimut = 0.5;
  }
  t3d._zoomMin = 3;
  t3d._zoomMax = 10;
  t3d.setColorLuzInferior(PALETA_LUCES_INFERIOR[form.luz].color);
  const partidaFalsa = {
    size: 5,
    board: new Array(25).fill(0),
    idx: (x, y) => y * 5 + x,
    ultimaJugada: null,
  };
  partidaFalsa.board[partidaFalsa.idx(1, 2)] = 1; // negro
  partidaFalsa.board[partidaFalsa.idx(3, 2)] = 2; // blanco
  t3d.actualizar(partidaFalsa, { colorNegro: form.colorNegro, colorBlanco: form.colorBlanco, unicolor: form.unicolor });
  t3d.resize();
}

// Muestras de color para la luz bajo el tablero: son colores lisos (es una
// luz, no una piedra), así que van directo como fondo del botón, sin pasar
// por canvas/dibujarMarmol como el resto de las muestras.
function construirSwatchesLuz(contenedorId, estado, alCambiar) {
  const cont = $("#" + contenedorId);
  Object.keys(PALETA_LUCES_INFERIOR).forEach((id) => {
    const cfg = PALETA_LUCES_INFERIOR[id];
    const btn = document.createElement("button");
    btn.className = "swatch-piedra" + (estado.luz === id ? " activo" : "");
    btn.title = cfg.nombre;
    btn.style.background = cfg.color;
    btn.addEventListener("click", () => {
      estado.luz = id;
      $$("#" + contenedorId + " .swatch-piedra").forEach((b) => b.classList.toggle("activo", b === btn));
      if (alCambiar) alCambiar();
    });
    cont.append(btn);
  });
}

construirSwatchesPiedra("swatches-negro", "colorNegro");
construirSwatchesPiedra("swatches-blanco", "colorBlanco");
construirSwatchesTablero();
construirSwatchesLuz("swatches-luz", form, redibujarPreview);

// ---------------- estado inicial del formulario ----------------
$("#slider-nivel").style.setProperty("--pct", "0%");
actualizarToggleNoResign();

// ================================================================
// AJEDREZ — mismo patrón que Go de arriba (modal de configuración, tablero
// 3D en la misma habitación washitsu, bot con nivel/rendición, modal de
// resultado), pero con su propio estado: nada acá toca `form`/`partida` de
// Go, así que las dos partidas conviven sin pisarse.
// ================================================================
const formAjedrez = {
  rival: "bot",
  nivel: 1,
  color: "blanco",
  noresign: false,
  colorBlancas: "blanco",
  colorNegras: "negro",
  tablero: "madera",
  luz: "azul",
};

function abrirModalAjedrez() { $("#modal-ajedrez").classList.add("abierto"); redibujarPreviewAjedrez(); }
function cerrarModalAjedrez() { $("#modal-ajedrez").classList.remove("abierto"); }
$("#modal-ajedrez-cerrar").addEventListener("click", cerrarModalAjedrez);
$("#modal-ajedrez").addEventListener("click", (e) => { if (e.target.id === "modal-ajedrez") cerrarModalAjedrez(); });

$("#seg-rival-ajedrez").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-rival]");
  if (!btn) return;
  formAjedrez.rival = btn.dataset.rival;
  $$("#seg-rival-ajedrez button").forEach((b) => b.classList.toggle("activo", b === btn));
  $("#bloque-nivel-ajedrez").classList.toggle("oculto", formAjedrez.rival !== "bot");
  actualizarToggleNoResignAjedrez();
});

$("#slider-nivel-ajedrez").addEventListener("input", (e) => {
  formAjedrez.nivel = Number(e.target.value);
  $("#nivel-texto-ajedrez").textContent = NIVELES[formAjedrez.nivel - 1];
  const pct = ((formAjedrez.nivel - 1) / 8) * 100;
  e.target.style.setProperty("--pct", pct + "%");
});

$("#seg-color-ajedrez").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-color]");
  if (!btn) return;
  formAjedrez.color = btn.dataset.color;
  $$("#seg-color-ajedrez button").forEach((b) => b.classList.toggle("activo", b === btn));
});

$("#toggle-noresign-ajedrez").addEventListener("change", (e) => { formAjedrez.noresign = e.target.checked; });
function actualizarToggleNoResignAjedrez() {
  const fila = $("#toggle-noresign-ajedrez").closest(".campo-fila");
  fila.classList.toggle("oculto", formAjedrez.rival !== "bot");
}

// ---------------- partida ----------------
let partidaAjedrez = null;
let miColorAjedrez = BLANCO;
let esFreePlayAjedrez = false;
let noresignActivoAjedrez = false;
let skillBotAjedrez = 0.6;
let colorBlancasActivo = "blanco";
let colorNegrasActivo = "negro";
let esperandoBotAjedrez = false;
let seleccionAjedrez = null;
let legalesAjedrez = [];

let tablero3dAjedrez = null;

const TIPO_PIEZA_VISTA = { P: "peon", N: "caballo", B: "alfil", R: "torre", Q: "reina", K: "rey" };

$("#btn-jugar-ajedrez").addEventListener("click", () => {
  juegoActivo = "ajedrez";
  partidaAjedrez = new Ajedrez();

  esFreePlayAjedrez = formAjedrez.rival === "libre";
  noresignActivoAjedrez = formAjedrez.noresign;
  skillBotAjedrez = (formAjedrez.nivel - 1) / 8;
  seleccionAjedrez = null;
  legalesAjedrez = [];

  if (formAjedrez.color === "nigiri") miColorAjedrez = Math.random() < 0.5 ? BLANCO : NEGRO;
  else miColorAjedrez = formAjedrez.color === "blanco" ? BLANCO : NEGRO;

  cerrarModalAjedrez();
  $("#vista-juegos").classList.add("oculto");
  $("#vista-tablero-ajedrez").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.remove("menu-fondo");
  $("#btn-rendirse-ajedrez").disabled = false;

  colorBlancasActivo = formAjedrez.colorBlancas;
  colorNegrasActivo = formAjedrez.colorNegras;

  inicializarTablero3dAjedrez();
  tablero3dAjedrez.cambiarTablero(formAjedrez.tablero);
  tablero3dAjedrez.setColorLuzInferior(PALETA_LUCES_INFERIOR[formAjedrez.luz].color);
  dibujarTableroAjedrez();
  actualizarPanelAjedrez();
  turnoBotAjedrezSiCorresponde();
});

$("#btn-volver-ajedrez").addEventListener("click", () => {
  $("#vista-tablero-ajedrez").classList.add("oculto");
  $("#vista-juegos").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.add("menu-fondo");
  partidaAjedrez = null;
});
$("#btn-nueva-ajedrez").addEventListener("click", () => abrirModalAjedrez());

$("#btn-pantalla-completa-ajedrez").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

$("#btn-rendirse-ajedrez").addEventListener("click", () => {
  if (!partidaAjedrez || partidaAjedrez.terminado) return;
  if (!esFreePlayAjedrez && !esperandoBotAjedrez) {
    partidaAjedrez.rendirse(miColorAjedrez);
  } else if (esFreePlayAjedrez) {
    partidaAjedrez.rendirse(partidaAjedrez.turno);
  } else {
    return; // no se puede rendir en medio del turno del bot
  }
  seleccionAjedrez = null; legalesAjedrez = [];
  dibujarTableroAjedrez();
  actualizarPanelAjedrez();
});

function esTurnoDelHumanoAjedrez() {
  if (esFreePlayAjedrez) return true;
  return partidaAjedrez.turno === miColorAjedrez;
}

function turnoBotAjedrezSiCorresponde() {
  if (!partidaAjedrez || partidaAjedrez.terminado || esFreePlayAjedrez) return;
  if (partidaAjedrez.turno === miColorAjedrez) return;
  esperandoBotAjedrez = true;
  $("#btn-rendirse-ajedrez").disabled = true;
  actualizarPanelAjedrez(); // ya puede mostrar "el bot está pensando…" acá
  (async () => {
    if (!partidaAjedrez || partidaAjedrez.terminado) { esperandoBotAjedrez = false; return; }
    const colorBot = partidaAjedrez.turno;
    if (!noresignActivoAjedrez && botDeberiaRendirseAjedrez(partidaAjedrez, colorBot, skillBotAjedrez)) {
      partidaAjedrez.rendirse(colorBot);
      esperandoBotAjedrez = false;
      $("#btn-rendirse-ajedrez").disabled = false;
      dibujarTableroAjedrez();
      actualizarPanelAjedrez();
      return;
    }
    // jugadaDelAjedrez ahora piensa de verdad (minimax + poda alfa-beta, ver
    // js/chess.js): tarda un rato real, no hace falta simular una demora
    // artificial encima. Mismo techo de tiempo duro que Go (ver motorbot.js)
    // para que la UI nunca quede esperando colgada.
    const jugada = await conTechoDeTiempo(
      jugadaDelAjedrez(partidaAjedrez, colorBot, skillBotAjedrez),
      presupuestoPensadaMs(skillBotAjedrez) + 2000,
      () => jugadaDelAjedrez(partidaAjedrez, colorBot, 0)
    );
    if (jugada) {
      const r = partidaAjedrez.mover(jugada.desde, jugada.hasta, "Q");
      if (r.ok) sonidoFichaAjedrez(!!r.capturada);
    }
    esperandoBotAjedrez = false;
    $("#btn-rendirse-ajedrez").disabled = false;
    dibujarTableroAjedrez();
    actualizarPanelAjedrez();
  })();
}

function alClickCasillaAjedrez(x, y) {
  if (!partidaAjedrez || partidaAjedrez.terminado) return;
  if (esperandoBotAjedrez) return;
  if (!esTurnoDelHumanoAjedrez()) return;

  const pieza = partidaAjedrez.pieza(x, y);

  if (seleccionAjedrez) {
    if (seleccionAjedrez.x === x && seleccionAjedrez.y === y) {
      seleccionAjedrez = null; legalesAjedrez = [];
      dibujarTableroAjedrez();
      return;
    }
    const destino = legalesAjedrez.find((m) => m.hasta.x === x && m.hasta.y === y);
    if (destino) {
      const r = partidaAjedrez.mover(seleccionAjedrez, { x, y });
      seleccionAjedrez = null; legalesAjedrez = [];
      if (r.ok) {
        sonidoFichaAjedrez(!!r.capturada);
        dibujarTableroAjedrez();
        actualizarPanelAjedrez();
        turnoBotAjedrezSiCorresponde();
      } else {
        dibujarTableroAjedrez();
      }
      return;
    }
  }

  if (pieza && pieza.color === partidaAjedrez.turno) {
    seleccionAjedrez = { x, y };
    legalesAjedrez = partidaAjedrez.movimientosLegales(x, y);
  } else {
    seleccionAjedrez = null; legalesAjedrez = [];
  }
  dibujarTableroAjedrez();
}

function actualizarPanelAjedrez() {
  const piedra = $("#turno-piedra-ajedrez");
  const texto = $("#turno-texto-ajedrez");
  if (partidaAjedrez.terminado) {
    texto.textContent = "Partida terminada";
    piedra.style.background = "linear-gradient(135deg, var(--oro-claro), var(--oro-oscuro))";
  } else {
    const esBlanco = partidaAjedrez.turno === BLANCO;
    piedra.style.background = esBlanco
      ? "radial-gradient(circle at 35% 30%, #ffffff, #d8cdb4)"
      : "radial-gradient(circle at 35% 30%, #3a352c, #050403)";
    const quien = esFreePlayAjedrez
      ? (esBlanco ? "Blancas juegan" : "Negras juegan")
      : (partidaAjedrez.turno === miColorAjedrez ? "Tu turno" : (esperandoBotAjedrez ? "El bot está pensando…" : "Turno del bot"));
    texto.textContent = quien;
  }
  $("#cap-blancas").textContent = partidaAjedrez.capturas[BLANCO].length;
  $("#cap-negras").textContent = partidaAjedrez.capturas[NEGRO].length;
  $("#mov-chip-ajedrez").textContent = partidaAjedrez.movimientos;
  // cuántas jugadas legales tiene cada color en esta posición — no sólo el
  // que le toca jugar, los dos, para poder comparar de un vistazo.
  $("#disp-blancas").textContent = partidaAjedrez.todosMovimientosLegales(BLANCO).length;
  $("#disp-negras").textContent = partidaAjedrez.todosMovimientosLegales(NEGRO).length;

  if (partidaAjedrez.terminado) {
    $("#btn-rendirse-ajedrez").disabled = true;
    mostrarResultadoAjedrez();
  }
}

function mostrarResultadoAjedrez() {
  const r = partidaAjedrez.resultado;
  const nombreColor = (c) => (c === BLANCO ? "Blancas" : "Negras");
  let titulo, detalle;

  if (r.ganador === null) {
    titulo = "Tablas";
    const motivos = {
      ahogado: "Ahogado — sin jugadas legales, sin estar en jaque.",
      material_insuficiente: "Tablas por material insuficiente para dar mate.",
      repeticion: "Tablas por repetición de posición.",
    };
    detalle = motivos[r.motivo] || "Partida en tablas.";
  } else if (esFreePlayAjedrez) {
    titulo = `Ganan las ${nombreColor(r.ganador).toLowerCase()}`;
    detalle = r.motivo === "jaqueMate" ? "Jaque mate." : "Partida ganada por renuncia del rival.";
  } else {
    titulo = r.ganador === miColorAjedrez ? "¡Ganaste!" : "Perdiste";
    const motivoTxt = r.motivo === "jaqueMate"
      ? "Jaque mate."
      : (r.ganador === miColorAjedrez ? "El bot se rindió." : "Te rendiste.");
    detalle = `${motivoTxt} · Jugaste con ${miColorAjedrez === BLANCO ? "blancas" : "negras"}`;
  }

  $("#mensaje-final-titulo").textContent = titulo;
  $("#mensaje-final-detalle").textContent = detalle;
  const piedraIcono = $("#resultado-piedra");
  if (r.ganador === null) {
    piedraIcono.style.background = "linear-gradient(135deg, var(--oro-claro), var(--oro-oscuro))";
  } else {
    piedraIcono.style.background = r.ganador === BLANCO
      ? "radial-gradient(circle at 35% 28%, #ffffff, #eee4cf 60%, #c9bda0 100%)"
      : "radial-gradient(circle at 35% 28%, #4a453a, #141210 55%, #000 100%)";
  }
  setTimeout(() => $("#modal-resultado").classList.add("abierto"), 260);
}

// ================================================================
// TABLERO — Three.js (ver js/chess3d.js)
// ================================================================
function inicializarTablero3dAjedrez() {
  if (tablero3dAjedrez) return;
  tablero3dAjedrez = new ChessTablero3D($("#tablero-ajedrez-madera"));
  tablero3dAjedrez.habilitarLinternas();
  tablero3dAjedrez.onCasilla((x, y) => alClickCasillaAjedrez(x, y));
}

function tableroAjedrezParaVista(ajedrez) {
  const filas = [];
  for (let y = 0; y < 8; y++) {
    const fila = [];
    for (let x = 0; x < 8; x++) {
      const p = ajedrez.pieza(x, y);
      fila.push(p ? { tipo: TIPO_PIEZA_VISTA[p.tipo], color: p.color === BLANCO ? "blanco" : "negro" } : null);
    }
    filas.push(fila);
  }
  return filas;
}

function dibujarTableroAjedrez() {
  const tablero = tableroAjedrezParaVista(partidaAjedrez);
  let jaqueCasilla = null;
  if (!partidaAjedrez.terminado && partidaAjedrez.estaEnJaque(partidaAjedrez.turno)) {
    jaqueCasilla = partidaAjedrez.encontrarRey(partidaAjedrez.turno);
  }
  tablero3dAjedrez.actualizar(tablero, {
    seleccion: seleccionAjedrez,
    legales: legalesAjedrez.map((m) => m.hasta),
    ultimoMovimiento: partidaAjedrez.ultimoMovimiento,
    jaqueCasilla,
    colorBlanco: colorBlancasActivo,
    colorNegro: colorNegrasActivo,
  });
  tablero3dAjedrez.resize();
}

// ---------------- selector de colores de pieza y tipo de tablero ----------------
// Silueta de peón (cabeza + collar + cuerpo + base), para que la vista
// previa de ajedrez muestre piezas con forma de ficha de ajedrez en vez de
// las fichas circulares que usa la vista previa de Go — si no, con el mismo
// swatch redondo, el modal de ajedrez se leía como "el mismo modal de Go
// pero con otro título" en vez de algo específico del juego.
function trazarSiluetaPeon(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy + r * 0.72);
  ctx.lineTo(cx + r * 0.62, cy + r * 0.72);
  ctx.lineTo(cx + r * 0.42, cy + r * 0.4);
  ctx.lineTo(cx + r * 0.22, cy + r * 0.02);
  ctx.arc(cx, cy + r * 0.02, r * 0.22, 0, Math.PI, true);
  ctx.lineTo(cx - r * 0.42, cy + r * 0.4);
  ctx.closePath();
  ctx.moveTo(cx + r * 0.42, cy - r * 0.34);
  ctx.arc(cx, cy - r * 0.34, r * 0.42, 0, Math.PI * 2);
}

let previewAjedrez3D = null;
function asegurarPreviewAjedrez3D() {
  if (previewAjedrez3D) return previewAjedrez3D;
  previewAjedrez3D = new ChessTablero3D($("#preview-tablero-ajedrez"));
  previewAjedrez3D._distancia = 6.2;
  previewAjedrez3D._elevacion = 0.78;
  previewAjedrez3D._azimut = 0.35;
  previewAjedrez3D._zoomMin = 3.5;
  previewAjedrez3D._zoomMax = 12;
  return previewAjedrez3D;
}
function redibujarPreviewAjedrez() {
  const t3d = asegurarPreviewAjedrez3D();
  t3d.cambiarTablero(formAjedrez.tablero);
  t3d.setColorLuzInferior(PALETA_LUCES_INFERIOR[formAjedrez.luz].color);
  const tableroFalso = Array.from({ length: 8 }, () => new Array(8).fill(null));
  tableroFalso[4][3] = { tipo: "reina", color: "blanco" };
  tableroFalso[4][4] = { tipo: "reina", color: "negro" };
  t3d.actualizar(tableroFalso, { colorBlanco: formAjedrez.colorBlancas, colorNegro: formAjedrez.colorNegras });
  t3d.resize();
}

construirSwatchesPiedra("swatches-blancas-ajedrez", "colorBlancas", formAjedrez, redibujarPreviewAjedrez, "swatch-pieza");
construirSwatchesPiedra("swatches-negras-ajedrez", "colorNegras", formAjedrez, redibujarPreviewAjedrez, "swatch-pieza");
construirSwatchesTablero("swatches-tablero-ajedrez", formAjedrez, redibujarPreviewAjedrez, PALETA_TABLEROS_AJEDREZ);
construirSwatchesLuz("swatches-luz-ajedrez", formAjedrez, redibujarPreviewAjedrez);

$("#slider-nivel-ajedrez").style.setProperty("--pct", "0%");
actualizarToggleNoResignAjedrez();

// ================================================================
// OPCIONES DE AJEDREZ — vista 2D/3D, música y efectos de sonido
// ================================================================
$("#btn-opciones-ajedrez").addEventListener("click", () => $("#modal-opciones-ajedrez").classList.add("abierto"));
$("#modal-opciones-cerrar").addEventListener("click", () => $("#modal-opciones-ajedrez").classList.remove("abierto"));
$("#modal-opciones-ajedrez").addEventListener("click", (e) => { if (e.target.id === "modal-opciones-ajedrez") $("#modal-opciones-ajedrez").classList.remove("abierto"); });

$("#seg-vista-ajedrez").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-vista]");
  if (!btn) return;
  $$("#seg-vista-ajedrez button").forEach((b) => b.classList.toggle("activo", b === btn));
  if (tablero3dAjedrez) tablero3dAjedrez.setVista(btn.dataset.vista);
});

// Reproductor de música: playlist barajada una vez (no un sorteo nuevo en
// cada pista, para poder tener "anterior/siguiente" de verdad y no sólo
// "otra al azar"), con botones visibles en la cabecera del tablero — antes
// era sólo un toggle escondido adentro de Opciones. El estado real del
// botón (▶/⏸) se sincroniza con los eventos nativos play/pause/ended del
// <audio>, no con una bandera propia: así, si el navegador bloquea el
// autoplay (política de gesto de usuario), el botón vuelve solo a mostrar
// "reproducir" en vez de mentir que está sonando cuando en realidad no.
const PISTAS_MUSICA_AJEDREZ = [
  "assets/music/chess-master-gambit.mp3",
  "assets/music/the-red-queen.mp3",
  "assets/music/the-mad-queen.mp3",
  "assets/music/commit-watch.mp3",
  "assets/music/commit-watch-1.mp3",
  "assets/music/encrypted-rain-1.mp3",
  "assets/music/encrypted-rain-stolen.mp3",
  "assets/music/khronos-command-core.mp3",
  "assets/music/khronos-command-core-1.mp3",
  "assets/music/khronos-core.mp3",
  "assets/music/khronos-core-1.mp3",
  "assets/music/khronos-grid.mp3",
  "assets/music/khronos-grid-1.mp3",
  "assets/music/khronos-red-king.mp3",
  "assets/music/khronos-red-queen.mp3",
  "assets/music/neon-watchtower-day.mp3",
  "assets/music/neon-watchtower-night.mp3",
  "assets/music/nile-signal-awake.mp3",
  "assets/music/nile-signal-awake-1.mp3",
];
let ordenMusicaAjedrez = [];
let indiceMusicaAjedrez = -1;

function _barajarMusica(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function _asegurarOrdenMusica() {
  if (!ordenMusicaAjedrez.length) ordenMusicaAjedrez = _barajarMusica(PISTAS_MUSICA_AJEDREZ.map((_, i) => i));
}
// De "assets/music/khronos-red-queen.mp3" a "Khronos Red Queen" — para que
// la cápsula de música muestre algo legible en vez del nombre de archivo
// crudo (o nada).
function _nombreLegiblePista(ruta) {
  const archivo = ruta.split("/").pop().replace(/\.[a-z0-9]+$/i, "");
  return archivo.replace(/-\d+$/, "").split(/[-_]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
function _cargarPistaMusica(indice) {
  if (!PISTAS_MUSICA_AJEDREZ.length) return;
  _asegurarOrdenMusica();
  indiceMusicaAjedrez = ((indice % ordenMusicaAjedrez.length) + ordenMusicaAjedrez.length) % ordenMusicaAjedrez.length;
  const ruta = PISTAS_MUSICA_AJEDREZ[ordenMusicaAjedrez[indiceMusicaAjedrez]];
  const el = $("#musica-ajedrez");
  el.src = ruta;
  el.play().catch(() => {});
  const titulo = $("#musica-titulo");
  if (titulo) titulo.textContent = _nombreLegiblePista(ruta);
}
function reproducirMusicaAjedrez() {
  if (!PISTAS_MUSICA_AJEDREZ.length) return;
  if (indiceMusicaAjedrez === -1) _cargarPistaMusica(0);
  else $("#musica-ajedrez").play().catch(() => {});
}
function pausarMusicaAjedrez() { $("#musica-ajedrez").pause(); }
function siguientePistaMusica() { _cargarPistaMusica(indiceMusicaAjedrez + 1); }
function anteriorPistaMusica() { _cargarPistaMusica(indiceMusicaAjedrez - 1); }

// Un único reproductor global en la cabecera principal (visible en el menú
// y en las tres partidas, ver .cabecera) — por clase igual que antes (no
// por id) porque así, si algún día vuelve a haber más de un cluster de
// controles en pantalla, se mantienen sincronizados solos.
$("#musica-ajedrez").addEventListener("ended", siguientePistaMusica);
$("#musica-ajedrez").addEventListener("play", () => {
  $$(".btn-musica-play").forEach((b) => b.classList.add("activo-musica"));
});
$("#musica-ajedrez").addEventListener("pause", () => {
  $$(".btn-musica-play").forEach((b) => b.classList.remove("activo-musica"));
  const titulo = $("#musica-titulo");
  if (titulo && indiceMusicaAjedrez === -1) titulo.textContent = "En pausa";
});
$$(".btn-musica-play").forEach((b) => b.addEventListener("click", () => {
  const el = $("#musica-ajedrez");
  if (el.paused) reproducirMusicaAjedrez(); else pausarMusicaAjedrez();
}));
$$(".btn-musica-siguiente").forEach((b) => b.addEventListener("click", siguientePistaMusica));
$$(".btn-musica-anterior").forEach((b) => b.addEventListener("click", anteriorPistaMusica));

$("#musica-ajedrez").volume = 0.6; // mismo valor inicial que el slider
$("#volumen-musica").addEventListener("input", (e) => {
  $("#musica-ajedrez").volume = Number(e.target.value);
});

// ---------------- efectos de sonido (sintetizados, sin archivos) ----------------
// El usuario también va a pasar sonidos propios más adelante para "las
// fichas al moverse o comer" — mientras tanto, esto genera un click/tock
// simple con el propio Web Audio API, para que el toggle ya funcione.
let sfxActivoAjedrez = true;
$("#toggle-sfx-ajedrez").addEventListener("change", (e) => { sfxActivoAjedrez = e.target.checked; });

let _audioCtxAjedrez = null;
function _ctxAudioAjedrez() {
  if (!_audioCtxAjedrez) _audioCtxAjedrez = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtxAjedrez;
}
function sonidoFichaAjedrez(esCaptura) {
  if (!sfxActivoAjedrez) return;
  let ctx;
  try { ctx = _ctxAudioAjedrez(); } catch { return; } // navegador sin Web Audio: no rompe el juego, sólo no suena
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  if (esCaptura) {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(190, t0);
    osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.14);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
    osc.start(t0); osc.stop(t0 + 0.17);
  } else {
    osc.type = "sine";
    osc.frequency.setValueAtTime(340, t0);
    osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.08);
    gain.gain.setValueAtTime(0.16, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    osc.start(t0); osc.stop(t0 + 0.1);
  }
}

// ================================================================
// DAMAS — motor de reglas (js/damas.js) + tablero 3D (js/damas3d.js)
// ================================================================
// Mismo patrón que Ajedrez, con dos diferencias por la captura obligatoria
// encadenada: alClickCasillaDamas() no limpia la selección después de un
// movimiento si la jugada devuelve `cadena:true` (hay que seguir comiendo
// con la misma ficha, el turno todavía no pasó), y turnoBotDamasSiCorresponde
// se llama de nuevo después de cada jugada del bot por si a él también le
// toca seguir la cadena.
const NIVELES_DAMAS = [
  "Nivel 1 · principiante", "Nivel 2", "Nivel 3", "Nivel 4", "Nivel 5",
  "Nivel 6", "Nivel 7", "Nivel 8", "Nivel 9 · MAX",
];

const formDamas = {
  rival: "bot",
  nivel: 1,
  color: "blanco",
  noresign: false,
  colorBlancas: "blanco",
  colorNegras: "negro",
  tablero: "clasico",
  luz: "azul",
};

function abrirModalDamas() { $("#modal-damas").classList.add("abierto"); redibujarPreviewDamas(); }
function cerrarModalDamas() { $("#modal-damas").classList.remove("abierto"); }
$("#modal-damas-cerrar").addEventListener("click", cerrarModalDamas);
$("#modal-damas").addEventListener("click", (e) => { if (e.target.id === "modal-damas") cerrarModalDamas(); });

$("#seg-rival-damas").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-rival]");
  if (!btn) return;
  formDamas.rival = btn.dataset.rival;
  $$("#seg-rival-damas button").forEach((b) => b.classList.toggle("activo", b === btn));
  $("#bloque-nivel-damas").classList.toggle("oculto", formDamas.rival !== "bot");
  actualizarToggleNoResignDamas();
});

$("#slider-nivel-damas").addEventListener("input", (e) => {
  formDamas.nivel = Number(e.target.value);
  $("#nivel-texto-damas").textContent = NIVELES_DAMAS[formDamas.nivel - 1];
  const pct = ((formDamas.nivel - 1) / 8) * 100;
  e.target.style.setProperty("--pct", pct + "%");
});

$("#seg-color-damas").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-color]");
  if (!btn) return;
  formDamas.color = btn.dataset.color;
  $$("#seg-color-damas button").forEach((b) => b.classList.toggle("activo", b === btn));
});

$("#toggle-noresign-damas").addEventListener("change", (e) => { formDamas.noresign = e.target.checked; });
function actualizarToggleNoResignDamas() {
  const fila = $("#toggle-noresign-damas").closest(".campo-fila");
  fila.classList.toggle("oculto", formDamas.rival !== "bot");
}

// ---------------- partida ----------------
let partidaDamas = null;
let miColorDamas = BLANCO;
let esFreePlayDamas = false;
let noresignActivoDamas = false;
let skillBotDamas = 0.6;
let colorBlancasActivoDamas = "blanco";
let colorNegrasActivoDamas = "negro";
let esperandoBotDamas = false;
let seleccionDamas = null;
let legalesDamas = [];

let tablero3dDamas = null;

$("#btn-jugar-damas").addEventListener("click", () => {
  juegoActivo = "damas";
  partidaDamas = new Damas();

  esFreePlayDamas = formDamas.rival === "libre";
  noresignActivoDamas = formDamas.noresign;
  skillBotDamas = (formDamas.nivel - 1) / 8;
  seleccionDamas = null;
  legalesDamas = [];

  if (formDamas.color === "nigiri") miColorDamas = Math.random() < 0.5 ? BLANCO : NEGRO;
  else miColorDamas = formDamas.color === "blanco" ? BLANCO : NEGRO;

  cerrarModalDamas();
  $("#vista-juegos").classList.add("oculto");
  $("#vista-tablero-damas").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.remove("menu-fondo");
  $("#btn-rendirse-damas").disabled = false;

  colorBlancasActivoDamas = formDamas.colorBlancas;
  colorNegrasActivoDamas = formDamas.colorNegras;

  inicializarTablero3dDamas();
  tablero3dDamas.cambiarTablero(formDamas.tablero);
  tablero3dDamas.setColorLuzInferior(PALETA_LUCES_INFERIOR[formDamas.luz].color);
  dibujarTableroDamas();
  actualizarPanelDamas();
  turnoBotDamasSiCorresponde();
});

$("#btn-volver-damas").addEventListener("click", () => {
  $("#vista-tablero-damas").classList.add("oculto");
  $("#vista-juegos").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.add("menu-fondo");
  partidaDamas = null;
});
$("#btn-nueva-damas").addEventListener("click", () => abrirModalDamas());

$("#btn-pantalla-completa-damas").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

$("#btn-rendirse-damas").addEventListener("click", () => {
  if (!partidaDamas || partidaDamas.terminado) return;
  if (!esFreePlayDamas && !esperandoBotDamas) {
    partidaDamas.rendirse(miColorDamas);
  } else if (esFreePlayDamas) {
    partidaDamas.rendirse(partidaDamas.turno);
  } else {
    return; // no se puede rendir en medio del turno del bot
  }
  seleccionDamas = null; legalesDamas = [];
  dibujarTableroDamas();
  actualizarPanelDamas();
});

function esTurnoDelHumanoDamas() {
  if (esFreePlayDamas) return true;
  return partidaDamas.turno === miColorDamas;
}

function turnoBotDamasSiCorresponde() {
  if (!partidaDamas || partidaDamas.terminado || esFreePlayDamas) return;
  if (partidaDamas.turno === miColorDamas) return;
  esperandoBotDamas = true;
  $("#btn-rendirse-damas").disabled = true;
  actualizarPanelDamas();
  (async () => {
    if (!partidaDamas || partidaDamas.terminado) { esperandoBotDamas = false; return; }
    const colorBot = partidaDamas.turno;
    if (!partidaDamas.capturaObligada && !noresignActivoDamas && botDeberiaRendirseDamas(partidaDamas, colorBot, skillBotDamas)) {
      partidaDamas.rendirse(colorBot);
      esperandoBotDamas = false;
      $("#btn-rendirse-damas").disabled = false;
      dibujarTableroDamas();
      actualizarPanelDamas();
      return;
    }
    const jugada = await conTechoDeTiempo(
      jugadaDelDamas(partidaDamas, colorBot, skillBotDamas),
      presupuestoPensadaMs(skillBotDamas) + 2000,
      () => jugadaDelDamas(partidaDamas, colorBot, 0)
    );
    if (jugada) {
      const r = partidaDamas.mover(jugada.desde, jugada.hasta);
      if (r.ok) sonidoFichaAjedrez(r.comida);
    }
    dibujarTableroDamas();
    actualizarPanelDamas();
    // ¿el bot tiene que seguir comiendo con la misma ficha? seguimos en su
    // turno — si no, esperandoBotDamas se apaga y vuelve a ser turno humano.
    if (partidaDamas.capturaObligada && partidaDamas.turno === colorBot && !partidaDamas.terminado) {
      turnoBotDamasSiCorresponde();
    } else {
      esperandoBotDamas = false;
      $("#btn-rendirse-damas").disabled = false;
    }
  })();
}

function alClickCasillaDamas(x, y) {
  if (!partidaDamas || partidaDamas.terminado) return;
  if (esperandoBotDamas) return;
  if (!esTurnoDelHumanoDamas()) return;

  const pieza = partidaDamas.pieza(x, y);

  if (seleccionDamas) {
    if (!partidaDamas.capturaObligada && seleccionDamas.x === x && seleccionDamas.y === y) {
      seleccionDamas = null; legalesDamas = [];
      dibujarTableroDamas();
      return;
    }
    const destino = legalesDamas.find((m) => m.hasta.x === x && m.hasta.y === y);
    if (destino) {
      const r = partidaDamas.mover(seleccionDamas, { x, y });
      if (r.ok) {
        sonidoFichaAjedrez(r.comida);
        if (r.cadena) {
          // captura encadenada: la misma ficha sigue seleccionada, sólo se
          // refrescan sus nuevos movimientos legales (todas capturas).
          seleccionDamas = { x, y };
          legalesDamas = partidaDamas.movimientosLegales(x, y);
        } else {
          seleccionDamas = null; legalesDamas = [];
        }
        dibujarTableroDamas();
        actualizarPanelDamas();
        if (!r.cadena) turnoBotDamasSiCorresponde();
      } else {
        dibujarTableroDamas();
      }
      return;
    }
  }

  if (!partidaDamas.capturaObligada && pieza && pieza.color === partidaDamas.turno) {
    seleccionDamas = { x, y };
    legalesDamas = partidaDamas.movimientosLegales(x, y);
  } else if (!partidaDamas.capturaObligada) {
    seleccionDamas = null; legalesDamas = [];
  }
  dibujarTableroDamas();
}

function actualizarPanelDamas() {
  const piedra = $("#turno-piedra-damas");
  const texto = $("#turno-texto-damas");
  if (partidaDamas.terminado) {
    texto.textContent = "Partida terminada";
    piedra.style.background = "linear-gradient(135deg, var(--oro-claro), var(--oro-oscuro))";
  } else {
    const esBlanco = partidaDamas.turno === BLANCO;
    piedra.style.background = esBlanco
      ? "radial-gradient(circle at 35% 30%, #ffffff, #d8cdb4)"
      : "radial-gradient(circle at 35% 30%, #3a352c, #050403)";
    const quien = esFreePlayDamas
      ? (esBlanco ? "Blancas juegan" : "Negras juegan")
      : (partidaDamas.turno === miColorDamas ? "Tu turno" : (esperandoBotDamas ? "El bot está pensando…" : "Turno del bot"));
    texto.textContent = quien;
  }
  $("#cap-blancas-damas").textContent = partidaDamas.capturas[BLANCO];
  $("#cap-negras-damas").textContent = partidaDamas.capturas[NEGRO];
  $("#mov-chip-damas").textContent = partidaDamas.movimientos;
  const pB = partidaDamas.contarPiezas(BLANCO), pN = partidaDamas.contarPiezas(NEGRO);
  $("#piezas-blancas-damas").textContent = pB.peones + pB.damas;
  $("#piezas-negras-damas").textContent = pN.peones + pN.damas;

  if (partidaDamas.terminado) {
    $("#btn-rendirse-damas").disabled = true;
    mostrarResultadoDamas();
  }
}

function mostrarResultadoDamas() {
  const r = partidaDamas.resultado;
  const nombreColor = (c) => (c === BLANCO ? "Blancas" : "Negras");
  let titulo, detalle;

  if (esFreePlayDamas) {
    titulo = `Ganan las ${nombreColor(r.ganador).toLowerCase()}`;
    detalle = r.motivo === "sin_movimientos"
      ? `Las ${nombreColor(otro(r.ganador)).toLowerCase()} se quedaron sin movimientos posibles.`
      : `Las ${nombreColor(otro(r.ganador)).toLowerCase()} se rindieron.`;
  } else {
    titulo = r.ganador === miColorDamas ? "¡Ganaste!" : "Perdiste";
    const motivoTxt = r.motivo === "sin_movimientos"
      ? (r.ganador === miColorDamas ? "El bot se quedó sin movimientos." : "Te quedaste sin movimientos.")
      : (r.ganador === miColorDamas ? "El bot se rindió." : "Te rendiste.");
    detalle = `${motivoTxt} · Jugaste con ${miColorDamas === BLANCO ? "blancas" : "negras"}`;
  }

  $("#mensaje-final-titulo").textContent = titulo;
  $("#mensaje-final-detalle").textContent = detalle;
  const piedraIcono = $("#resultado-piedra");
  piedraIcono.style.background = r.ganador === BLANCO
    ? "radial-gradient(circle at 35% 28%, #ffffff, #eee4cf 60%, #c9bda0 100%)"
    : "radial-gradient(circle at 35% 28%, #4a453a, #141210 55%, #000 100%)";
  setTimeout(() => $("#modal-resultado").classList.add("abierto"), 260);
}

// ================================================================
// TABLERO — Three.js (ver js/damas3d.js)
// ================================================================
function inicializarTablero3dDamas() {
  if (tablero3dDamas) return;
  tablero3dDamas = new DamasTablero3D($("#tablero-damas-madera"));
  tablero3dDamas.habilitarLinternas();
  tablero3dDamas.onCasilla((x, y) => alClickCasillaDamas(x, y));
}

function tableroDamasParaVista(damas) {
  const filas = [];
  for (let y = 0; y < 8; y++) {
    const fila = [];
    for (let x = 0; x < 8; x++) {
      const p = damas.pieza(x, y);
      fila.push(p ? { color: p.color === BLANCO ? "blanco" : "negro", dama: p.dama } : null);
    }
    filas.push(fila);
  }
  return filas;
}

function dibujarTableroDamas() {
  const tablero = tableroDamasParaVista(partidaDamas);
  const legales = legalesDamas.filter((m) => m.tipo !== "captura").map((m) => m.hasta);
  const capturas = legalesDamas.filter((m) => m.tipo === "captura").map((m) => m.hasta);
  tablero3dDamas.actualizar(tablero, {
    seleccion: seleccionDamas,
    legales, capturas,
    ultimoMovimiento: partidaDamas.ultimoMovimiento,
    colorBlanco: colorBlancasActivoDamas,
    colorNegro: colorNegrasActivoDamas,
  });
  tablero3dDamas.resize();
}

// ---------------- selector de colores de pieza y tipo de tablero ----------------
let previewDamas3D = null;
function asegurarPreviewDamas3D() {
  if (previewDamas3D) return previewDamas3D;
  previewDamas3D = new DamasTablero3D($("#preview-tablero-damas"));
  previewDamas3D._distancia = 6.2;
  previewDamas3D._elevacion = 0.78;
  previewDamas3D._azimut = 0.35;
  previewDamas3D._zoomMin = 3.5;
  previewDamas3D._zoomMax = 12;
  return previewDamas3D;
}
function redibujarPreviewDamas() {
  const t3d = asegurarPreviewDamas3D();
  t3d.cambiarTablero(formDamas.tablero);
  t3d.setColorLuzInferior(PALETA_LUCES_INFERIOR[formDamas.luz].color);
  const tableroFalso = Array.from({ length: 8 }, () => new Array(8).fill(null));
  tableroFalso[4][3] = { color: "negro", dama: false };
  tableroFalso[4][4] = { color: "blanco", dama: false };
  t3d.actualizar(tableroFalso, { colorBlanco: formDamas.colorBlancas, colorNegro: formDamas.colorNegras });
  t3d.resize();
}

construirSwatchesPiedra("swatches-blancas-damas", "colorBlancas", formDamas, redibujarPreviewDamas, "swatch-pieza");
construirSwatchesPiedra("swatches-negras-damas", "colorNegras", formDamas, redibujarPreviewDamas, "swatch-pieza");
construirSwatchesTablero("swatches-tablero-damas", formDamas, redibujarPreviewDamas, PALETA_TABLEROS_DAMAS);
construirSwatchesLuz("swatches-luz-damas", formDamas, redibujarPreviewDamas);

$("#slider-nivel-damas").style.setProperty("--pct", "0%");
actualizarToggleNoResignDamas();

// ---------------- opciones (vista 2D/3D, sonido) ----------------
$("#btn-opciones-damas").addEventListener("click", () => $("#modal-opciones-damas").classList.add("abierto"));
$("#modal-opciones-damas-cerrar").addEventListener("click", () => $("#modal-opciones-damas").classList.remove("abierto"));
$("#modal-opciones-damas").addEventListener("click", (e) => { if (e.target.id === "modal-opciones-damas") $("#modal-opciones-damas").classList.remove("abierto"); });

$("#seg-vista-damas").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-vista]");
  if (!btn) return;
  $$("#seg-vista-damas button").forEach((b) => b.classList.toggle("activo", b === btn));
  if (tablero3dDamas) tablero3dDamas.setVista(btn.dataset.vista);
});
// El SFX de damas reusa el mismo sintetizador que ajedrez (sonidoFichaAjedrez
// — genérico, "ficha que se mueve/come", nada específico de ajedrez) pero
// con su propio toggle en su propio modal de Opciones.
$("#toggle-sfx-damas").addEventListener("change", (e) => { sfxActivoAjedrez = e.target.checked; $("#toggle-sfx-ajedrez").checked = e.target.checked; });

// ================================================================
// TEG — mapa Leaflet (js/tegmapa.js) + motor de reglas (js/teg.js)
// ================================================================
// Mismo patrón que Go/Ajedrez (form del modal, partida global, panel,
// modal de resultado compartido), pero acá "seleccionar una casilla" es
// más simple de lo que parece: en refuerzo cada clic en territorio propio
// coloca 1 ejército (repetible); en ataque/fortificación, el primer clic en
// territorio propio elige el origen y el segundo clic (en el destino
// correcto) resuelve la acción — sin diálogos numéricos intermedios, ni
// selector de cantidad de dados (siempre tira el máximo permitido) ni
// selector de cuántas tropas mover tras conquistar (mueve una cantidad
// razonable sola): se prioriza que el loop completo sea jugable de punta a
// punta antes que cubrir cada variante de las reglas de mesa.
const formTeg = { cantidadJugadores: 3, bots: [false, true, true, true, true, true], nivel: 5, colorJugador: "turquesa" };

// El jugador humano (seat 0) elige su color; el resto de los asientos se
// reparte los colores que quedan, en el mismo orden de siempre — así nunca
// hay dos jugadores con el mismo color aunque el humano cambie el suyo.
function coloresOrdenTeg() {
  return [formTeg.colorJugador, ...ORDEN_COLORES_TEG.filter((c) => c !== formTeg.colorJugador)];
}

function actualizarListaJugadoresTeg() {
  const cont = $("#teg-lista-jugadores");
  cont.innerHTML = "";
  const orden = coloresOrdenTeg();
  for (let i = 0; i < formTeg.cantidadJugadores; i++) {
    const cfg = PALETA_JUGADORES_TEG[orden[i]];
    const esVos = i === 0;
    const fila = document.createElement("div");
    fila.className = "campo-fila teg-fila-jugador";
    fila.innerHTML = `
      <div style="display:flex;align-items:center;">
        <span class="punto-color" style="background:${cfg.color}"></span>
        <span>${esVos ? "Vos" : "Jugador " + (i + 1)} (${cfg.nombre})</span>
      </div>
      ${esVos
        ? '<span class="campo-nota">Humano</span>'
        : `<label class="toggle"><input type="checkbox" class="teg-toggle-bot" data-idx="${i}" ${formTeg.bots[i] ? "checked" : ""}><span class="via"></span></label>`}`;
    cont.append(fila);
  }
  $$(".teg-toggle-bot").forEach((chk) => {
    chk.addEventListener("change", (e) => { formTeg.bots[Number(e.target.dataset.idx)] = e.target.checked; });
  });

  // fila de swatches para elegir el color propio — abajo de la lista, no
  // por jugador (sólo el humano elige; los bots se acomodan solos).
  const filaColor = document.createElement("div");
  filaColor.className = "campo";
  filaColor.innerHTML = `<div class="campo-label">Tu color</div><div class="fila-swatches" id="teg-swatches-color"></div>`;
  cont.append(filaColor);
  const contSwatches = $("#teg-swatches-color");
  ORDEN_COLORES_TEG.forEach((id) => {
    const cfg = PALETA_JUGADORES_TEG[id];
    const btn = document.createElement("button");
    btn.className = "swatch-piedra" + (formTeg.colorJugador === id ? " activo" : "");
    btn.style.background = cfg.color;
    btn.title = cfg.nombre;
    btn.addEventListener("click", () => { formTeg.colorJugador = id; actualizarListaJugadoresTeg(); });
    contSwatches.append(btn);
  });
}
$("#teg-jugadores-menos").addEventListener("click", () => {
  formTeg.cantidadJugadores = Math.max(2, formTeg.cantidadJugadores - 1);
  $("#teg-jugadores-valor").textContent = formTeg.cantidadJugadores;
  actualizarListaJugadoresTeg();
});
$("#teg-jugadores-mas").addEventListener("click", () => {
  formTeg.cantidadJugadores = Math.min(6, formTeg.cantidadJugadores + 1);
  $("#teg-jugadores-valor").textContent = formTeg.cantidadJugadores;
  actualizarListaJugadoresTeg();
});
$("#slider-nivel-teg").addEventListener("input", (e) => {
  formTeg.nivel = Number(e.target.value);
  $("#nivel-texto-teg").textContent = NIVELES[formTeg.nivel - 1];
  e.target.style.setProperty("--pct", ((formTeg.nivel - 1) / 8) * 100 + "%");
});

function abrirModalTeg() { actualizarListaJugadoresTeg(); $("#modal-teg").classList.add("abierto"); }
function cerrarModalTeg() { $("#modal-teg").classList.remove("abierto"); }
$("#modal-teg-cerrar").addEventListener("click", cerrarModalTeg);
$("#modal-teg").addEventListener("click", (e) => { if (e.target.id === "modal-teg") cerrarModalTeg(); });

let partidaTeg = null;
let mapaTeg = null;
const miJugadorTeg = 0; // el humano siempre es el jugador 0
let seleccionTeg = null;
let cartasSeleccionadasTeg = [];
let skillBotTeg = 0.6;
let esperandoBotTeg = false;

$("#btn-jugar-teg").addEventListener("click", () => {
  juegoActivo = "teg";
  const jugadores = [];
  for (let i = 0; i < formTeg.cantidadJugadores; i++) jugadores.push({ id: i, esBot: i !== 0 && formTeg.bots[i] });
  partidaTeg = new Teg(jugadores);
  skillBotTeg = (formTeg.nivel - 1) / 8;
  seleccionTeg = null;
  cartasSeleccionadasTeg = [];

  cerrarModalTeg();
  $("#vista-juegos").classList.add("oculto");
  $("#vista-tablero-teg").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.remove("menu-fondo");
  $("#btn-pasar-fase-teg").disabled = false;
  $("#btn-rendirse-teg").disabled = false;

  inicializarMapaTeg();
  dibujarTeg();
  actualizarPanelTeg();
  turnoBotTegSiCorresponde();
});

$("#btn-volver-teg").addEventListener("click", () => {
  $("#vista-tablero-teg").classList.add("oculto");
  $("#vista-juegos").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.add("menu-fondo");
  partidaTeg = null;
});
$("#btn-nueva-teg").addEventListener("click", () => abrirModalTeg());
$("#btn-pantalla-completa-teg").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});
// cajón lateral (objetivo/cartas/log) — se puede cerrar para que el mapa
// use todo el ancho; el mapa 3D tiene que enterarse del resize real, no
// sólo la animación CSS, o el canvas queda con el tamaño viejo.
$("#btn-info-teg").addEventListener("click", () => {
  const drawer = $("#teg-drawer");
  const cerrado = drawer.classList.toggle("cerrado");
  $("#btn-info-teg").setAttribute("aria-expanded", String(!cerrado));
  setTimeout(() => mapaTeg?.resize(), 340);
});

function inicializarMapaTeg() {
  if (mapaTeg) return;
  mapaTeg = new TegMapa($("#mapa-teg"));
  mapaTeg.onTerritorio((id) => alClickTerritorioTeg(id));
}

function coloresJugadoresTeg() {
  const orden = coloresOrdenTeg();
  return partidaTeg.jugadores.map((_, idx) => PALETA_JUGADORES_TEG[orden[idx]].colorId);
}

function dibujarTeg() {
  let resaltados = [];
  if (seleccionTeg && partidaTeg.fase === "ataque") resaltados = partidaTeg.vecinosEnemigos(seleccionTeg);
  else if (seleccionTeg && partidaTeg.fase === "fortificacion") {
    resaltados = partidaTeg.territoriosDe(partidaTeg.turno).filter((id) => id !== seleccionTeg && partidaTeg._conectados(seleccionTeg, id));
  }
  mapaTeg.actualizar(partidaTeg, coloresJugadoresTeg(), { seleccion: seleccionTeg, resaltados });
  mapaTeg.resize();
}

// Después de conquistar hay que mover tropas del origen al destino sí o sí
// antes de seguir — se resuelve solo, con una cantidad razonable (60% del
// máximo permitido), en vez de pedir otro clic o un número.
function resolverMovimientoConquistaTeg() {
  if (!partidaTeg.movimientoPendienteConquista) return;
  const mp = partidaTeg.movimientoPendienteConquista;
  partidaTeg.moverTrasConquista(Math.max(mp.minimo, Math.round(mp.maximo * 0.6)));
}

function mostrarCombateTeg(r) {
  const nOrigen = TERRITORIOS[r.desde].nombre, nDestino = TERRITORIOS[r.hasta].nombre;
  let texto = `${nOrigen} ataca ${nDestino}: 🎲 ${r.dadosAtacante.join(",")} vs 🎲 ${r.dadosDefensor.join(",")} — `
    + `pierde el atacante ${r.bajasAtacante}, el defensor ${r.bajasDefensor}.`;
  if (r.conquistado) texto += ` ¡${nDestino} conquistado!`;
  $("#teg-log-texto").textContent = texto;
}

function alClickTerritorioTeg(id) {
  if (!partidaTeg || partidaTeg.terminado || esperandoBotTeg) return;
  if (partidaTeg.turno !== miJugadorTeg) return;
  const casilla = partidaTeg.board[id];

  if (partidaTeg.fase === "refuerzo") {
    if (casilla.dueno !== partidaTeg.turno) return;
    const r = partidaTeg.colocarEjercitos(id, 1);
    if (r.ok) { dibujarTeg(); actualizarPanelTeg(); }
    return;
  }

  if (partidaTeg.fase === "ataque") {
    if (!seleccionTeg || id === seleccionTeg) {
      seleccionTeg = (id !== seleccionTeg && casilla.dueno === partidaTeg.turno && casilla.ejercitos >= 2) ? id : null;
      dibujarTeg(); actualizarAyudaTeg();
      return;
    }
    if (casilla.dueno === partidaTeg.turno) {
      seleccionTeg = casilla.ejercitos >= 2 ? id : null;
      dibujarTeg(); actualizarAyudaTeg();
      return;
    }
    const r = partidaTeg.atacar(seleccionTeg, id);
    if (r.ok) {
      mostrarCombateTeg(r);
      sonidoDadosTeg();
      if (r.conquistado) { resolverMovimientoConquistaTeg(); sonidoConquistaTeg(); }
      seleccionTeg = (!partidaTeg.terminado && partidaTeg.board[seleccionTeg] && partidaTeg.board[seleccionTeg].ejercitos >= 2) ? seleccionTeg : null;
      dibujarTeg(); actualizarPanelTeg();
    }
    return;
  }

  if (partidaTeg.fase === "fortificacion") {
    if (!seleccionTeg || id === seleccionTeg) {
      seleccionTeg = (id !== seleccionTeg && casilla.dueno === partidaTeg.turno && casilla.ejercitos >= 2) ? id : null;
      dibujarTeg(); actualizarAyudaTeg();
      return;
    }
    if (casilla.dueno === partidaTeg.turno) {
      const origenEjercitos = partidaTeg.board[seleccionTeg].ejercitos;
      const cantidad = Math.max(1, Math.floor((origenEjercitos - 1) / 2));
      const r = partidaTeg.fortificar(seleccionTeg, id, cantidad);
      if (r.ok) {
        seleccionTeg = null;
        dibujarTeg(); actualizarPanelTeg();
        turnoBotTegSiCorresponde();
      } else {
        seleccionTeg = casilla.ejercitos >= 2 ? id : null;
        dibujarTeg(); actualizarAyudaTeg();
      }
    }
  }
}

$("#btn-pasar-fase-teg").addEventListener("click", () => {
  if (!partidaTeg || partidaTeg.terminado || esperandoBotTeg || partidaTeg.turno !== miJugadorTeg) return;
  seleccionTeg = null;
  partidaTeg.pasarFase();
  dibujarTeg(); actualizarPanelTeg();
  turnoBotTegSiCorresponde();
});
$("#btn-rendirse-teg").addEventListener("click", () => {
  if (!partidaTeg || partidaTeg.terminado) return;
  partidaTeg.rendirse(miJugadorTeg);
  dibujarTeg(); actualizarPanelTeg();
});

function actualizarAyudaTeg() {
  const el = $("#teg-ayuda");
  if (!partidaTeg || partidaTeg.terminado) { el.textContent = ""; return; }
  if (partidaTeg.turno !== miJugadorTeg) { el.textContent = "Turno del bot..."; return; }
  if (partidaTeg.fase === "refuerzo") {
    el.textContent = `Elegí territorios propios para colocar tus ${partidaTeg.refuerzosPendientes} refuerzos (un clic = 1 ejército).`;
  } else if (partidaTeg.fase === "ataque") {
    el.textContent = seleccionTeg
      ? `Elegí un territorio enemigo vecino de ${TERRITORIOS[seleccionTeg].nombre} para atacar, o volvé a tocarlo para deseleccionar.`
      : "Elegí un territorio propio (con 2+ ejércitos) para atacar desde ahí, o pasá de fase.";
  } else if (partidaTeg.fase === "fortificacion") {
    el.textContent = seleccionTeg
      ? "Elegí un territorio propio conectado para mover tropas ahí."
      : "Elegí un territorio propio para reagrupar tropas, o pasá de fase para terminar el turno.";
  }
}

function dibujarCartasTeg() {
  const cont = $("#teg-cartas");
  cont.innerHTML = "";
  const iconos = { infanteria: "🪖", caballeria: "🐎", artilleria: "💣" };
  partidaTeg.jugadores[miJugadorTeg].cartas.forEach((c, i) => {
    const btn = document.createElement("button");
    btn.className = "swatch-piedra swatch-pieza" + (cartasSeleccionadasTeg.includes(i) ? " activo" : "");
    btn.style.fontSize = "18px";
    btn.title = TERRITORIOS[c.territorio]?.nombre || "";
    btn.textContent = iconos[c.simbolo] || "?";
    btn.addEventListener("click", () => {
      const pos = cartasSeleccionadasTeg.indexOf(i);
      if (pos >= 0) cartasSeleccionadasTeg.splice(pos, 1);
      else if (cartasSeleccionadasTeg.length < 3) cartasSeleccionadasTeg.push(i);
      dibujarCartasTeg();
    });
    cont.append(btn);
  });
}
$("#btn-canjear-teg").addEventListener("click", () => {
  if (cartasSeleccionadasTeg.length !== 3 || !partidaTeg) return;
  const r = partidaTeg.intercambiarCartas(cartasSeleccionadasTeg);
  cartasSeleccionadasTeg = [];
  if (r.ok) { actualizarPanelTeg(); dibujarTeg(); }
  else dibujarCartasTeg();
});

function actualizarPanelTeg() {
  const piedra = $("#turno-piedra-teg");
  const texto = $("#turno-texto-teg");
  if (partidaTeg.terminado) {
    texto.textContent = "Partida terminada";
    piedra.style.background = "linear-gradient(135deg, var(--oro-claro), var(--oro-oscuro))";
  } else {
    const cfg = PALETA_JUGADORES_TEG[ORDEN_COLORES_TEG[partidaTeg.turno]];
    piedra.style.background = cfg.color;
    const nombreFase = { refuerzo: "Refuerzo", ataque: "Ataque", fortificacion: "Fortificación" }[partidaTeg.fase];
    const quien = partidaTeg.turno === miJugadorTeg ? "Tu turno" : `Turno de ${cfg.nombre}`;
    texto.textContent = `${quien} · ${nombreFase}`;
  }
  $("#teg-refuerzos").textContent = partidaTeg.fase === "refuerzo" && partidaTeg.turno === miJugadorTeg ? partidaTeg.refuerzosPendientes : 0;
  $("#teg-territorios").textContent = partidaTeg.territoriosDe(miJugadorTeg).length;
  $("#teg-cartas-num").textContent = partidaTeg.jugadores[miJugadorTeg].cartas.length;
  $("#teg-objetivo-texto").textContent = partidaTeg.jugadores[miJugadorTeg].objetivo.descripcion;
  $("#btn-canjear-teg").disabled = !(partidaTeg.turno === miJugadorTeg && partidaTeg.fase === "refuerzo" && !partidaTeg.terminado);
  dibujarCartasTeg();
  actualizarAyudaTeg();

  if (partidaTeg.terminado) {
    $("#btn-pasar-fase-teg").disabled = true;
    $("#btn-rendirse-teg").disabled = true;
    mostrarResultadoTeg();
  }
}

function mostrarResultadoTeg() {
  const r = partidaTeg.resultado;
  const cfg = PALETA_JUGADORES_TEG[ORDEN_COLORES_TEG[r.ganador]];
  const titulo = r.ganador === miJugadorTeg ? "¡Ganaste!" : `Gana ${cfg.nombre}`;
  const detalle = r.motivo === "objetivo"
    ? `Cumplió su objetivo secreto: "${partidaTeg.jugadores[r.ganador].objetivo.descripcion}"`
    : "Eliminó (o hizo rendir) a todos sus rivales.";
  $("#mensaje-final-titulo").textContent = titulo;
  $("#mensaje-final-detalle").textContent = detalle;
  $("#resultado-piedra").style.background = cfg.color;
  setTimeout(() => $("#modal-resultado").classList.add("abierto"), 260);
}

function turnoBotTegSiCorresponde() {
  if (!partidaTeg || partidaTeg.terminado) return;
  if (!partidaTeg.jugadores[partidaTeg.turno].esBot) { actualizarAyudaTeg(); return; }
  esperandoBotTeg = true;
  $("#btn-pasar-fase-teg").disabled = true;
  $("#btn-rendirse-teg").disabled = true;
  setTimeout(ejecutarPasoBotTeg, 450 + Math.random() * 300);
}

// Un paso de bot = una acción (colocar refuerzo, atacar una vez, o pasar de
// fase), no todo el turno de una — así se puede ver jugada por jugada en
// vez de que el turno entero salte de golpe. Se re-llama a sí misma con un
// setTimeout hasta que el turno vuelve a ser del humano o termina la partida.
function ejecutarPasoBotTeg() {
  if (!partidaTeg || partidaTeg.terminado) { finalizarTurnoBotTeg(); return; }
  const jugada = jugadaDelBotTeg(partidaTeg, partidaTeg.turno, skillBotTeg);
  if (!jugada || jugada.tipo === "pasar") {
    partidaTeg.pasarFase();
  } else if (jugada.tipo === "refuerzo") {
    partidaTeg.colocarEjercitos(jugada.territorioId, jugada.cantidad);
  } else if (jugada.tipo === "ataque") {
    const r = partidaTeg.atacar(jugada.desde, jugada.hasta);
    if (r.ok) {
      mostrarCombateTeg(r);
      sonidoDadosTeg();
      if (r.conquistado) { resolverMovimientoConquistaTeg(); sonidoConquistaTeg(); }
    }
  }
  dibujarTeg(); actualizarPanelTeg();
  if (partidaTeg.terminado) { finalizarTurnoBotTeg(); return; }
  if (partidaTeg.jugadores[partidaTeg.turno].esBot) setTimeout(ejecutarPasoBotTeg, 240 + Math.random() * 220);
  else finalizarTurnoBotTeg();
}
function finalizarTurnoBotTeg() {
  esperandoBotTeg = false;
  $("#btn-pasar-fase-teg").disabled = false;
  $("#btn-rendirse-teg").disabled = false;
  actualizarAyudaTeg();
}

// ---------------- SFX de TEG (dados y conquista, mismo mecanismo sintetizado) ----------------
function sonidoDadosTeg() {
  if (!sfxActivoAjedrez) return;
  let ctx; try { ctx = _ctxAudioAjedrez(); } catch { return; }
  const t0 = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "square";
    const inicio = t0 + i * 0.06;
    osc.frequency.setValueAtTime(220 + Math.random() * 180, inicio);
    gain.gain.setValueAtTime(0.1, inicio);
    gain.gain.exponentialRampToValueAtTime(0.001, inicio + 0.07);
    osc.start(inicio); osc.stop(inicio + 0.08);
  }
}
function sonidoConquistaTeg() {
  if (!sfxActivoAjedrez) return;
  let ctx; try { ctx = _ctxAudioAjedrez(); } catch { return; }
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(140, t0);
  osc.frequency.exponentialRampToValueAtTime(340, t0 + 0.18);
  gain.gain.setValueAtTime(0.18, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  osc.start(t0); osc.stop(t0 + 0.24);
}

// ================================================================
// "AJEDREZ 2.0" — ajedrez jugable con personajes 3D (ver js/ajedrez2_3d.js)
// ================================================================
// Se DUPLICA acá toda la capa de interacción del Ajedrez original (más
// abajo, sección "AJEDREZ") en vez de reutilizarla — pedido explícito del
// usuario ("no migrar sino duplicar") — pero el motor de reglas de
// verdad (class Ajedrez, jugadaDelAjedrez, botDeberiaRendirseAjedrez, todo
// en js/chess.js) sí es el mismo: es el tablero original el que no se
// toca ni se comparte estado con esto, no las reglas del ajedrez en sí.
let tablero3dAjedrez2 = null;
let inspectorAjedrez2 = null;
let tableroAjedrez2Activo = "rojoNegro";

// Alto objetivo por rol (unidades de escena, 1 = una casilla): pedido
// explícito — "quiero que las fichas sean más grandes, las torres tengan
// mayor tamaño, los peones son más pequeños, así cada uno tiene diferente
// imponencia". Nada de esto es realista-a-escala (un rey de verdad no le
// saca dos cabezas a un peón) — es la misma licencia visual de "peso
// jerárquico" que ya usan los sets de ajedrez de diseño.
const ALTURA_ROL_AJEDREZ2 = { rey: 1.35, reina: 1.28, torre: 1.30, alfil: 1.12, caballo: 1.08, peon: 0.85 };
const NOMBRE_ROL_AJEDREZ2 = { rey: "Rey", reina: "Reina", torre: "Torre", alfil: "Alfil", caballo: "Caballo", peon: "Peón" };
// No todos los .fbx de origen traen el mismo "frente". Medido con una
// auditoría sistemática de los 12: captura de cada personaje en el
// inspector con cámara fija en el eje +z y lectura visual de hacia dónde
// mira (pedido explícito: "todas mirando al frente, como enfrentadas").
// El valor es el giro que lleva el frente crudo del modelo a +z; el giro
// de 180° del equipo negro se aplica aparte (ver ajedrez2_3d.js), así el
// mismo valor sirve para los dos bandos. Los que no figuran ya vienen
// mirando a +z (giro 0).
const GIRO_EXTRA_PERSONAJE = {
  peonBlanco: 90,    // frente crudo: -x
  caballoNegro: 90,  // frente crudo: -x
  alfilNegro: 90,    // frente crudo: -x
  reinaBlanca: 270,  // frente crudo: +x
  reyNegro: 270,     // frente crudo: +x
};

// tipo de pieza de js/chess.js (P/N/B/R/Q/K) + color → { id del personaje
// (ver js/personajes/*.js), rol (para el alto y el nombre en el inspector) }.
const PERSONAJE_POR_PIEZA_AJEDREZ2 = {
  P: { rol: "peon", blanco: "peonBlanco", negro: "peonNegro" },
  N: { rol: "caballo", blanco: "caballoBlanco", negro: "caballoNegro" },
  B: { rol: "alfil", blanco: "alfilBlanco", negro: "alfilNegro" },
  R: { rol: "torre", blanco: "torreBlanca", negro: "torreNegra" },
  Q: { rol: "reina", blanco: "reinaBlanca", negro: "reinaNegra" },
  K: { rol: "rey", blanco: "reyBlanco", negro: "reyNegro" },
};
function personajeDePieza(pieza) {
  const info = PERSONAJE_POR_PIEZA_AJEDREZ2[pieza.tipo];
  const equipo = pieza.color === BLANCO ? "blanco" : "negro";
  const id = info[equipo];
  return { id, rol: info.rol, equipo, altura: ALTURA_ROL_AJEDREZ2[info.rol], giroExtra: GIRO_EXTRA_PERSONAJE[id] };
}
function formacionDesdeChessAjedrez2(partida) {
  const filas = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = partida.pieza(x, y);
      if (!p) continue;
      filas.push({ x, y, ...personajeDePieza(p) });
    }
  }
  return filas;
}

const formAjedrez2 = { rival: "bot", nivel: 1, color: "blanco", noresign: false };

function abrirModalAjedrez2() { $("#modal-ajedrez2").classList.add("abierto"); }
function cerrarModalAjedrez2() { $("#modal-ajedrez2").classList.remove("abierto"); }
$("#modal-ajedrez2-cerrar").addEventListener("click", cerrarModalAjedrez2);
$("#modal-ajedrez2").addEventListener("click", (e) => { if (e.target.id === "modal-ajedrez2") cerrarModalAjedrez2(); });

$("#seg-rival-ajedrez2").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-rival]");
  if (!btn) return;
  formAjedrez2.rival = btn.dataset.rival;
  $$("#seg-rival-ajedrez2 button").forEach((b) => b.classList.toggle("activo", b === btn));
  $("#bloque-nivel-ajedrez2").classList.toggle("oculto", formAjedrez2.rival !== "bot");
  actualizarToggleNoResignAjedrez2();
});
$("#slider-nivel-ajedrez2").addEventListener("input", (e) => {
  formAjedrez2.nivel = Number(e.target.value);
  $("#nivel-texto-ajedrez2").textContent = NIVELES[formAjedrez2.nivel - 1];
  const pct = ((formAjedrez2.nivel - 1) / 8) * 100;
  e.target.style.setProperty("--pct", pct + "%");
});
$("#seg-color-ajedrez2").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-color]");
  if (!btn) return;
  formAjedrez2.color = btn.dataset.color;
  $$("#seg-color-ajedrez2 button").forEach((b) => b.classList.toggle("activo", b === btn));
});
$("#toggle-noresign-ajedrez2").addEventListener("change", (e) => { formAjedrez2.noresign = e.target.checked; });
function actualizarToggleNoResignAjedrez2() {
  const fila = $("#toggle-noresign-ajedrez2").closest(".campo-fila");
  fila.classList.toggle("oculto", formAjedrez2.rival !== "bot");
}

// ---------------- partida ----------------
let partidaAjedrez2 = null;
let miColorAjedrez2 = BLANCO;
let esFreePlayAjedrez2 = false;
let noresignActivoAjedrez2 = false;
let skillBotAjedrez2 = 0.6;
let esperandoBotAjedrez2 = false;
let seleccionAjedrez2 = null;
let legalesAjedrez2 = [];

function inicializarTablero3dAjedrez2() {
  if (tablero3dAjedrez2) return;
  tablero3dAjedrez2 = new Ajedrez2Tablero3D($("#tablero-ajedrez2-madera"));
  tablero3dAjedrez2.onCasilla((x, y) => alClickCasillaAjedrez2(x, y));
}

$("#btn-jugar-ajedrez2").addEventListener("click", () => {
  juegoActivo = "ajedrez2";
  partidaAjedrez2 = new Ajedrez();

  esFreePlayAjedrez2 = formAjedrez2.rival === "libre";
  noresignActivoAjedrez2 = formAjedrez2.noresign;
  skillBotAjedrez2 = (formAjedrez2.nivel - 1) / 8;
  seleccionAjedrez2 = null;
  legalesAjedrez2 = [];

  if (formAjedrez2.color === "nigiri") miColorAjedrez2 = Math.random() < 0.5 ? BLANCO : NEGRO;
  else miColorAjedrez2 = formAjedrez2.color === "blanco" ? BLANCO : NEGRO;

  cerrarModalAjedrez2();
  $("#vista-juegos").classList.add("oculto");
  $("#vista-ajedrez2").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.remove("menu-fondo");
  $("#btn-rendirse-ajedrez2").disabled = false;
  cerrarInspectorAjedrez2();

  inicializarTablero3dAjedrez2();
  tablero3dAjedrez2.cambiarTablero(tableroAjedrez2Activo);
  dibujarTableroAjedrez2();
  actualizarPanelAjedrez2();
  tablero3dAjedrez2.resize();
  turnoBotAjedrez2SiCorresponde();
});

$("#btn-volver-ajedrez2").addEventListener("click", () => {
  $("#vista-ajedrez2").classList.add("oculto");
  $("#vista-juegos").classList.remove("oculto");
  $("#modal-resultado").classList.remove("abierto");
  document.body.classList.add("menu-fondo");
  partidaAjedrez2 = null;
  cerrarInspectorAjedrez2();
});
$("#btn-nueva-ajedrez2").addEventListener("click", () => abrirModalAjedrez2());

$("#seg-tablero-ajedrez2").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tablero]");
  if (!btn) return;
  tableroAjedrez2Activo = btn.dataset.tablero;
  $$("#seg-tablero-ajedrez2 button").forEach((b) => b.classList.toggle("activo", b === btn));
  if (tablero3dAjedrez2) {
    tablero3dAjedrez2.cambiarTablero(tableroAjedrez2Activo);
    if (partidaAjedrez2) dibujarTableroAjedrez2();
  }
});

$("#btn-pantalla-completa-ajedrez2").addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.addEventListener("fullscreenchange", () => {
  if (tablero3dAjedrez2) setTimeout(() => tablero3dAjedrez2.resize(), 60);
  if (inspectorAjedrez2) setTimeout(() => inspectorAjedrez2.resize(), 60);
});

$("#btn-rendirse-ajedrez2").addEventListener("click", () => {
  if (!partidaAjedrez2 || partidaAjedrez2.terminado) return;
  if (!esFreePlayAjedrez2 && !esperandoBotAjedrez2) {
    partidaAjedrez2.rendirse(miColorAjedrez2);
  } else if (esFreePlayAjedrez2) {
    partidaAjedrez2.rendirse(partidaAjedrez2.turno);
  } else {
    return; // no se puede rendir en medio del turno del bot
  }
  seleccionAjedrez2 = null; legalesAjedrez2 = [];
  dibujarTableroAjedrez2();
  actualizarPanelAjedrez2();
});

function esTurnoDelHumanoAjedrez2() {
  if (esFreePlayAjedrez2) return true;
  return partidaAjedrez2.turno === miColorAjedrez2;
}

function turnoBotAjedrez2SiCorresponde() {
  if (!partidaAjedrez2 || partidaAjedrez2.terminado || esFreePlayAjedrez2) return;
  if (partidaAjedrez2.turno === miColorAjedrez2) return;
  esperandoBotAjedrez2 = true;
  $("#btn-rendirse-ajedrez2").disabled = true;
  actualizarPanelAjedrez2();
  (async () => {
    if (!partidaAjedrez2 || partidaAjedrez2.terminado) { esperandoBotAjedrez2 = false; return; }
    const colorBot = partidaAjedrez2.turno;
    if (!noresignActivoAjedrez2 && botDeberiaRendirseAjedrez(partidaAjedrez2, colorBot, skillBotAjedrez2)) {
      partidaAjedrez2.rendirse(colorBot);
      esperandoBotAjedrez2 = false;
      $("#btn-rendirse-ajedrez2").disabled = false;
      dibujarTableroAjedrez2();
      actualizarPanelAjedrez2();
      return;
    }
    const jugada = await conTechoDeTiempo(
      jugadaDelAjedrez(partidaAjedrez2, colorBot, skillBotAjedrez2),
      presupuestoPensadaMs(skillBotAjedrez2) + 2000,
      () => jugadaDelAjedrez(partidaAjedrez2, colorBot, 0)
    );
    if (jugada) {
      const r = partidaAjedrez2.mover(jugada.desde, jugada.hasta, "Q");
      if (r.ok) sonidoFichaAjedrez(!!r.capturada);
    }
    esperandoBotAjedrez2 = false;
    $("#btn-rendirse-ajedrez2").disabled = false;
    dibujarTableroAjedrez2();
    actualizarPanelAjedrez2();
  })();
}

function alClickCasillaAjedrez2(x, y) {
  if (!partidaAjedrez2 || partidaAjedrez2.terminado) return;
  if (esperandoBotAjedrez2) return;
  if (!esTurnoDelHumanoAjedrez2()) return;

  const pieza = partidaAjedrez2.pieza(x, y);

  if (seleccionAjedrez2) {
    if (seleccionAjedrez2.x === x && seleccionAjedrez2.y === y) {
      seleccionAjedrez2 = null; legalesAjedrez2 = [];
      cerrarInspectorAjedrez2();
      dibujarTableroAjedrez2();
      return;
    }
    const destino = legalesAjedrez2.find((m) => m.hasta.x === x && m.hasta.y === y);
    if (destino) {
      const r = partidaAjedrez2.mover(seleccionAjedrez2, { x, y });
      seleccionAjedrez2 = null; legalesAjedrez2 = [];
      cerrarInspectorAjedrez2();
      if (r.ok) {
        sonidoFichaAjedrez(!!r.capturada);
        dibujarTableroAjedrez2();
        actualizarPanelAjedrez2();
        turnoBotAjedrez2SiCorresponde();
      } else {
        dibujarTableroAjedrez2();
      }
      return;
    }
  }

  if (pieza && pieza.color === partidaAjedrez2.turno) {
    seleccionAjedrez2 = { x, y };
    legalesAjedrez2 = partidaAjedrez2.movimientosLegales(x, y);
    // Pedido explícito: "cuando le haga click a la ficha que quiero mover
    // se abra un modal al costado que me muestre la ficha seleccionada y
    // pueda inspeccionarla 360" — la selección para mover Y la inspección
    // son el mismo clic, no dos acciones separadas.
    abrirInspectorAjedrez2(personajeDePieza(pieza));
  } else {
    seleccionAjedrez2 = null; legalesAjedrez2 = [];
    cerrarInspectorAjedrez2();
  }
  dibujarTableroAjedrez2();
}

function dibujarTableroAjedrez2() {
  let jaqueCasilla = null;
  if (!partidaAjedrez2.terminado && partidaAjedrez2.estaEnJaque(partidaAjedrez2.turno)) {
    jaqueCasilla = partidaAjedrez2.encontrarRey(partidaAjedrez2.turno);
  }
  tablero3dAjedrez2.actualizar(formacionDesdeChessAjedrez2(partidaAjedrez2), {
    seleccion: seleccionAjedrez2,
    legales: legalesAjedrez2.map((m) => m.hasta),
    ultimoMovimiento: partidaAjedrez2.ultimoMovimiento,
    jaqueCasilla,
  });
}

function actualizarPanelAjedrez2() {
  const piedra = $("#turno-piedra-ajedrez2");
  const texto = $("#turno-texto-ajedrez2");
  if (partidaAjedrez2.terminado) {
    texto.textContent = "Partida terminada";
    piedra.style.background = "linear-gradient(135deg, var(--oro-claro), var(--oro-oscuro))";
  } else {
    const esBlanco = partidaAjedrez2.turno === BLANCO;
    piedra.style.background = esBlanco
      ? "radial-gradient(circle at 35% 30%, #ffffff, #d8cdb4)"
      : "radial-gradient(circle at 35% 30%, #3a352c, #050403)";
    const quien = esFreePlayAjedrez2
      ? (esBlanco ? "Blancas juegan" : "Negras juegan")
      : (partidaAjedrez2.turno === miColorAjedrez2 ? "Tu turno" : (esperandoBotAjedrez2 ? "El bot está pensando…" : "Turno del bot"));
    texto.textContent = quien;
  }
  $("#cap-blancas-ajedrez2").textContent = partidaAjedrez2.capturas[BLANCO].length;
  $("#cap-negras-ajedrez2").textContent = partidaAjedrez2.capturas[NEGRO].length;
  $("#mov-chip-ajedrez2").textContent = partidaAjedrez2.movimientos;

  if (partidaAjedrez2.terminado) {
    $("#btn-rendirse-ajedrez2").disabled = true;
    mostrarResultadoAjedrez2();
  }
}

function mostrarResultadoAjedrez2() {
  const r = partidaAjedrez2.resultado;
  const nombreColor = (c) => (c === BLANCO ? "Blancas" : "Negras");
  let titulo, detalle;

  if (r.ganador === null) {
    titulo = "Tablas";
    const motivos = {
      ahogado: "Ahogado — sin jugadas legales, sin estar en jaque.",
      material_insuficiente: "Tablas por material insuficiente para dar mate.",
      repeticion: "Tablas por repetición de posición.",
    };
    detalle = motivos[r.motivo] || "Partida en tablas.";
  } else if (esFreePlayAjedrez2) {
    titulo = `Ganan las ${nombreColor(r.ganador).toLowerCase()}`;
    detalle = r.motivo === "jaqueMate" ? "Jaque mate." : "Partida ganada por renuncia del rival.";
  } else {
    titulo = r.ganador === miColorAjedrez2 ? "¡Ganaste!" : "Perdiste";
    const motivoTxt = r.motivo === "jaqueMate"
      ? "Jaque mate."
      : (r.ganador === miColorAjedrez2 ? "El bot se rindió." : "Te rendiste.");
    detalle = `${motivoTxt} · Jugaste con ${miColorAjedrez2 === BLANCO ? "blancas" : "negras"}`;
  }

  $("#mensaje-final-titulo").textContent = titulo;
  $("#mensaje-final-detalle").textContent = detalle;
  const piedraIcono = $("#resultado-piedra");
  if (r.ganador === null) {
    piedraIcono.style.background = "linear-gradient(135deg, var(--oro-claro), var(--oro-oscuro))";
  } else {
    piedraIcono.style.background = r.ganador === BLANCO
      ? "radial-gradient(circle at 35% 28%, #ffffff, #eee4cf 60%, #c9bda0 100%)"
      : "radial-gradient(circle at 35% 28%, #4a453a, #141210 55%, #000 100%)";
  }
  setTimeout(() => $("#modal-resultado").classList.add("abierto"), 260);
}

$("#slider-nivel-ajedrez2").style.setProperty("--pct", "0%");
actualizarToggleNoResignAjedrez2();

// ---------------- inspección 360° de una pieza (drawer lateral) ----------------
const NOMBRE_PIEZA_AJEDREZ2 = {
  torreBlanca: "el señor demonio", caballoBlanco: "el inquisidor carmesí", alfilBlanco: "el ángel caído en llamas",
  reinaBlanca: "la caballero medusa", reyBlanco: "el archángel corrupto", peonBlanco: "la armadura oxidada",
  torreNegra: "el señor demonio", alfilNegro: "el ángel caído demoníaco", reinaNegra: "la hechicera oscura",
  reyNegro: "el rey corrupto", peonNegro: "el asesino regicida", caballoNegro: "el centauro guerrero",
  medievalKnight: "el caballero medieval",
};

function abrirInspectorAjedrez2(info) {
  const drawer = $("#ajedrez2-inspector-drawer");
  drawer.classList.remove("cerrado");
  const equipoTxt = info.equipo === "negro" ? "negras" : "blancas";
  const rolTxt = NOMBRE_ROL_AJEDREZ2[info.rol] || "";
  $("#ajedrez2-inspector-titulo").textContent = `${rolTxt} — ${equipoTxt}`.trim();
  $("#ajedrez2-inspector-sub").textContent = NOMBRE_PIEZA_AJEDREZ2[info.id] || info.id;

  if (!inspectorAjedrez2) {
    inspectorAjedrez2 = new AjedrezInspector3D($("#ajedrez2-inspector-canvas"));
  }
  setTimeout(() => inspectorAjedrez2.resize(), 10); // el drawer recién ahora tiene ancho real (transición CSS)
  inspectorAjedrez2.mostrar(info.id);
  if (tablero3dAjedrez2) setTimeout(() => tablero3dAjedrez2.resize(), 350);
}

function cerrarInspectorAjedrez2() {
  $("#ajedrez2-inspector-drawer").classList.add("cerrado");
  if (tablero3dAjedrez2) setTimeout(() => tablero3dAjedrez2.resize(), 350);
}
$("#ajedrez2-inspector-cerrar").addEventListener("click", cerrarInspectorAjedrez2);
