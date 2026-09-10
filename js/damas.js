// ============ Motor de Damas ============
// Reglas: tablero 8×8, piezas sólo en las casillas oscuras. Captura
// obligatoria (si hay alguna captura disponible en el tablero, sólo se
// pueden jugar capturas) y encadenada (si tras comer la misma ficha puede
// seguir comiendo, el turno no pasa hasta que se termine la cadena). Las
// piezas normales ("peones") sólo avanzan en diagonal hacia adelante para
// moverse, pero capturan en las 4 diagonales (no sólo hacia adelante) —
// convención habitual de las damas "a la española" más que las damas
// americanas de captura sólo hacia adelante. Al llegar a la última fila se
// coronan en "dama".
//
// Simplificación consciente (mismo criterio de honestidad que ya se usó
// para TEG): la dama NO es una "dama voladora" completa de las damas
// internacionales (que puede capturar desde lejos, a cualquier distancia
// de la pieza rival, y elegir dónde aterrizar). Acá la dama sólo gana
// alcance para MOVERSE (desliza como un alfil, cualquier distancia en
// diagonal), pero captura exactamente igual que un peón: la pieza rival
// tiene que estar en la casilla diagonal inmediata, y aterriza en la
// casilla inmediata siguiente. Es la regla más simple/extendida en
// versiones casuales de damas y evita la complejidad extra de "elegir
// dónde aterriza la voladora" en la UI.
//
// Este archivo asume que go.js ya se cargó antes (reutiliza NEGRO/BLANCO/
// otro), igual que chess.js.
//
// Convención de coordenadas: x = columna (0..7), y = fila (0..7). Las
// blancas arrancan en y=0,1,2 y avanzan hacia y creciente; las negras
// arrancan en y=5,6,7 y avanzan hacia y decreciente. Sólo se usan las
// casillas oscuras: (x+y) impar.

const DIAGONALES_DAMAS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const VALOR_PEON_DAMAS = 1;
const VALOR_DAMA_DAMAS = 1.75;

function direccionPeonDamas(color) { return color === BLANCO ? 1 : -1; }
function filaCoronacionDamas(color) { return color === BLANCO ? 7 : 0; }
function normalizarCoordDamas(c) { return Array.isArray(c) ? c : [c.x, c.y]; }

class Damas {
  constructor() {
    this.board = this.crearTableroInicial();
    this.turno = BLANCO; // las blancas siempre empiezan
    this.capturas = { [NEGRO]: 0, [BLANCO]: 0 }; // cantidad de piezas rivales comidas por cada color
    this.capturaObligada = null; // {x,y} de la ficha que está a mitad de una cadena de capturas, o null
    this.ultimoMovimiento = null; // { desde, hasta, tipo, color, comida:{x,y}|null }
    this.movimientos = 0;
    this.terminado = false;
    this.resultado = null; // { ganador, motivo }
  }

