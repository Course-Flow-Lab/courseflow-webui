ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginx:stable-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run check && node --test test/*.test.mjs && npm run build

FROM ${NGINX_IMAGE}
ARG WEBUI_REVISION
LABEL org.opencontainers.image.title="Courseflow WebUI" \
      org.opencontainers.image.revision="${WEBUI_REVISION}"
RUN rm /etc/nginx/conf.d/default.conf
COPY deploy/docker-nginx.conf /etc/nginx/nginx.conf
COPY --from=build /build/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
