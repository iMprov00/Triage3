# syntax=docker/dockerfile:1
# Сборка из корня репозитория: docker compose build stage2

FROM node:22-alpine AS build
WORKDIR /app

COPY client-stage2/package.json client-stage2/package-lock.json ./
RUN npm ci

COPY client-stage2/ .

ARG VITE_STAGE1_APP_URL=
ENV VITE_STAGE1_APP_URL=$VITE_STAGE1_APP_URL

RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