  crearTableroInicial() {
    const b = new Array(64).fill(null);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 !== 1) continue; // sólo casillas oscuras
        if (y <= 2) b[this.idx(x, y)] = { color: BLANCO, dama: false };
        else if (y >= 5) b[this.idx(x, y)] = { color: NEGRO, dama: false };
      }
    }
    return b;
  }

  idx(x, y) { return y * 8 + x; }
  dentro(x, y) { return x >= 0 && y >= 0 && x < 8 && y < 8; }
  pieza(x, y) { return this.dentro(x, y) ? this.board[this.idx(x, y)] : null; }

  // ---------- Generación de movimientos ----------
  // No filtra por this.turno ni por capturaObligada a propósito — eso lo
  // hace movimientosLegales()/todosMovimientosLegales(), que son los que de
  // verdad se usan para jugar. Acá abajo son los movimientos "en bruto" de
  // una pieza puntual, sin las reglas de "captura obligatoria en todo el
  // tablero" ni "seguir la cadena con la misma ficha".
  capturasDe(x, y) {
    const p = this.pieza(x, y);
    if (!p) return [];
    const moves = [];
    for (const [dx, dy] of DIAGONALES_DAMAS) {
      const mx = x + dx, my = y + dy; // casilla de la pieza a comer
      const hx = x + dx * 2, hy = y + dy * 2; // casilla de aterrizaje
      if (!this.dentro(hx, hy)) continue;
      const media = this.pieza(mx, my);
      if (!media || media.color === p.color) continue;
      if (this.pieza(hx, hy)) continue;
      moves.push({ desde: { x, y }, hasta: { x: hx, y: hy }, tipo: "captura", comida: { x: mx, y: my } });
    }
    return moves;
  }

  movimientosSimplesDe(x, y) {
    const p = this.pieza(x, y);
    if (!p) return [];
    const moves = [];
    if (p.dama) {
      for (const [dx, dy] of DIAGONALES_DAMAS) {
        let nx = x + dx, ny = y + dy;
        while (this.dentro(nx, ny) && !this.pieza(nx, ny)) {
          moves.push({ desde: { x, y }, hasta: { x: nx, y: ny }, tipo: "normal" });
          nx += dx; ny += dy;
        }
      }
    } else {
      const dir = direccionPeonDamas(p.color);
      for (const dx of [-1, 1]) {
        const nx = x + dx, ny = y + dir;
        if (this.dentro(nx, ny) && !this.pieza(nx, ny)) {
          moves.push({ desde: { x, y }, hasta: { x: nx, y: ny }, tipo: "normal" });
        }
      }
    }
    return moves;
  }

  // Todas las capturas disponibles para `color` en todo el tablero — si la
  // lista no está vacía, la captura es obligatoria y movimientosLegales()
  // filtra todo lo demás.
  todasLasCapturas(color) {
    const todas = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = this.pieza(x, y);
        if (p && p.color === color) todas.push(...this.capturasDe(x, y));
      }
    }
    return todas;
  }

  // Movimientos legales de UNA pieza puntual, ya filtrados por captura
  // obligatoria y por cadena en curso (si hay una cadena activa, sólo esa
  // ficha tiene movimientos, y sólo capturas).
  movimientosLegales(x, y) {
    if (this.capturaObligada) {
      if (this.capturaObligada.x !== x || this.capturaObligada.y !== y) return [];
      return this.capturasDe(x, y);
    }
    const p = this.pieza(x, y);
    if (!p || p.color !== this.turno) return [];
    const capturasTablero = this.todasLasCapturas(this.turno);
    if (capturasTablero.length > 0) return this.capturasDe(x, y);
    return this.movimientosSimplesDe(x, y);
  }

  todosMovimientosLegales(color) {
    if (this.capturaObligada) {
      return this.turno === color ? this.capturasDe(this.capturaObligada.x, this.capturaObligada.y) : [];
    }
    const capturasTablero = this.todasLasCapturas(color);
    if (capturasTablero.length > 0) return capturasTablero;
    const todos = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = this.pieza(x, y);
        if (p && p.color === color) todos.push(...this.movimientosSimplesDe(x, y));
      }
    }
    return todos;
  }

  // Intenta mover de `desde` a `hasta`. Devuelve
  // { ok, motivo, comida:bool, cadena:bool, corono:bool, terminado, ganador }.
  mover(desde, hasta) {
    if (this.terminado) return { ok: false, motivo: "terminado" };
    const [dx, dy] = normalizarCoordDamas(desde);
    const [hx, hy] = normalizarCoordDamas(hasta);
    if (!this.dentro(dx, dy) || !this.dentro(hx, hy)) return { ok: false, motivo: "fuera" };

    const pieza = this.pieza(dx, dy);
    if (!pieza) return { ok: false, motivo: "pieza_invalida" };
    if (!this.capturaObligada && pieza.color !== this.turno) return { ok: false, motivo: "pieza_invalida" };

    const legales = this.movimientosLegales(dx, dy);
    const mv = legales.find((m) => m.hasta.x === hx && m.hasta.y === hy);
    if (!mv) return { ok: false, motivo: "ilegal" };

    const color = pieza.color;
    this.board[this.idx(dx, dy)] = null;
    if (mv.tipo === "captura") {
      this.board[this.idx(mv.comida.x, mv.comida.y)] = null;
      this.capturas[color]++;
    }

    let corono = false;
    if (!pieza.dama && hy === filaCoronacionDamas(color)) { pieza.dama = true; corono = true; }
    this.board[this.idx(hx, hy)] = pieza;

    this.ultimoMovimiento = { desde: { x: dx, y: dy }, hasta: { x: hx, y: hy }, tipo: mv.tipo, color, comida: mv.comida || null };

    let cadena = false;
    if (mv.tipo === "captura" && this.capturasDe(hx, hy).length > 0) {
      cadena = true;
      this.capturaObligada = { x: hx, y: hy };
    } else {
      this.capturaObligada = null;
      this.turno = otro(color);
      this.movimientos++;
    }

    if (!cadena) {
      const rival = this.turno;
      if (this.todosMovimientosLegales(rival).length === 0) {
        this.terminado = true;
        this.resultado = { ganador: color, motivo: "sin_movimientos" };
      }
    }

    return {
      ok: true, motivo: mv.tipo, comida: !!mv.comida, cadena, corono,
      terminado: this.terminado, ganador: this.resultado ? this.resultado.ganador : null,
    };
  }

  rendirse(color) {
    if (this.terminado) return;
    this.terminado = true;
    this.resultado = { ganador: otro(color), motivo: "renuncia" };
  }

  contarPiezas(color) {
    let peones = 0, damas = 0;
    for (const p of this.board) {
      if (p && p.color === color) { if (p.dama) damas++; else peones++; }
    }
    return { peones, damas };
  }

  clonar() {
    const copia = new Damas();
    copia.board = this.board.map((p) => (p ? { ...p } : null));
    copia.turno = this.turno;
    copia.capturas = { [NEGRO]: this.capturas[NEGRO], [BLANCO]: this.capturas[BLANCO] };
    copia.capturaObligada = this.capturaObligada ? { ...this.capturaObligada } : null;
    copia.ultimoMovimiento = this.ultimoMovimiento;
    copia.movimientos = this.movimientos;
    copia.terminado = this.terminado;
    copia.resultado = this.resultado;
    return copia;
  }
}

