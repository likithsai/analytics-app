# ---------- Stage 1: Build ----------
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all source files
COPY . .

# Build Next.js
RUN npm run build

# ---------- Stage 2: Run ----------
FROM node:20-alpine

WORKDIR /app

# Copy build artifacts from the previous stage
COPY --from=build /app/package*.json ./
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

# Install only production dependencies
RUN npm install --production --verbose

# Expose container port
EXPOSE 3000

# Start Next.js
CMD ["npm", "start"]