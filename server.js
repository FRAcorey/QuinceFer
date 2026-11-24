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

/* ---------- Galería (Cloudinary) ----------
   Las fotos las suben los invitados directo a Cloudinary desde el navegador.
   Este servidor solo LEE la lista de fotos (con tu API secret, que nunca sale del servidor)
   y le pasa a la página el nombre de tu cuenta y el preset de subida. */
const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const CLOUD_KEY = (process.env.CLOUDINARY_API_KEY || '').trim();
const CLOUD_SECRET = (process.env.CLOUDINARY_API_SECRET || '').trim();
const CLOUD_PRESET = (process.env.CLOUDINARY_UPLOAD_PRESET || '').trim();
const CLOUD_TAG = (process.env.CLOUDINARY_TAG || 'quince-fernanda').trim();
if (!CLOUD_NAME || !CLOUD_KEY || !CLOUD_SECRET || !CLOUD_PRESET) {
  console.error('Falta configurar Cloudinary (CLOUDINARY_CLOUD_NAME, _API_KEY, _API_SECRET y _UPLOAD_PRESET).');
}

// La lista se guarda 20 segundos para no gastar el límite de consultas de Cloudinary
let cacheGaleria = { hora: 0, fotos: [] };

app.get('/api/galeria', async (req, res) => {
  try {
    if (!CLOUD_NAME || !CLOUD_KEY || !CLOUD_SECRET || !CLOUD_PRESET) {
      throw new Error('Falta configurar Cloudinary en el .env');
    }
    res.set('Cache-Control', 'no-store');
    if (Date.now() - cacheGaleria.hora > 20000) {
      const auth = Buffer.from(`${CLOUD_KEY}:${CLOUD_SECRET}`).toString('base64');
      const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/resources/image/tags/${encodeURIComponent(CLOUD_TAG)}?max_results=500`;
      const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
      if (!r.ok) throw new Error(`Leer fotos: Cloudinary respondió ${r.status} ${await r.text()}`);
      const datos = await r.json();
      const fotos = (datos.resources || [])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // las más nuevas primero
        .map((f) => ({ id: f.public_id, url: f.secure_url, ancho: f.width, alto: f.height }));
      cacheGaleria = { hora: Date.now(), fotos };
    }
    res.json({ cloud: CLOUD_NAME, preset: CLOUD_PRESET, tag: CLOUD_TAG, fotos: cacheGaleria.fotos });
  } catch (e) {
    fallo(res, e, 'No se pudo cargar la galería.');
  }
});

// Página de la galería (solo para correr en tu compu; en Vercel va dentro de public/)
app.get('/galeria.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'galeria.html'));
});

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