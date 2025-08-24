// Exam System JavaScript

let examData = null
let questions = []
let currentQuestionIndex = 0
const answers = {}
let examTimer = null
let startTime = null
let examDurationMinutes = 0
let timeRemaining = 0
let examId = null
let isExamSubmitted = false
const bootstrap = window.bootstrap // Declare bootstrap variable

document.addEventListener("DOMContentLoaded", () => {
  // Get exam ID from URL
  const urlParams = new URLSearchParams(window.location.search)
  examId = urlParams.get("id") || getExamIdFromPath()

  if (!examId) {
    showError("No exam ID provided")
    return
  }

  // Prevent page refresh/navigation during exam
  setupExamSecurity()

  // Load exam data
  loadExamData()
})

// Get exam ID from URL path
function getExamIdFromPath() {
  const path = window.location.pathname
  const matches = path.match(/\/student\/exam\/(\d+)/)
  return matches ? matches[1] : null
}

// Setup exam security measures
function setupExamSecurity() {
  // Prevent right-click
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault()
  })

  // Prevent common keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Prevent F12, Ctrl+Shift+I, Ctrl+U, etc.
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && e.key === "I") ||
      (e.ctrlKey && e.key === "u") ||
      (e.ctrlKey && e.key === "U")
    ) {
      e.preventDefault()
    }
  })

  // Warn before page unload
  window.addEventListener("beforeunload", (e) => {
    if (!isExamSubmitted && examData) {
      e.preventDefault()
      e.returnValue = "Are you sure you want to leave? Your exam progress will be lost."
    }
  })

  // Handle visibility change (tab switching)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && examData && !isExamSubmitted) {
      console.warn("Student switched tabs during exam")
      // Could implement tab switching penalties here
    }
  })
}

// Load exam data
async function loadExamData() {
  try {
    const response = await fetch(`/api/student/exam/${examId}`)
    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error || "Failed to load exam")
    }

    examData = result.exam
    questions = result.questions
    examDurationMinutes = examData.duration_minutes
    timeRemaining = examDurationMinutes * 60 // Convert to seconds

    // Initialize answers object
    questions.forEach((_, index) => {
      answers[index] = null
    })

    // Show instructions screen
    showInstructionsScreen()
  } catch (error) {
    console.error("Error loading exam:", error)
    showError(error.message || "Failed to load exam")
  }
}

// Show instructions screen
function showInstructionsScreen() {
  document.getElementById("loadingScreen").style.display = "none"
  document.getElementById("instructionsScreen").style.display = "block"

  // Populate exam information
  document.getElementById("examTitle").textContent = examData.title
  document.getElementById("instructionsExamTitle").textContent = examData.title
  document.getElementById("examDuration").textContent = examData.duration_minutes
  document.getElementById("totalQuestions").textContent = questions.length
}

// Start exam
function startExam() {
  if (!examData || questions.length === 0) {
    showError("Exam data not loaded properly")
    return
  }

  // Hide instructions and show exam
  document.getElementById("instructionsScreen").style.display = "none"
  document.getElementById("examScreen").style.display = "block"

  // Initialize exam interface
  initializeExamInterface()

  // Start timer
  startTime = new Date()
  startExamTimer()

  // Load first question
  loadQuestion(0)
}

// Initialize exam interface
function initializeExamInterface() {
  // Set total questions
  document.getElementById("totalQuestionsNav").textContent = questions.length
  document.getElementById("totalQuestionsHeader").textContent = questions.length

  // Generate question navigation
  generateQuestionNavigation()

  // Update progress
  updateProgress()
}

// Generate question navigation buttons
function generateQuestionNavigation() {
  const container = document.getElementById("questionNavigation")
  container.innerHTML = ""

  questions.forEach((_, index) => {
    const button = document.createElement("div")
    button.className = "question-nav-btn"
    button.textContent = index + 1
    button.onclick = () => goToQuestion(index)
    button.id = `nav-btn-${index}`
    container.appendChild(button)
  })

  // Mark first question as current
  updateQuestionNavigation()
}

// Start exam timer
function startExamTimer() {
  examTimer = setInterval(() => {
    timeRemaining--
    updateTimerDisplay()

    // Warning at 5 minutes
    if (timeRemaining === 300) {
      // 5 minutes
      showTimeWarning(5)
    }

    // Warning at 1 minute
    if (timeRemaining === 60) {
      // 1 minute
      showTimeWarning(1)
    }

    // Auto-submit when time runs out
    if (timeRemaining <= 0) {
      autoSubmitExam()
    }
  }, 1000)
}

