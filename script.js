let wakeLock = null;
let countdownInterval = null;
let autoScrollInterval = null;

// --- Wake Lock + Timer ---
async function requestWakeLock(durationMinutes, countdownEl, progressEl) {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    let remaining = durationMinutes * 60;
    const total = remaining;
    updateCountdown(remaining, countdownEl);
    updateProgress(remaining, total, progressEl);

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      remaining--;
      updateCountdown(remaining, countdownEl);
      updateProgress(remaining, total, progressEl);
      if (remaining <= 0) releaseWakeLock(countdownEl, progressEl);
    }, 1000);

    wakeLock.addEventListener('release', () => {
      clearInterval(countdownInterval);
      countdownEl.textContent = "Screen lock released.";
      progressEl.style.width = "0%";
    });
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
}

function releaseWakeLock(countdownEl, progressEl) {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
  clearInterval(countdownInterval);
  countdownEl.textContent = "Screen lock released.";
  progressEl.style.width = "0%";
}

function updateCountdown(seconds, countdownEl) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  countdownEl.textContent = `Time remaining: ${minutes}:${secs.toString().padStart(2, '0')}`;
}

function updateProgress(remaining, total, progressEl) {
  const percent = Math.max(0, (remaining / total) * 100);
  progressEl.style.width = percent + "%";
}

// --- Notes system ---
function loadNotes() {
  const notesList = document.getElementById('notesList');
  if (!notesList) return;
  notesList.innerHTML = '';
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.forEach((note, index) => {
    const div = document.createElement('div');
    div.className = 'noteItem';
    div.innerHTML = `
      <strong contenteditable="true" onblur="renameNote(${index}, this.textContent)">${note.title}</strong>
      <button onclick="showSong(${index})">Open</button>
      <button class="deleteNote" onclick="deleteNote(${index})">Delete</button>
    `;
    notesList.appendChild(div);
  });
}

function saveNote() {
  const title = document.getElementById('noteTitle').value || "Untitled";
  const content = document.getElementById('notesArea').value;
  if (!content.trim()) return;

  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.push({ title, content });
  localStorage.setItem('notes', JSON.stringify(notes));
  document.getElementById('notesArea').value = '';
  document.getElementById('noteTitle').value = '';
  loadNotes();
}

function deleteNote(index) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.splice(index, 1);
  localStorage.setItem('notes', JSON.stringify(notes));
  loadNotes();
}

function renameNote(index, newTitle) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes[index].title = newTitle;
  localStorage.setItem('notes', JSON.stringify(notes));
  loadNotes();
}

function clearAllNotes() {
  if (confirm("Are you sure you want to clear all notes?")) {
    localStorage.removeItem('notes');
    loadNotes();
  }
}

// --- Song view ---
function showSong(index) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  const note = notes[index];
  if (!note) return;

  document.getElementById('savedPage').classList.add('hidden');
  document.getElementById('songViewPage').classList.remove('hidden');

  document.getElementById('songTitle').textContent = note.title;
  const lyricsBox = document.getElementById('songLyrics');
  lyricsBox.innerHTML = note.content.replace(/\n/g, "<br>");
  lyricsBox.scrollTop = 0;
}

function startAutoScroll(durationMinutes, countdownEl, progressEl, lyricsBox) {
  const lines = lyricsBox.innerText.split("\n").length;
  const totalSeconds = durationMinutes * 60;
  const intervalSeconds = totalSeconds / lines;

  let remaining = totalSeconds;
  let currentLine = 0;
  const lineHeight = parseFloat(getComputedStyle(lyricsBox).lineHeight);

  clearInterval(autoScrollInterval);
  autoScrollInterval = setInterval(() => {
    remaining -= intervalSeconds;
    currentLine++;
    updateCountdown(Math.floor(remaining), countdownEl);
    updateProgress(remaining, totalSeconds, progressEl);

    lyricsBox.scrollTop = currentLine * lineHeight;

    if (currentLine >= lines) {
      clearInterval(autoScrollInterval);
      releaseWakeLock(countdownEl, progressEl);
    }
  }, intervalSeconds * 1000);

  requestWakeLock(durationMinutes, countdownEl, progressEl);
}

function stopAutoScroll(countdownEl, progressEl) {
  clearInterval(autoScrollInterval);
  releaseWakeLock(countdownEl, progressEl);
}

// --- Page setup ---
document.addEventListener("DOMContentLoaded", () => {
  // Main page timer
  const startBtn = document.getElementById('startButton');
  const releaseBtn = document.getElementById('releaseButton');
  if (startBtn && releaseBtn) {
    startBtn.addEventListener('click', () => {
      const minutes = parseInt(document.getElementById('minutes').value, 10);
      requestWakeLock(minutes, document.getElementById('countdown'), document.getElementById('progressBar'));
    });
    releaseBtn.addEventListener('click', () => {
      releaseWakeLock(document.getElementById('countdown'), document.getElementById('progressBar'));
    });
    document.getElementById('saveNote').addEventListener('click', saveNote);
  }

  // Saved page timer
  const startBtnSaved = document.getElementById('startButtonSaved');
  const releaseBtnSaved = document.getElementById('releaseButtonSaved');
  if (startBtnSaved && releaseBtnSaved) {
    startBtnSaved.addEventListener('click', () => {
      const minutes = parseInt(document.getElementById('minutesSaved').value, 10);
      requestWakeLock(minutes, document.getElementById('countdownSaved'), document.getElementById('progressBarSaved'));
    });
    releaseBtnSaved.addEventListener('click', () => {
      releaseWakeLock(document.getElementById('countdownSaved'), document.getElementById('progressBarSaved'));
    });
    loadNotes();
    document.getElementById('clearAllNotes').addEventListener('click', clearAllNotes);
  }

  // Song view timer
  const startBtnSong = document.getElementById('startButtonSong');
  const releaseBtnSong = document.getElementById('releaseButtonSong');
  const backToSaved = document.getElementById('backToSaved');
  if (startBtnSong && releaseBtnSong) {
    startBtnSong.addEventListener('click', () => {
      const minutes = parseInt(document.getElementById('minutesSong').value, 10);
      startAutoScroll(
        minutes,
        document.getElementById('countdownSong'),
        document.getElementById('progressBarSong'),
        document.getElementById('songLyrics')
      );
    });
    releaseBtnSong.addEventListener('click', () => {
      stopAutoScroll(document.getElementById('countdownSong'), document.getElementById('progressBarSong'));
    });
  }
  if (backToSaved) {
    backToSaved.addEventListener('click', () => {
      document.getElementById('songViewPage').classList.add('hidden');
      document.getElementById('savedPage').classList.remove('hidden');
    });
  }

  // Navigation
  const navNotes = document.getElementById('navNotes');
  const backBtn = document.getElementById('backButton');
  if (navNotes) {
    navNotes.addEventListener('click', () => {
      document.getElementById('mainPage').classList.add('hidden');
      document.getElementById('savedPage').classList.remove('hidden');
      loadNotes();
    });
  }
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('savedPage').classList.add('hidden');
      document.getElementById('mainPage').classList.remove('hidden');
    });
  }
});