// ============ Bot: minimax con poda alfa-beta + iterative deepening ============
// Misma arquitectura que el bot de ajedrez (js/chess.js): generador que cede
// el control cada tantos nodos (ver motorbot.js), profundización iterativa
// dentro de un presupuesto de tiempo. Sin quiescence search: acá las
// capturas encadenadas ya son parte del árbol principal (mover() las
// resuelve como parte del mismo turno), así que no hace falta una búsqueda
// aparte sólo para capturas como en ajedrez.

// Tablero de control central: casillas del medio valen más (más movilidad,
// más opciones de captura en ambas direcciones), las filas de "casa" propia
// valen un poco más para desalentar vaciarlas de más (esas piezas frenan al
// rival de coronar por esa columna).
function valorPosicionalDamas(x, y, color) {
  let v = 0;
  if (x >= 2 && x <= 5 && y >= 2 && y <= 5) v += 0.06;
  const filaCasa = color === BLANCO ? 0 : 7;
  if (y === filaCasa) v += 0.04;
  return v;
}

function evaluarPosicionDamas(damas, color) {
  let total = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = damas.pieza(x, y);
      if (!p || p.color !== color) continue;
      total += (p.dama ? VALOR_DAMA_DAMAS : VALOR_PEON_DAMAS) + valorPosicionalDamas(x, y, color);
    }
  }
  return total;
}

function evaluarPosicionRelativaDamas(damas) {
  const color = damas.turno;
  return evaluarPosicionDamas(damas, color) - evaluarPosicionDamas(damas, otro(color));
}

function puntajeTerminalDamas(damas) {
  if (!damas.resultado || !damas.resultado.ganador) return 0;
  return damas.resultado.ganador === damas.turno ? 100000 : -100000;
}

// Orden simple: capturas primero (más nodos podados antes), y entre
// capturas las que comen una dama antes que las que comen un peón.
function puntajeOrdenDamas(damas, mv) {
  if (mv.tipo !== "captura") return 0;
  const victima = damas.pieza(mv.comida.x, mv.comida.y);
  return victima && victima.dama ? 20 : 10;
}
function ordenarJugadasDamas(damas, movs, prioridad) {
  const arr = movs.slice().sort((a, b) => puntajeOrdenDamas(damas, b) - puntajeOrdenDamas(damas, a));
  if (prioridad) {
    const i = arr.findIndex((m) => m.desde.x === prioridad.desde.x && m.desde.y === prioridad.desde.y && m.hasta.x === prioridad.hasta.x && m.hasta.y === prioridad.hasta.y);
    if (i > 0) { const [mv] = arr.splice(i, 1); arr.unshift(mv); }
  }
  return arr;
}

