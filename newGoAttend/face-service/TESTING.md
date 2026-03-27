# Face Service

## API Endpoints

### 1. `GET /health`

**Purpose:** Quick health check to verify the service is running.

**Response:**
```json
{
  "status": "ok",
  "registered_faces": 5,
  "model": "VGG-Face"
}
```

- `registered_faces` — count of `.jpg` files in the `faces/` directory.
- `model` — the DeepFace model currently in use (configured via `MODEL_NAME` env var).

---

### 2. `POST /register`

**Purpose:** Register a student's face for future recognition. Saves the photo to disk after validating that a face is detectable in it.

**Request** (multipart form-data):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `student_id` | string | ✅ | Unique ID for the student (e.g. a UUID from your DB) |
| `photo` | file (JPEG) | ✅ | A clear photo containing the student's face |

**Flow:**
1. Saves the uploaded photo to a temp file.
2. Runs `DeepFace.extract_faces()` to confirm a face exists.
3. If no face → returns **400** `"No face detected"`.
4. If detection crashes → returns **400** `"Face detection failed: ..."`.
5. On success → moves the file to `faces/<student_id>.jpg` and returns **200**.

**Success Response:**
```json
{ "status": "registered", "student_id": "stu_001" }
```

**Error Responses:**
- `400` — No face detected or detection failed.
- `422` — Missing required `student_id` field.

---

### 3. `POST /recognize`

**Purpose:** Upload a face photo and find the best matching registered student.

**Request** (multipart form-data):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `photo` | file (JPEG) | ✅ | A photo of the face to recognize |

**Flow:**
1. Checks if any faces are registered. If none → returns **404**.
2. Saves the uploaded photo to a temp file.
3. Runs `DeepFace.extract_faces()` to confirm a face exists in the upload.
4. Loops through every registered face and calls `DeepFace.verify()` to compute the distance.
5. Picks the face with the **smallest distance**.
6. If the best distance ≤ `THRESHOLD` (default `0.40`) → returns a match.
7. Otherwise → returns no match.

**Match Response (200):**
```json
{
  "matched": true,
  "student_id": "stu_001",
  "distance": 0.1523
}
```

**No Match Response (200):**
```json
{
  "matched": false,
  "distance": 0.8721
}
```

**Error Responses:**
- `400` — No face detected in uploaded image.
- `404` — No faces registered yet.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FACES_DIR` | `./faces` | Directory to store registered face images |
| `MODEL_NAME` | `VGG-Face` | DeepFace model (`VGG-Face`, `Facenet`, `ArcFace`, etc.) |
| `DETECTOR` | `opencv` | Face detector backend (`opencv`, `retinaface`, `mtcnn`, etc.) |
| `DISTANCE_METRIC` | `cosine` | Distance metric (`cosine`, `euclidean`, `euclidean_l2`) |
| `THRESHOLD` | `0.40` | Max distance to consider a match |
| `PORT` | `8000` | Server port |

---

# Unit Testing

## Prerequisites

```bash
source venv/bin/activate
pip install pytest httpx
```

## Run Tests

```bash
pytest test_main.py -v
```

## Test Coverage

| # | Test | Endpoint | What it checks |
|---|------|----------|----------------|
| 1 | `test_health_returns_ok` | `GET /health` | Returns status `"ok"` with model info |
| 2 | `test_health_counts_registered_faces` | `GET /health` | Correctly counts `.jpg` files in faces dir |
| 3 | `test_register_success` | `POST /register` | Registers a face and saves the file |
| 4 | `test_register_no_face_detected` | `POST /register` | Returns 400 when no face found |
| 5 | `test_register_detection_failure` | `POST /register` | Returns 400 when DeepFace throws ValueError |
| 6 | `test_register_overwrites_existing` | `POST /register` | Re-registering same student_id overwrites |
| 7 | `test_register_missing_student_id` | `POST /register` | Returns 422 validation error |
| 8 | `test_recognize_no_registered_faces` | `POST /recognize` | Returns 404 when no faces registered |
| 9 | `test_recognize_match_found` | `POST /recognize` | Returns `matched=true` with correct student_id |
| 10 | `test_recognize_no_match` | `POST /recognize` | Returns `matched=false` when distance > threshold |
| 11 | `test_recognize_no_face_in_upload` | `POST /recognize` | Returns 400 when no face in uploaded image |
| 12 | `test_recognize_picks_best_match` | `POST /recognize` | Among multiple faces, picks closest match |
| 13 | `test_recognize_handles_verify_exception` | `POST /recognize` | DeepFace.verify crash returns no match (not 500) |

## Design Decisions

- **DeepFace is mocked** — Tests use `@patch("main.DeepFace.extract_faces")` and `@patch("main.DeepFace.verify")` so they run instantly without downloading models or needing a GPU.
- **Isolated faces directory** — Each test gets a fresh temp directory via the `_isolated_faces_dir` pytest fixture, so tests never interfere with each other or the real `faces/` folder.
- **Synthetic test images** — `_create_test_face_image()` generates a simple JPEG in-memory using OpenCV. No real photos needed.

## Notes

- The first run may be slow (~30s) due to TensorFlow import overhead from `deepface`.
- If tests hang, run with a timeout: `pytest test_main.py -v --timeout=60` (install `pytest-timeout`).
