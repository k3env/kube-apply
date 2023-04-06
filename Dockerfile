FROM node:18.13.0-bullseye-slim AS build
WORKDIR /app
COPY package.json package.json
COPY yarn.lock yarn.lock
RUN yarn install
COPY . .
RUN npm run build && npm run bundle

FROM node:18.13.0-bullseye-slim
COPY plugin.sh /bin/plugin.sh
RUN chmod +x /bin/plugin.sh
WORKDIR /app
COPY package.json /app/package.json
RUN yarn install
COPY --from=build /app/dist/app.cjs /app/app.cjs
ENTRYPOINT [ "/bin/plugin.sh" ]
