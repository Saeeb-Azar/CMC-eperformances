FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD sh -c "echo \"window.__ENV__={VITE_API_URL:\\\"${VITE_API_URL}\\\"}\" > dist/env.js && serve dist --single --listen 3000"
