# Use official Java 21 image
FROM eclipse-temurin:21-jdk-alpine

# App directory
WORKDIR /app

# Copy all files
COPY . .

# Build project
RUN ./mvnw clean package -DskipTests

# Render dynamic port support
EXPOSE 8080

# Run jar
CMD ["java", "-jar", "target/backend-0.0.1-SNAPSHOT.jar"]