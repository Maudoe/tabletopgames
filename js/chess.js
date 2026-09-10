// ============ Motor de Ajedrez ============
// Reglas reales: movimientos de las 6 piezas, enroque (corto y largo, con
// todas sus condiciones), captura al paso, promoción (auto-reina salvo que
// se indique otra pieza), jaque/jaque mate/ahogado, y tablas por material
// insuficiente o repetición triple. A propósito NO implementa la regla de
// los 50 movimientos sin captura/peón: en una partida casual contra un bot
// simple, esa regla termina la partida sola de golpe en medio de un final
// largo sin que el jugador la esté buscando — más un tropiezo que una
// regla útil acá.
//
// Este archivo asume que go.js ya se cargó antes como <script> (antes que
// este), porque reutiliza sus constantes globales NEGRO/BLANCO/VACIO/otro en
// vez de volver a declararlas (redeclarar const en otro <script> del mismo
// documento tira SyntaxError). Acá NEGRO/BLANCO representan los dos bandos
// (negras/blancas) igual que en Go; VACIO no se usa (el tablero de ajedrez
// guarda piezas, no números, así que las casillas vacías son simplemente
// null).
//
// Convención de coordenadas: x = columna (0=a … 7=h), y = fila (0=1 … 7=8).
// Las piezas blancas arrancan en y=0/1 y avanzan hacia y creciente; las
// negras arrancan en y=6/7 y avanzan hacia y decreciente. mover() acepta
// {x,y} o [x,y] indistintamente.

const SALTOS_CABALLO = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const DELTAS_REY = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const DIRECCIONES_TORRE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRECCIONES_ALFIL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const VALOR_PIEZA = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

function direccionPeon(color) { return color === BLANCO ? 1 : -1; }
function filaInicialPeon(color) { return color === BLANCO ? 1 : 6; }
function filaPromocion(color) { return color === BLANCO ? 7 : 0; }
function normalizarCoord(c) { return Array.isArray(c) ? c : [c.x, c.y]; }

class Ajedrez {
  constructor() {
    this.board = this.crearTableroInicial();
    this.turno = BLANCO; // las blancas siempre empiezan
    this.capturas = { [NEGRO]: [], [BLANCO]: [] }; // piezas rivales que cada color capturó
    this.historial = new Map(); // clave de posición -> veces vista (repetición triple)
    this.derechosEnroque = {
      [BLANCO]: { corto: true, largo: true },
      [NEGRO]: { corto: true, largo: true },
    };
    this.enPassant = null; // casilla capturable al paso este turno, o null
    this.ultimoMovimiento = null;
    this.movimientos = 0; // medias jugadas totales
    this.terminado = false;
    this.resultado = null; // { ganador, motivo }

    this.registrarPosicion();
  }

  crearTableroInicial() {
    const b = new Array(64).fill(null);
    const orden = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    for (let x = 0; x < 8; x++) {
      b[this.idx(x, 0)] = { tipo: orden[x], color: BLANCO };
      b[this.idx(x, 1)] = { tipo: "P", color: BLANCO };
      b[this.idx(x, 6)] = { tipo: "P", color: NEGRO };
      b[this.idx(x, 7)] = { tipo: orden[x], color: NEGRO };
    }
    return b;
  }

  idx(x, y) { return y * 8 + x; }
  dentro(x, y) { return x >= 0 && y >= 0 && x < 8 && y < 8; }
  pieza(x, y) { return this.dentro(x, y) ? this.board[this.idx(x, y)] : null; }

  // Clave de posición: tablero + turno + derechos de enroque + al paso.
  // Sirve tanto para la repetición triple como (indirectamente) para no
  // reevaluar dos veces una misma posición al simular jugadas del bot.
  clave() {
    const tablero = this.board.map((p) => (p ? p.color + p.tipo : ".")).join("");
    const d = this.derechosEnroque;
    const dcad = `${d[BLANCO].corto ? 1 : 0}${d[BLANCO].largo ? 1 : 0}${d[NEGRO].corto ? 1 : 0}${d[NEGRO].largo ? 1 : 0}`;
    const ep = this.enPassant ? `${this.enPassant.x},${this.enPassant.y}` : "-";
    return `${tablero}|${this.turno}|${dcad}|${ep}`;
  }

