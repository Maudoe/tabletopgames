// ============ Motor de TEG (Táctica y Estrategia de la Guerra) ============
// Versión "de mesa": reparto inicial al azar, fases refuerzo -> ataque ->
// fortificación, combate por dados estilo TEG/Risk, cartas canjeables y
// objetivos secretos. El mapa es fiel al ESTILO de TEG (6 continentes, ~40
// territorios con nombres y vecinos plausibles) pero no una reproducción
// cartográfica exacta de la edición TEG 2.0 — ver nota en el tablero 3D.
//
// De 2 a 6 jugadores. Cada jugador es sólo `{ id, esBot }`; el color con el
// que se pinta en pantalla es un tema de la UI (ver app.js), el motor no
// sabe nada de eso.

const CONTINENTES = {
  america_norte:  { nombre: "América del Norte", bonus: 5 },
  america_central:{ nombre: "América Central", bonus: 3 },
  america_sur:    { nombre: "América del Sur", bonus: 4 },
  europa:         { nombre: "Europa", bonus: 5 },
  africa:         { nombre: "África", bonus: 3 },
  asia_oceania:   { nombre: "Asia y Oceanía", bonus: 7 },
};

// { id: { nombre, continente, pos:[lat,lon] } } — coordenadas GPS reales
// (una ciudad de referencia por territorio, normalmente la capital), no
// posiciones inventadas: el mapa se dibuja sobre un mapa real de verdad
// (Leaflet + tiles oscuros, ver js/tegmapa.js), así que cada territorio
// tiene que caer en un punto real dentro de la región que representa. Los
// vecinos se arman aparte, a partir de ARISTAS, para no escribir cada
// conexión dos veces (una por cada lado).
const TERRITORIOS_BASE = {
  // -- América del Norte --
  alaska:              { nombre: "Alaska", continente: "america_norte", pos: [64.20, -149.40] },
  yukon:               { nombre: "Yukón", continente: "america_norte", pos: [60.70, -135.10] },
  groenlandia:         { nombre: "Groenlandia", continente: "america_norte", pos: [64.18, -51.72] },
  columbia_britanica:  { nombre: "Columbia Británica", continente: "america_norte", pos: [49.28, -123.12] },
  quebec:              { nombre: "Quebec", continente: "america_norte", pos: [46.81, -71.21] },
  eeuu:                { nombre: "Estados Unidos", continente: "america_norte", pos: [38.90, -77.04] },
  mexico:              { nombre: "México", continente: "america_norte", pos: [19.43, -99.13] },

  // -- América Central --
  centroamerica:       { nombre: "Centroamérica", continente: "america_central", pos: [12.11, -86.24] },
  panama:              { nombre: "Panamá", continente: "america_central", pos: [8.98, -79.52] },
  antillas_mayores:    { nombre: "Antillas Mayores", continente: "america_central", pos: [23.13, -82.38] },
  antillas_menores:    { nombre: "Antillas Menores", continente: "america_central", pos: [18.22, -66.59] },

  // -- América del Sur --
  colombia:            { nombre: "Colombia", continente: "america_sur", pos: [4.71, -74.07] },
  venezuela:           { nombre: "Venezuela", continente: "america_sur", pos: [10.49, -66.88] },
  brasil:              { nombre: "Brasil", continente: "america_sur", pos: [-15.79, -47.88] },
  peru:                { nombre: "Perú", continente: "america_sur", pos: [-12.05, -77.04] },
  argentina:           { nombre: "Argentina", continente: "america_sur", pos: [-34.61, -58.38] },
  chile:               { nombre: "Chile", continente: "america_sur", pos: [-33.45, -70.66] },

  // -- Europa --
  islandia:            { nombre: "Islandia", continente: "europa", pos: [64.15, -21.94] },
  gran_bretana:        { nombre: "Gran Bretaña", continente: "europa", pos: [51.51, -0.13] },
  escandinavia:        { nombre: "Escandinavia", continente: "europa", pos: [59.33, 18.07] },
  francia:             { nombre: "Francia", continente: "europa", pos: [48.86, 2.35] },
  alemania:            { nombre: "Alemania", continente: "europa", pos: [52.52, 13.40] },
  europa_del_sur:      { nombre: "Europa del Sur", continente: "europa", pos: [41.90, 12.50] },
  rusia:               { nombre: "Rusia", continente: "europa", pos: [55.75, 37.62] },

  // -- África --
  egipto:              { nombre: "Egipto", continente: "africa", pos: [30.04, 31.24] },
  africa_del_norte:    { nombre: "África del Norte", continente: "africa", pos: [33.57, -7.59] },
  africa_occidental:   { nombre: "África Occidental", continente: "africa", pos: [6.52, 3.38] },
  congo:               { nombre: "Congo", continente: "africa", pos: [-4.32, 15.31] },
  africa_oriental:     { nombre: "África Oriental", continente: "africa", pos: [-1.29, 36.82] },
  africa_del_sur:      { nombre: "África del Sur", continente: "africa", pos: [-26.20, 28.05] },
  madagascar:          { nombre: "Madagascar", continente: "africa", pos: [-18.88, 47.51] },

  // -- Asia y Oceanía --
  medio_oriente:       { nombre: "Medio Oriente", continente: "asia_oceania", pos: [24.71, 46.68] },
  ural:                { nombre: "Ural", continente: "asia_oceania", pos: [56.84, 60.61] },
  siberia:             { nombre: "Siberia", continente: "asia_oceania", pos: [55.03, 82.92] },
  kamchatka:           { nombre: "Kamchatka", continente: "asia_oceania", pos: [53.04, 158.65] },
  mongolia:            { nombre: "Mongolia", continente: "asia_oceania", pos: [47.89, 106.91] },
  china:               { nombre: "China", continente: "asia_oceania", pos: [39.90, 116.41] },
  india:               { nombre: "India", continente: "asia_oceania", pos: [28.61, 77.21] },
  indonesia:           { nombre: "Indonesia", continente: "asia_oceania", pos: [-6.21, 106.85] },
  australia:           { nombre: "Australia", continente: "asia_oceania", pos: [-33.87, 151.21] },
};

