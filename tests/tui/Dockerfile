# TUI visual testing environment for vizzly-cli
FROM node:22-slim

# Install x11 driver dependencies (same as tui-driver action)
RUN apt-get update && apt-get install -y \
    xvfb \
    xterm \
    xdotool \
    x11-apps \
    x11-utils \
    imagemagick \
    fonts-dejavu-core \
    locales \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen

ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

WORKDIR /app

# Copy package files first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY clients/ember/package.json ./clients/ember/package.json
COPY clients/ember/test-app/package.json ./clients/ember/test-app/package.json
COPY clients/static-site/package.json ./clients/static-site/package.json
COPY clients/storybook/package.json ./clients/storybook/package.json
COPY clients/storybook/example-storybook/package.json ./clients/storybook/example-storybook/package.json
COPY clients/vitest/package.json ./clients/vitest/package.json
COPY examples/custom-plugin/package.json ./examples/custom-plugin/package.json
COPY test-site/package.json ./test-site/package.json

# Install dependencies (cached unless package.json/pnpm-lock.yaml changes)
# Note: tui-driver will be mounted at runtime for local dev
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate && pnpm install --frozen-lockfile

# Copy build config files
COPY babel.config.json ./
COPY biome.json ./

# Copy source for build (changes here invalidate build cache)
COPY src/ ./src/
COPY bin/ ./bin/

# Build (cached if src/ hasn't changed)
RUN pnpm run build

# Tests and tui-driver are mounted at runtime - no COPY needed
# See run-tui-tests.sh for volume mounts

# Run TUI tests by default
CMD ["pnpm", "run", "test:tui"]