  registrarPosicion() {
    const clave = this.clave();
    const veces = (this.historial.get(clave) || 0) + 1;
    this.historial.set(clave, veces);
    return veces;
  }

  // ---------- Generación de movimientos ----------
  // Los movimientos son objetos { desde:{x,y}, hasta:{x,y}, tipo }, con
  // tipo en "normal" | "captura" | "doble" | "enPassant" | "promocion" |
  // "enroqueCorto" | "enroqueLargo". movimientosLegales(x,y) es la que
  // filtra por "no deja al propio rey en jaque" (ahí está el manejo de
  // clavadas): cada pseudo-movimiento se aplica sobre el tablero real, se
  // revisa si el rey propio queda atacado, y se deshace.
  // No filtra por this.turno a propósito: quien decide si corresponde mover
  // ese color es mover() (antes de llamar acá) — dejar esto sin esa
  // restricción es lo que permite pedir "cuántas jugadas legales tiene el
  // rival ahora mismo" sin tener que cambiar el turno para consultarlo.
  movimientosLegales(x, y) {
    const p = this.pieza(x, y);
    if (!p) return [];
    const pseudo = this.pseudoMovimientos(x, y);
    const legales = [];
    for (const mv of pseudo) {
      const snapBoard = this.board.map((c) => (c ? { ...c } : null));
      const snapEnPassant = this.enPassant;
      this.aplicarCrudo(mv, p.color);
      const enJaque = this.estaEnJaque(p.color);
      this.board = snapBoard;
      this.enPassant = snapEnPassant;
      if (!enJaque) legales.push(mv);
    }
    return legales;
  }