const ARISTAS = [
  // América del Norte
  ["alaska", "yukon"], ["alaska", "columbia_britanica"], ["yukon", "columbia_britanica"],
  ["yukon", "groenlandia"], ["groenlandia", "quebec"], ["columbia_britanica", "eeuu"],
  ["quebec", "eeuu"], ["eeuu", "mexico"],
  // AN <-> otros continentes
  ["mexico", "centroamerica"], ["alaska", "kamchatka"], ["groenlandia", "islandia"],
  // América Central
  ["centroamerica", "panama"], ["centroamerica", "antillas_mayores"], ["panama", "antillas_mayores"],
  ["antillas_mayores", "antillas_menores"],
  ["panama", "colombia"], ["antillas_menores", "venezuela"],
  // América del Sur
  ["colombia", "venezuela"], ["colombia", "peru"], ["venezuela", "brasil"], ["brasil", "peru"],
  ["brasil", "argentina"], ["peru", "chile"], ["argentina", "chile"],
  // Europa
  ["islandia", "gran_bretana"], ["islandia", "escandinavia"], ["gran_bretana", "francia"],
  ["gran_bretana", "escandinavia"], ["escandinavia", "rusia"], ["escandinavia", "alemania"],
  ["francia", "alemania"], ["francia", "europa_del_sur"], ["alemania", "europa_del_sur"],
  ["alemania", "rusia"], ["europa_del_sur", "rusia"],
  ["europa_del_sur", "egipto"], ["europa_del_sur", "africa_del_norte"],
  ["rusia", "medio_oriente"], ["rusia", "ural"],
  // África
  ["egipto", "africa_del_norte"], ["africa_del_norte", "africa_occidental"], ["africa_del_norte", "congo"],
  ["africa_occidental", "congo"], ["congo", "africa_oriental"], ["congo", "africa_del_sur"],
  ["africa_oriental", "egipto"], ["africa_oriental", "africa_del_sur"], ["africa_oriental", "madagascar"],
  ["africa_del_sur", "madagascar"],
  ["egipto", "medio_oriente"],
  // Asia y Oceanía
  ["medio_oriente", "india"], ["ural", "siberia"], ["ural", "china"], ["siberia", "kamchatka"],
  ["siberia", "mongolia"], ["siberia", "china"], ["kamchatka", "mongolia"], ["mongolia", "china"],
  ["china", "india"], ["china", "indonesia"], ["india", "indonesia"], ["indonesia", "australia"],
];

