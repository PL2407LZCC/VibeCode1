# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS base
WORKDIR /usr/src/app

FROM base AS dev
COPY client/package.json ./package.json
RUN npm install
COPY tsconfig.base.json /usr/src/tsconfig.base.json
COPY client/tsconfig.json ./
COPY client/vite.config.ts ./
COPY client/index.html ./
COPY client/public ./public
COPY client/src ./src

FROM dev AS build
COPY client/.env.production ./
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/src/app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
