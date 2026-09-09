// ============ Motor de Go/Baduk ============
// Reglas reales: capturas por libertades, prohibido el suicidio (salvo que
// capture), y superko posicional simple (no se puede repetir una posición
// de tablero ya vista). Puntuación por área (estilo chino): piedras propias
// en el tablero + territorio vacío rodeado solo por ese color. Al blanco se
// le suma la komi.

const VACIO = 0, NEGRO = 1, BLANCO = 2;

function otro(color) { return color === NEGRO ? BLANCO : NEGRO; }

class Go {
  constructor(size, komi = 7.5, handicap = 0) {
    this.size = size;
    this.komi = komi;
    this.board = new Array(size * size).fill(VACIO);
    this.turno = NEGRO;
    this.capturas = { [NEGRO]: 0, [BLANCO]: 0 }; // piedras del rival que cada color capturó
    this.historial = new Set();
    this.ultimaJugada = null;
    this.pasesSeguidos = 0;
    this.terminado = false;
    this.resultado = null; // { ganador, motivo, puntos }
    this.movimientos = 0;

    if (handicap >= 2) this.colocarHandicap(handicap);
    this.historial.add(this.clave());
  }

  idx(x, y) { return y * this.size + x; }
  dentro(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
  clave() { return this.board.join(""); }

  // Puntos hoshi estándar, usados también como referencia para el handicap.
  hoshi() {
    const s = this.size;
    if (s === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    if (s === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
    if (s === 19) return [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]];
    return [];
  }

  colocarHandicap(n) {
    const puntos = this.hoshi().filter(([x, y]) => !(x === Math.floor(this.size / 2) && y === Math.floor(this.size / 2)));
    // El centro (tengen) entra último, y sólo si el handicap es impar.
    const centro = this.hoshi().find(([x, y]) => x === Math.floor(this.size / 2) && y === Math.floor(this.size / 2));
    const orden = [...puntos];
    if (centro && n % 2 === 1) orden.push(centro);
    orden.slice(0, n).forEach(([x, y]) => { this.board[this.idx(x, y)] = NEGRO; });
    // Con handicap puesto, empieza blanco.
    this.turno = BLANCO;
  }

  vecinos(x, y) {
    const out = [];
    if (this.dentro(x - 1, y)) out.push([x - 1, y]);
    if (this.dentro(x + 1, y)) out.push([x + 1, y]);
    if (this.dentro(x, y - 1)) out.push([x, y - 1]);
    if (this.dentro(x, y + 1)) out.push([x, y + 1]);
    return out;
  }

  // Grupo conectado (mismo color) a partir de (x,y) y el set de libertades que tiene.
  grupo(x, y) {
    const color = this.board[this.idx(x, y)];
    const vistos = new Set([this.idx(x, y)]);
    const pila = [[x, y]];
    const libertades = new Set();
    const piedras = [];
    while (pila.length) {
      const [cx, cy] = pila.pop();
      piedras.push([cx, cy]);
      for (const [nx, ny] of this.vecinos(cx, cy)) {
        const ni = this.idx(nx, ny);
        const v = this.board[ni];
        if (v === VACIO) { libertades.add(ni); continue; }
        if (v === color && !vistos.has(ni)) { vistos.add(ni); pila.push([nx, ny]); }
      }
    }
    return { piedras, libertades };
  }

  // Intenta jugar en (x,y). Devuelve { ok, motivo, capturadas }.
  jugar(x, y) {
    if (this.terminado) return { ok: false, motivo: "terminado" };
    if (!this.dentro(x, y)) return { ok: false, motivo: "fuera" };
    const i = this.idx(x, y);
    if (this.board[i] !== VACIO) return { ok: false, motivo: "ocupado" };

    const color = this.turno;
    const rival = otro(color);
    const tableroPrevio = this.board.slice();
    this.board[i] = color;

    // 1) Capturar grupos rivales adyacentes que se quedaron sin libertades.
    let capturadas = [];
    for (const [nx, ny] of this.vecinos(x, y)) {
      if (this.board[this.idx(nx, ny)] !== rival) continue;
      const { piedras, libertades } = this.grupo(nx, ny);
      if (libertades.size === 0) {
        for (const [px, py] of piedras) { this.board[this.idx(px, py)] = VACIO; capturadas.push([px, py]); }
      }
    }

    // 2) Suicidio: si el grupo propio recién jugado quedó sin libertades
    //    (y no capturó nada que se las diera), la jugada es ilegal.
    const propio = this.grupo(x, y);
    if (propio.libertades.size === 0) {
      this.board = tableroPrevio;
      return { ok: false, motivo: "suicidio" };
    }

    // 3) Superko posicional simple: no repetir una posición ya vista.
    const clave = this.clave();
    if (this.historial.has(clave)) {
      this.board = tableroPrevio;
      return { ok: false, motivo: "ko" };
    }

    this.historial.add(clave);
    this.capturas[color] += capturadas.length;
    this.ultimaJugada = { x, y, color };
    this.pasesSeguidos = 0;
    this.movimientos++;
    this.turno = rival;
    return { ok: true, capturadas };
  }

  pasar() {
    if (this.terminado) return;
    this.pasesSeguidos++;
    this.ultimaJugada = null;
    this.movimientos++;
    if (this.pasesSeguidos >= 2) {
      this.terminado = true;
      this.resultado = this.contar();
    } else {
      this.turno = otro(this.turno);
    }
  }

  rendirse(color) {
    this.terminado = true;
    this.resultado = { ganador: otro(color), motivo: "renuncia" };
  }

  // Puntuación por área: piedras en el tablero + territorio vacío rodeado
  // solo por ese color (las zonas que tocan los dos colores no cuentan).
  contar() {
    const visto = new Array(this.size * this.size).fill(false);
    const territorio = { [NEGRO]: 0, [BLANCO]: 0 };
    const piedras = { [NEGRO]: 0, [BLANCO]: 0 };

    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] === NEGRO) piedras[NEGRO]++;
      else if (this.board[i] === BLANCO) piedras[BLANCO]++;
    }

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const i = this.idx(x, y);
        if (visto[i] || this.board[i] !== VACIO) continue;
        const pila = [[x, y]];
        visto[i] = true;
        const region = [[x, y]];
        const bordes = new Set();
        while (pila.length) {
          const [cx, cy] = pila.pop();
          for (const [nx, ny] of this.vecinos(cx, cy)) {
            const ni = this.idx(nx, ny);
            const v = this.board[ni];
            if (v === VACIO) {
              if (!visto[ni]) { visto[ni] = true; pila.push([nx, ny]); region.push([nx, ny]); }
            } else {
              bordes.add(v);
            }
          }
        }
        if (bordes.size === 1) {
          const dueño = [...bordes][0];
          territorio[dueño] += region.length;
        }
      }
    }

    const puntosNegro = piedras[NEGRO] + territorio[NEGRO];
    const puntosBlanco = piedras[BLANCO] + territorio[BLANCO] + this.komi;
    const ganador = puntosNegro > puntosBlanco ? NEGRO : BLANCO;
    return {
      ganador, motivo: "conteo",
      puntosNegro, puntosBlanco,
      territorio, piedras,
    };
  }
}