const TERRITORIOS = {};
for (const id of Object.keys(TERRITORIOS_BASE)) TERRITORIOS[id] = { ...TERRITORIOS_BASE[id], vecinos: [] };
for (const [a, b] of ARISTAS) { TERRITORIOS[a].vecinos.push(b); TERRITORIOS[b].vecinos.push(a); }

const OBJETIVOS = [
  { id: "dominar3", descripcion: "Conquistar 3 continentes completos, cualquiera.", evaluar: (teg, j) => teg.continentesCompletos(j).length >= 3 },
  { id: "norte_y_africa", descripcion: "Conquistar toda América del Norte y toda África.", evaluar: (teg, j) => teg.continentesCompletos(j).includes("america_norte") && teg.continentesCompletos(j).includes("africa") },
  { id: "europa_y_sur", descripcion: "Conquistar toda Europa y toda América del Sur.", evaluar: (teg, j) => teg.continentesCompletos(j).includes("europa") && teg.continentesCompletos(j).includes("america_sur") },
  { id: "asia_y_central", descripcion: "Conquistar toda Asia/Oceanía y toda América Central.", evaluar: (teg, j) => teg.continentesCompletos(j).includes("asia_oceania") && teg.continentesCompletos(j).includes("america_central") },
  { id: "24territorios", descripcion: "Ocupar 24 territorios, sin importar el continente.", evaluar: (teg, j) => teg.territoriosDe(j).length >= 24 },
  { id: "18con2", descripcion: "Ocupar 18 territorios con al menos 2 ejércitos cada uno.", evaluar: (teg, j) => { const t = teg.territoriosDe(j); return t.length >= 18 && t.filter((id) => teg.board[id].ejercitos >= 2).length >= 18; } },
  { id: "eliminar_rival", descripcion: "Eliminar por completo a otro jugador.", evaluar: (teg, j) => teg.jugadores.some((jj, idx) => idx !== j && jj.eliminado) },
];

const SIMBOLOS_CARTA = ["infanteria", "caballeria", "artilleria"];
const TABLA_BONUS_CANJE = [4, 7, 10, 15, 20, 25];

class Teg {
  // jugadores: [{ id, esBot }], entre 2 y 6.
  constructor(jugadores) {
    this.jugadores = jugadores.map((j) => ({ ...j, cartas: [], objetivo: null, eliminado: false }));
    this.board = {}; // territorioId -> { dueno: índice de jugador, ejercitos }
    this.turno = 0;
    this.fase = "refuerzo"; // "refuerzo" | "ataque" | "fortificacion"
    this.refuerzosPendientes = 0;
    this.conquistoEsteTurno = false;
    this._ultimaConquistaTerritorio = null;
    this.movimientoPendienteConquista = null; // { desde, hasta, minimo, maximo }
    this.ultimoCombate = null;
    this.canjesRealizados = 0;
    this.terminado = false;
    this.resultado = null; // { ganador, motivo }

    this._repartirTerritorios();
    this._repartirObjetivos();
    this.refuerzosPendientes = this.calcularRefuerzos(this.turno);
  }

  _repartirTerritorios() {
    const ids = Object.keys(TERRITORIOS);
    const mezclados = ids.slice();
    for (let i = mezclados.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mezclados[i], mezclados[j]] = [mezclados[j], mezclados[i]];
    }
    mezclados.forEach((id, i) => { this.board[id] = { dueno: i % this.jugadores.length, ejercitos: 1 }; });

