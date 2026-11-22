"use strict";

const QUESTION_COUNT = 10;
const QUESTION_SECONDS = 15;
const BEST_SCORE_KEY = "quizQuestBestScore";
const API_URL = "https://opentdb.com/api.php";

class Question {
  constructor(text, correctAnswer, incorrectAnswers) {
    this.text = text;
    this.correctAnswer = correctAnswer;
    this.answers = shuffle([correctAnswer, ...incorrectAnswers]);
  }
}

class Quiz {
  constructor(questions) {
    this.questions = questions;
    this.currentIndex = 0;
    this.score = 0;
    this.hasAnswered = false;
  }

  getCurrentQuestion() {
    return this.questions[this.currentIndex];
  }

  checkAnswer(answer) {
    if (this.hasAnswered) {
      return null;
    }

    this.hasAnswered = true;
    const isCorrect = answer === this.getCurrentQuestion().correctAnswer;
    if (isCorrect) {
      this.score += 1;
    }
    return isCorrect;
  }

  nextQuestion() {
    if (!this.hasAnswered || this.isFinished()) {
      return;
    }
    this.currentIndex += 1;
    this.hasAnswered = false;
  }

  isFinished() {
    return this.currentIndex >= this.questions.length;
  }
}

const startScreen = document.querySelector("#start-screen");
const quizScreen = document.querySelector("#quiz-screen");
const resultsScreen = document.querySelector("#results-screen");
const startForm = document.querySelector("#start-form");
const startButton = document.querySelector("#start-button");
const startError = document.querySelector("#start-error");
const categorySelect = document.querySelector("#category");
const difficultySelect = document.querySelector("#difficulty");
const bestScoreDisplay = document.querySelector("#best-score strong");
const loadingState = document.querySelector("#loading-state");
const errorState = document.querySelector("#error-state");
const errorMessage = document.querySelector("#error-message");
const questionState = document.querySelector("#question-state");
const retryButton = document.querySelector("#retry-button");
const backButton = document.querySelector("#back-button");
const progressDisplay = document.querySelector("#progress");
const scoreDisplay = document.querySelector("#score");
const timerDisplay = document.querySelector("#timer");
const timerBar = document.querySelector("#timer-bar");
const questionText = document.querySelector("#question-text");
const answersContainer = document.querySelector("#answers");
const feedback = document.querySelector("#feedback");
const nextButton = document.querySelector("#next-button");
const resultMessage = document.querySelector("#result-message");
const finalScore = document.querySelector("#final-score");
const percentageDisplay = document.querySelector("#percentage");
const storageMessage = document.querySelector("#storage-message");

let quiz = null;
let timerId = null;
let secondsRemaining = QUESTION_SECONDS;
let selectedSettings = null;
let isLoading = false;

function shuffle(items) {
  const shuffledItems = [...items];
  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[randomIndex]] = [shuffledItems[randomIndex], shuffledItems[index]];
  }
  return shuffledItems;
}

function decodeText(value) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    throw new Error("The quiz service returned text that could not be decoded.");
  }
}

function showScreen(screen) {
  startScreen.hidden = screen !== startScreen;
  quizScreen.hidden = screen !== quizScreen;
  resultsScreen.hidden = screen !== resultsScreen;
}

function updateBestScore() {
  try {
    const savedScore = Number(localStorage.getItem(BEST_SCORE_KEY));
    bestScoreDisplay.textContent = Number.isInteger(savedScore) && savedScore >= 0
      ? `${savedScore} / ${QUESTION_COUNT}`
      : "Not set yet";
  } catch (error) {
    bestScoreDisplay.textContent = "Unavailable";
  }
}

function buildRequestUrl(settings) {
  const params = new URLSearchParams({
    amount: String(QUESTION_COUNT),
    encode: "url3986"
  });
  if (settings.category) {
    params.set("category", settings.category);
  }
  if (settings.difficulty) {
    params.set("difficulty", settings.difficulty);
  }
  return `${API_URL}?${params.toString()}`;
}

function getApiErrorMessage(responseCode) {
  const messages = {
    1: "There aren't enough questions for that combination. Try another category or difficulty.",
    2: "The quiz service didn't accept those settings. Please change your selections and try again.",
    3: "The quiz service could not start a session. Please try again.",
    4: "The quiz service ran out of questions for this session. Please try again.",
    5: "The quiz service is receiving requests too quickly. Wait a few seconds, then try again."
  };
  return messages[responseCode] || "The quiz service returned an unexpected response. Please try again.";
}

function setLoading() {
  loadingState.hidden = false;
  errorState.hidden = true;
  questionState.hidden = true;
  startButton.disabled = true;
  isLoading = true;
  showScreen(quizScreen);
}

function showLoadError(message) {
  isLoading = false;
  loadingState.hidden = true;
  questionState.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = message;
  startButton.disabled = false;
}

