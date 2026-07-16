# syntax=docker/dockerfile:1
# Сборка из корня репозитория: docker compose build stage1

FROM node:22-alpine AS build
WORKDIR /app

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ .

ARG VITE_STAGE2_APP_URL=
ENV VITE_STAGE2_APP_URL=$VITE_STAGE2_APP_URL

RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
