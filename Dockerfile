FROM node:alpine

WORKDIR /usr/src/app
COPY package.json .
RUN npm install

CMD [ "node", "app.js" ]

COPY . .
