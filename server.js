/* Servidor de la invitación (Express).
   - Sirve la carpeta public/ cuando lo corrés en tu compu.
   - En Vercel, public/ la sirve su CDN y este archivo atiende solo las rutas /api/...
   - Guarda las asistencias y las canciones en Supabase. Las claves quedan en el servidor,
     nunca llegan al navegador. */

require('dotenv').config({path: require('path').join(__dirname, '/config', '.env')}); 
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use("/assets", express.static(path.join(__dirname, "assets")));

/* ---------- Configuración ---------- */
app.get('/config', (req, res) => {
  res.json({
    conectado: CONECTADO,
    supabase_url: SUPABASE_URL,
    supabase_key: SUPABASE_KEY ? '*****' : ''
  });
});

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const CONECTADO = Boolean(SUPABASE_URL && SUPABASE_KEY);

/* Si no hay claves, funciona en modo de prueba: guarda en memoria y se borra al reiniciar. */
const memoria = { asistencias: [], musica: [] };
if (!CONECTADO) {
  console.warn('Sin SUPABASE_URL / SUPABASE_KEY: modo de prueba, los datos se guardan en memoria.');
}

/* ---------- Acceso a Supabase (REST, sin librerías) ---------- */
function supabase(ruta, opciones = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...opciones.headers
    }
  });
}

async function listar(tabla, campos, limite) {
  if (!CONECTADO) return memoria[tabla].slice(0, limite);
  const r = await supabase(`${tabla}?select=${campos}&order=creado_en.desc&limit=${limite}`);
  if (!r.ok) throw new Error(`No se pudo leer ${tabla}`);
  return r.json();
}

/* Devuelve 'ok' o 'duplicado' */
async function agregar(tabla, fila) {
  if (!CONECTADO) {
    const repetido = tabla === 'asistencias' &&
      memoria.asistencias.some((x) => x.nombre.toLowerCase() === fila.nombre.toLowerCase());
    if (repetido) return 'duplicado';
    memoria[tabla].unshift(fila);
    return 'ok';
  }
  const r = await supabase(tabla, { method: 'POST', body: JSON.stringify(fila) });
  if (r.status === 409) return 'duplicado'; // el nombre ya existe (restricción única de la tabla)
  if (!r.ok) throw new Error(`No se pudo guardar en ${tabla}`);
  return 'ok';
}

/* ---------- Rutas ---------- */
app.get('/', (req, res) => {
  const archivo = path.join(__dirname, 'index.html');
  res.sendFile(archivo, (err) => {
    if (err) res.status(404).send('No encuentro ' + archivo + '. Revisá que index.html esté dentro de la carpeta public.');
  });
});

app.get('/api/asistencias', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await listar('asistencias', 'nombre,va', 200));
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'No se pudo leer la lista.' });
  }
});

app.post('/api/asistencias', async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();
  const va = req.body?.va;
  if (!nombre || nombre.length > 60 || typeof va !== 'boolean') {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }
  try {
    const resultado = await agregar('asistencias', { nombre, va });
    if (resultado === 'duplicado') {
      return res.status(409).json({ error: 'Ya hay una confirmación con ese nombre.' });
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'No se pudo guardar tu respuesta.' });
  }
});

app.get('/api/musica', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await listar('musica', 'cancion', 100));
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'No se pudo leer la lista.' });
  }
});

app.post('/api/musica', async (req, res) => {
  const cancion = String(req.body?.cancion ?? '').trim();
  if (!cancion || cancion.length > 80) {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }
  try {
    await agregar('musica', { cancion });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'No se pudo guardar la canción.' });
  }
});

/* ---------- Archivos de la página (solo para correr en tu compu) ---------- */
app.use(express.static(path.join(__dirname, 'public')));
app.use("/assets", express.static(path.join(__dirname, "assets")));

/* ---------- Arranque ---------- */
const PORT = process.env.PORT || 3100;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Invitación lista en http://localhost:${PORT}`));
}

module.exports = app;