  todosMovimientosLegales(color) {
    const todos = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = this.pieza(x, y);
        if (p && p.color === color) todos.push(...this.movimientosLegales(x, y));
      }
    }
    return todos;
  }

  pseudoMovimientos(x, y) {
    const p = this.pieza(x, y);
    if (!p) return [];
    switch (p.tipo) {
      case "P": return this.generarPeon(x, y, p.color);
      case "N": return this.generarSaltos(x, y, p.color, SALTOS_CABALLO);
      case "B": return this.generarDeslizante(x, y, p.color, DIRECCIONES_ALFIL);
      case "R": return this.generarDeslizante(x, y, p.color, DIRECCIONES_TORRE);
      case "Q": return this.generarDeslizante(x, y, p.color, DIRECCIONES_TORRE.concat(DIRECCIONES_ALFIL));
      case "K": return this.generarSaltos(x, y, p.color, DELTAS_REY).concat(this.generarEnroques(x, y, p.color));
      default: return [];
    }
  }

  generarPeon(x, y, color) {
    const moves = [];
    const dir = direccionPeon(color);
    const filaProm = filaPromocion(color);

    if (this.dentro(x, y + dir) && !this.pieza(x, y + dir)) {
      moves.push(this.movPeon(x, y, x, y + dir, filaProm, false));
      if (y === filaInicialPeon(color) && !this.pieza(x, y + 2 * dir)) {
        moves.push({ desde: { x, y }, hasta: { x, y: y + 2 * dir }, tipo: "doble" });
      }
    }

    for (const dx of [-1, 1]) {
      const nx = x + dx, ny = y + dir;
      if (!this.dentro(nx, ny)) continue;
      const objetivo = this.pieza(nx, ny);
      if (objetivo && objetivo.color !== color) {
        moves.push(this.movPeon(x, y, nx, ny, filaProm, true));
      } else if (!objetivo && this.enPassant && this.enPassant.x === nx && this.enPassant.y === ny) {
        moves.push({ desde: { x, y }, hasta: { x: nx, y: ny }, tipo: "enPassant" });
      }
    }
    return moves;
  }

  movPeon(x, y, nx, ny, filaProm, captura) {
    const tipo = ny === filaProm ? "promocion" : captura ? "captura" : "normal";
    return { desde: { x, y }, hasta: { x: nx, y: ny }, tipo };
  }

  generarSaltos(x, y, color, deltas) {
    const moves = [];
    for (const [dx, dy] of deltas) {
      const nx = x + dx, ny = y + dy;
      if (!this.dentro(nx, ny)) continue;
      const obj = this.pieza(nx, ny);
      if (!obj) moves.push({ desde: { x, y }, hasta: { x: nx, y: ny }, tipo: "normal" });
      else if (obj.color !== color) moves.push({ desde: { x, y }, hasta: { x: nx, y: ny }, tipo: "captura" });
    }
    return moves;
  }

  generarDeslizante(x, y, color, direcciones) {
    const moves = [];
    for (const [dx, dy] of direcciones) {
      let nx = x + dx, ny = y + dy;
      while (this.dentro(nx, ny)) {
        const obj = this.pieza(nx, ny);
        if (!obj) {
          moves.push({ desde: { x, y }, hasta: { x: nx, y: ny }, tipo: "normal" });
        } else {
          if (obj.color !== color) moves.push({ desde: { x, y }, hasta: { x: nx, y: ny }, tipo: "captura" });
          break;
        }
        nx += dx; ny += dy;
      }
    }
    return moves;
  }

  // El rey no debe estar en jaque, ni pasar, ni terminar en una casilla
  // atacada; las casillas entre rey y torre deben estar vacías. Se chequea
  // acá con el tablero real (nada se movió todavía), y movimientosLegales
  // vuelve a validar la casilla final por las dudas (clavadas indirectas).
  generarEnroques(x, y, color) {
    const moves = [];
    if (this.estaEnJaque(color)) return moves;
    const fila = color === BLANCO ? 0 : 7;
    if (x !== 4 || y !== fila) return moves;
    const derechos = this.derechosEnroque[color];
    const rival = otro(color);

    if (derechos.corto &&
        !this.pieza(5, fila) && !this.pieza(6, fila) &&
        this.pieza(7, fila) && this.pieza(7, fila).tipo === "R" && this.pieza(7, fila).color === color &&
        !this.casillaAtacada(5, fila, rival) && !this.casillaAtacada(6, fila, rival)) {
      moves.push({ desde: { x, y }, hasta: { x: 6, y: fila }, tipo: "enroqueCorto" });
    }
    if (derechos.largo &&
        !this.pieza(1, fila) && !this.pieza(2, fila) && !this.pieza(3, fila) &&
        this.pieza(0, fila) && this.pieza(0, fila).tipo === "R" && this.pieza(0, fila).color === color &&
        !this.casillaAtacada(3, fila, rival) && !this.casillaAtacada(2, fila, rival)) {
      moves.push({ desde: { x, y }, hasta: { x: 2, y: fila }, tipo: "enroqueLargo" });
    }
    return moves;
  }

  // ¿La casilla (x,y) está atacada por alguna pieza de `color`? Se usa para
  // jaque, y para las condiciones de "no pasar/aterrizar en jaque" del enroque.
  casillaAtacada(x, y, color) {
    const dir = direccionPeon(color);
    for (const dx of [-1, 1]) {
      const p = this.pieza(x - dx, y - dir);
      if (p && p.color === color && p.tipo === "P") return true;
    }
    for (const [dx, dy] of SALTOS_CABALLO) {
      const p = this.pieza(x + dx, y + dy);
      if (p && p.color === color && p.tipo === "N") return true;
    }
    for (const [dx, dy] of DELTAS_REY) {
      const p = this.pieza(x + dx, y + dy);
      if (p && p.color === color && p.tipo === "K") return true;
    }
    for (const [dx, dy] of DIRECCIONES_TORRE) {
      let cx = x + dx, cy = y + dy;
      while (this.dentro(cx, cy)) {
        const p = this.pieza(cx, cy);
        if (p) { if (p.color === color && (p.tipo === "R" || p.tipo === "Q")) return true; break; }
        cx += dx; cy += dy;
      }
    }
    for (const [dx, dy] of DIRECCIONES_ALFIL) {
      let cx = x + dx, cy = y + dy;
      while (this.dentro(cx, cy)) {
        const p = this.pieza(cx, cy);
        if (p) { if (p.color === color && (p.tipo === "B" || p.tipo === "Q")) return true; break; }
        cx += dx; cy += dy;
      }
    }
    return false;
  }

  encontrarRey(color) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = this.pieza(x, y);
        if (p && p.tipo === "K" && p.color === color) return { x, y };
      }
    }
    return null;
  }

  estaEnJaque(color) {
    const rey = this.encontrarRey(color);
    if (!rey) return false;
    return this.casillaAtacada(rey.x, rey.y, otro(color));
  }

  // Ejecuta un movimiento sobre this.board sin tocar turno/historial/
  // capturas/derechos de enroque: lo usan tanto la simulación de legalidad
  // (que después deshace todo) como mover() para el movimiento real.
  aplicarCrudo(mv, color, piezaPromocion) {
    const pieza = this.board[this.idx(mv.desde.x, mv.desde.y)];
    let capturada = this.board[this.idx(mv.hasta.x, mv.hasta.y)];
    this.board[this.idx(mv.desde.x, mv.desde.y)] = null;

    if (mv.tipo === "enPassant") {
      capturada = this.board[this.idx(mv.hasta.x, mv.desde.y)];
      this.board[this.idx(mv.hasta.x, mv.desde.y)] = null;
    }

    this.board[this.idx(mv.hasta.x, mv.hasta.y)] = {
      tipo: mv.tipo === "promocion" ? (piezaPromocion || "Q") : pieza.tipo,
      color,
    };

    if (mv.tipo === "enroqueCorto" || mv.tipo === "enroqueLargo") {
      const fila = mv.desde.y;
      const torreDesde = mv.tipo === "enroqueCorto" ? 7 : 0;
      const torreHasta = mv.tipo === "enroqueCorto" ? mv.hasta.x - 1 : mv.hasta.x + 1;
      const torre = this.board[this.idx(torreDesde, fila)];
      this.board[this.idx(torreDesde, fila)] = null;
      this.board[this.idx(torreHasta, fila)] = torre;
    }

    // El al paso solo queda "vivo" para la jugada inmediatamente siguiente.
    if (pieza.tipo === "P" && Math.abs(mv.hasta.y - mv.desde.y) === 2) {
      this.enPassant = { x: mv.desde.x, y: (mv.desde.y + mv.hasta.y) / 2 };
    } else {
      this.enPassant = null;
    }

    return { capturada };
  }

  // Si se movió o se capturó una pieza en a1/h1/a8/h8, se pierde el derecho
  // de enroque de ese lado (sirve tanto si la torre se movió como si la
  // capturaron ahí sin moverse).
  revisarCasillaTorre(x, y) {
    if (y === 0) {
      if (x === 0) this.derechosEnroque[BLANCO].largo = false;
      if (x === 7) this.derechosEnroque[BLANCO].corto = false;
    }
    if (y === 7) {
      if (x === 0) this.derechosEnroque[NEGRO].largo = false;
      if (x === 7) this.derechosEnroque[NEGRO].corto = false;
    }
  }

  esMaterialInsuficiente() {
    const piezas = this.board.filter((p) => p && p.tipo !== "K");
    if (piezas.length === 0) return true; // rey contra rey
    if (piezas.length === 1 && (piezas[0].tipo === "N" || piezas[0].tipo === "B")) return true; // rey+menor contra rey solo
    return false;
  }

  // Intenta mover de `desde` a `hasta` ({x,y} o [x,y]). `promocion` es
  // opcional ("Q"|"R"|"B"|"N", default reina) y solo se usa si la jugada es
  // una promoción. Devuelve { ok, motivo, capturada, jaque, jaqueMate, tablas }:
  // en éxito `motivo` es el tipo de jugada jugada (útil para animaciones en
  // la UI), en fallo es la razón por la que se rechazó.
  mover(desde, hasta, promocion = "Q") {
    if (this.terminado) return { ok: false, motivo: "terminado" };
    const [dx, dy] = normalizarCoord(desde);
    const [hx, hy] = normalizarCoord(hasta);
    if (!this.dentro(dx, dy) || !this.dentro(hx, hy)) return { ok: false, motivo: "fuera" };

    const pieza = this.pieza(dx, dy);
    if (!pieza || pieza.color !== this.turno) return { ok: false, motivo: "pieza_invalida" };

    const legales = this.movimientosLegales(dx, dy);
    const mv = legales.find((m) => m.hasta.x === hx && m.hasta.y === hy);
    if (!mv) return { ok: false, motivo: "ilegal" };

    const piezasProm = ["Q", "R", "B", "N"];
    const piezaPromocion = piezasProm.includes(promocion) ? promocion : "Q";

    const color = this.turno;
    const rival = otro(color);

    const { capturada } = this.aplicarCrudo(mv, color, piezaPromocion);
    if (capturada) this.capturas[color].push(capturada.tipo);

    if (pieza.tipo === "K") {
      this.derechosEnroque[color].corto = false;
      this.derechosEnroque[color].largo = false;
    }
    this.revisarCasillaTorre(dx, dy);
    this.revisarCasillaTorre(hx, hy);

    this.turno = rival;
    this.movimientos++;
    this.ultimoMovimiento = { desde: { x: dx, y: dy }, hasta: { x: hx, y: hy }, tipo: mv.tipo, color };

    const veces = this.registrarPosicion();
    const jaque = this.estaEnJaque(rival);
    const tieneMovimientos = this.todosMovimientosLegales(rival).length > 0;
    let jaqueMate = false, tablas = false;

    if (!tieneMovimientos) {
      this.terminado = true;
      if (jaque) { jaqueMate = true; this.resultado = { ganador: color, motivo: "jaqueMate" }; }
      else { tablas = true; this.resultado = { ganador: null, motivo: "ahogado" }; }
    } else if (this.esMaterialInsuficiente()) {
      tablas = true; this.terminado = true; this.resultado = { ganador: null, motivo: "material_insuficiente" };
    } else if (veces >= 3) {
      tablas = true; this.terminado = true; this.resultado = { ganador: null, motivo: "repeticion" };
    }

    return { ok: true, motivo: mv.tipo, capturada: capturada ? capturada.tipo : null, jaque, jaqueMate, tablas };
  }

  rendirse(color) {
    if (this.terminado) return;
    this.terminado = true;
    this.resultado = { ganador: otro(color), motivo: "renuncia" };
  }

  // Copia independiente del estado completo, usada por el bot para probar
  // jugadas sin tocar la partida real.
  clonar() {
    const copia = new Ajedrez();
    copia.board = this.board.map((p) => (p ? { ...p } : null));
    copia.turno = this.turno;
    copia.capturas = { [NEGRO]: [...this.capturas[NEGRO]], [BLANCO]: [...this.capturas[BLANCO]] };
    copia.historial = new Map(this.historial);
    copia.derechosEnroque = {
      [BLANCO]: { ...this.derechosEnroque[BLANCO] },
      [NEGRO]: { ...this.derechosEnroque[NEGRO] },
    };
    copia.enPassant = this.enPassant ? { ...this.enPassant } : null;
    copia.ultimoMovimiento = this.ultimoMovimiento;
    copia.movimientos = this.movimientos;
    copia.terminado = this.terminado;
    copia.resultado = this.resultado;
    return copia;
  }
}

