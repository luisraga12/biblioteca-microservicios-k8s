# Servicio admin - Biblioteca UNIR (gestion)
# Codigo propio, imagen propia: luisraga12/biblioteca-admin:1.0
# No hay paso de build: es Node.js puro, solo se instalan dependencias.
# Construir desde la raiz del kit: docker build -t luisraga12/biblioteca-admin:1.0 admin/
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY app.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "app.js"]
