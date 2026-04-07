"""
ObjectDetector
Uses OpenCV Haar cascades for detecting suspicious objects like phones, books, etc.
This is a simpler approach that doesn't require downloading large model files.
"""

import cv2
import numpy as np
import logging
import os

logger = logging.getLogger(__name__)

# Suspicious object classes that we can detect with Haar cascades
SUSPICIOUS_OBJECTS = {
    "cell phone": "haarcascade_mobile_phone.xml",  # This might not exist in OpenCV
    "book": None,  # Books are hard to detect with Haar cascades
    "laptop": None,  # Laptops are complex objects
}

class ObjectDetector:
    def __init__(self):
        self.cascades = {}
        self._init_cascades()

    def _init_cascades(self):
        """Initialize Haar cascades for object detection."""
        try:
            # For now, we'll use a simple approach - detect rectangular objects
            # that might indicate suspicious items. This is a basic implementation.
            # In a production system, you'd want proper ML models.
            
            # Try to load some basic cascades that might be available
            cascade_files = [
                "haarcascade_frontalface_default.xml",  # Already loaded by face detector
                # Add more cascades if available
            ]
            
            for cascade_file in cascade_files:
                cascade_path = os.path.join(cv2.data.haarcascades, cascade_file)
                if os.path.exists(cascade_path):
                    self.cascades[cascade_file] = cv2.CascadeClassifier(cascade_path)
                    logger.info(f"Loaded Haar cascade: {cascade_file}")
            
            logger.info("Object detector initialized with basic Haar cascades")
            
        except Exception as e:
            logger.error(f"Failed to initialize object detector: {e}")

    def detect(self, image: np.ndarray, confidence_threshold: float = 0.5) -> list[str]:
        """
        Detect suspicious objects in the image.
        For now, this is a basic implementation that looks for:
        - Multiple rectangular objects that might indicate books/screens
        - Very basic heuristics
        """
        if not self.cascades:
            return []

        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            height, width = image.shape[:2]
            
            suspicious_objects = []
            
            # Basic heuristics for suspicious objects:
            
            # 1. Look for rectangular shapes that might be screens/books
            # Convert to binary and find contours
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            thresh = cv2.threshold(blurred, 60, 255, cv2.THRESH_BINARY)[1]
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Look for rectangular contours that might be books or screens
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < 5000:  # Too small
                    continue
                    
                # Get bounding rectangle
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / float(h)
                
                # Look for rectangular objects with reasonable aspect ratios
                if 0.3 < aspect_ratio < 3.0 and w > 50 and h > 50:
                    # Check if it might be a book (horizontal rectangle) or screen (various ratios)
                    if aspect_ratio > 1.5:  # Wider than tall - might be a book
                        if not suspicious_objects.count("book"):  # Avoid duplicates
                            suspicious_objects.append("book")
                    elif 0.8 < aspect_ratio < 1.2:  # Square-ish - might be a screen
                        # Additional check: look for high contrast areas (might indicate screens)
                        roi = gray[y:y+h, x:x+w]
                        if roi.size > 0:
                            contrast = np.std(roi)
                            if contrast > 30:  # High contrast might indicate a screen
                                if not suspicious_objects.count("laptop"):
                                    suspicious_objects.append("laptop")
            
            # 2. Simple color-based detection for phones (look for black rectangles)
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            mask = cv2.inRange(hsv, (0, 0, 0), (180, 255, 50))  # Dark colors
            dark_contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in dark_contours:
                area = cv2.contourArea(contour)
                if 2000 < area < 15000:  # Reasonable phone size
                    x, y, w, h = cv2.boundingRect(contour)
                    aspect_ratio = w / float(h)
                    if 0.4 < aspect_ratio < 2.5:  # Phone-like aspect ratio
                        if not suspicious_objects.count("cell phone"):
                            suspicious_objects.append("cell phone")
            
            # Log detections
            if suspicious_objects:
                logger.debug(f"Detected suspicious objects: {suspicious_objects}")
            
            return suspicious_objects
            
        except Exception as e:
            logger.error(f"Object detection error: {e}")
            return []