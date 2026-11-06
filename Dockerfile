# syntax=docker/dockerfile:1
FROM amazon/aws-cli:2.39.5 AS aws
FROM docker:29.0.0-cli AS docker
FROM node:22-bookworm-slim
COPY --from=aws /usr/local/aws-cli /usr/local/aws-cli
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
RUN ln -s /usr/local/aws-cli/v2/current/bin/aws /usr/local/bin/aws
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
ENV NODE_ENV=production NODE_USE_ENV_PROXY=1 HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8787/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/web/server.js"]
