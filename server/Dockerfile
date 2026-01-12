FROM node:20-alpine AS base
WORKDIR /usr/src/app

FROM base AS dev
COPY server/package.json ./package.json
RUN npm install
COPY tsconfig.base.json /usr/src/tsconfig.base.json
COPY server/tsconfig*.json ./
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./prisma.config.ts
RUN npm run prisma:generate

FROM base AS build
COPY server/package.json ./package.json
RUN npm install
COPY tsconfig.base.json /usr/src/tsconfig.base.json
COPY server/tsconfig*.json ./
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./prisma.config.ts
COPY server/src ./src
RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY server/package.json ./package.json
COPY server/prisma.config.ts ./prisma.config.ts
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p uploads \
	&& chown -R node:node /usr/src/app \
	&& chmod +x docker-entrypoint.sh

ENV UPLOADS_DIR=/usr/src/app/uploads

USER node

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "./dist/index.js"]
