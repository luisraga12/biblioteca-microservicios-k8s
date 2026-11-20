// Biblioteca UNIR - Servicio ADMIN (microservicio independiente)
// Gestion: alta, baja y cambio de libros, autores y prestamos.
// Es codigo propio, distinto del servicio usuario (usuario/app.js): no hay
// APP_MODE ni codigo compartido entre servicios. Cada servicio tiene su
// propio app.js, su propio package.json, su propio Dockerfile y su
// propia imagen (luisraga12/biblioteca-admin:1.0).
// Rutas: / (libros + alta), /books, /authors, /loans, /api/libros,
// /api/autores, /api/prestamos, /salud
// Las credenciales de MySQL NUNCA van hardcodeadas: se leen de variables
// de entorno (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME), inyectadas en
// Kubernetes desde el Secret db-secret con valueFrom / secretKeyRef.
const express = require('express');
const mysql = require('mysql2/promise');

const PORT = process.env.PORT || 8080;
const MODULO = 'admin';

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
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;margin:0;background:linear-gradient(135deg,#fff7ed 0%,#fef2f2 55%,#eef4ff 100%);color:#1e293b;min-height:100vh}header{background:linear-gradient(135deg,#b91c1c,#7c3aed);color:#fff;padding:2rem 1rem 1.5rem}header .wrap,main,footer{max-width:960px;margin:0 auto;padding:0 1rem}header h1{margin:0;font-size:2rem;letter-spacing:-.02em}header p{margin:.5rem 0 0;opacity:.9}main{padding:1.5rem 1rem 2rem}.card{background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(30,41,59,.10);padding:1.25rem;margin-bottom:1rem}nav{margin:1rem 0}nav a{display:inline-block;background:#fff;color:#b91c1c;text-decoration:none;font-weight:600;padding:.45rem .9rem;border-radius:999px;margin:.2rem .25rem 0 0;box-shadow:0 2px 8px rgba(30,41,59,.08)}nav a:hover{background:#b91c1c;color:#fff}table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden}th{background:#b91c1c;color:#fff;padding:.7rem;text-align:left}td{padding:.65rem;border-bottom:1px solid #e2e8f0}tr:last-child td{border-bottom:0}tr:hover td{background:#fff7ed}.badge{display:inline-block;background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.4);padding:.25rem .7rem;border-radius:999px;font-size:.85rem;margin-right:.3rem}.pill{display:inline-block;background:#dcfce7;color:#166534;padding:.2rem .6rem;border-radius:999px;font-weight:600;font-size:.85rem}.pill.no{background:#fee2e2;color:#991b1b}form{display:inline}input,select,button{padding:.55rem .7rem;border-radius:10px;border:1px solid #cbd5e1;font-size:1rem}button{background:#b91c1c;color:#fff;border:0;font-weight:700;cursor:pointer}button:hover{background:#991b1b}h2{color:#b91c1c}footer{color:#64748b;padding-bottom:2rem;font-size:.9rem}footer a{color:#b91c1c}</style></head><body><header><div class="wrap"><h1>📚 Biblioteca</h1><p>Módulo admin · Panel para gestionar libros, autores y préstamos</p><p><span class="badge">Namespace: pruebas</span> <span class="badge">Servicio: biblioteca-admin</span> <span class="badge">Gestión</span></p></div></header><main><nav><a href="/">📖 Libros</a><a href="/authors">✍️ Autores</a><a href="/loans">🔄 Préstamos</a><a href="/api/libros">API libros</a></nav><div class="card">${body}</div></main><footer><p><a href="/salud">/salud</a> · La consulta pública está en el módulo usuario (:30080).</p></footer></body></html>`;
}

// Salud: la usan livenessProbe y readinessProbe de Kubernetes.
app.get('/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ estado: 'ok', modulo: MODULO, servicio: 'biblioteca-admin' });
  } catch (err) {
    return res.status(503).json({ estado: 'error', detalle: err.message });
  }
});

