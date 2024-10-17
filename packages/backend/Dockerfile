# Use an official Node.js image as the base
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of your application code
COPY . .

# Build the NestJS app (if needed)
RUN npm run build

# Use environment variables from Docker Compose (defined as ARG)
ARG NESTJS_PORT
ARG INBOUND_PORT
ARG ADMIN_PORT

# Expose necessary ports for the NestJS app and agents
EXPOSE ${NESTJS_PORT}
EXPOSE ${INBOUND_PORT}
EXPOSE ${ADMIN_PORT}

# Command to start the application
CMD ["npm", "run", "start:prod"]
