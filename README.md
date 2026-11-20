# Actividad UNIR — Biblioteca en microservicios (Node.js + MySQL + Kubernetes)

Kit de **referencia** para que Luis lo copie y lo adapte y lo haga él mismo.
No es la entrega final: falta el informe PDF (máx. 10 págs., Calibri 11,
interlineado 1,5, sin el código dentro, que va en el ZIP).

## Qué cambia respecto al proyecto Biblioteca anterior

El proyecto anterior (`unir-actividad-k8s/`) usaba **un solo código** para
los dos módulos y se comportaba según `APP_MODE=usuario|admin`. Eso es lo
que Luis ya no quiere: la misma aplicación dos veces.

Aquí cada servicio es **independiente de verdad**:

| Servicio | Código | Dockerfile | Imagen | Rutas |
|---|---|---|---|---|
| **usuario** | `usuario/app.js` (solo consulta) | `usuario/Dockerfile` | `luisraga12/biblioteca-usuario:1.0` | `/`, `/books`, `/authors`, `/api/libros`, `/api/autores` |
| **admin** | `admin/app.js` (gestión) | `admin/Dockerfile` | `luisraga12/biblioteca-admin:1.0` | `/`, `/books`, `/authors`, `/loans`, `/api/libros`, `/api/autores`, `/api/prestamos` |
| **mysql** | `mysql/init.sql` | `mysql/Dockerfile` | `luisraga12/biblioteca-mysql:1.0` | interna, `mysql-svc:3306` |

- **usuario** no tiene ninguna ruta de escritura: un POST a `/api/*`
  devuelve 403. Solo lista libros y autores.
- **admin** gestiona libros (alta, baja, cambio de disponibilidad),
  autores (alta, baja) y préstamos (prestar y devolver; al prestar, el
  libro queda no disponible, y al devolverlo vuelve a estar disponible).
- Los dos comparten la **misma MySQL** (`biblioteca`), con 3 tablas:
  `libros` (los 5 libros semilla del proyecto anterior), `autores`
  (4 autores) y `prestamos` (2 préstamos semilla).
- No hay `APP_MODE` en ningún YAML: cada servicio ya es lo que es por su
  propio código. Si borras el Deployment admin, el usuario sigue
  funcionando, y al revés.
- Esto **no es Laravel** y por tanto **no hay APP_KEY**: eso solo aplica a
  Laravel. Aquí las apps son Node.js y solo necesitan las variables de
  MySQL del Secret.

## Arquitectura

- **Namespace:** `pruebas` (todos los recursos van ahí).
- **Pods en total:** 5 (2 usuario + 2 admin + 1 MySQL). 3 componentes lógicos.
- **Services (4):** `mysql-headless` (ClusterIP None, para el StatefulSet),
  `mysql-svc` (ClusterIP, 3306), `usuario-svc` (NodePort 30080),
  `admin-svc` (NodePort 30081).
- **Secret:** `db-secret` (base64) con `MYSQL_DATABASE`, `MYSQL_USER`,
  `MYSQL_PASSWORD` y `MYSQL_ROOT_PASSWORD`. Credenciales **de ejemplo,
  solo para esta actividad**.
- **Almacenamiento, solo para esta actividad:** hostPath **directo**
  `/data/pruebas/mysql`, **SIN PV y SIN PVC**, usado **únicamente** por
  MySQL (`/var/lib/mysql`). Las apps son stateless: sin volumen
  persistente, solo `emptyDir` en `/tmp`. En minikube el hostPath vive
  dentro de la VM de minikube; en k3s, en el disco de la EC2. No apto
  para multinodo ni para producción. La BD debe quedarse en 1 réplica.

## Estructura

```
README.md
usuario/          app.js, package.json, Dockerfile (servicio usuario)
admin/            app.js, package.json, Dockerfile (servicio admin)
mysql/            Dockerfile, init.sql (5 libros, 4 autores, 2 prestamos)
k8s/
  00-namespace.yaml
  01-secret.yaml
  02-statefulset-mysql.yaml   (hostPath directo, sin PV/PVC)
  03-deployment-usuario.yaml  (replicas: 2)
  04-deployment-admin.yaml    (replicas: 2)
  05-services.yaml            (los 4 Services)
```

## 1. Construir y publicar las imágenes en Docker Hub

Cambia `luisraga12` por tu usuario de Docker Hub si es otro (también en
los YAML 02, 03 y 04, en el campo `image:`).

```bash
docker login

# El contexto de cada build es la carpeta del servicio (ahi estan su
# app.js, su package.json y su Dockerfile).
docker build -t luisraga12/biblioteca-usuario:1.0 usuario/
docker build -t luisraga12/biblioteca-admin:1.0 admin/
docker build -t luisraga12/biblioteca-mysql:1.0 mysql/

docker push luisraga12/biblioteca-usuario:1.0
docker push luisraga12/biblioteca-admin:1.0
docker push luisraga12/biblioteca-mysql:1.0
```