// ============ Bot ============
// La jugada del bot (jugadaDelBot, un Monte Carlo Tree Search real con
// lectura a futuro) vive en js/gobot.js, no acá — separado porque es bastante
// código y porque go.js no necesita saber nada de cómo piensa el bot, sólo
// exponer las reglas. Acá sólo queda la decisión de rendirse, que es
// puntual y usa directo el conteo por área que ya expone la clase.

// Evalúa si el bot está tan atrás en el marcador que conviene rendirse en
// lugar de seguir jugando. Usa el mismo conteo por área que la puntuación
// final como estimación (no es exacto a mitad de partida, pero para un bot
// simple alcanza). Sólo se activa pasada una porción del tablero jugada,
// para no rendirse apenas empezó la partida.
function botDeberiaRendirse(go, color, skill = 0.6) {
  const ocupacion = 1 - go.board.filter((v) => v === VACIO).length / (go.size * go.size);
  if (ocupacion < 0.45 || go.movimientos < 12) return false;

  const est = go.contar();
  const puntosPropios = color === NEGRO ? est.puntosNegro : est.puntosBlanco;
  const puntosRival = color === NEGRO ? est.puntosBlanco : est.puntosNegro;
  const diferencia = puntosRival - puntosPropios;
  const umbral = go.size * go.size * 0.12; // "muy atrás" escala con el tamaño del tablero

  if (diferencia < umbral) return false;

  // Cuanto más fuerte el nivel, más rápido reconoce que está perdido; con
  // niveles bajos igual se rinde eventualmente, sólo que más de vez en cuando.
  const probabilidad = 0.05 + skill * 0.12;
  return Math.random() < probabilidad;
}
