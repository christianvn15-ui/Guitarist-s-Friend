let wakeLock = null;
let countdownInterval = null;
let autoScrollInterval = null;

// --- Wake Lock + Timer ---
async function requestWakeLock(durationMinutes, countdownEl, progressEl) {
  try {
    // Release existing lock first
    if (wakeLock) {
      wakeLock.release();
    }
    
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
      if (remaining <= 0) {
        releaseWakeLock(countdownEl, progressEl);
      }
    }, 1000);

    wakeLock.addEventListener('release', () => {
      clearInterval(countdownInterval);
      countdownEl.textContent = "Screen lock released.";
      progressEl.style.width = "0%";
      wakeLock = null;
    });
  } catch (err) {
    console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
    countdownEl.textContent = `Error: ${err.message}`;
  }
}

function releaseWakeLock(countdownEl, progressEl) {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  clearInterval(countdownInterval);
  countdownInterval = null;
  if (countdownEl) countdownEl.textContent = "Screen lock released.";
  if (progressEl) progressEl.style.width = "0%";
}

function updateCountdown(seconds, countdownEl) {
  if (!countdownEl) return;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  countdownEl.textContent = `Time remaining: ${minutes}:${secs.toString().padStart(2, '0')}`;
}

function updateProgress(remaining, total, progressEl) {
  if (!progressEl) return;
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
      <strong contenteditable="true" onblur="renameNote(${index}, this.textContent)">${escapeHtml(note.title)}</strong>
      <div>
        <button onclick="showSong(${index})">Open</button>
        <button class="deleteNote" onclick="deleteNote(${index})">Delete</button>
      </div>
    `;
    notesList.appendChild(div);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function saveNote() {
  const titleInput = document.getElementById('noteTitle');
  const notesArea = document.getElementById('notesArea');
  
  if (!titleInput || !notesArea) return;
  
  const title = titleInput.value.trim() || "Untitled";
  const content = notesArea.value;
  
  if (!content.trim()) return;

  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.push({ title, content });
  localStorage.setItem('notes', JSON.stringify(notes));
  
  notesArea.value = '';
  titleInput.value = '';
  loadNotes();
}

function deleteNote(index) {
  if (!confirm("Delete this note?")) return;
  
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.splice(index, 1);
  localStorage.setItem('notes', JSON.stringify(notes));
  loadNotes();
}

function renameNote(index, newTitle) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  if (notes[index]) {
    notes[index].title = newTitle.trim() || "Untitled";
    localStorage.setItem('notes', JSON.stringify(notes));
    loadNotes();
  }
}

function clearAllNotes() {
  if (confirm("Are you sure you want to clear all notes? This cannot be undone.")) {
    localStorage.removeItem('notes');
    loadNotes();
  }
}

// --- Song view ---
function showSong(index) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  const note = notes[index];
  if (!note) return;

  // Stop any running timers
  stopAutoScroll(
    document.getElementById('countdownSong'),
    document.getElementById('progressBarSong')
  );

  document.getElementById('savedPage').classList.add('hidden');
  document.getElementById('songViewPage').classList.remove('hidden');

  const titleEl = document.getElementById('songTitle');
  const lyricsBox = document.getElementById('songLyrics');
  
  if (titleEl) titleEl.textContent = note.title;
  if (lyricsBox) {
    lyricsBox.innerHTML = escapeHtml(note.content).replace(/\n/g, "<br>");
    lyricsBox.scrollTop = 0;
  }
}

function startAutoScroll(durationMinutes, countdownEl, progressEl, lyricsBox) {
  if (!lyricsBox) return;
  
  // Stop any existing scroll
  stopAutoScroll(countdownEl, progressEl);
  
  const lines = lyricsBox.innerText.split("\n").filter(line => line.trim() !== '').length;
  if (lines === 0) return;
  
  const totalSeconds = durationMinutes * 60;
  const scrollHeight = lyricsBox.scrollHeight - lyricsBox.clientHeight;
  
  if (scrollHeight <= 0) return; // No scrolling needed

  let startTime = Date.now();
  const endTime = startTime + (totalSeconds * 1000);
  
  updateCountdown(totalSeconds, countdownEl);
  updateProgress(totalSeconds, totalSeconds, progressEl);
  
  // Request wake lock for the duration
  requestWakeLock(durationMinutes, countdownEl, progressEl);
  
  autoScrollInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    const remaining = Math.max(0, totalSeconds - elapsed);
    const progress = Math.min(1, elapsed / totalSeconds);
    
    updateCountdown(Math.ceil(remaining), countdownEl);
    updateProgress(remaining, totalSeconds, progressEl);
    
    // Smooth scroll calculation
    lyricsBox.scrollTop = scrollHeight * progress;
    
    if (progress >= 1 || remaining <= 0) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
      releaseWakeLock(countdownEl, progressEl);
    }
  }, 100); // Update every 100ms for smooth scrolling
}

function stopAutoScroll(countdownEl, progressEl) {
  clearInterval(autoScrollInterval);
  autoScrollInterval = null;
  releaseWakeLock(countdownEl, progressEl);
}

// --- Page setup ---
document.addEventListener("DOMContentLoaded", () => {
  // Feature detection for wake lock
  const wakeLockSupported = 'wakeLock' in navigator;
  
  // Main page elements
  const startBtn = document.getElementById('startButton');
  const releaseBtn = document.getElementById('releaseButton');
  const saveNoteBtn = document.getElementById('saveNote');
  
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const minutes = parseInt(document.getElementById('minutes')?.value, 10) || 1;
      requestWakeLock(minutes, document.getElementById('countdown'), document.getElementById('progressBar'));
    });
  }
  
  if (releaseBtn) {
    releaseBtn.addEventListener('click', () => {
      releaseWakeLock(document.getElementById('countdown'), document.getElementById('progressBar'));
    });
  }
  
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', saveNote);
  }

  // Saved page elements
  const startBtnSaved = document.getElementById('startButtonSaved');
  const releaseBtnSaved = document.getElementById('releaseButtonSaved');
  
  if (startBtnSaved) {
    startBtnSaved.addEventListener('click', () => {
      const minutes = parseInt(document.getElementById('minutesSaved')?.value, 10) || 1;
      requestWakeLock(minutes, document.getElementById('countdownSaved'), document.getElementById('progressBarSaved'));
    });
  }
  
  if (releaseBtnSaved) {
    releaseBtnSaved.addEventListener('click', () => {
      releaseWakeLock(document.getElementById('countdownSaved'), document.getElementById('progressBarSaved'));
    });
  }

  // Clear all notes
  const clearAllBtn = document.getElementById('clearAllNotes');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllNotes);
  }

  // Song view elements
  const startBtnSong = document.getElementById('startButtonSong');
  const releaseBtnSong = document.getElementById('releaseButtonSong');
  const backToSaved = document.getElementById('backToSaved');
  
  if (startBtnSong) {
    startBtnSong.addEventListener('click', () => {
      const minutes = parseInt(document.getElementById('minutesSong')?.value, 10) || 1;
      const lyricsBox = document.getElementById('songLyrics');
      if (lyricsBox) {
        startAutoScroll(
          minutes,
          document.getElementById('countdownSong'),
          document.getElementById('progressBarSong'),
          lyricsBox
        );
      }
    });
  }
  
  if (releaseBtnSong) {
    releaseBtnSong.addEventListener('click', () => {
      stopAutoScroll(document.getElementById('countdownSong'), document.getElementById('progressBarSong'));
    });
  }
  
  if (backToSaved) {
    backToSaved.addEventListener('click', () => {
      stopAutoScroll(
        document.getElementById('countdownSong'),
        document.getElementById('progressBarSong')
      );
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

  // Re-acquire wake lock on visibility change (best practice per MDN [^5^])
  document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.log('Failed to re-acquire wake lock:', err);
      }
    }
  });
  
  // Initial load
  loadNotes();
});