// Update timer display
function updateTimerDisplay() {
  const hours = Math.floor(timeRemaining / 3600)
  const minutes = Math.floor((timeRemaining % 3600) / 60)
  const seconds = timeRemaining % 60

  const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`

  document.getElementById("timeRemaining").textContent = timeString
  document.getElementById("questionTimeRemaining").textContent = timeString

  // Update timer styling based on remaining time
  const timerElement = document.getElementById("examTimer")
  if (timeRemaining <= 300) {
    // 5 minutes
    timerElement.className = "exam-timer danger"
  } else if (timeRemaining <= 600) {
    // 10 minutes
    timerElement.className = "exam-timer warning"
  } else {
    timerElement.className = "exam-timer"
  }
}

// Show time warning
function showTimeWarning(minutes) {
  document.getElementById("warningTimeLeft").textContent = minutes
  const modal = new bootstrap.Modal(document.getElementById("timeWarningModal"))
  modal.show()
}

// Load question
function loadQuestion(index) {
  if (index < 0 || index >= questions.length) return

  currentQuestionIndex = index
  const question = questions[index]

  // Update question content
  document.getElementById("currentQuestionNumber").textContent = index + 1
  document.getElementById("questionText").textContent = question.question_text
  document.getElementById("optionAText").textContent = `A. ${question.option_a}`
  document.getElementById("optionBText").textContent = `B. ${question.option_b}`
  document.getElementById("optionCText").textContent = `C. ${question.option_c}`
  document.getElementById("optionDText").textContent = `D. ${question.option_d}`

  // Clear previous selection
  document.querySelectorAll('input[name="answer"]').forEach((input) => {
    input.checked = false
  })

  document.querySelectorAll(".option-item").forEach((item) => {
    item.classList.remove("selected")
  })

  // Load saved answer if exists
  if (answers[index]) {
    const savedAnswer = answers[index]
    document.getElementById(`option${savedAnswer}`).checked = true
    document.querySelector(`label[for="option${savedAnswer}"]`).closest(".option-item").classList.add("selected")
  }

  // Update navigation buttons
  updateNavigationButtons()
  updateQuestionNavigation()
  updateProgress()
}

// Select option
function selectOption(option) {
  // Clear previous selections
  document.querySelectorAll(".option-item").forEach((item) => {
    item.classList.remove("selected")
  })

  // Select current option
  document.getElementById(`option${option}`).checked = true
  document.querySelector(`label[for="option${option}"]`).closest(".option-item").classList.add("selected")

  // Save answer
  answers[currentQuestionIndex] = option

  // Update navigation and progress
  updateQuestionNavigation()
  updateProgress()
}

// Clear answer
function clearAnswer() {
  // Clear selection
  document.querySelectorAll('input[name="answer"]').forEach((input) => {
    input.checked = false
  })

  document.querySelectorAll(".option-item").forEach((item) => {
    item.classList.remove("selected")
  })

  // Remove saved answer
  answers[currentQuestionIndex] = null

  // Update navigation and progress
  updateQuestionNavigation()
  updateProgress()
}

// Go to specific question
function goToQuestion(index) {
  if (index >= 0 && index < questions.length) {
    loadQuestion(index)
  }
}

// Previous question
function previousQuestion() {
  if (currentQuestionIndex > 0) {
    loadQuestion(currentQuestionIndex - 1)
  }
}

// Next question
function nextQuestion() {
  if (currentQuestionIndex < questions.length - 1) {
    loadQuestion(currentQuestionIndex + 1)
  }
}

// Update navigation buttons
function updateNavigationButtons() {
  const prevButton = document.getElementById("prevButton")
  const nextButton = document.getElementById("nextButton")
  const submitButton = document.getElementById("submitButton")

  // Previous button
  prevButton.disabled = currentQuestionIndex === 0

  // Next/Submit button
  if (currentQuestionIndex === questions.length - 1) {
    nextButton.style.display = "none"
    submitButton.style.display = "inline-block"
  } else {
    nextButton.style.display = "inline-block"
    submitButton.style.display = "none"
  }
}

// Update question navigation
function updateQuestionNavigation() {
  questions.forEach((_, index) => {
    const button = document.getElementById(`nav-btn-${index}`)
    button.className = "question-nav-btn"

    if (index === currentQuestionIndex) {
      button.classList.add("current")
    } else if (answers[index] !== null) {
      button.classList.add("answered")
    }
  })
}

// Update progress
function updateProgress() {
  const answeredCount = Object.values(answers).filter((answer) => answer !== null).length
  const progressPercentage = (answeredCount / questions.length) * 100

  document.getElementById("answeredCount").textContent = answeredCount
  document.getElementById("examProgress").style.width = `${progressPercentage}%`
}

// Show submit confirmation
function showSubmitConfirmation() {
  const answeredCount = Object.values(answers).filter((answer) => answer !== null).length
  const unansweredCount = questions.length - answeredCount

  document.getElementById("submissionAnsweredCount").textContent = answeredCount
  document.getElementById("submissionUnansweredCount").textContent = unansweredCount
  document.getElementById("submissionTimeRemaining").textContent = document.getElementById("timeRemaining").textContent

  const modal = new bootstrap.Modal(document.getElementById("submitConfirmationModal"))
  modal.show()
}

// Submit exam
async function submitExam() {
  if (isExamSubmitted) return

  // Stop timer
  if (examTimer) {
    clearInterval(examTimer)
  }

  // Calculate time taken
  const endTime = new Date()
  const timeTakenMinutes = Math.round((endTime - startTime) / (1000 * 60))

  // Prepare submission data
  const submissionData = {
    examId: examId,
    answers: answers,
    timeTakenMinutes: timeTakenMinutes,
    totalQuestions: questions.length,
  }

  try {
    // Show loading
    showLoadingOverlay("Submitting exam...")

    const response = await fetch("/api/student/submit-exam", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submissionData),
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error || "Submission failed")
    }

    // Mark as submitted
    isExamSubmitted = true

    // Hide loading
    hideLoadingOverlay()

    // Show results
    showResults(result.results)
  } catch (error) {
    console.error("Error submitting exam:", error)
    hideLoadingOverlay()
    showError(error.message || "Failed to submit exam")
  }
}

// Auto-submit exam when time runs out
function autoSubmitExam() {
  // Show auto-submit warning
  showAutoSubmitWarning()

  // Submit after 5 seconds
  setTimeout(() => {
    submitExam()
  }, 5000)
}

// Show auto-submit warning
function showAutoSubmitWarning() {
  const warningDiv = document.createElement("div")
  warningDiv.className = "auto-submit-warning"
  warningDiv.innerHTML = `
    <h4><i class="fas fa-exclamation-triangle me-2"></i>Time's Up!</h4>
    <p>Your exam will be automatically submitted in:</p>
    <div class="countdown" id="autoSubmitCountdown">5</div>
    <p>Please wait...</p>
  `

  document.body.appendChild(warningDiv)

  // Countdown
  let countdown = 5
  const countdownInterval = setInterval(() => {
    countdown--
    document.getElementById("autoSubmitCountdown").textContent = countdown

    if (countdown <= 0) {
      clearInterval(countdownInterval)
    }
  }, 1000)
}

// Show results
function showResults(results) {
  // Hide exam screen
  document.getElementById("examScreen").style.display = "none"

  // Show results screen
  document.getElementById("resultsScreen").style.display = "block"

  // Populate results
  document.getElementById("finalScore").textContent = results.score
  document.getElementById("totalQuestionsResult").textContent = results.totalQuestions
  document.getElementById("correctAnswers").textContent = results.score
  document.getElementById("incorrectAnswers").textContent = results.totalQuestions - results.score

  const percentage = Math.round((results.score / results.totalQuestions) * 100)
  document.getElementById("percentageScore").textContent = `${percentage}%`

  // Set grade text and color
  const gradeText = document.getElementById("gradeText")
  if (percentage >= 80) {
    gradeText.textContent = "Excellent"
    gradeText.className = "lead text-success"
  } else if (percentage >= 70) {
    gradeText.textContent = "Good"
    gradeText.className = "lead text-info"
  } else if (percentage >= 60) {
    gradeText.textContent = "Fair"
    gradeText.className = "lead text-warning"
  } else {
    gradeText.textContent = "Poor"
    gradeText.className = "lead text-danger"
  }

  // Time taken
  const timeTakenHours = Math.floor(results.timeTakenMinutes / 60)
  const timeTakenMins = results.timeTakenMinutes % 60
  document.getElementById("timeTaken").textContent =
    `${timeTakenHours.toString().padStart(2, "0")}:${timeTakenMins.toString().padStart(2, "0")}:00`

  // Other details
  document.getElementById("examTitleResult").textContent = examData.title
  document.getElementById("examDateResult").textContent = new Date().toLocaleDateString()
}

// Show loading overlay
function showLoadingOverlay(message) {
  const overlay = document.getElementById("loadingOverlay")
  if (overlay) {
    document.getElementById("loadingMessage").textContent = message
    overlay.style.display = "flex"
  }
}

// Hide loading overlay
function hideLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay")
  if (overlay) {
    overlay.style.display = "none"
  }
}

// Show error message
function showError(message) {
  const errorDiv = document.createElement("div")
  errorDiv.className = "alert alert-danger alert-dismissible fade show position-fixed"
  errorDiv.style.cssText = "top: 20px; right: 20px; z-index: 9999; max-width: 400px;"
  errorDiv.innerHTML = `
    <strong>Error:</strong> ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `

  document.body.appendChild(errorDiv)

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv)
    }
  }, 5000)
}

// Return to dashboard
function returnToDashboard() {
  window.location.href = "/student/dashboard.html"
}

// Print results
function printResults() {
  window.print()
}