function* negamaxDamas(damas, profundidad, alfa, beta, contador) {
  if (damas.terminado) return puntajeTerminalDamas(damas);
  if (profundidad <= 0) return evaluarPosicionRelativaDamas(damas);

  const color = damas.turno;
  const candidatas = ordenarJugadasDamas(damas, damas.todosMovimientosLegales(color));
  if (candidatas.length === 0) return -100000; // sin movimientos = perdió quien tiene el turno

  let mejor = -Infinity;
  for (const mv of candidatas) {
    const copia = damas.clonar();
    copia.mover(mv.desde, mv.hasta);
    contador.n++;
    if (contador.n % 400 === 0) yield;
    // Si la jugada encadena captura con la misma ficha, el turno NO pasó —
    // seguimos evaluando desde el mismo lado (sin negar el valor), como una
    // extensión obligatoria de la búsqueda en vez de un nivel más de minimax.
    const mismoTurno = copia.turno === color && !copia.terminado;
    const val = mismoTurno
      ? (yield* negamaxDamas(copia, profundidad, alfa, beta, contador))
      : -(yield* negamaxDamas(copia, profundidad - 1, -beta, -alfa, contador));
    if (val > mejor) mejor = val;
    if (mejor > alfa) alfa = mejor;
    if (alfa >= beta) break;
  }
  return mejor;
}

function* buscarRaizDamas(damas, profundidad, contador, mejorRef, prioridad) {
  const color = damas.turno;
  const candidatas = ordenarJugadasDamas(damas, damas.todosMovimientosLegales(color), prioridad);
  if (candidatas.length === 0) { mejorRef.jugada = null; return; }

  let alfa = -Infinity;
  const beta = Infinity;
  for (const mv of candidatas) {
    const copia = damas.clonar();
    copia.mover(mv.desde, mv.hasta);
    contador.n++;
    if (contador.n % 400 === 0) yield;
    const mismoTurno = copia.turno === color && !copia.terminado;
    const val = mismoTurno
      ? (yield* negamaxDamas(copia, profundidad, alfa, beta, contador))
      : -(yield* negamaxDamas(copia, profundidad - 1, -beta, -alfa, contador));
    if (val > alfa) { alfa = val; mejorRef.jugada = mv; mejorRef.valor = val; }
  }
}

// Punto de entrada del bot. `damas` puede estar a mitad de una cadena de
// capturas (this.capturaObligada seteado): todosMovimientosLegales() ya
// devuelve sólo las capturas de esa ficha puntual en ese caso, así que esta
// función funciona igual para "jugar un turno normal" y para "seguir una
// cadena a medio terminar".
async function jugadaDelDamas(damas, color, skill = 0.6) {
  const candidatas = damas.todosMovimientosLegales(color);
  if (candidatas.length === 0) return null;
  if (candidatas.length === 1) return candidatas[0]; // única opción (típico a mitad de una cadena): no hace falta pensar

  const probAzar = (1 - skill) * (1 - skill);
  if (Math.random() < probAzar) return candidatas[Math.floor(Math.random() * candidatas.length)];

  const presupuesto = presupuestoPensadaMs(skill);
  const finGlobal = performance.now() + presupuesto;
  const mejorRef = { jugada: candidatas[0], valor: -Infinity };
  const TOPE_PROFUNDIDAD = 10;
  let profundidad = 1;
  let mvPrioridad = null;

  while (profundidad <= TOPE_PROFUNDIDAD) {
    const tiempoRestante = finGlobal - performance.now();
    if (tiempoRestante <= 15) break;
    const contador = { n: 0 };
    const gen = buscarRaizDamas(damas.clonar(), profundidad, contador, mejorRef, mvPrioridad);
    await ejecutarBusquedaCooperativa(gen, tiempoRestante);
    mvPrioridad = mejorRef.jugada;
    profundidad++;
  }
  return mejorRef.jugada;
}

function valorMaterialDamas(damas, color) {
  let total = 0;
  for (const p of damas.board) {
    if (p && p.color === color) total += p.dama ? VALOR_DAMA_DAMAS : VALOR_PEON_DAMAS;
  }
  return total;
}

function botDeberiaRendirseDamas(damas, color, skill = 0.6) {
  if (damas.movimientos < 14) return false;
  if (damas.capturaObligada) return false; // nunca a mitad de una cadena propia

  const propio = valorMaterialDamas(damas, color);
  const rival = valorMaterialDamas(damas, otro(color));
  const diferencia = rival - propio;
  const umbral = 3.5; // varias piezas de desventaja

  if (diferencia < umbral) return false;

  const probabilidad = 0.05 + skill * 0.12;
  return Math.random() < probabilidad;
}