async function loadQuestions() {
  if (isLoading || !selectedSettings) {
    return;
  }

  setLoading();
  try {
    const response = await fetch(buildRequestUrl(selectedSettings));
    if (!response.ok) {
      throw new Error(`The quiz service is unavailable right now (HTTP ${response.status}). Please try again.`);
    }

    const data = await response.json();
    if (data.response_code !== 0) {
      throw new Error(getApiErrorMessage(data.response_code));
    }
    if (!Array.isArray(data.results) || data.results.length !== QUESTION_COUNT) {
      throw new Error("The quiz service returned an incomplete set of questions. Please try again.");
    }

    const questions = data.results.map((item) => new Question(
      decodeText(item.question),
      decodeText(item.correct_answer),
      item.incorrect_answers.map(decodeText)
    ));
    quiz = new Quiz(questions);
    isLoading = false;
    startButton.disabled = false;
    loadingState.hidden = true;
    errorState.hidden = true;
    questionState.hidden = false;
    renderQuestion();
  } catch (error) {
    showLoadError(error instanceof Error ? error.message : "Something went wrong while loading your quiz.");
  }
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function updateTimerDisplay() {
  timerDisplay.textContent = `${secondsRemaining}s`;
  timerBar.style.width = `${(secondsRemaining / QUESTION_SECONDS) * 100}%`;
  timerBar.classList.toggle("urgent", secondsRemaining <= 5);
}

function startTimer() {
  stopTimer();
  secondsRemaining = QUESTION_SECONDS;
  updateTimerDisplay();
  timerId = window.setInterval(() => {
    secondsRemaining -= 1;
    updateTimerDisplay();
    if (secondsRemaining <= 0) {
      stopTimer();
      handleAnswer(null);
    }
  }, 1000);
}

function renderQuestion() {
  if (!quiz || quiz.isFinished()) {
    showResults();
    return;
  }

  const question = quiz.getCurrentQuestion();
  progressDisplay.textContent = `QUESTION ${quiz.currentIndex + 1} OF ${quiz.questions.length}`;
  scoreDisplay.textContent = String(quiz.score);
  questionText.textContent = question.text;
  answersContainer.replaceChildren();
  feedback.textContent = "";
  feedback.className = "feedback";
  nextButton.disabled = true;
  nextButton.textContent = quiz.currentIndex === quiz.questions.length - 1 ? "See results" : "Next question →";

  question.answers.forEach((answer) => {
    const button = document.createElement("button");
    button.className = "answer-button";
    button.type = "button";
    button.textContent = answer;
    button.addEventListener("click", () => handleAnswer(answer));
    answersContainer.append(button);
  });

  startTimer();
}

function handleAnswer(answer) {
  if (!quiz || quiz.hasAnswered) {
    return;
  }
  stopTimer();

  const wasCorrect = quiz.checkAnswer(answer);
  const correctAnswer = quiz.getCurrentQuestion().correctAnswer;
  const answerButtons = answersContainer.querySelectorAll(".answer-button");
  answerButtons.forEach((button) => {
    button.disabled = true;
    if (button.textContent === correctAnswer) {
      button.classList.add("correct");
    } else if (button.textContent === answer && !wasCorrect) {
      button.classList.add("incorrect");
    }
  });

  if (answer === null) {
    feedback.textContent = `Time's up! The correct answer is ${correctAnswer}.`;
    feedback.classList.add("failure");
  } else if (wasCorrect) {
    feedback.textContent = "That's right!";
    feedback.classList.add("success");
  } else {
    feedback.textContent = `Not quite. The correct answer is ${correctAnswer}.`;
    feedback.classList.add("failure");
  }

  scoreDisplay.textContent = String(quiz.score);
  nextButton.disabled = false;
}

function saveBestScore(score) {
  try {
    const previousBest = Number(localStorage.getItem(BEST_SCORE_KEY));
    const validPreviousBest = Number.isInteger(previousBest) && previousBest >= 0 ? previousBest : 0;
    const newBest = Math.max(validPreviousBest, score);
    localStorage.setItem(BEST_SCORE_KEY, String(newBest));
    updateBestScore();
    return true;
  } catch (error) {
    storageMessage.textContent = "Your score is shown, but this browser couldn't save your best score.";
    storageMessage.hidden = false;
    return false;
  }
}

function showResults() {
  stopTimer();
  const percentage = Math.round((quiz.score / quiz.questions.length) * 100);
  finalScore.textContent = `${quiz.score} / ${quiz.questions.length}`;
  percentageDisplay.textContent = `${percentage}%`;
  if (percentage >= 80) {
    resultMessage.textContent = "Great job! You really know your stuff.";
  } else if (percentage >= 50) {
    resultMessage.textContent = "Nice effort! A few more rounds and you'll be a quiz pro.";
  } else {
    resultMessage.textContent = "Good try! Play again and see if you can beat your score.";
  }
  storageMessage.hidden = true;
  saveBestScore(quiz.score);
  showScreen(resultsScreen);
}

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isLoading) {
    return;
  }
  startError.hidden = true;
  quiz = null;
  selectedSettings = {
    category: categorySelect.value,
    difficulty: difficultySelect.value
  };
  loadQuestions();
});

retryButton.addEventListener("click", () => {
  loadQuestions();
});

backButton.addEventListener("click", () => {
  stopTimer();
  isLoading = false;
  startButton.disabled = false;
  showScreen(startScreen);
});

nextButton.addEventListener("click", () => {
  if (!quiz || !quiz.hasAnswered) {
    return;
  }
  quiz.nextQuestion();
  renderQuestion();
});

document.querySelector("#play-again-button").addEventListener("click", () => {
  stopTimer();
  quiz = null;
  selectedSettings = null;
  updateBestScore();
  showScreen(startScreen);
});

updateBestScore();