// --- Lectura (API) ---
app.get('/api/libros', async (req, res) => {
  try { const [rows] = await pool.query('SELECT * FROM libros ORDER BY id'); return res.json(rows); }
  catch (err) { return res.status(500).json({ error: err.message }); }
});
app.get('/api/autores', async (req, res) => {
  try { const [rows] = await pool.query('SELECT * FROM autores ORDER BY id'); return res.json(rows); }
  catch (err) { return res.status(500).json({ error: err.message }); }
});
app.get('/api/prestamos', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT p.*, l.titulo FROM prestamos p JOIN libros l ON l.id = p.libro_id ORDER BY p.id');
    return res.json(rows);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// --- Libros: alta, cambio de disponibilidad, baja ---
app.post('/api/libros', async (req, res) => {
  const { titulo, autor, anio, disponible } = req.body;
  if (!titulo || !autor || !anio) return res.status(400).json({ error: 'titulo, autor y anio son obligatorios' });
  try {
    const [r] = await pool.query('INSERT INTO libros (titulo, autor, anio, disponible) VALUES (?, ?, ?, ?)', [titulo, autor, Number(anio), disponible === false || disponible === 'false' || disponible === '0' ? 0 : 1]);
    if (req.headers.accept && req.headers.accept.includes('text/html')) return res.redirect('/');
    return res.status(201).json({ id: r.insertId });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

async function toggleDisponibilidad(req, res, redirect) {
  try {
    const [rows] = await pool.query('SELECT disponible FROM libros WHERE id = ?', [req.params.id]);
    if (!rows.length) return redirect ? res.status(404).send('Libro no encontrado') : res.status(404).json({ error: 'Libro no encontrado' });
    const nuevo = rows[0].disponible ? 0 : 1;
    await pool.query('UPDATE libros SET disponible = ? WHERE id = ?', [nuevo, req.params.id]);
    if (redirect) return res.redirect('/');
    return res.json({ id: Number(req.params.id), disponible: Boolean(nuevo) });
  } catch (err) { return redirect ? res.status(500).send(err.message) : res.status(500).json({ error: err.message }); }
}
app.put('/api/libros/:id/disponibilidad', (req, res) => toggleDisponibilidad(req, res, false));
app.post('/api/libros/:id/disponibilidad', (req, res) => toggleDisponibilidad(req, res, true)); // override para formularios HTML

async function borrarLibro(req, res, redirect) {
  try {
    const [r] = await pool.query('DELETE FROM libros WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return redirect ? res.status(404).send('Libro no encontrado') : res.status(404).json({ error: 'Libro no encontrado' });
    if (redirect) return res.redirect('/');
    return res.json({ borrado: Number(req.params.id) });
  } catch (err) { return redirect ? res.status(500).send(err.message) : res.status(500).json({ error: err.message }); }
}
app.delete('/api/libros/:id', (req, res) => borrarLibro(req, res, false));
app.post('/api/libros/:id/borrar', (req, res) => borrarLibro(req, res, true)); // override para formularios HTML

// --- Autores: alta y baja ---
app.post('/api/autores', async (req, res) => {
  const { nombre, nacionalidad } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
  try {
    const [r] = await pool.query('INSERT INTO autores (nombre, nacionalidad) VALUES (?, ?)', [nombre, nacionalidad || '']);
    if (req.headers.accept && req.headers.accept.includes('text/html')) return res.redirect('/authors');
    return res.status(201).json({ id: r.insertId });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.delete('/api/autores/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM autores WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Autor no encontrado' });
    return res.json({ borrado: Number(req.params.id) });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// --- Prestamos: prestar y devolver ---
app.post('/api/prestamos', async (req, res) => {
  const { libro_id, lector } = req.body;
  if (!libro_id || !lector) return res.status(400).json({ error: 'libro_id y lector son obligatorios' });
  try {
    const [libros] = await pool.query('SELECT disponible FROM libros WHERE id = ?', [libro_id]);
    if (!libros.length) return res.status(404).json({ error: 'Libro no encontrado' });
    if (!libros[0].disponible) return res.status(400).json({ error: 'Ese libro ya está prestado' });
    const [r] = await pool.query('INSERT INTO prestamos (libro_id, lector) VALUES (?, ?)', [libro_id, lector]);
    await pool.query('UPDATE libros SET disponible = 0 WHERE id = ?', [libro_id]);
    if (req.headers.accept && req.headers.accept.includes('text/html')) return res.redirect('/loans');
    return res.status(201).json({ id: r.insertId });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

async function devolverPrestamo(req, res, redirect) {
  try {
    const [rows] = await pool.query('SELECT * FROM prestamos WHERE id = ?', [req.params.id]);
    if (!rows.length) return redirect ? res.status(404).send('Préstamo no encontrado') : res.status(404).json({ error: 'Préstamo no encontrado' });
    if (rows[0].devuelto) return redirect ? res.redirect('/loans') : res.json({ id: Number(req.params.id), devuelto: true });
    await pool.query('UPDATE prestamos SET devuelto = 1, fecha_devolucion = CURRENT_DATE WHERE id = ?', [req.params.id]);
    await pool.query('UPDATE libros SET disponible = 1 WHERE id = ?', [rows[0].libro_id]);
    if (redirect) return res.redirect('/loans');
    return res.json({ id: Number(req.params.id), devuelto: true });
  } catch (err) { return redirect ? res.status(500).send(err.message) : res.status(500).json({ error: err.message }); }
}
app.post('/api/prestamos/:id/devolver', (req, res) => devolverPrestamo(req, res, true)); // formularios HTML
app.put('/api/prestamos/:id/devolver', (req, res) => devolverPrestamo(req, res, false));

// --- Vistas HTML ---
async function vistaLibros(req, res) {
  const q = (req.query.q || '').trim();
  try {
    const [rows] = q
      ? await pool.query('SELECT * FROM libros WHERE titulo LIKE ? OR autor LIKE ? ORDER BY id', [`%${q}%`, `%${q}%`])
      : await pool.query('SELECT * FROM libros ORDER BY id');
    const filas = rows.map((l) => `<tr><td>${l.id}</td><td>${esc(l.titulo)}</td><td>${esc(l.autor)}</td><td>${l.anio}</td><td><span class="pill${l.disponible ? '' : ' no'}">${l.disponible ? '✓ Disponible' : '✕ Prestado'}</span></td><td><form method="post" action="/api/libros/${l.id}/disponibilidad"><button>Cambiar disponibilidad</button></form> <form method="post" action="/api/libros/${l.id}/borrar" onsubmit="return confirm('¿Borrar este libro?')"><button>Borrar</button></form></td></tr>`).join('');
    return res.send(layout('Biblioteca — admin', `<form method="get" action="/"><input name="q" value="${esc(q)}" placeholder="Buscar por título o autor"> <button>Buscar</button></form><table><tr><th>ID</th><th>Título</th><th>Autor</th><th>Año</th><th>Disponible</th><th>Acciones</th></tr>${filas || '<tr><td colspan="6">Sin libros.</td></tr>'}</table><h2>Alta de libro</h2><form method="post" action="/api/libros"><input name="titulo" placeholder="Título" required> <input name="autor" placeholder="Autor" required> <input name="anio" placeholder="Año" type="number" required> <label><input name="disponible" type="checkbox" checked> Disponible</label> <button>Añadir</button></form>`));
  } catch (err) { return res.status(500).send(layout('Error', `<p>Error al consultar la base de datos: ${esc(err.message)}</p>`)); }
}
app.get('/', vistaLibros);
app.get('/books', vistaLibros);

app.get('/authors', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM autores ORDER BY id');
    const filas = rows.map((a) => `<tr><td>${a.id}</td><td>${esc(a.nombre)}</td><td>${esc(a.nacionalidad)}</td></tr>`).join('');
    return res.send(layout('Autores', `<table><tr><th>ID</th><th>Nombre</th><th>Nacionalidad</th></tr>${filas || '<tr><td colspan="3">Sin autores.</td></tr>'}</table><h2>Alta de autor</h2><form method="post" action="/api/autores"><input name="nombre" placeholder="Nombre" required> <input name="nacionalidad" placeholder="Nacionalidad"> <button>Añadir</button></form>`));
  } catch (err) { return res.status(500).send(layout('Error', `<p>Error al consultar la base de datos: ${esc(err.message)}</p>`)); }
});

app.get('/loans', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT p.*, l.titulo FROM prestamos p JOIN libros l ON l.id = p.libro_id ORDER BY p.id');
    const [libros] = await pool.query('SELECT id, titulo FROM libros WHERE disponible = 1 ORDER BY id');
    const filas = rows.map((p) => `<tr><td>${p.id}</td><td>${esc(p.titulo)}</td><td>${esc(p.lector)}</td><td>${p.fecha_prestamo ? String(p.fecha_prestamo).slice(0, 10) : ''}</td><td>${p.fecha_devolucion ? String(p.fecha_devolucion).slice(0, 10) : '—'}</td><td>${p.devuelto ? 'Sí' : 'No'}</td><td>${p.devuelto ? '' : `<form method="post" action="/api/prestamos/${p.id}/devolver"><button>Devolver</button></form>`}</td></tr>`).join('');
    const opciones = libros.map((l) => `<option value="${l.id}">${l.id} — ${esc(l.titulo)}</option>`).join('');
    return res.send(layout('Préstamos', `<table><tr><th>ID</th><th>Libro</th><th>Lector</th><th>Préstamo</th><th>Devolución</th><th>Devuelto</th><th>Acción</th></tr>${filas || '<tr><td colspan="7">Sin préstamos.</td></tr>'}</table><h2>Nuevo préstamo</h2><form method="post" action="/api/prestamos"><select name="libro_id" required>${opciones}</select> <input name="lector" placeholder="Lector" required> <button>Prestar</button></form>`));
  } catch (err) { return res.status(500).send(layout('Error', `<p>Error al consultar la base de datos: ${esc(err.message)}</p>`)); }
});

connectWithRetry()
  .then(() => app.listen(PORT, () => console.log(`[biblioteca-${MODULO}] Escuchando en el puerto ${PORT}`)))
  .catch((err) => { console.error(`[biblioteca-${MODULO}] No se pudo conectar a MySQL: ${err.message}`); process.exit(1); });
