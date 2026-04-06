// ============================================
// FIREBASE IMPORTS - Modular SDK v9+
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-analytics.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ============================================
// YOUR FIREBASE CONFIG
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyD549PgcblHYyyoZaNyFb0afZOT9MZVSfc",
  authDomain: "guitarist-s-friend.firebaseapp.com",
  projectId: "guitarist-s-friend",
  storageBucket: "guitarist-s-friend.firebasestorage.app",
  messagingSenderId: "441392933718",
  appId: "1:441392933718:web:a035fb1251d0396b2d84f7",
  measurementId: "G-CFWS6JLNWZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

let wakeLock = null;
let countdownInterval = null;
let autoScrollInterval = null;
let currentUser = null;
let unsubscribeFromNotes = null;

// --- Wake Lock + Timer ---
async function requestWakeLock(durationMinutes, countdownEl, progressEl) {
  try {
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

// --- Firebase Auth ---
function initAuth() {
  const authButton = document.getElementById('authButton');
  const authStatus = document.getElementById('authStatus');
  
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      // User is signed in
      authButton.textContent = 'Quit';
      authButton.onclick = handleSignOut;
      if (authStatus) {
        authStatus.textContent = `Signed in as: ${user.displayName || user.email}`;
        authStatus.className = 'auth-status signed-in';
      }
      // Start real-time sync when signed in
      startRealtimeSync();
    } else {
      // User is signed out
      authButton.textContent = 'Sign In';
      authButton.onclick = signInWithGoogle;
      if (authStatus) {
        authStatus.textContent = 'Not signed in - using local storage only';
        authStatus.className = 'auth-status signed-out';
      }
      // Stop real-time sync
      stopRealtimeSync();
      loadNotes();
    }
  });
}

function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch((error) => {
    console.error('Sign in error:', error);
    alert('Sign in failed: ' + error.message);
  });
}

function handleSignOut() {
  signOut(auth).catch((error) => {
    console.error('Sign out error:', error);
  });
}

// --- Real-time Sync with Firestore ---
function startRealtimeSync() {
  if (!currentUser) return;
  
  console.log('[Sync] Starting real-time sync for user:', currentUser.uid);
  
  // Stop any existing listener
  stopRealtimeSync();
  
  // Set up real-time listener
  const userDocRef = doc(db, 'users', currentUser.uid);
  unsubscribeFromNotes = onSnapshot(userDocRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      console.log('[Sync] Received data from cloud:', data);
      
      if (data.notes) {
        const cloudNotes = data.notes;
        const localNotes = getNotes();
        
        // Check if cloud has different data
        const cloudNotesJson = JSON.stringify(cloudNotes);
        const localNotesJson = JSON.stringify(localNotes);
        
        if (cloudNotesJson !== localNotesJson) {
          console.log('[Sync] Cloud data differs from local, updating...');
          saveNotes(cloudNotes);
          loadNotes();
          updateSyncStatus('Synced from cloud');
        } else {
          console.log('[Sync] Data is already in sync');
        }
      }
    } else {
      console.log('[Sync] No cloud data yet, uploading local data');
      syncToCloud();
    }
  }, (error) => {
    console.error('[Sync] Real-time sync error:', error);
    updateSyncStatus('Sync error: ' + error.message);
  });
}

function stopRealtimeSync() {
  if (unsubscribeFromNotes) {
    unsubscribeFromNotes();
    unsubscribeFromNotes = null;
    console.log('[Sync] Stopped real-time sync');
  }
}

function updateSyncStatus(message) {
  const syncButton = document.getElementById('syncButton');
  if (syncButton) {
    syncButton.innerHTML = `<i class="fas fa-check"></i> ${message}`;
    setTimeout(() => {
      syncButton.innerHTML = '<i class="fas fa-sync"></i> Sync to Cloud';
    }, 3000);
  }
}

// --- Notes system ---
function getNotes() {
  const notes = localStorage.getItem('notes');
  return notes ? JSON.parse(notes) : [];
}

function saveNotes(notes) {
  localStorage.setItem('notes', JSON.stringify(notes));
}

