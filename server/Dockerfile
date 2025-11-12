# syntax=docker/dockerfile:1.6
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p uploads

ENV UPLOADS_DIR=/usr/src/app/uploads

EXPOSE 3000

CMD ["npm", "run", "dev"]
