FROM node:20-alpine

WORKDIR /workspace/services/foundation-erp

COPY tsconfig.base.json /workspace/tsconfig.base.json
COPY services/foundation-erp/package*.json ./
ENV npm_config_fetch_retries=5 \
	npm_config_fetch_retry_factor=2 \
	npm_config_fetch_retry_mintimeout=20000 \
	npm_config_fetch_retry_maxtimeout=120000 \
	npm_config_foreground_scripts=true
RUN npm ci --foreground-scripts || npm ci --foreground-scripts

COPY services/foundation-erp ./
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