// ============ Bot: minimax con poda alfa-beta + iterative deepening ============
// A diferencia del bot anterior (que evaluaba una sola jugada a la vez, sin
// mirar la respuesta del rival), acá cada jugada candidata se explora varios
// medios-movimientos hacia adelante: minimax con poda alfa-beta, tablas
// posicionales por pieza, un término de movilidad, quiescence search en las
// capturas (para no cortar la búsqueda justo antes de perder una pieza
// colgada, el clásico "horizon effect"), y profundización iterativa dentro
// de un presupuesto de tiempo (ver presupuestoPensadaMs en motorbot.js).
//
// La búsqueda está escrita como generadores (function*) que ceden el
// control cada tantos nodos — motorbot.js la recorre en lotes con un
// setTimeout(0) entre medio, para no congelar la animación de la sala 3D
// mientras el bot piensa (ver comentario en motorbot.js: file:// no permite
// un Web Worker real acá).

// Tablas posicionales (rank8→rank1, valores tipo centipawn estándar de
// chess-programming, acá se dividen por 100 para vivir en la misma escala
// "en peones" que VALOR_PIEZA). valorPST() las espeja según el color: para
// blanco la fila 0 de la tabla es la octava fila del tablero (y=7), para
// negro es al revés.
const TABLA_PEON_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];
const TABLA_CABALLO_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];
const TABLA_ALFIL_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];
const TABLA_TORRE_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];
const TABLA_DAMA_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];
const TABLA_REY_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];
const TABLAS_PST = { P: TABLA_PEON_PST, N: TABLA_CABALLO_PST, B: TABLA_ALFIL_PST, R: TABLA_TORRE_PST, Q: TABLA_DAMA_PST, K: TABLA_REY_PST };

