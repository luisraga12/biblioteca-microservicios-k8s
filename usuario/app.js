// Biblioteca UNIR - Servicio USUARIO (microservicio independiente)
// Solo consulta: NO tiene rutas de alta, baja ni modificacion.
// Es codigo propio, distinto del servicio admin (admin/app.js): no hay
// APP_MODE ni codigo compartido entre servicios. Cada servicio tiene su
// propio app.js, su propio package.json, su propio Dockerfile y su
// propia imagen (luisraga12/biblioteca-usuario:1.0).
// Rutas: / (libros), /books, /authors, /api/libros, /api/autores, /salud
// Las credenciales de MySQL NUNCA van hardcodeadas: se leen de variables
// de entorno (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME), inyectadas en
// Kubernetes desde el Secret db-secret con valueFrom / secretKeyRef.
const express = require('express');
const mysql = require('mysql2/promise');

const PORT = process.env.PORT || 8080;
const MODULO = 'usuario';

const dbConfig = {
  host: process.env.DB_HOST || 'mysql-svc',
  user: process.env.DB_USER || 'biblio_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'biblioteca',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
};

let pool = null;

// Reintentos al arrancar: MySQL tarda en estar listo dentro del StatefulSet.
// Sin esto, el Deployment fallaria en el primer intento y entraria en CrashLoopBackOff.
async function connectWithRetry(attempts = 20, delayMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      pool = mysql.createPool(dbConfig);
      await pool.query('SELECT 1');
      console.log(`[biblioteca-${MODULO}] Conectado a MySQL en ${dbConfig.host}:${dbConfig.port}/${dbConfig.database} (intento ${i})`);
      return;
    } catch (err) {
      console.error(`[biblioteca-${MODULO}] MySQL no listo, intento ${i}/${attempts}: ${err.message}`);
      if (pool) { try { await pool.end(); } catch (_) {} pool = null; }
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function layout(title, body) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;margin:0;background:linear-gradient(135deg,#eef4ff 0%,#f7f3ff 55%,#eafaf3 100%);color:#1e293b;min-height:100vh}header{background:linear-gradient(135deg,#1d4ed8,#7c3aed);color:#fff;padding:2rem 1rem 1.5rem}header .wrap,main,footer{max-width:960px;margin:0 auto;padding:0 1rem}header h1{margin:0;font-size:2rem;letter-spacing:-.02em}header p{margin:.5rem 0 0;opacity:.9}main{padding:1.5rem 1rem 2rem}.card{background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(30,41,59,.10);padding:1.25rem;margin-bottom:1rem}nav{margin:1rem 0}nav a{display:inline-block;background:#fff;color:#1d4ed8;text-decoration:none;font-weight:600;padding:.45rem .9rem;border-radius:999px;margin:.2rem .25rem 0 0;box-shadow:0 2px 8px rgba(30,41,59,.08)}nav a:hover{background:#1d4ed8;color:#fff}table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden}th{background:#1d4ed8;color:#fff;padding:.7rem;text-align:left}td{padding:.65rem;border-bottom:1px solid #e2e8f0}tr:last-child td{border-bottom:0}tr:hover td{background:#f8fafc}.badge{display:inline-block;background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.4);padding:.25rem .7rem;border-radius:999px;font-size:.85rem;margin-right:.3rem}.pill{display:inline-block;background:#dcfce7;color:#166534;padding:.2rem .6rem;border-radius:999px;font-weight:600;font-size:.85rem}.pill.no{background:#fee2e2;color:#991b1b}input,button,select{padding:.55rem .7rem;border-radius:10px;border:1px solid #cbd5e1;font-size:1rem}button{background:#1d4ed8;color:#fff;border:0;font-weight:700;cursor:pointer}button:hover{background:#1e40af}footer{color:#64748b;padding-bottom:2rem;font-size:.9rem}footer a{color:#1d4ed8}</style></head><body><header><div class="wrap"><h1>📚 Biblioteca</h1><p>Módulo usuario · Catálogo para consultar libros y autores</p><p><span class="badge">Namespace: pruebas</span> <span class="badge">Servicio: biblioteca-usuario</span> <span class="badge">Solo consulta</span></p></div></header><main><nav><a href="/">📖 Libros</a><a href="/authors">✍️ Autores</a><a href="/api/libros">API libros</a></nav><div class="card">${body}</div></main><footer><p><a href="/salud">/salud</a> · La gestión se hace en el módulo admin (:30081).</p></footer></body></html>`;
}

// Salud: la usan livenessProbe y readinessProbe de Kubernetes.
app.get('/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ estado: 'ok', modulo: MODULO, servicio: 'biblioteca-usuario' });
  } catch (err) {
    return res.status(503).json({ estado: 'error', detalle: err.message });
  }
});

app.get('/api/libros', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const [rows] = q
      ? await pool.query('SELECT * FROM libros WHERE titulo LIKE ? OR autor LIKE ? ORDER BY id', [`%${q}%`, `%${q}%`])
      : await pool.query('SELECT * FROM libros ORDER BY id');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/autores', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM autores ORDER BY id');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

async function listaLibros(req, res) {
  const q = (req.query.q || '').trim();
  try {
    const [rows] = q
      ? await pool.query('SELECT * FROM libros WHERE titulo LIKE ? OR autor LIKE ? ORDER BY id', [`%${q}%`, `%${q}%`])
      : await pool.query('SELECT * FROM libros ORDER BY id');
    const filas = rows.map((l) => `<tr><td>${l.id}</td><td>${esc(l.titulo)}</td><td>${esc(l.autor)}</td><td>${l.anio}</td><td><span class="pill${l.disponible ? '' : ' no'}">${l.disponible ? '✓ Disponible' : '✕ Prestado'}</span></td></tr>`).join('');
    return res.send(layout('Biblioteca — usuario', `<form method="get" action="/"><input name="q" value="${esc(q)}" placeholder="Buscar por título o autor"> <button>Buscar</button></form><table><tr><th>ID</th><th>Título</th><th>Autor</th><th>Año</th><th>Disponible</th></tr>${filas || '<tr><td colspan="5">Sin libros.</td></tr>'}</table><p>Este módulo es solo de consulta. La gestión se hace en el módulo admin (:30081).</p>`));
  } catch (err) {
    return res.status(500).send(layout('Error', `<p>Error al consultar la base de datos: ${esc(err.message)}</p>`));
  }
}

app.get('/', listaLibros);
app.get('/books', listaLibros);

app.get('/authors', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM autores ORDER BY id');
    const filas = rows.map((a) => `<tr><td>${a.id}</td><td>${esc(a.nombre)}</td><td>${esc(a.nacionalidad)}</td></tr>`).join('');
    return res.send(layout('Autores', `<table><tr><th>ID</th><th>Nombre</th><th>Nacionalidad</th></tr>${filas || '<tr><td colspan="3">Sin autores.</td></tr>'}</table>`));
  } catch (err) {
    return res.status(500).send(layout('Error', `<p>Error al consultar la base de datos: ${esc(err.message)}</p>`));
  }
});

// Este servicio es solo de consulta: cualquier intento de escritura se rechaza.
app.all('/api/*', (req, res, next) => {
  if (req.method !== 'GET') return res.status(403).json({ error: 'Servicio usuario: solo consulta. La gestión se hace en el módulo admin (:30081).' });
  return next();
});

connectWithRetry()
  .then(() => app.listen(PORT, () => console.log(`[biblioteca-${MODULO}] Escuchando en el puerto ${PORT}`)))
  .catch((err) => { console.error(`[biblioteca-${MODULO}] No se pudo conectar a MySQL: ${err.message}`); process.exit(1); });
