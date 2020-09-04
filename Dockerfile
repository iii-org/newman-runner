FROM node:current-slim

ENV repo_id 11
ENV api_host 10.50.1.66 
ENV api_port 10009

WORKDIR /usr/src/app
COPY package.json .
RUN npm install

CMD [ "node", "app.js" ]

COPY . .
