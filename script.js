//Firebase logic
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

//Firebase config
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
let unsubscribeFromLyrics = null;

// Wakelock & timer
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

// Firebase Authentication
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
      loadLyrics();
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

// Real-time Sync with Firestore
function startRealtimeSync() {
  if (!currentUser) return;

  console.log('[Sync] Starting real-time sync for user:', currentUser.uid);

  // Stop any existing listener
  stopRealtimeSync();

  // Set up real-time listener
  const userDocRef = doc(db, 'users', currentUser.uid);
  unsubscribeFromLyrics = onSnapshot(userDocRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      console.log('[Sync] Received data from cloud:', data);

      if (data.lyrics) {
        const cloudLyrics = data.lyrics;
        const localLyrics = getLyrics();

        // Check if cloud has different data
        const cloudLyricsJson = JSON.stringify(cloudLyrics);
        const localLyricsJson = JSON.stringify(localLyrics);

        if (cloudLyricsJson !== localLyricsJson) {
          console.log('[Sync] Cloud data differs from local, updating...');
          saveLyrics(cloudLyrics);
          loadLyrics();
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
  if (unsubscribeFromLyrics) {
    unsubscribeFromLyrics();
    unsubscribeFromLyrics = null;
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

// --- Lyrics system ---
function getLyrics() {
  const lyrics = localStorage.getItem('lyrics');
  return lyrics ? JSON.parse(lyrics) : [];
}

function saveLyrics(lyrics) {
  localStorage.setItem('lyrics', JSON.stringify(lyrics));
}

function loadLyrics() {
  const lyricsList = document.getElementById('lyricsList');
  if (!lyricsList) return;

  lyricsList.innerHTML = '';
  const lyrics = getLyrics();

  lyrics.forEach((lyric, index) => {
    const div = document.createElement('div');
    div.className = 'lyricItem';
    div.innerHTML = `
      <strong contenteditable="true" onblur="window.renameLyric(${index}, this.textContent)">${escapeHtml(lyric.title)}</strong>
      <div>
        <button onclick="window.showSong(${index})">Open</button>
        <button class="deleteLyric" onclick="window.deleteLyric(${index})"><i class="fas fa-trash"></i></button>
      </div>
    `;
    lyricsList.appendChild(div);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function saveLyric() {
  const titleInput = document.getElementById('lyricTitle');
  const lyricsArea = document.getElementById('lyricsArea');

  if (!titleInput || !lyricsArea) return;

  const title = titleInput.value.trim() || "Untitled";
  const content = lyricsArea.value;

  if (!content.trim()) return;

  const lyrics = getLyrics();
  const newLyric = { 
    title, 
    content, 
    createdAt: new Date().toISOString(),
    id: Date.now().toString() // Add unique ID
  };
  lyrics.push(newLyric);
  saveLyrics(lyrics);

  lyricsArea.value = '';
  titleInput.value = '';
  loadLyrics();

  // Sync to cloud if signed in
  if (currentUser) {
    console.log('[Save] New lyric saved, syncing to cloud...');
    syncToCloud();
  }
}

function deleteLyric(index) {
  if (!confirm("Delete this lyric?")) return;

  const lyrics = getLyrics();
  lyrics.splice(index, 1);
  saveLyrics(lyrics);
  loadLyrics();

  if (currentUser) {
    console.log('[Delete] Lyric deleted, syncing to cloud...');
    syncToCloud();
  }
}

function renameLyric(index, newTitle) {
  const lyrics = getLyrics();
  if (lyrics[index]) {
    lyrics[index].title = newTitle.trim() || "Untitled";
    lyrics[index].updatedAt = new Date().toISOString();
    saveLyrics(lyrics);
    loadLyrics();

    if (currentUser) {
      console.log('[Rename] Lyric renamed, syncing to cloud...');
      syncToCloud();
    }
  }
}

function clearAllLyrics() {
  if (confirm("Are you sure you want to clear all lyrics? This cannot be undone.")) {
    localStorage.removeItem('lyrics');
    loadLyrics();

    if (currentUser) {
      console.log('[Clear] All lyrics cleared, syncing to cloud...');
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
    const lyrics = getLyrics();
    console.log('[Sync] Uploading to cloud:', lyrics);

    await setDoc(doc(db, 'users', currentUser.uid), {
      lyrics: lyrics,
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

async function loadLyricsFromCloud() {
  // This is now handled by real-time sync
  console.log('[Sync] Using real-time sync instead');
}

// --- Song view ---
function showSong(index) {
  const lyrics = getLyrics();
  const lyric = lyrics[index];
  if (!lyric) return;

  stopAutoScroll(
    document.getElementById('countdownSong'),
    document.getElementById('progressBarSong')
  );

  document.getElementById('savedPage').classList.add('hidden');
  document.getElementById('songViewPage').classList.remove('hidden');

  const titleEl = document.getElementById('songTitle');
  const lyricsBox = document.getElementById('songLyrics');

  if (titleEl) titleEl.textContent = lyric.title;
  if (lyricsBox) {
    lyricsBox.innerHTML = escapeHtml(lyric.content).replace(/\n/g, "<br>");
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
  const saveLyricBtn = document.getElementById('saveLyric');

  if (saveLyricBtn) {
    saveLyricBtn.addEventListener('click', saveLyric);
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

  // Clear all lyrics
  const clearAllBtn = document.getElementById('clearAllLyrics');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllLyrics);
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
  const navLyrics = document.getElementById('navLyrics');
  const backBtn = document.getElementById('backButton');

  if (navLyrics) {
    navLyrics.addEventListener('click', () => {
      document.getElementById('mainPage').classList.add('hidden');
      document.getElementById('savedPage').classList.remove('hidden');
      loadLyrics();
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
  loadLyrics();
});

// Expose functions to window for inline event handlers
window.showSong = showSong;
window.deleteLyric = deleteLyric;
window.renameLyric = renameLyric;

// --- Search Functions ---
function initSearch() {
  const searchInput = document.getElementById('searchLyrics');
  const clearBtn = document.getElementById('clearSearch');
  const searchResults = document.getElementById('searchResults');
  
  if (!searchInput) return;
  
  // Real-time search as user types
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    
    if (query.length === 0) {
      clearSearch();
      return;
    }
    
    performSearch(query);
    clearBtn.classList.remove('hidden');
  });
  
  // Clear search button
  if (clearBtn) {
    clearBtn.addEventListener('click', clearSearch);
  }
  
  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container') && !e.target.closest('.search-results')) {
      searchResults.classList.add('hidden');
    }
  });
}

function performSearch(query) {
  const lyrics = getLyrics();
  const searchResults = document.getElementById('searchResults');
  const lyricsList = document.getElementById('lyricsList');
  
  // Filter lyrics that match title or content
  const results = lyrics.map((lyric, index) => {
    const titleMatch = lyric.title.toLowerCase().includes(query);
    const contentMatch = lyric.content.toLowerCase().includes(query);
    const score = (titleMatch ? 2 : 0) + (contentMatch ? 1 : 0);
    
    return { lyric, index, score, titleMatch, contentMatch };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  
  // Show/hide main list
  if (results.length > 0) {
    lyricsList.classList.add('hidden');
    searchResults.classList.remove('hidden');
    
    // Build results HTML
    searchResults.innerHTML = results.map(({ lyric, index, titleMatch, contentMatch }) => {
      // Find matching snippet from content
      let preview = lyric.content.substring(0, 100) + '...';
      let highlightedTitle = escapeHtml(lyric.title);
      let highlightedPreview = escapeHtml(preview);
      
      // Highlight matching text
      if (titleMatch) {
        highlightedTitle = highlightMatch(highlightedTitle, query);
      }
      if (contentMatch) {
        const matchIndex = lyric.content.toLowerCase().indexOf(query);
        const start = Math.max(0, matchIndex - 40);
        const end = Math.min(lyric.content.length, matchIndex + query.length + 40);
        preview = (start > 0 ? '...' : '') + lyric.content.substring(start, end) + (end < lyric.content.length ? '...' : '');
        highlightedPreview = highlightMatch(escapeHtml(preview), query);
      }
      
      return `
        <div class="search-result-item" onclick="window.showSong(${index}); clearSearch();">
          <div class="search-result-title">${highlightedTitle}</div>
          <div class="search-result-preview">${highlightedPreview}</div>
        </div>
      `;
    }).join('');
  } else {
    searchResults.innerHTML = '<div class="no-results">No songs found matching "' + escapeHtml(query) + '"</div>';
    searchResults.classList.remove('hidden');
    lyricsList.classList.add('hidden');
  }
}

function highlightMatch(text, query) {
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<span class="search-highlight">$1</span>');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearSearch() {
  const searchInput = document.getElementById('searchLyrics');
  const clearBtn = document.getElementById('clearSearch');
  const searchResults = document.getElementById('searchResults');
  const lyricsList = document.getElementById('lyricsList');
  
  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  if (searchResults) searchResults.classList.add('hidden');
  if (lyricsList) lyricsList.classList.remove('hidden');
}

// --- Page setup ---
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Firebase Auth
  initAuth();
  
  // Initialize search
  initSearch();

  // ... (keep all your existing event listeners below) ...
  
  // Main page elements
  const saveLyricBtn = document.getElementById('saveLyric');
  if (saveLyricBtn) {
    saveLyricBtn.addEventListener('click', saveLyric);
  }

  // ... (rest of your existing code) ...
});

// Expose functions to window for inline event handlers
window.showSong = showSong;
window.deleteLyric = deleteLyric;
window.renameLyric = renameLyric;
window.clearSearch = clearSearch; // Expose clearSearch too