function valorPST(tipo, x, y, color) {
  const fila = color === BLANCO ? 7 - y : y;
  return TABLAS_PST[tipo][fila][x];
}

// Movilidad barata (jugadas pseudo-legales, sin filtrar por jaque propio):
// mucho más rápido que todosMovimientosLegales en cada hoja del árbol, que
// tendría que simular+deshacer cada pseudo-movimiento para chequear jaque.
// Como diferencia entre ambos colores alcanza para orientar al bot hacia
// posiciones activas sin pagar ese costo en cada nodo.
function movilidadPseudo(ajedrez, color) {
  let total = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = ajedrez.pieza(x, y);
      if (p && p.color === color) total += ajedrez.pseudoMovimientos(x, y).length;
    }
  }
  return total;
}

function evaluarPosicion(ajedrez, color) {
  let total = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = ajedrez.pieza(x, y);
      if (!p || p.color !== color) continue;
      total += VALOR_PIEZA[p.tipo] + valorPST(p.tipo, x, y, color) / 100;
    }
  }
  total += movilidadPseudo(ajedrez, color) * 0.01;
  return total;
}

// Puntaje relativo al jugador que tiene el turno en `ajedrez` (convención
// negamax: cada nivel de la recursión niega el resultado del nivel de
// abajo, así que la evaluación siempre es "cómo estoy yo, el que mueve acá").
function evaluarPosicionRelativa(ajedrez) {
  const color = ajedrez.turno;
  return evaluarPosicion(ajedrez, color) - evaluarPosicion(ajedrez, otro(color));
}

