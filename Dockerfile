FROM node:current-slim

WORKDIR /usr/src/app
COPY package.json .
RUN npm install

CMD [ "node", "app.js" ]

COPY . .
