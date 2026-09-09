// ============ Bot de Go: Monte Carlo Tree Search ============
// El bot anterior evaluaba una sola jugada por vez con una heurística local
// (capturar si podía, evitar autoatari) y nunca leía adelante — por eso era
// fácil de vencer incluso en el nivel máximo. Acá en cambio se usa MCTS
// (Monte Carlo Tree Search): para cada jugada candidata, el bot simula
// muchas partidas al azar hasta el final y ve cuántas termina ganando —
// es el enfoque clásico de los motores de Go fuertes previos a las redes
// neuronales (Fuego, Pachi, etc.).
//
// Es sensiblemente mejor que el bot anterior (lee, no regala capturas gratis,
// disputa territorio) pero no hay que prometer de más: con un presupuesto de
// unos pocos segundos por jugada y sin red neuronal evaluando posiciones, en
// 19x19 el árbol es enorme y no llega ni de cerca a nivel "dan" — en 9x9,
// con un árbol mucho más chico, se nota bastante más fuerte.
//
// Los rollouts (las partidas simuladas) NO usan la clase Go completa —
// demasiado overhead por jugada simulada cuando se necesitan miles por
// segundo. Usan un estado liviano { tablero: Int8Array, size, turno,
// anterior, pases } con su propio set de reglas simplificadas: captura +
// suicidio ilegal + ko simple (compara sólo contra la posición de un pase
// atrás, no contra todo el historial — aproximación aceptable para un
// rollout, no para la jugada real). La jugada final elegida por el árbol se
// vuelve a validar contra el tablero real (superko completo) antes de
// jugarla de verdad — ver el final de jugadaDelBot.

function vecinosIdx(i, size) {
  const x = i % size, y = (i / size) | 0;
  const out = [];
  if (x > 0) out.push(i - 1);
  if (x < size - 1) out.push(i + 1);
  if (y > 0) out.push(i - size);
  if (y < size - 1) out.push(i + size);
  return out;
}

function grupoIdx(tablero, size, i) {
  const color = tablero[i];
  const vistos = new Set([i]);
  const pila = [i];
  const libertades = new Set();
  const piedras = [];
  while (pila.length) {
    const c = pila.pop();
    piedras.push(c);
    for (const n of vecinosIdx(c, size)) {
      const v = tablero[n];
      if (v === VACIO) libertades.add(n);
      else if (v === color && !vistos.has(n)) { vistos.add(n); pila.push(n); }
    }
  }
  return { piedras, libertades };
}