// Puntaje de una posición ya terminada (jaqueMate/ahogado/tablas), también
// relativo a quien tiene el turno ahí (que si es jaqueMate, es quien perdió).
function puntajeTerminal(ajedrez) {
  if (!ajedrez.resultado || !ajedrez.resultado.ganador) return 0;
  return ajedrez.resultado.ganador === ajedrez.turno ? 100000 : -100000;
}

// Orden MVV-LVA (víctima más valiosa primero, con el atacante más barato
// como desempate) para que la poda alfa-beta corte lo antes posible;
// `prioridad`, si se pasa, es la mejor jugada de la profundidad anterior de
// iterative deepening y va primera (suele seguir siendo buena).
function puntajeOrden(ajedrez, mv) {
  if (mv.tipo === "captura" || mv.tipo === "enPassant") {
    const atacante = ajedrez.pieza(mv.desde.x, mv.desde.y);
    const victima = mv.tipo === "enPassant" ? { tipo: "P" } : ajedrez.pieza(mv.hasta.x, mv.hasta.y);
    return VALOR_PIEZA[victima.tipo] * 10 - VALOR_PIEZA[atacante.tipo];
  }
  if (mv.tipo === "promocion") return 80;
  return 0;
}
function ordenarJugadas(ajedrez, movs, prioridad) {
  const arr = movs.slice().sort((a, b) => puntajeOrden(ajedrez, b) - puntajeOrden(ajedrez, a));
  if (prioridad) {
    const i = arr.findIndex((m) => m.desde.x === prioridad.desde.x && m.desde.y === prioridad.desde.y && m.hasta.x === prioridad.hasta.x && m.hasta.y === prioridad.hasta.y);
    if (i > 0) { const [mv] = arr.splice(i, 1); arr.unshift(mv); }
  }
  return arr;
}

