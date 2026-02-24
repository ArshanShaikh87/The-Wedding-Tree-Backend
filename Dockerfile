# Use official Java 21 image
FROM eclipse-temurin:21-jdk-alpine

WORKDIR /app

# Copy project
COPY . .

# Give execution permission to mvnw
RUN chmod +x mvnw

# Build project
RUN ./mvnw clean package -DskipTests

EXPOSE 9090

CMD ["java", "-jar", "target/backend-0.0.1-SNAPSHOT.jar"]