function arraysIguales(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Intenta jugar en el índice `i`. Devuelve el estado resultante o null si es
// ilegal (ocupado, suicidio, o ko simple).
function jugarRapido(estado, i) {
  if (estado.tablero[i] !== VACIO) return null;
  const color = estado.turno, rival = otro(color);
  const nuevo = estado.tablero.slice();
  nuevo[i] = color;

  let numCapturas = 0;
  for (const n of vecinosIdx(i, estado.size)) {
    if (nuevo[n] !== rival) continue;
    const { piedras, libertades } = grupoIdx(nuevo, estado.size, n);
    if (libertades.size === 0) {
      for (const p of piedras) nuevo[p] = VACIO;
      numCapturas += piedras.length;
    }
  }

  const propio = grupoIdx(nuevo, estado.size, i);
  if (propio.libertades.size === 0) return null; // suicidio

  if (estado.anterior && arraysIguales(nuevo, estado.anterior)) return null; // ko simple

  return { tablero: nuevo, size: estado.size, turno: rival, anterior: estado.tablero, pases: 0, numCapturas };
}

function pasarRapido(estado) {
  return { tablero: estado.tablero, size: estado.size, turno: otro(estado.turno), anterior: estado.tablero, pases: (estado.pases || 0) + 1 };
}

// Ojo verdadero simplificado (sólo mira los 4 vecinos ortogonales, no la
// diagonal) — no distingue ojos falsos, pero alcanza para evitar que el
// rollout rellene su propio territorio ya cerrado sin sentido.
function esOjoVerdadero(tablero, size, i, color) {
  if (tablero[i] !== VACIO) return false;
  const vec = vecinosIdx(i, size);
  if (vec.length === 0) return false;
  for (const n of vec) if (tablero[n] !== color) return false;
  return true;
}

// Jugadas candidatas: vacíos jugables, evitando rellenar el propio ojo
// verdadero salvo que no quede ninguna otra opción; "pasar" siempre entra
// como una candidata más (así el árbol puede aprender a pasar cuando
// conviene, en vez de tratarlo como un caso aparte).
function movimientosLegalesRapidos(estado) {
  if ((estado.pases || 0) >= 2) return [];
  const { tablero, size, turno } = estado;
  const vacios = [];
  for (let i = 0; i < tablero.length; i++) if (tablero[i] === VACIO) vacios.push(i);

  const sinOjoPropio = vacios.filter((i) => !esOjoVerdadero(tablero, size, i, turno) && jugarRapido(estado, i) !== null);
  if (sinOjoPropio.length > 0) return [...sinOjoPropio, "pasar"];

  const cualquiera = vacios.filter((i) => jugarRapido(estado, i) !== null);
  if (cualquiera.length > 0) return [...cualquiera, "pasar"];

  return ["pasar"];
}

function contarRapido(tablero, size, komi) {
  const visto = new Uint8Array(tablero.length);
  const territorio = { [NEGRO]: 0, [BLANCO]: 0 };
  const piedras = { [NEGRO]: 0, [BLANCO]: 0 };
  for (let i = 0; i < tablero.length; i++) {
    if (tablero[i] === NEGRO) piedras[NEGRO]++;
    else if (tablero[i] === BLANCO) piedras[BLANCO]++;
  }
  for (let i = 0; i < tablero.length; i++) {
    if (visto[i] || tablero[i] !== VACIO) continue;
    const pila = [i];
    visto[i] = 1;
    const bordes = new Set();
    let tam = 0;
    while (pila.length) {
      const c = pila.pop();
      tam++;
      for (const n of vecinosIdx(c, size)) {
        const v = tablero[n];
        if (v === VACIO) { if (!visto[n]) { visto[n] = 1; pila.push(n); } }
        else bordes.add(v);
      }
    }
    if (bordes.size === 1) territorio[[...bordes][0]] += tam;
  }
  const puntosNegro = piedras[NEGRO] + territorio[NEGRO];
  const puntosBlanco = piedras[BLANCO] + territorio[BLANCO] + komi;
  return { puntosNegro, puntosBlanco, ganador: puntosNegro > puntosBlanco ? NEGRO : BLANCO };
}

// Elige la jugada de un paso del rollout por "rejection sampling": prueba
// hasta 24 casillas al azar (no las ~80+ vacías de un 9x9, ni las ~350 de un
// 19x19) y se queda con la primera que capture algo, o si ninguna captura,
// con la primera que resultó legal. Es la diferencia entre un rollout barato
// y uno que barre el tablero entero (con una verificación de legalidad + ojo
// por candidata) en cada uno de sus ~cientos de pasos — con miles de
// rollouts por jugada esa segunda opción no entra en el presupuesto de
// tiempo ni de cerca (probado: sin esto, un solo lote de 300 iteraciones
// tardaba decenas de segundos en vez de unos pocos). Sólo si el sampling
// al azar no encuentra nada jugable en esos 24 intentos (tablero casi
// lleno, caso raro) se hace el barrido exhaustivo como red de seguridad.
function elegirJugadaRollout(estado) {
  const { tablero, size, turno } = estado;
  const total = tablero.length;
  const intentosMax = Math.min(24, total);
  let mejorNoCaptura = null;
  const probados = new Set();
  for (let t = 0; t < intentosMax && probados.size < total; t++) {
    const i = (Math.random() * total) | 0;
    if (probados.has(i)) continue;
    probados.add(i);
    if (tablero[i] !== VACIO || esOjoVerdadero(tablero, size, i, turno)) continue;
    const r = jugarRapido(estado, i);
    if (!r) continue;
    if (r.numCapturas > 0) return r;
    if (!mejorNoCaptura) mejorNoCaptura = r;
  }
  if (mejorNoCaptura) return mejorNoCaptura;

  // Red de seguridad barata: recorre el tablero una sola vez (sin filtrar
  // ojos, ya es un caso de emergencia) y se queda con la primera jugable —
  // a propósito NO usa movimientosLegalesRapidos acá (ese hace dos pasadas
  // con chequeo de ojo incluido, mucho más caro, y este camino puede
  // llegar a pisarse muchas veces por rollout en un tablero casi lleno).
  for (let i = 0; i < tablero.length; i++) {
    if (tablero[i] !== VACIO) continue;
    const r = jugarRapido(estado, i);
    if (r) return r;
  }
  return null;
}

// Política del rollout: prioriza capturar si encuentra alguna jugada que
// capture algo, si no juega alguna legal cualquiera (nunca puro random sin
// ningún criterio — MCTS con rollouts totalmente al azar da estimaciones de
// territorio malas incluso a tableros chicos).
function rollout(estadoInicial, komi) {
  let estado = estadoInicial;
  let jugadas = 0;
  const tope = estado.size * estado.size * 1.5;
  while ((estado.pases || 0) < 2 && jugadas < tope) {
    const resultado = elegirJugadaRollout(estado);
    estado = resultado === null ? pasarRapido(estado) : resultado;
    jugadas++;
  }
  return contarRapido(estado.tablero, estado.size, komi).ganador;
}

function crearNodo(estado, jugada, padre) {
  return { estado, jugada, padre, hijos: [], visitas: 0, victorias: 0, sinExpandir: null };
}

function mejorHijoUCT(nodo) {
  const C = 1.4142;
  let mejor = null, mejorValor = -Infinity;
  for (const hijo of nodo.hijos) {
    if (hijo.visitas === 0) return hijo;
    const valor = hijo.victorias / hijo.visitas + C * Math.sqrt(Math.log(nodo.visitas) / hijo.visitas);
    if (valor > mejorValor) { mejorValor = valor; mejor = hijo; }
  }
  return mejor;
}

function iteracionMCTS(raiz, komi) {
  let nodo = raiz;
  if (nodo.sinExpandir === null) nodo.sinExpandir = movimientosLegalesRapidos(nodo.estado);
  while (nodo.sinExpandir.length === 0 && nodo.hijos.length > 0) {
    nodo = mejorHijoUCT(nodo);
    if (nodo.sinExpandir === null) nodo.sinExpandir = movimientosLegalesRapidos(nodo.estado);
  }

  let nodoRollout = nodo;
  if (nodo.sinExpandir.length > 0) {
    const idx = (Math.random() * nodo.sinExpandir.length) | 0;
    const jugada = nodo.sinExpandir.splice(idx, 1)[0];
    const estadoHijo = jugada === "pasar" ? pasarRapido(nodo.estado) : jugarRapido(nodo.estado, jugada);
    const hijo = crearNodo(estadoHijo, jugada, nodo);
    nodo.hijos.push(hijo);
    nodoRollout = hijo;
  }

  const ganador = rollout(nodoRollout.estado, komi);
  let actual = nodoRollout;
  while (actual) {
    actual.visitas++;
    const colorQueEligio = actual.padre ? actual.padre.estado.turno : null;
    if (colorQueEligio != null && ganador === colorQueEligio) actual.victorias++;
    actual = actual.padre;
  }
}

// Corre la búsqueda en lotes de 15 iteraciones, cediendo el control entre
// lotes (ver motorbot.js). Después de cada lote actualiza `mejorRef.jugada`
// con el hijo más visitado del root — el criterio estándar de selección
// final en MCTS (más robusto que "el de mejor ratio de victorias" cuando
// hay pocas simulaciones).
function* mctsGen(raiz, komi, mejorRef) {
  while (true) {
    if (raiz.sinExpandir === null) raiz.sinExpandir = movimientosLegalesRapidos(raiz.estado);
    for (let i = 0; i < 15; i++) iteracionMCTS(raiz, komi);

    if (raiz.hijos.length) {
      let mejor = raiz.hijos[0];
      for (const h of raiz.hijos) if (h.visitas > mejor.visitas) mejor = h;
      mejorRef.jugada = mejor.jugada;
    }
    yield;
  }
}

function hijosOrdenadosPorVisitas(raiz) {
  return raiz.hijos.slice().sort((a, b) => b.visitas - a.visitas).map((h) => h.jugada);
}

// Punto de entrada del bot (misma firma que antes, ahora async porque MCTS
// tarda un rato de verdad — ver motorbot.js). Con probabilidad (1-skill)
// sigue jugando al azar sin pensar, igual que antes, para que los niveles
// bajos del slider sigan siendo claramente vencibles.
async function jugadaDelBot(go, color, skill = 0.6) {
  const libres = [];
  for (let y = 0; y < go.size; y++) {
    for (let x = 0; x < go.size; x++) {
      if (go.board[go.idx(x, y)] === VACIO) libres.push([x, y]);
    }
  }
  if (libres.length === 0) return null;

  // Candidatas legales reales (mismo enumerado defensivo del bot anterior):
  // se usan para el camino "al azar" de niveles bajos y como red de
  // seguridad si ninguna sugerencia de MCTS resulta válida en el tablero real.
  const candidatasReales = [];
  for (const [x, y] of libres) {
    const snapBoard = go.board.slice();
    const snapHist = new Set(go.historial);
    const snapPases = go.pasesSeguidos;
    const snapCap = { ...go.capturas };
    const snapMov = go.movimientos;
    const snapUltima = go.ultimaJugada;
    const r = go.jugar(x, y);
    if (r.ok) candidatasReales.push({ x, y });
    go.board = snapBoard; go.historial = snapHist; go.pasesSeguidos = snapPases;
    go.capturas = snapCap; go.movimientos = snapMov; go.ultimaJugada = snapUltima;
    go.turno = color;
  }
  if (candidatasReales.length === 0) return null;

  if (Math.random() > skill) {
    return candidatasReales[(Math.random() * candidatasReales.length) | 0];
  }

  const estadoRaiz = { tablero: Int8Array.from(go.board), size: go.size, turno: color, anterior: null, pases: 0 };
  const raiz = crearNodo(estadoRaiz, null, null);
  raiz.sinExpandir = movimientosLegalesRapidos(estadoRaiz);
  const mejorRef = { jugada: raiz.sinExpandir[0] };

  const presupuesto = presupuestoPensadaMs(skill);
  const gen = mctsGen(raiz, go.komi, mejorRef);
  await ejecutarBusquedaCooperativa(gen, presupuesto);

  // Validación final contra el tablero REAL (superko completo, no la
  // aproximación de ko simple del motor rápido): si la sugerencia de MCTS
  // no resulta legal ahí, se prueba con la siguiente más visitada, y en
  // último caso cae a una jugada real al azar.
  const candidatos = [mejorRef.jugada, ...hijosOrdenadosPorVisitas(raiz)];
  for (const cand of candidatos) {
    if (cand === "pasar" || cand == null) return null;
    const x = cand % go.size, y = (cand / go.size) | 0;
    const snapBoard = go.board.slice();
    const snapHist = new Set(go.historial);
    const snapPases = go.pasesSeguidos;
    const snapCap = { ...go.capturas };
    const snapMov = go.movimientos;
    const snapUltima = go.ultimaJugada;
    const r = go.jugar(x, y);
    go.board = snapBoard; go.historial = snapHist; go.pasesSeguidos = snapPases;
    go.capturas = snapCap; go.movimientos = snapMov; go.ultimaJugada = snapUltima;
    go.turno = color;
    if (r.ok) return { x, y };
  }
  return candidatasReales[(Math.random() * candidatasReales.length) | 0];
}
