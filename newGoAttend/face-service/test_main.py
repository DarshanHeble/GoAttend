"""
Unit tests for GoAttend Face Service API.
Uses mocked DeepFace calls so tests run fast without GPU/model downloads.

Run:  pytest test_main.py -v
"""

import io
import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import numpy as np
import cv2
import pytest
from fastapi.testclient import TestClient


# ── helpers ─────────────────────────────────────────────────────────────────

def _create_test_face_image() -> bytes:
    """Generate a simple 200x200 BGR image with a circle (fake face) as JPEG bytes."""
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    img[:] = (200, 180, 160)  # skin-ish background
    cv2.circle(img, (100, 100), 60, (150, 130, 110), -1)  # "face"
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


@pytest.fixture(autouse=True)
def _isolated_faces_dir(tmp_path, monkeypatch):
    """Each test gets its own empty faces directory so tests don't interfere."""
    faces = tmp_path / "faces"
    faces.mkdir()
    monkeypatch.setenv("FACES_DIR", str(faces))

    # Re-import so the module picks up the new FACES_DIR
    import main as m
    m.FACES_DIR = faces
    m.FACES_DIR.mkdir(parents=True, exist_ok=True)
    yield faces


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


FAKE_FACE_RESULT = [
    {
        "face": np.zeros((100, 100, 3)),
        "facial_area": {"x": 10, "y": 10, "w": 80, "h": 80, "left_eye": (50, 40), "right_eye": (70, 40)},
        "confidence": 0.99,
    }
]


# ── /health ─────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "registered_faces" in data
        assert "model" in data

    def test_health_counts_registered_faces(self, client, _isolated_faces_dir):
        # Put two dummy jpgs in the faces dir
        (_isolated_faces_dir / "stu1.jpg").write_bytes(b"fake")
        (_isolated_faces_dir / "stu2.jpg").write_bytes(b"fake")

        resp = client.get("/health")
        assert resp.json()["registered_faces"] == 2


# ── /register ───────────────────────────────────────────────────────────────

class TestRegister:
    @patch("main.DeepFace.extract_faces", return_value=FAKE_FACE_RESULT)
    def test_register_success(self, mock_extract, client, _isolated_faces_dir):
        img_bytes = _create_test_face_image()
        resp = client.post(
            "/register",
            data={"student_id": "stu_001"},
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "registered"
        assert data["student_id"] == "stu_001"
        # file should now exist
        assert (_isolated_faces_dir / "stu_001.jpg").exists()

    @patch("main.DeepFace.extract_faces", return_value=[])
    def test_register_no_face_detected(self, mock_extract, client):
        img_bytes = _create_test_face_image()
        resp = client.post(
            "/register",
            data={"student_id": "stu_002"},
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 400
        assert "No face detected" in resp.json()["detail"]

    @patch("main.DeepFace.extract_faces", side_effect=ValueError("Face could not be detected"))
    def test_register_detection_failure(self, mock_extract, client):
        img_bytes = _create_test_face_image()
        resp = client.post(
            "/register",
            data={"student_id": "stu_003"},
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 400
        assert "Face detection failed" in resp.json()["detail"]

    @patch("main.DeepFace.extract_faces", return_value=FAKE_FACE_RESULT)
    def test_register_overwrites_existing(self, mock_extract, client, _isolated_faces_dir):
        """Registering the same student_id twice should overwrite the old photo."""
        img_bytes = _create_test_face_image()
        for _ in range(2):
            resp = client.post(
                "/register",
                data={"student_id": "stu_dup"},
                files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
            )
            assert resp.status_code == 200
        # Only one file should exist
        assert len(list(_isolated_faces_dir.glob("stu_dup*"))) == 1

    def test_register_missing_student_id(self, client):
        img_bytes = _create_test_face_image()
        resp = client.post(
            "/register",
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 422  # validation error


# ── /recognize ──────────────────────────────────────────────────────────────

class TestRecognize:
    def test_recognize_no_registered_faces(self, client):
        img_bytes = _create_test_face_image()
        resp = client.post(
            "/recognize",
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 404
        assert "No faces registered" in resp.json()["detail"]

    @patch("main.DeepFace.verify", return_value={"distance": 0.15})
    @patch("main.DeepFace.extract_faces", return_value=FAKE_FACE_RESULT)
    def test_recognize_match_found(self, mock_extract, mock_verify, client, _isolated_faces_dir):
        # Pre-register a face file
        img_bytes = _create_test_face_image()
        (_isolated_faces_dir / "stu_match.jpg").write_bytes(img_bytes)

        resp = client.post(
            "/recognize",
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["matched"] is True
        assert data["student_id"] == "stu_match"
        assert data["distance"] == 0.15

    @patch("main.DeepFace.verify", return_value={"distance": 0.95})
    @patch("main.DeepFace.extract_faces", return_value=FAKE_FACE_RESULT)
    def test_recognize_no_match(self, mock_extract, mock_verify, client, _isolated_faces_dir):
        img_bytes = _create_test_face_image()
        (_isolated_faces_dir / "stu_nomatch.jpg").write_bytes(img_bytes)

        resp = client.post(
            "/recognize",
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["matched"] is False

    @patch("main.DeepFace.extract_faces", side_effect=ValueError("No face"))
    def test_recognize_no_face_in_upload(self, mock_extract, client, _isolated_faces_dir):
        img_bytes = _create_test_face_image()
        (_isolated_faces_dir / "stu_x.jpg").write_bytes(img_bytes)

        resp = client.post(
            "/recognize",
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 400
        assert "No face detected" in resp.json()["detail"]

    @patch("main.DeepFace.verify", return_value={"distance": 0.10})
    @patch("main.DeepFace.extract_faces", return_value=FAKE_FACE_RESULT)
    def test_recognize_picks_best_match(self, mock_extract, mock_verify, client, _isolated_faces_dir):
        """When multiple faces are registered, the closest match should be returned."""
        img_bytes = _create_test_face_image()
        (_isolated_faces_dir / "alice.jpg").write_bytes(img_bytes)
        (_isolated_faces_dir / "bob.jpg").write_bytes(img_bytes)

        # Make verify return different distances per call
        mock_verify.side_effect = [
            {"distance": 0.35},  # alice
            {"distance": 0.10},  # bob — closer
        ]

        resp = client.post(
            "/recognize",
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["matched"] is True
        assert data["student_id"] == "bob"
        assert data["distance"] == 0.10

    @patch("main.DeepFace.verify", side_effect=Exception("model error"))
    @patch("main.DeepFace.extract_faces", return_value=FAKE_FACE_RESULT)
    def test_recognize_handles_verify_exception(self, mock_extract, mock_verify, client, _isolated_faces_dir):
        """If DeepFace.verify throws for all faces, return no match (not a 500)."""
        img_bytes = _create_test_face_image()
        (_isolated_faces_dir / "broken.jpg").write_bytes(img_bytes)

        resp = client.post(
            "/recognize",
            files={"photo": ("face.jpg", io.BytesIO(img_bytes), "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["matched"] is False
