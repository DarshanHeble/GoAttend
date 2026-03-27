package handler

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"

	"github.com/darshan/goattend/internal/cloudinary"
	"github.com/darshan/goattend/internal/faceclient"
	"github.com/darshan/goattend/internal/model"
	"github.com/darshan/goattend/internal/store"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	store      *store.Store
	cloud      *cloudinary.Client // nil if Cloudinary not configured
	faceClient *faceclient.Client
}

func New(s *store.Store, cloud *cloudinary.Client, faceClient *faceclient.Client) *Handler {
	return &Handler{store: s, cloud: cloud, faceClient: faceClient}
}

// ---------- Health ----------

func (h *Handler) Healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ---------- Register Student ----------

type registerRequest struct {
	Name            string `form:"name" binding:"required"`
	Email           string `form:"email" binding:"required,email"`
	StudentID       string `form:"student_id" binding:"required"`
	Department      string `form:"department"`
	Password        string `form:"password" binding:"required,min=6"`
	ConfirmPassword string `form:"confirm_password" binding:"required"`
}

type asyncTaskResult struct {
	task     string
	photoURL string
	err      error
}

func (h *Handler) uploadPhotoTask(photoBytes []byte, filename string, out chan<- asyncTaskResult, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	result, err := h.cloud.Upload(bytes.NewReader(photoBytes), filename, "goattend/students")
	res := asyncTaskResult{task: "cloud", err: err}
	if err == nil {
		res.photoURL = result.SecureURL
	}

	select {
	case out <- res:
	case <-done:
	}
}

func (h *Handler) registerFaceTask(studentID string, photoBytes []byte, filename string, out chan<- asyncTaskResult, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	_, err := h.faceClient.Register(studentID, bytes.NewReader(photoBytes), filename)
	res := asyncTaskResult{task: "face", err: err}

	select {
	case out <- res:
	case <-done:
	}
}

// RegisterStudent handles registration: saves student info + uploads photo to Cloudinary + registers face.
// Expects multipart form with fields: name, email, student_id, department, photo (file).
// Uses goroutines to upload photo to Cloudinary and register face concurrently.
func (h *Handler) RegisterStudent(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate passwords match
	if req.Password != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "passwords do not match"})
		return
	}

	// Hash password with bcrypt
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	// Read photo file
	file, header, err := c.Request.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "photo file is required"})
		return
	}
	defer file.Close()

	// Read photo bytes into memory (needed for both Cloudinary and face service)
	photoBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read photo"})
		return
	}

	// Save student to DB first (need the generated ID for face registration)
	st := &model.Student{
		Name:         req.Name,
		Email:        req.Email,
		StudentID:    req.StudentID,
		Department:   req.Department,
		PasswordHash: string(hash),
	}
	if err := h.store.CreateStudent(st); err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "student already exists: " + err.Error()})
		return
	}

	// Run Cloudinary upload and face registration concurrently using goroutines
	var wg sync.WaitGroup
	var photoURL string
	var cloudErr, faceErr error
	results := make(chan asyncTaskResult, 2)
	done := make(chan struct{})
	defer close(done)

	tasks := 0

	// Goroutine 1: Upload photo to Cloudinary
	if h.cloud != nil {
		tasks++
		wg.Add(1)
		go h.uploadPhotoTask(photoBytes, header.Filename, results, done, &wg)
	}

	// Goroutine 2: Register face with face service
	if h.faceClient != nil {
		tasks++
		wg.Add(1)
		go h.registerFaceTask(st.ID, photoBytes, header.Filename, results, done, &wg)
	}

	// Close result channel once all goroutines have completed.
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect task results via channel range.
	for res := range results {
		switch res.task {
		case "cloud":
			if res.err != nil {
				log.Printf("cloudinary upload error: %v", res.err)
				cloudErr = res.err
			} else {
				photoURL = res.photoURL
			}
		case "face":
			if res.err != nil {
				log.Printf("face service register error: %v", res.err)
				faceErr = res.err
			}
		}

		tasks--
		if tasks == 0 {
			break
		}
	}

	// Update photo URL in DB if Cloudinary upload succeeded
	if photoURL != "" {
		st.PhotoURL = photoURL
		if err := h.store.UpdateStudentPhoto(st.ID, photoURL); err != nil {
			log.Printf("failed to update photo URL: %v", err)
		}
	}

	// Build response with warnings for any partial failures
	response := gin.H{"student": st}
	if cloudErr != nil {
		response["warning_photo"] = "photo upload failed, can be retried"
	}
	if faceErr != nil {
		response["warning_face"] = "face registration failed, can be retried"
	}

	c.JSON(http.StatusCreated, response)
}

// ---------- Login via Face (= Mark Attendance) ----------

// FaceLogin accepts a photo, sends it to face service for recognition,
// and if matched, marks attendance for that student.
func (h *Handler) FaceLogin(c *gin.Context) {
	file, header, err := c.Request.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "photo file is required"})
		return
	}
	defer file.Close()

	photoBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read photo"})
		return
	}

	// Call face service to recognize
	if h.faceClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "face service not configured"})
		return
	}

	result, err := h.faceClient.Recognize(bytes.NewReader(photoBytes), header.Filename)
	if err != nil {
		log.Printf("face recognize error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "face recognition failed"})
		return
	}

	if !result.Matched {
		c.JSON(http.StatusUnauthorized, gin.H{
			"matched": false,
			"error":   "face not recognized",
		})
		return
	}

	// Get student info
	student, err := h.store.GetStudentByID(result.StudentID)
	if err != nil || student == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "matched student not found in database"})
		return
	}

	// Mark attendance
	rec, err := h.store.MarkAttendance(student.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark attendance"})
		return
	}

	rec.Name = student.Name
	c.JSON(http.StatusOK, gin.H{
		"matched":    true,
		"student":    student,
		"attendance": rec,
	})
}

// ---------- List Endpoints ----------

func (h *Handler) ListStudents(c *gin.Context) {
	students, err := h.store.ListStudents()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if students == nil {
		students = []model.Student{}
	}
	c.JSON(http.StatusOK, students)
}

func (h *Handler) GetStudent(c *gin.Context) {
	id := c.Param("id")
	student, err := h.store.GetStudentByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if student == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "student not found"})
		return
	}
	c.JSON(http.StatusOK, student)
}

func (h *Handler) ListAttendance(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	records, err := h.store.ListAttendance(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if records == nil {
		records = []model.AttendanceRecord{}
	}
	c.JSON(http.StatusOK, records)
}

// ---------- Password Login ----------

// PasswordLogin accepts student_id + password, verifies credentials,
// and marks attendance if valid.
func (h *Handler) PasswordLogin(c *gin.Context) {
	var req struct {
		StudentID string `json:"student_id" binding:"required"`
		Password  string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	student, err := h.store.GetStudentByStudentID(req.StudentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if student == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid student ID or password"})
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(student.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid student ID or password"})
		return
	}

	// Mark attendance
	rec, err := h.store.MarkAttendance(student.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to mark attendance"})
		return
	}

	rec.Name = student.Name
	c.JSON(http.StatusOK, gin.H{
		"matched":    true,
		"student":    student,
		"attendance": rec,
	})
}
