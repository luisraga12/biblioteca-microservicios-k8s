-- Biblioteca UNIR - datos semilla (microservicios)
-- Se ejecuta solo la primera vez que MySQL crea el volumen (volumen vacio).
-- Las credenciales y la base de datos las crea MySQL a partir de las
-- variables MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD del Secret.
-- Los 5 libros son los mismos del proyecto Biblioteca anterior; se anaden
-- las tablas autores y prestamos que usan los servicios usuario y admin.
CREATE TABLE IF NOT EXISTS libros (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  autor VARCHAR(200) NOT NULL,
  anio INT NOT NULL,
  disponible TINYINT(1) NOT NULL DEFAULT 1
);

INSERT INTO libros (titulo, autor, anio, disponible) VALUES
  ('Don Quijote de la Mancha', 'Miguel de Cervantes', 1605, 1),
  ('Cien años de soledad', 'Gabriel García Márquez', 1967, 1),
  ('El ingenioso hidalgo', 'Miguel de Cervantes', 1615, 0),
  ('La sombra del viento', 'Carlos Ruiz Zafón', 2001, 1),
  ('El Principito', 'Antoine de Saint-Exupéry', 1943, 1);

CREATE TABLE IF NOT EXISTS autores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  nacionalidad VARCHAR(100) NOT NULL DEFAULT ''
);

INSERT INTO autores (nombre, nacionalidad) VALUES
  ('Miguel de Cervantes', 'España'),
  ('Gabriel García Márquez', 'Colombia'),
  ('Carlos Ruiz Zafón', 'España'),
  ('Antoine de Saint-Exupéry', 'Francia');

CREATE TABLE IF NOT EXISTS prestamos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  libro_id INT NOT NULL,
  lector VARCHAR(200) NOT NULL,
  fecha_prestamo DATE NOT NULL DEFAULT (CURRENT_DATE),
  fecha_devolucion DATE NULL,
  devuelto TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (libro_id) REFERENCES libros(id)
);

-- El libro 3 (El ingenioso hidalgo) esta prestado y por eso no disponible.
INSERT INTO prestamos (libro_id, lector, fecha_prestamo, devuelto) VALUES
  (3, 'Ana López', '2026-11-10', 0),
  (5, 'Carlos Ruiz', '2026-11-02', 1);
UPDATE prestamos SET fecha_devolucion = '2026-11-09' WHERE id = 2;
