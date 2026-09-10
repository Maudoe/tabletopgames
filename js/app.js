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
}
function cerrarModalGo() { $("#modal-go").classList.remove("abierto"); }

$$(".tarjeta-juego").forEach((tarjeta) => {
  tarjeta.addEventListener("click", () => {
    const juego = tarjeta.dataset.juego;
    if (juego === "go") abrirModalGo();
    else if (juego === "ajedrez") abrirModalAjedrez();
    else if (juego === "teg") abrirModalTeg();
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
const NOMBRES_PRONTO = {
  damas: { icono: "⛃", titulo: "Damas", desc: "Falta terminar la captura obligatoria y las coronas. Mientras tanto, jugá una partida de Go o Ajedrez." },
};
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
  document.documentElement.classList.toggle("pantalla-completa", enPantallaCompleta);
  // el contenedor cambia de tamaño al entrar/salir: el canvas de Three.js
  // (o el mapa de Leaflet) no se entera solo, hay que avisarle.
  if (tablero3d) setTimeout(() => tablero3d.resize(), 60);
  if (tablero3dAjedrez) setTimeout(() => tablero3dAjedrez.resize(), 60);
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

// Vista previa grande: el tablero elegido con un puñado de piedras de cada
// color, para responder "cómo se vería" antes de jugar.
function redibujarPreview() {
  const cv = $("#preview-tablero");
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  dibujarSwatchTablero(ctx, w, h, PALETA_TABLEROS[form.tablero]);

  const radio = h * 0.16;
  const y = h * 0.5;
  const posiciones = [0.14, 0.30, 0.46, 0.62, 0.78, 0.92];
  posiciones.forEach((fx, i) => {
    const cfg = PALETA_PIEDRAS[i % 2 === 0 ? form.colorNegro : form.colorBlanco];
    const cvPiedra = document.createElement("canvas");
    const N = 80;
    cvPiedra.width = cvPiedra.height = N;
    dibujarMarmol(cvPiedra.getContext("2d"), N, cfg);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w * fx, y + (i % 2 === 0 ? -radio * 0.55 : radio * 0.55), radio, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.drawImage(cvPiedra, w * fx - radio, y + (i % 2 === 0 ? -radio * 0.55 : radio * 0.55) - radio, radio * 2, radio * 2);
    ctx.restore();
  });
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
construirSwatchesLuz("swatches-luz", form);
redibujarPreview();

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

function abrirModalAjedrez() { $("#modal-ajedrez").classList.add("abierto"); }
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

function redibujarPreviewAjedrez() {
  const cv = $("#preview-tablero-ajedrez");
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  dibujarSwatchTablero(ctx, w, h, PALETA_TABLEROS_AJEDREZ[formAjedrez.tablero]);

  const radio = h * 0.19;
  const y = h * 0.54;
  const posiciones = [0.14, 0.30, 0.46, 0.62, 0.78, 0.92];
  posiciones.forEach((fx, i) => {
    const cfg = PALETA_PIEDRAS[i % 2 === 0 ? formAjedrez.colorNegras : formAjedrez.colorBlancas];
    const cvPieza = document.createElement("canvas");
    const N = 80;
    cvPieza.width = cvPieza.height = N;
    dibujarMarmol(cvPieza.getContext("2d"), N, cfg);
    const cy = y + (i % 2 === 0 ? -radio * 0.35 : radio * 0.35);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    trazarSiluetaPeon(ctx, w * fx, cy, radio);
    ctx.clip();
    ctx.drawImage(cvPieza, w * fx - radio, cy - radio, radio * 2, radio * 2);
    ctx.restore();
  });
}

construirSwatchesPiedra("swatches-blancas-ajedrez", "colorBlancas", formAjedrez, redibujarPreviewAjedrez, "swatch-pieza");
construirSwatchesPiedra("swatches-negras-ajedrez", "colorNegras", formAjedrez, redibujarPreviewAjedrez, "swatch-pieza");
construirSwatchesTablero("swatches-tablero-ajedrez", formAjedrez, redibujarPreviewAjedrez, PALETA_TABLEROS_AJEDREZ);
construirSwatchesLuz("swatches-luz-ajedrez", formAjedrez);
redibujarPreviewAjedrez();

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
function _cargarPistaMusica(indice) {
  if (!PISTAS_MUSICA_AJEDREZ.length) return;
  _asegurarOrdenMusica();
  indiceMusicaAjedrez = ((indice % ordenMusicaAjedrez.length) + ordenMusicaAjedrez.length) % ordenMusicaAjedrez.length;
  const el = $("#musica-ajedrez");
  el.src = PISTAS_MUSICA_AJEDREZ[ordenMusicaAjedrez[indiceMusicaAjedrez]];
  el.play().catch(() => {});
}
function reproducirMusicaAjedrez() {
  if (!PISTAS_MUSICA_AJEDREZ.length) return;
  if (indiceMusicaAjedrez === -1) _cargarPistaMusica(0);
  else $("#musica-ajedrez").play().catch(() => {});
}
function pausarMusicaAjedrez() { $("#musica-ajedrez").pause(); }
function siguientePistaMusica() { _cargarPistaMusica(indiceMusicaAjedrez + 1); }
function anteriorPistaMusica() { _cargarPistaMusica(indiceMusicaAjedrez - 1); }

// Hay dos reproductores en la página (cabecera de Go y de Ajedrez, ambos
// controlando el mismo <audio>), por eso todo esto va por clase — clic en
// cualquiera de los dos actualiza los dos (querySelectorAll, no un id).
$("#musica-ajedrez").addEventListener("ended", siguientePistaMusica);
$("#musica-ajedrez").addEventListener("play", () => {
  $$(".btn-musica-play").forEach((b) => { b.textContent = "⏸ Música"; b.classList.add("activo-musica"); });
});
$("#musica-ajedrez").addEventListener("pause", () => {
  $$(".btn-musica-play").forEach((b) => { b.textContent = "▶ Música"; b.classList.remove("activo-musica"); });
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
const formTeg = { cantidadJugadores: 3, bots: [false, true, true, true, true, true], nivel: 5, colorJugador: "azul" };

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
  return partidaTeg.jugadores.map((_, idx) => PALETA_JUGADORES_TEG[orden[idx]].color);
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
