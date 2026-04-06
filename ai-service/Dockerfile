# ai-service/Dockerfile
FROM python:3.11-slim-bookworm

# System dependencies for OpenCV + dlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (better layer caching)
COPY requirements.txt .
RUN pip install dlib --no-build-isolation --no-cache-dir
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install face-recognition==1.3.0 --no-cache-dir

# Copy source
COPY . .

# Create data directory for embedding store
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["python", "main.py"]
