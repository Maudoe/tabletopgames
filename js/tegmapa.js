// ============ Mapa de TEG (Leaflet, tiles reales oscuros) ============
// A diferencia de Go/Ajedrez (escenas Three.js con una sala 3D alrededor),
// TEG usa un mapa geográfico real: Leaflet.js con los mismos tiles oscuros
// que ya se usaban en otro proyecto propio (Khronos, un panel de métricas
// con un mapa de origen de ejecución) — ver los <link>/<script> de Leaflet
// en index.html, tienen que cargar antes que este archivo. Cada territorio
// (ver TERRITORIOS en js/teg.js, ya cargado antes) es una ficha redonda
// posicionada en su coordenada real, con un degradado tipo canica/botón
// pulido (no un círculo plano) para que se lea con volumen; las conexiones
// entre vecinos son líneas finas doradas.

const PALETA_JUGADORES_TEG = {
  azul:    { nombre: "Azul",    color: "#4a7fd6" },
  rojo:    { nombre: "Rojo",    color: "#e0483a" },
  verde:   { nombre: "Verde",   color: "#4ad68f" },
  dorado:  { nombre: "Dorado",  color: "#e8b84b" },
  violeta: { nombre: "Violeta", color: "#9a5fe0" },
  blanco:  { nombre: "Blanco",  color: "#eef0f2" },
};
const ORDEN_COLORES_TEG = ["azul", "rojo", "verde", "dorado", "violeta", "blanco"];

// Aclara/oscurece un color hex mezclándolo hacia blanco (cantidad > 0) o
// negro (cantidad < 0) — para armar el degradado de brillo/sombra de cada
// ficha a partir de un único color de dueño, sin tener que guardar 3 tonos
// por color a mano.
function _mezclarColorTeg(hex, cantidad) {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const hacia = cantidad > 0 ? 255 : 0;
  const t = Math.abs(cantidad);
  r = Math.round(r + (hacia - r) * t);
  g = Math.round(g + (hacia - g) * t);
  b = Math.round(b + (hacia - b) * t);
  return `rgb(${r},${g},${b})`;
}

class TegMapa {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.mapa = L.map(contenedor, {
      zoomControl: true, attributionControl: true, worldCopyJump: false,
      minZoom: 2, maxZoom: 6, maxBounds: [[-75, -200], [82, 200]], maxBoundsViscosity: 0.65,
    }).setView([18, 8], 2);

    // CartoDB (el que se usaba en el proyecto de origen) empezó a pedir API
    // key para este estilo — esto en cambio es el basemap gris oscuro
    // gratuito de Esri (sin key), con el orden de tile {z}/{y}/{x} que usa
    // ArcGIS (al revés que la mayoría de los proveedores).
    L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16, attribution: "&copy; Esri, HERE, Garmin, FAO, NOAA, USGS",
    }).addTo(this.mapa);

    this._lineas = L.layerGroup().addTo(this.mapa);
    this._grupoMarcadores = L.layerGroup().addTo(this.mapa);
    this._marcadores = {}; // territorioId -> L.Marker (divIcon)
    this._onTerritorio = null;

    this._dibujarLineas();
    this._crearMarcadores();
    setTimeout(() => this.resize(), 60);
  }

  _dibujarLineas() {
    const vistos = new Set();
    for (const id of Object.keys(TERRITORIOS)) {
      for (const v of TERRITORIOS[id].vecinos) {
        const clave = [id, v].sort().join("|");
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        L.polyline([TERRITORIOS[id].pos, TERRITORIOS[v].pos], {
          color: "#c8a24a", weight: 1, opacity: 0.32, interactive: false,
        }).addTo(this._lineas);
      }
    }
  }

  // Ficha tipo "canica/botón": un <div> con degradado radial (no un círculo
  // SVG plano) para que se lea con volumen — más claro arriba a la
  // izquierda, más oscuro al borde, como una piedra pulida. El color exacto
  // (según el dueño) y el número se completan en actualizar(), acá sólo se
  // arma la estructura y los eventos.
  _crearMarcadores() {
    for (const id of Object.keys(TERRITORIOS)) {
      const icon = L.divIcon({
        className: "teg-token-wrap",
        html: `<div class="teg-token"><span class="teg-token-num"></span></div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      });
      const m = L.marker(TERRITORIOS[id].pos, { icon, interactive: true, keyboard: false });
      m.on("click", () => { if (this._onTerritorio) this._onTerritorio(id); });
      m.on("mouseover", () => this._resaltarContinente(TERRITORIOS[id].continente));
      m.on("mouseout", () => this._resaltarContinente(null));
      m.addTo(this._grupoMarcadores);
      this._marcadores[id] = m;
    }
  }

  onTerritorio(cb) { this._onTerritorio = cb; }

  // Hover sobre cualquier ficha ilumina TODO su continente (no sólo esa
  // ficha) en naranja — ayuda a ver de un vistazo qué territorios hacen
  // falta para el bonus de continente completo.
  _resaltarContinente(continente) {
    for (const id of Object.keys(TERRITORIOS)) {
      const el = this._marcadores[id].getElement();
      const token = el && el.querySelector(".teg-token");
      if (token) token.classList.toggle("teg-token--continente", !!continente && TERRITORIOS[id].continente === continente);
    }
  }

  // `coloresPorJugador`: array de hex, uno por índice de jugador.
  // `opciones`: { seleccion: territorioId|null, resaltados: [territorioId,...] }
  actualizar(teg, coloresPorJugador, opciones = {}) {
    for (const id of Object.keys(TERRITORIOS)) {
      const info = teg.board[id];
      const el = this._marcadores[id].getElement();
      if (!el) continue;
      const token = el.querySelector(".teg-token");
      const color = coloresPorJugador[info.dueno] || "#666";
      token.style.background = `radial-gradient(circle at 34% 28%, ${_mezclarColorTeg(color, 0.55)}, ${color} 48%, ${_mezclarColorTeg(color, -0.35)} 100%)`;
      token.querySelector(".teg-token-num").textContent = String(info.ejercitos);
      token.classList.toggle("teg-token--seleccion", opciones.seleccion === id);
      token.classList.toggle("teg-token--resaltado", !!(opciones.resaltados && opciones.resaltados.includes(id)));
    }
  }

  resize() { this.mapa.invalidateSize(); }
  dispose() { this.mapa.remove(); }
}