// Quiescence search: en la hoja del árbol principal, sigue explorando sólo
// capturas (tope de 4 medios-movimientos extra) hasta llegar a una posición
// "tranquila" antes de evaluar — evita el horizon effect de cortar justo
// antes de una recaptura que cambia todo el balance de material.
function* quiescence(ajedrez, alfa, beta, contador, profundidadRestante) {
  const standPat = evaluarPosicionRelativa(ajedrez);
  if (standPat >= beta) return beta;
  if (standPat > alfa) alfa = standPat;
  if (profundidadRestante <= 0) return alfa;

  const color = ajedrez.turno;
  const capturas = ordenarJugadas(ajedrez, ajedrez.todosMovimientosLegales(color).filter(
    (mv) => mv.tipo === "captura" || mv.tipo === "enPassant" || mv.tipo === "promocion"
  ));
  let mejor = alfa;
  for (const mv of capturas) {
    const copia = ajedrez.clonar();
    copia.mover(mv.desde, mv.hasta, "Q");
    contador.n++;
    if (contador.n % 400 === 0) yield;
    const val = copia.terminado
      ? -puntajeTerminal(copia)
      : -(yield* quiescence(copia, -beta, -alfa, contador, profundidadRestante - 1));
    if (val > mejor) mejor = val;
    if (mejor > alfa) alfa = mejor;
    if (alfa >= beta) break;
  }
  return mejor;
}

// Minimax (forma negamax) con poda alfa-beta. Usa Ajedrez.clonar()+mover()
// para simular cada jugada (no hace falta un motor de make/unmove más
// rápido: el presupuesto de tiempo por jugada son unos pocos segundos, y
// clonar ya lo usaba el bot anterior).
function* negamax(ajedrez, profundidad, alfa, beta, contador) {
  if (ajedrez.terminado) return puntajeTerminal(ajedrez);
  if (profundidad <= 0) return yield* quiescence(ajedrez, alfa, beta, contador, 4);

  const color = ajedrez.turno;
  const candidatas = ordenarJugadas(ajedrez, ajedrez.todosMovimientosLegales(color));
  if (candidatas.length === 0) return 0; // red de seguridad: mover() ya debería haber marcado terminado

  let mejor = -Infinity;
  for (const mv of candidatas) {
    const copia = ajedrez.clonar();
    copia.mover(mv.desde, mv.hasta, "Q");
    contador.n++;
    if (contador.n % 400 === 0) yield;
    const val = -(yield* negamax(copia, profundidad - 1, -beta, -alfa, contador));
    if (val > mejor) mejor = val;
    if (mejor > alfa) alfa = mejor;
    if (alfa >= beta) break;
  }
  return mejor;
}

