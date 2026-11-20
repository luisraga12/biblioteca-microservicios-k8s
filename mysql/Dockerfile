# Imagen de la base de datos con los datos semilla.
# MySQL ejecuta automaticamente todo .sql de /docker-entrypoint-initdb.d/
# la primera vez que se crea el volumen de datos (volumen vacio).
# Construir desde la raiz del kit: docker build -t luisraga12/biblioteca-mysql:1.0 mysql/
FROM mysql:8.0
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
EXPOSE 3306