    // ejércitos iniciales extra, repartidos al azar entre los territorios
    // propios de cada jugador (cantidad total baja con más jugadores, como
    // en una partida de mesa real).
    const inicialesPorJugador = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 }[this.jugadores.length] || 20;
    this.jugadores.forEach((_, idx) => {
      const propios = ids.filter((id) => this.board[id].dueno === idx);
      let restantes = inicialesPorJugador - propios.length;
      while (restantes > 0) {
        const id = propios[Math.floor(Math.random() * propios.length)];
        this.board[id].ejercitos++;
        restantes--;
      }
    });
  }

  _repartirObjetivos() {
    const mezclados = OBJETIVOS.slice();
    for (let i = mezclados.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mezclados[i], mezclados[j]] = [mezclados[j], mezclados[i]];
    }
    this.jugadores.forEach((j, idx) => { j.objetivo = mezclados[idx % mezclados.length]; });
  }

  territoriosDe(jugadorIdx) { return Object.keys(this.board).filter((id) => this.board[id].dueno === jugadorIdx); }

  continentesCompletos(jugadorIdx) {
    return Object.keys(CONTINENTES).filter((c) => {
      const deEseContinente = Object.keys(TERRITORIOS).filter((id) => TERRITORIOS[id].continente === c);
      return deEseContinente.every((id) => this.board[id].dueno === jugadorIdx);
    });
  }

  calcularRefuerzos(jugadorIdx) {
    const propios = this.territoriosDe(jugadorIdx);
    let refuerzos = Math.max(3, Math.floor(propios.length / 3));
    for (const c of this.continentesCompletos(jugadorIdx)) refuerzos += CONTINENTES[c].bonus;
    return refuerzos;
  }

  vecinosEnemigos(territorioId) {
    const t = this.board[territorioId];
    return TERRITORIOS[territorioId].vecinos.filter((v) => this.board[v].dueno !== t.dueno);
  }

  colocarEjercitos(territorioId, cantidad) {
    if (this.terminado || this.fase !== "refuerzo") return { ok: false, motivo: "fase_invalida" };
    const t = this.board[territorioId];
    if (!t || t.dueno !== this.turno) return { ok: false, motivo: "no_es_tuyo" };
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > this.refuerzosPendientes) return { ok: false, motivo: "cantidad_invalida" };
    t.ejercitos += cantidad;
    this.refuerzosPendientes -= cantidad;
    if (this.refuerzosPendientes === 0) this.fase = "ataque";
    return { ok: true };
  }

  // Tira los dados y resuelve un asalto. `dadosAtacante` es cuántos dados
  // quiere tirar el atacante (se recorta solo al máximo permitido). No
  // agota el turno del atacante: se puede volver a atacar el mismo u otro
  // territorio hasta pasar de fase.
  atacar(desdeId, hastaId, dadosAtacante) {
    if (this.terminado || this.fase !== "ataque") return { ok: false, motivo: "fase_invalida" };
    if (this.movimientoPendienteConquista) return { ok: false, motivo: "mover_tropas_pendiente" };
    const origen = this.board[desdeId], destino = this.board[hastaId];
    if (!origen || origen.dueno !== this.turno) return { ok: false, motivo: "no_es_tuyo" };
    if (!destino || destino.dueno === this.turno) return { ok: false, motivo: "destino_invalido" };
    if (!TERRITORIOS[desdeId].vecinos.includes(hastaId)) return { ok: false, motivo: "no_vecino" };
    if (origen.ejercitos < 2) return { ok: false, motivo: "pocas_tropas" };

    const maxDados = Math.min(3, origen.ejercitos - 1);
    dadosAtacante = Math.max(1, Math.min(dadosAtacante || maxDados, maxDados));
    const dadosDefensor = Math.min(2, destino.ejercitos);

    const tirar = (n) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a);
    const tA = tirar(dadosAtacante), tD = tirar(dadosDefensor);
    let bajasAtacante = 0, bajasDefensor = 0;
    for (let i = 0; i < Math.min(tA.length, tD.length); i++) {
      if (tA[i] > tD[i]) bajasDefensor++; else bajasAtacante++; // empate lo gana el defensor
    }
    origen.ejercitos -= bajasAtacante;
    destino.ejercitos -= bajasDefensor;

    let conquistado = false;
    if (destino.ejercitos <= 0) {
      conquistado = true;
      const duenoAnterior = destino.dueno;
      destino.dueno = this.turno;
      destino.ejercitos = 0;
      this.conquistoEsteTurno = true;
      this._ultimaConquistaTerritorio = hastaId;
      this.movimientoPendienteConquista = { desde: desdeId, hasta: hastaId, minimo: dadosAtacante, maximo: origen.ejercitos - 1 };
      this._chequearEliminacion(duenoAnterior);
    }

    this.ultimoCombate = { desde: desdeId, hasta: hastaId, dadosAtacante: tA, dadosDefensor: tD, bajasAtacante, bajasDefensor, conquistado };
    if (!this.terminado) this._chequearVictoria();
    return { ok: true, ...this.ultimoCombate };
  }

  // Después de conquistar hay que pasar tropas de "desde" a "hasta" (al
  // menos los dados que atacaron, como mucho lo que le quede a "desde"
  // menos 1 para no dejarlo vacío) antes de poder seguir jugando.
  moverTrasConquista(cantidad) {
    if (!this.movimientoPendienteConquista) return { ok: false, motivo: "nada_pendiente" };
    const { desde, hasta, minimo, maximo } = this.movimientoPendienteConquista;
    cantidad = Math.max(minimo, Math.min(cantidad, maximo));
    this.board[desde].ejercitos -= cantidad;
    this.board[hasta].ejercitos += cantidad;
    this.movimientoPendienteConquista = null;
    return { ok: true };
  }

  // Una sola vez por turno: mueve tropas entre dos territorios propios
  // conectados por una cadena de territorios también propios, y termina el
  // turno (regla clásica: la fortificación es el último paso).
  fortificar(desdeId, hastaId, cantidad) {
    if (this.terminado || this.fase !== "fortificacion") return { ok: false, motivo: "fase_invalida" };
    if (this.movimientoPendienteConquista) return { ok: false, motivo: "mover_tropas_pendiente" };
    const origen = this.board[desdeId], destino = this.board[hastaId];
    if (!origen || origen.dueno !== this.turno || !destino || destino.dueno !== this.turno) return { ok: false, motivo: "invalido" };
    if (!this._conectados(desdeId, hastaId)) return { ok: false, motivo: "no_conectado" };
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad >= origen.ejercitos) return { ok: false, motivo: "cantidad_invalida" };
    origen.ejercitos -= cantidad;
    destino.ejercitos += cantidad;
    this.terminarTurno();
    return { ok: true };
  }

  _conectados(desdeId, hastaId) {
    const dueno = this.board[desdeId].dueno;
    const visitados = new Set([desdeId]);
    const pila = [desdeId];
    while (pila.length) {
      const actual = pila.pop();
      if (actual === hastaId) return true;
      for (const v of TERRITORIOS[actual].vecinos) {
        if (!visitados.has(v) && this.board[v].dueno === dueno) { visitados.add(v); pila.push(v); }
      }
    }
    return false;
  }

  // Avanza a la siguiente fase; en fortificación, en vez de pasar de fase
  // "sin más" termina el turno directamente (no hay una cuarta fase).
  pasarFase() {
    if (this.terminado || this.movimientoPendienteConquista) return;
    if (this.fase === "refuerzo") {
      if (this.refuerzosPendientes > 0) return; // hay que colocar todos los refuerzos antes de atacar
      this.fase = "ataque";
    } else if (this.fase === "ataque") {
      this.fase = "fortificacion";
    } else if (this.fase === "fortificacion") {
      this.terminarTurno();
    }
  }

  // Canjea 3 cartas (mismo símbolo, o los tres símbolos distintos) por
  // ejércitos extra para la fase de refuerzo actual. `indices` son
  // posiciones dentro de jugador.cartas.
  intercambiarCartas(indices) {
    const jugador = this.jugadores[this.turno];
    if (!Array.isArray(indices) || indices.length !== 3) return { ok: false, motivo: "cantidad_invalida" };
    const unicos = new Set(indices);
    if (unicos.size !== 3) return { ok: false, motivo: "cantidad_invalida" };
    const cartas = indices.map((i) => jugador.cartas[i]).filter(Boolean);
    if (cartas.length !== 3) return { ok: false, motivo: "cartas_invalidas" };
    const simbolos = cartas.map((c) => c.simbolo);
    const esTrio = simbolos.every((s) => s === simbolos[0]);
    const esVariado = new Set(simbolos).size === 3;
    if (!esTrio && !esVariado) return { ok: false, motivo: "combinacion_invalida" };

    this.canjesRealizados++;
    const bonus = this.canjesRealizados <= TABLA_BONUS_CANJE.length
      ? TABLA_BONUS_CANJE[this.canjesRealizados - 1]
      : 25 + (this.canjesRealizados - TABLA_BONUS_CANJE.length) * 5;
    this.refuerzosPendientes += bonus;

    // territorio propio entre las cartas canjeadas: +2 ejércitos ahí mismo.
    for (const c of cartas) {
      if (this.board[c.territorio] && this.board[c.territorio].dueno === this.turno) this.board[c.territorio].ejercitos += 2;
    }

    indices.slice().sort((a, b) => b - a).forEach((i) => jugador.cartas.splice(i, 1));
    return { ok: true, bonus };
  }

  _chequearEliminacion(jugadorIdx) {
    if (this.jugadores[jugadorIdx].eliminado) return;
    if (this.territoriosDe(jugadorIdx).length > 0) return;
    this.jugadores[jugadorIdx].eliminado = true;
    // las cartas del eliminado pasan a quien lo eliminó (regla clásica).
    this.jugadores[this.turno].cartas.push(...this.jugadores[jugadorIdx].cartas);
    this.jugadores[jugadorIdx].cartas = [];
  }

  _chequearVictoria() {
    const objetivo = this.jugadores[this.turno].objetivo;
    if (objetivo && objetivo.evaluar(this, this.turno)) {
      this.terminado = true;
      this.resultado = { ganador: this.turno, motivo: "objetivo" };
      return;
    }
    const activos = this.jugadores.map((j, idx) => ({ j, idx })).filter(({ j }) => !j.eliminado);
    if (activos.length === 1) {
      this.terminado = true;
      this.resultado = { ganador: activos[0].idx, motivo: "eliminacion" };
    }
  }

  rendirse(jugadorIdx) {
    if (this.terminado || this.jugadores[jugadorIdx].eliminado) return;
    this.jugadores[jugadorIdx].eliminado = true;
    this.jugadores[jugadorIdx].cartas = [];
    if (jugadorIdx === this.turno) this.terminarTurno();
    this._chequearVictoria();
  }

  terminarTurno() {
    if (this.terminado) return;
    if (this.conquistoEsteTurno && this._ultimaConquistaTerritorio) {
      this.jugadores[this.turno].cartas.push({
        territorio: this._ultimaConquistaTerritorio,
        simbolo: SIMBOLOS_CARTA[Math.floor(Math.random() * 3)],
      });
    }
    this.conquistoEsteTurno = false;
    this._ultimaConquistaTerritorio = null;
    this.ultimoCombate = null;
    this.movimientoPendienteConquista = null;

    const activos = this.jugadores.filter((j) => !j.eliminado).length;
    if (activos <= 1) { this._chequearVictoria(); if (this.terminado) return; }

    let siguiente = this.turno;
    do { siguiente = (siguiente + 1) % this.jugadores.length; } while (this.jugadores[siguiente].eliminado);
    this.turno = siguiente;
    this.fase = "refuerzo";
    this.refuerzosPendientes = this.calcularRefuerzos(this.turno);
  }
}