## 2. Desplegar en minikube (PC, Windows)

```bash
minikube start --driver=docker --cpus=2 --memory=4096

# Crear el directorio hostPath DENTRO de la VM de minikube:
minikube ssh "sudo mkdir -p /data/pruebas/mysql"

# Aplicar en orden:
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secret.yaml
kubectl apply -f k8s/02-statefulset-mysql.yaml
kubectl apply -f k8s/05-services.yaml

# Esperar a que MySQL este listo (init.sql solo corre la primera vez,
# con el volumen vacio):
kubectl -n pruebas wait --for=condition=ready pod -l modulo=mysql --timeout=300s

kubectl apply -f k8s/03-deployment-usuario.yaml
kubectl apply -f k8s/04-deployment-admin.yaml

kubectl -n pruebas wait --for=condition=ready pod -l app=biblioteca --timeout=300s
kubectl -n pruebas get pods,svc
```

Obtener la IP y las URLs:

```bash
minikube ip
# Usuario: http://<IP>:30080        (/books, /authors)
# Admin:   http://<IP>:30081        (/books, /authors, /loans)
```

## 3. Desplegar en k3s (EC2 de AWS)

Antes, en la consola de AWS, abre en el **Security Group** de la EC2 los
puertos **30080 y 30081 (TCP)**. Sin eso, NodePort no es accesible desde
internet. También el 6443 si usas `kubectl` desde fuera de la EC2.

```bash
# En la EC2:
sudo mkdir -p /data/pruebas/mysql
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secret.yaml
kubectl apply -f k8s/02-statefulset-mysql.yaml
kubectl apply -f k8s/05-services.yaml
# esperar a MySQL, igual que en minikube
kubectl apply -f k8s/03-deployment-usuario.yaml
kubectl apply -f k8s/04-deployment-admin.yaml
```

IP pública de la EC2:

```bash
curl -s http://169.254.169.254/latest/meta-data/public-ipv4
# Usuario: http://<IP_PUBLICA>:30080
# Admin:   http://<IP_PUBLICA>:30081
```

## 4. Verificar

```bash
kubectl -n pruebas get pods,svc
# Esperado: 5 Pods en Running (2 usuario + 2 admin + 1 mysql)

curl http://<IP>:30080/salud
# {"estado":"ok","modulo":"usuario","servicio":"biblioteca-usuario"}
curl http://<IP>:30081/salud
# {"estado":"ok","modulo":"admin","servicio":"biblioteca-admin"}

curl http://<IP>:30080/api/libros    # los 5 libros semilla
curl http://<IP>:30080/api/autores   # los 4 autores
curl http://<IP>:30081/api/prestamos # los 2 prestamos semilla
```

Prueba de que son servicios independientes: en el admin (`:30081`) da de
alta un libro y comprueba que aparece en el usuario (`:30080`); bórralo
y comprueba que desaparece. Y prueba que el usuario es solo consulta:

```bash
curl -X POST http://<IP>:30080/api/libros -H "Content-Type: application/json" -d "{\"titulo\":\"X\",\"autor\":\"Y\",\"anio\":2026}"
# 403: solo consulta. La gestión se hace en el módulo admin.
```

## Notas importantes

- **No probado en esta máquina:** en esta VM no hay docker, kubectl ni
  minikube, así que el despliegue real no se pudo probar aquí. Los YAML
  se validaron por sintaxis y `node --check` pasó en los dos `app.js`.
  Los comandos de arriba son los exactos que hay que correr en el PC /
  en la EC2.
- **Init de MySQL:** `init.sql` solo se ejecuta la primera vez que se
  crea el volumen (volumen vacío). Si cambias los datos semilla, borra
  el directorio `/data/pruebas/mysql` antes de volver a desplegar
  (en minikube: `minikube ssh "sudo rm -rf /data/pruebas/mysql"`).
- **Probes de MySQL:** usan `mysqladmin ping -p$(MYSQL_ROOT_PASSWORD)`.
  Si fallan en tu clúster, el plan B es cambiarlas por un probe
  `tcpSocket` al puerto 3306.
- **Contraseñas:** las del Secret son solo de ejemplo para la actividad.
  Cámbialas con `printf 'nueva' | base64` y actualiza `k8s/01-secret.yaml`.
- **Limpieza:** `kubectl delete namespace pruebas` borra todo. Como no
  hay PV/PVC, el directorio `/data/pruebas/mysql` hay que borrarlo a
  mano si ya no se necesita.
