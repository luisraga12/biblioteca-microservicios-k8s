# Servicio usuario - Biblioteca UNIR (solo consulta)
# Codigo propio, imagen propia: luisraga12/biblioteca-usuario:1.0
# No hay paso de build: es Node.js puro, solo se instalan dependencias.
# Construir desde la raiz del kit: docker build -t luisraga12/biblioteca-usuario:1.0 usuario/
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY app.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "app.js"]
