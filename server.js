/* Servidor de la invitación (Express).
   - Sirve la carpeta public/ cuando lo corrés en tu compu.
   - En Vercel, public/ la sirve su CDN y este archivo atiende solo las rutas /api/...
   - Guarda las asistencias y las canciones en Supabase. Las claves quedan en el servidor,
     nunca llegan al navegador. */

require('dotenv').config({path: require('path').join(__dirname, '/config', '.env')});
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json({ limit: '10kb' }));
app.get('/api/prueba', (req, res) => {
  res.json({
    mensaje: 'Express funciona en Vercel',
    estado: 'OK'
  });
});

/* ---------- Configuración ---------- */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_KEY. Revisá config/.env (o las variables de Vercel).');
}

/* ---------- Acceso a Supabase (REST, sin librerías) ---------- */
function supabase(ruta, opciones = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Falta configurar SUPABASE_URL y SUPABASE_KEY.');
  }
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
    ...opciones.headers
  };
  // Las claves nuevas (sb_publishable_... / sb_secret_...) se mandan solo en "apikey".
  // Las claves viejas (empiezan con "eyJ") también se mandan como Bearer.
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  return fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, { ...opciones, headers });
}

/* Si Supabase responde con error, lo muestra completo en la terminal */
async function revisar(r, accion) {
  if (r.ok) return;
  const detalle = await r.text();
  throw new Error(`${accion}: Supabase respondió ${r.status} ${detalle}`);
}

async function listar(tabla, campos, limite) {
  const r = await supabase(`${tabla}?select=${campos}&order=creado_en.desc&limit=${limite}`);
  await revisar(r, `Leer ${tabla}`);
  return r.json();
}

/* Devuelve 'ok' o 'duplicado' */
async function agregar(tabla, fila) {
  const r = await supabase(tabla, { method: 'POST', body: JSON.stringify(fila) });
  if (r.status === 409) return 'duplicado'; // el nombre ya existe (restricción única de la tabla)
  await revisar(r, `Guardar en ${tabla}`);
  return 'ok';
}

function fallo(res, e, mensaje) {
  console.error(e.message, e.cause ? `(${e.cause.code || e.cause.message})` : '');
  res.status(500).json({ error: mensaje });
}

/* ---------- Rutas ---------- */
app.get('/api/asistencias', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const filas = await listar('asistencias', 'va', 1000);
    res.json({ total: filas.filter((f) => f.va).length });
  } catch (e) {
    fallo(res, e, 'No se pudo leer el total.');
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
    fallo(res, e, 'No se pudo guardar tu respuesta.');
  }
});

app.get('/api/musica', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await listar('musica', 'cancion', 100));
  } catch (e) {
    fallo(res, e, 'No se pudo leer la lista.');
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
    fallo(res, e, 'No se pudo guardar la canción.');
  }
});

/* ---------- Archivos de la página (solo para correr en tu compu) ---------- */
// Archivos CSS, imágenes y otros recursos
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ---------- Arranque ---------- */
const PORT = process.env.PORT || 3100;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Invitación lista en http://localhost:${PORT}`));
}

module.exports = app;