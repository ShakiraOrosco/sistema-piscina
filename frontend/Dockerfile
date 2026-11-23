# ==========================================
# Etapa 1: Build de la aplicación React (Vite)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifiestos de paquetes
COPY package.json package-lock.json ./

# Instalar dependencias limpias
RUN npm ci

# Copiar código fuente
COPY . .

# Compilar los estáticos optimizados para producción
RUN npm run build

# ==========================================
# Etapa 2: Servidor Web Nginx de Producción
# ==========================================
FROM nginx:alpine

# Reemplazar la configuración por defecto de Nginx con nuestro reverse proxy y SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar la aplicación compilada desde la etapa de construcción
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