// Búsqueda del nivel raíz: igual que negamax pero sin poda beta (queremos
// evaluar todas las jugadas del root para saber cuál es la mejor, no sólo
// probar que ninguna supera un límite) y guardando la mejor encontrada hasta
// el momento en `mejorRef` — así, si el presupuesto de tiempo se corta a
// mitad de esta profundidad, ya hay una jugada válida guardada afuera.
function* buscarRaiz(ajedrez, profundidad, contador, mejorRef, prioridad) {
  const color = ajedrez.turno;
  const candidatas = ordenarJugadas(ajedrez, ajedrez.todosMovimientosLegales(color), prioridad);
  if (candidatas.length === 0) { mejorRef.jugada = null; return; }

  let alfa = -Infinity;
  const beta = Infinity;
  for (const mv of candidatas) {
    const copia = ajedrez.clonar();
    copia.mover(mv.desde, mv.hasta, "Q");
    contador.n++;
    if (contador.n % 400 === 0) yield;
    const val = -(yield* negamax(copia, profundidad - 1, -beta, -alfa, contador));
    if (val > alfa) { alfa = val; mejorRef.jugada = mv; mejorRef.valor = val; }
  }
}

// Punto de entrada del bot (misma firma que antes, ahora async porque la
// búsqueda real tarda un rato — ver motorbot.js). Con probabilidad (1-skill)
// sigue jugando al azar sin pensar nada, igual que el bot anterior, para que
// los niveles bajos del slider sigan siendo claramente vencibles aunque el
// motor fuerte esté disponible.
async function jugadaDelAjedrez(ajedrez, color, skill = 0.6) {
  const candidatas = ajedrez.todosMovimientosLegales(color);
  if (candidatas.length === 0) return null;
  // Cuadrático, igual que el bot de Go: los niveles medios piensan la gran
  // mayoría de las jugadas (nivel 5: 3 de cada 4), sólo los niveles 1-2
  // siguen siendo mayormente azar.
  const probAzar = (1 - skill) * (1 - skill);
  if (Math.random() < probAzar) return candidatas[Math.floor(Math.random() * candidatas.length)];

  const presupuesto = presupuestoPensadaMs(skill);
  const finGlobal = performance.now() + presupuesto;
  const mejorRef = { jugada: candidatas[0], valor: -Infinity };
  const TOPE_PROFUNDIDAD = 8;
  let profundidad = 1;
  let mvPrioridad = null;

  while (profundidad <= TOPE_PROFUNDIDAD) {
    const tiempoRestante = finGlobal - performance.now();
    if (tiempoRestante <= 15) break;
    const contador = { n: 0 };
    const gen = buscarRaiz(ajedrez.clonar(), profundidad, contador, mejorRef, mvPrioridad);
    await ejecutarBusquedaCooperativa(gen, tiempoRestante);
    mvPrioridad = mejorRef.jugada;
    profundidad++;
  }
  return mejorRef.jugada;
}

function valorMaterial(ajedrez, color) {
  let total = 0;
  for (const p of ajedrez.board) {
    if (p && p.color === color) total += VALOR_PIEZA[p.tipo];
  }
  return total;
}

// Igual que botDeberiaRendirse de Go (con otro nombre a propósito: los dos
// scripts comparten el scope global de <script> planos, y una segunda
// declaración de la misma función pisaría silenciosamente a la de Go): piso
// de jugadas para no rendirse apenas empezó, diferencia de material contra
// un umbral ("más que una torre" de desventaja), y probabilidad que escala
// con el nivel.
function botDeberiaRendirseAjedrez(ajedrez, color, skill = 0.6) {
  if (ajedrez.movimientos < 16) return false;

  const propio = valorMaterial(ajedrez, color);
  const rival = valorMaterial(ajedrez, otro(color));
  const diferencia = rival - propio;
  const umbral = 5; // el valor de una torre

  if (diferencia < umbral) return false;

  const probabilidad = 0.05 + skill * 0.12;
  return Math.random() < probabilidad;
}
