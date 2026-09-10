// ============ Motor de búsqueda cooperativa (compartido Go/Ajedrez) ============
// La app se abre por file:// (doble click a index.html), y un Web Worker
// real falla ahí en Chrome por la restricción de origen sobre ese esquema —
// así que en vez de mandar la búsqueda a otro hilo, el MCTS de Go y el
// alfa-beta de Ajedrez se escriben como generadores que ceden el control
// (yield) cada tantos nodos/iteraciones. Este driver los recorre en lotes y
// entre lote y lote hace un await a un setTimeout(0), así el hilo principal
// queda libre un instante para seguir animando (la luna, el flicker de la
// luz, etc.) en vez de congelarse de punta a punta de la jugada.
//
// El generador NUNCA devuelve la jugada elegida como su valor de retorno:
// la va dejando en `ref.jugada` (un objeto de clausura que el caller ya
// tiene de antes) en cada lote, para que si el tiempo se acaba a mitad de
// camino, `ref.jugada` ya tenga la mejor candidata encontrada hasta ese
// momento — cortar por tiempo nunca deja al bot sin jugada.
async function ejecutarBusquedaCooperativa(generador, presupuestoMs) {
  const fin = performance.now() + presupuestoMs;
  while (true) {
    const { done } = generador.next();
    if (done) break;
    if (performance.now() >= fin) { generador.return(); break; }
    await new Promise((r) => setTimeout(r, 0));
  }
}

// Presupuesto de pensada por jugada: escala con el nivel (skill 0-1 ya lo
// arma app.js a partir del slider), de medio segundo a ~3.7s. La curva es
// cuadrática para que la diferencia real de fuerza se concentre en los
// niveles altos: nivel 5 piensa ~1.3s, nivel 7 ~2.3s, nivel 9 ~3.7s.
function presupuestoPensadaMs(skill) {
  return 500 + skill * skill * 3200;
}

// Red de seguridad dura: por más que la búsqueda ceda el control seguido
// (ver arriba), un caso de tablero particular podría hacer que un solo lote
// tarde bastante más de lo esperado — así que la UI nunca debe quedar
// esperando de forma indefinida. `promesa` es la búsqueda real (jugadaDelBot
// o jugadaDelAjedrez); si no resuelve dentro de `techoMs`, se seguirá
// ejecutando en segundo plano sola (es cooperativa, no bloquea el hilo) pero
// se ignora su resultado y se usa `siFallback()` en su lugar, así el turno
// del bot nunca se cuelga en pantalla.
async function conTechoDeTiempo(promesa, techoMs, siFallback) {
  let vencido = false;
  const timeout = new Promise((resolve) => setTimeout(() => { vencido = true; resolve(undefined); }, techoMs));
  const resultado = await Promise.race([promesa, timeout]);
  if (vencido) return await siFallback();
  return resultado;
}