// ============ Bot simple ============
// Mismo espíritu que el resto de los bots de GameHub: heurística liviana,
// no un motor de guerra de verdad. Refuerza fronteras, ataca sólo con
// ventaja numérica clara (más exigente cuanto más bajo el nivel), y por
// ahora no reagrupa en la fase de fortificación (simplemente la pasa).
function jugadaDelBotTeg(teg, jugadorIdx, skill = 0.6) {
  if (teg.terminado || teg.turno !== jugadorIdx) return null;

  if (teg.fase === "refuerzo") {
    const propios = teg.territoriosDe(jugadorIdx);
    const frontera = propios.filter((id) => teg.vecinosEnemigos(id).length > 0);
    const pool = frontera.length ? frontera : propios;
    const elegido = pool[Math.floor(Math.random() * pool.length)];
    return { tipo: "refuerzo", territorioId: elegido, cantidad: teg.refuerzosPendientes };
  }

  if (teg.fase === "ataque") {
    const propios = teg.territoriosDe(jugadorIdx);
    const candidatos = [];
    for (const id of propios) {
      if (teg.board[id].ejercitos < 2) continue;
      for (const v of teg.vecinosEnemigos(id)) {
        candidatos.push({ desde: id, hasta: v, ventaja: teg.board[id].ejercitos - teg.board[v].ejercitos });
      }
    }
    candidatos.sort((a, b) => b.ventaja - a.ventaja);
    const mejor = candidatos[0];
    const umbral = 3 - skill * 2; // nivel alto: ataca con ventaja de sólo +1; nivel bajo: pide +3
    if (mejor && mejor.ventaja >= umbral) return { tipo: "ataque", desde: mejor.desde, hasta: mejor.hasta };
    return { tipo: "pasar" };
  }

  return { tipo: "pasar" }; // fortificación: sin reagrupe por ahora
}