function loadNotes() {
  const notesList = document.getElementById('notesList');
  if (!notesList) return;

  notesList.innerHTML = '';
  const notes = getNotes();

  notes.forEach((note, index) => {
    const div = document.createElement('div');
    div.className = 'noteItem';
    div.innerHTML = `
      <strong contenteditable="true" onblur="window.renameNote(${index}, this.textContent)">${escapeHtml(note.title)}</strong>
      <div>
        <button onclick="window.showSong(${index})">Open</button>
        <button class="deleteNote" onclick="window.deleteNote(${index})">Delete</button>
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

  const notes = getNotes();
  const newNote = { 
    title, 
    content, 
    createdAt: new Date().toISOString(),
    id: Date.now().toString() // Add unique ID
  };
  notes.push(newNote);
  saveNotes(notes);

  notesArea.value = '';
  titleInput.value = '';
  loadNotes();
  
  // Sync to cloud if signed in
  if (currentUser) {
    console.log('[Save] New note saved, syncing to cloud...');
    syncToCloud();
  }
}

function deleteNote(index) {
  if (!confirm("Delete this note?")) return;

  const notes = getNotes();
  notes.splice(index, 1);
  saveNotes(notes);
  loadNotes();
  
  if (currentUser) {
    console.log('[Delete] Note deleted, syncing to cloud...');
    syncToCloud();
  }
}

function renameNote(index, newTitle) {
  const notes = getNotes();
  if (notes[index]) {
    notes[index].title = newTitle.trim() || "Untitled";
    notes[index].updatedAt = new Date().toISOString();
    saveNotes(notes);
    loadNotes();
    
    if (currentUser) {
      console.log('[Rename] Note renamed, syncing to cloud...');
      syncToCloud();
    }
  }
}

function clearAllNotes() {
  if (confirm("Are you sure you want to clear all notes? This cannot be undone.")) {
    localStorage.removeItem('notes');
    loadNotes();
    
    if (currentUser) {
      console.log('[Clear] All notes cleared, syncing to cloud...');
      syncToCloud();
    }
  }
}

// --- Cloud Sync Functions ---
async function syncToCloud() {
  if (!currentUser) {
    alert('Please sign in first to sync to cloud');
    return;
  }

  const syncButton = document.getElementById('syncButton');
  if (syncButton) {
    syncButton.disabled = true;
    syncButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
  }

  try {
    const notes = getNotes();
    console.log('[Sync] Uploading to cloud:', notes);
    
    await setDoc(doc(db, 'users', currentUser.uid), {
      notes: notes,
      lastSynced: serverTimestamp(),
      userId: currentUser.uid
    }, { merge: true });
    
    console.log('[Sync] Upload successful');
    updateSyncStatus('Synced!');
    
  } catch (error) {
    console.error('[Sync] Upload error:', error);
    if (syncButton) {
      syncButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Sync Failed';
      setTimeout(() => {
        syncButton.innerHTML = '<i class="fas fa-sync"></i> Sync to Cloud';
        syncButton.disabled = false;
      }, 3000);
    }
    alert('Sync failed: ' + error.message);
  }
}

async function loadNotesFromCloud() {
  // This is now handled by real-time sync
  console.log('[Sync] Using real-time sync instead');
}

// --- Song view ---
function showSong(index) {
  const notes = getNotes();
  const note = notes[index];
  if (!note) return;

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

  stopAutoScroll(countdownEl, progressEl);

  const lines = lyricsBox.innerText.split("\n").filter(line => line.trim() !== '').length;
  if (lines === 0) return;

  const totalSeconds = durationMinutes * 60;
  const scrollHeight = lyricsBox.scrollHeight - lyricsBox.clientHeight;

  if (scrollHeight <= 0) return;

  let startTime = Date.now();
  const endTime = startTime + (totalSeconds * 1000);

  updateCountdown(totalSeconds, countdownEl);
  updateProgress(totalSeconds, totalSeconds, progressEl);

  requestWakeLock(durationMinutes, countdownEl, progressEl);

  autoScrollInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - startTime) / 1000;
    const remaining = Math.max(0, totalSeconds - elapsed);
    const progress = Math.min(1, elapsed / totalSeconds);

    updateCountdown(Math.ceil(remaining), countdownEl);
    updateProgress(remaining, totalSeconds, progressEl);

    lyricsBox.scrollTop = scrollHeight * progress;

    if (progress >= 1 || remaining <= 0) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
      releaseWakeLock(countdownEl, progressEl);
    }
  }, 100);
}

function stopAutoScroll(countdownEl, progressEl) {
  clearInterval(autoScrollInterval);
  autoScrollInterval = null;
  releaseWakeLock(countdownEl, progressEl);
}

// --- Page setup ---
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Firebase Auth
  initAuth();

  // Main page elements
  const saveNoteBtn = document.getElementById('saveNote');

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

  // Sync button
  const syncButton = document.getElementById('syncButton');
  if (syncButton) {
    syncButton.addEventListener('click', syncToCloud);
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

  // Re-acquire wake lock on visibility change
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

// Expose functions to window for inline event handlers
window.showSong = showSong;
window.deleteNote = deleteNote;
window.renameNote = renameNote;
