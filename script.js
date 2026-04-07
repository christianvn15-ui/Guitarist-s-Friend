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
  const setlistAuthStatus = document.getElementById('setlistAuthStatus');

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      authButton.textContent = 'Quit';
      authButton.onclick = handleSignOut;
      if (authStatus) {
        authStatus.textContent = `Signed in as: ${user.displayName || user.email}`;
        authStatus.className = 'auth-status signed-in';
      }
      if (setlistAuthStatus) {
        setlistAuthStatus.textContent = `Signed in as: ${user.displayName || user.email}`;
        setlistAuthStatus.className = 'auth-status signed-in';
      }
      startRealtimeSync();
    } else {
      authButton.textContent = 'Sign In';
      authButton.onclick = signInWithGoogle;
      if (authStatus) {
        authStatus.textContent = 'Not signed in - using local storage only';
        authStatus.className = 'auth-status signed-out';
      }
      if (setlistAuthStatus) {
        setlistAuthStatus.textContent = 'Not signed in - using local storage only';
        setlistAuthStatus.className = 'auth-status signed-out';
      }
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

  stopRealtimeSync();

  const userDocRef = doc(db, 'users', currentUser.uid);
  unsubscribeFromLyrics = onSnapshot(userDocRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      console.log('[Sync] Received data from cloud:', data);

      if (data.lyrics) {
        const cloudLyrics = data.lyrics;
        const localLyrics = getLyrics();

        const cloudLyricsJson = JSON.stringify(cloudLyrics);
        const localLyricsJson = JSON.stringify(localLyrics);

        if (cloudLyricsJson !== localLyricsJson) {
          console.log('[Sync] Cloud lyrics differ from local, updating...');
          saveLyrics(cloudLyrics);
          loadLyrics();
          updateSyncStatus('Synced from cloud');
        }
      }
      
      if (data.setlists) {
        const cloudSetlists = data.setlists;
        const localSetlists = getSetlists();
        
        const cloudSetlistsJson = JSON.stringify(cloudSetlists);
        const localSetlistsJson = JSON.stringify(localSetlists);
        
        if (cloudSetlistsJson !== localSetlistsJson) {
          console.log('[Sync] Cloud setlists differ from local, updating...');
          saveSetlists(cloudSetlists);
          
          if (!document.getElementById('setlistsPage').classList.contains('hidden')) {
            loadSetlists();
          }
          if (!document.getElementById('setlistDetailPage').classList.contains('hidden')) {
            loadSetlistSongs();
          }
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
    id: Date.now().toString()
  };
  lyrics.push(newLyric);
  saveLyrics(lyrics);

  lyricsArea.value = '';
  titleInput.value = '';
  loadLyrics();

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
    const setlists = getSetlists();
    
    console.log('[Sync] Uploading to cloud:', { lyrics, setlists });

    await setDoc(doc(db, 'users', currentUser.uid), {
      lyrics: lyrics,
      setlists: setlists,
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
  document.getElementById('setlistDetailPage').classList.add('hidden');
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

// --- Search Functions ---
function initSearch() {
  const searchInput = document.getElementById('searchLyrics');
  const clearBtn = document.getElementById('clearSearch');
  const searchResults = document.getElementById('searchResults');
  
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    
    if (query.length === 0) {
      clearSearch();
      return;
    }
    
    performSearch(query);
    clearBtn.classList.remove('hidden');
  });
  
  if (clearBtn) {
    clearBtn.addEventListener('click', clearSearch);
  }
  
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
  
  const results = lyrics.map((lyric, index) => {
    const titleMatch = lyric.title.toLowerCase().includes(query);
    const contentMatch = lyric.content.toLowerCase().includes(query);
    const score = (titleMatch ? 2 : 0) + (contentMatch ? 1 : 0);
    
    return { lyric, index, score, titleMatch, contentMatch };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  
  if (results.length > 0) {
    lyricsList.classList.add('hidden');
    searchResults.classList.remove('hidden');
    
    searchResults.innerHTML = results.map(({ lyric, index, titleMatch, contentMatch }) => {
      let preview = lyric.content.substring(0, 100) + '...';
      let highlightedTitle = escapeHtml(lyric.title);
      let highlightedPreview = escapeHtml(preview);
      
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

// --- Setlist System ---

function getSetlists() {
  const setlists = localStorage.getItem('setlists');
  return setlists ? JSON.parse(setlists) : [];
}

function saveSetlists(setlists) {
  localStorage.setItem('setlists', JSON.stringify(setlists));
}

function getCurrentSetlistId() {
  return localStorage.getItem('currentSetlistId');
}

function setCurrentSetlistId(id) {
  if (id) {
    localStorage.setItem('currentSetlistId', id);
  } else {
    localStorage.removeItem('currentSetlistId');
  }
}

// CREATE SETLIST FUNCTION - THIS WAS MISSING!
function createSetlist() {
  const nameInput = document.getElementById('newSetlistName');
  const name = nameInput.value.trim();
  
  if (!name) {
    alert('Please enter a setlist name');
    return;
  }

  const setlists = getSetlists();
  const newSetlist = {
    id: Date.now().toString(),
    name: name,
    songIds: [],
    createdAt: new Date().toISOString()
  };
  
  setlists.push(newSetlist);
  saveSetlists(setlists);
  
  nameInput.value = '';
  loadSetlists();
  
  if (currentUser) {
    syncToCloud();
  }
}

function loadSetlists() {
  const setlistsList = document.getElementById('setlistsList');
  if (!setlistsList) return;

  const setlists = getSetlists();
  
  if (setlists.length === 0) {
    setlistsList.innerHTML = `
      <div class="empty-setlists">
        <i class="fas fa-folder-open"></i>
        <p>No setlists yet. Create your first setlist above!</p>
      </div>
    `;
    return;
  }

  setlistsList.innerHTML = setlists.map(setlist => {
    const songCount = setlist.songIds ? setlist.songIds.length : 0;
    return `
      <div class="setlistItem" data-setlist-id="${setlist.id}">
        <div class="setlist-info" onclick="window.openSetlist('${setlist.id}')">
          <div class="setlist-name">${escapeHtml(setlist.name)}</div>
          <div class="setlist-count">${songCount} song${songCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="setlist-actions-inline">
          <button onclick="event.stopPropagation(); window.renameSetlistPrompt('${setlist.id}')" class="setlist-inline-btn rename-inline-btn" title="Rename">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="event.stopPropagation(); window.deleteSetlistPrompt('${setlist.id}')" class="setlist-inline-btn delete-inline-btn" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
          <div class="setlist-arrow" onclick="window.openSetlist('${setlist.id}')">
            <i class="fas fa-chevron-right"></i>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renameSetlistPrompt(setlistId) {
  const setlists = getSetlists();
  const setlist = setlists.find(s => s.id === setlistId);
  
  if (!setlist) return;
  
  const newName = prompt('Enter new name for setlist:', setlist.name);
  if (!newName || newName.trim() === '') return;
  
  setlist.name = newName.trim();
  saveSetlists(setlists);
  
  loadSetlists();
  
  if (currentUser) {
    syncToCloud();
  }
}

function deleteSetlistPrompt(setlistId) {
  const setlists = getSetlists();
  const setlist = setlists.find(s => s.id === setlistId);
  
  if (!setlist) return;
  
  if (!confirm(`Delete setlist "${setlist.name}"? This cannot be undone.`)) {
    return;
  }
  
  const newSetlists = setlists.filter(s => s.id !== setlistId);
  saveSetlists(newSetlists);
  
  loadSetlists();
  
  if (currentUser) {
    syncToCloud();
  }
}

function openSetlist(setlistId) {
  const setlists = getSetlists();
  const setlist = setlists.find(s => s.id === setlistId);
  
  if (!setlist) return;
  
  setCurrentSetlistId(setlistId);
  
  document.getElementById('setlistsPage').classList.add('hidden');
  document.getElementById('setlistDetailPage').classList.remove('hidden');
  
  document.getElementById('currentSetlistName').textContent = setlist.name;
  
  loadSetlistSongs();
}

function loadSetlistSongs() {
  const setlistId = getCurrentSetlistId();
  if (!setlistId) return;
  
  const setlists = getSetlists();
  const setlist = setlists.find(s => s.id === setlistId);
  
  if (!setlist) return;
  
  const songsList = document.getElementById('setlistSongsList');
  const lyrics = getLyrics();
  
  if (!setlist.songIds || setlist.songIds.length === 0) {
    songsList.innerHTML = `
      <div class="empty-setlists">
        <i class="fas fa-music"></i>
        <p>No songs in this setlist yet. Click "Add Songs" to get started!</p>
      </div>
    `;
    return;
  }
  
  songsList.innerHTML = setlist.songIds.map((songId, index) => {
    const song = lyrics.find(l => l.id === songId);
    if (!song) return '';
    
    const originalIndex = lyrics.findIndex(l => l.id === songId);
    
    return `
      <div class="setlistSongItem">
        <div class="song-number">${index + 1}</div>
        <strong>${escapeHtml(song.title)}</strong>
        <button onclick="window.showSong(${originalIndex})" class="open-btn">Open</button>
        <button onclick="window.removeSongFromSetlist('${songId}')" class="remove-from-setlist">
          <i class="fas fa-minus"></i>
        </button>
      </div>
    `;
  }).join('');
}

function showAddSongsPanel() {
  const panel = document.getElementById('addSongsPanel');
  const availableList = document.getElementById('availableSongsList');
  
  const setlistId = getCurrentSetlistId();
  const setlists = getSetlists();
  const setlist = setlists.find(s => s.id === setlistId);
  const lyrics = getLyrics();
  
  if (lyrics.length === 0) {
    availableList.innerHTML = '<p>No songs in your library. Add some songs first!</p>';
    panel.classList.remove('hidden');
    return;
  }
  
  availableList.innerHTML = lyrics.map((song, index) => {
    const isAdded = setlist.songIds && setlist.songIds.includes(song.id);
    
    return `
      <div class="available-song-item ${isAdded ? 'added' : ''}" data-song-id="${song.id}">
        <div>
          <strong>${escapeHtml(song.title)}</strong>
        </div>
        <button 
          onclick="window.addSongToSetlist('${song.id}')" 
          class="add-song-btn"
          ${isAdded ? 'disabled' : ''}
        >
          ${isAdded ? '<i class="fas fa-check"></i> Added' : '<i class="fas fa-plus"></i> Add'}
        </button>
      </div>
    `;
  }).join('');
  
  panel.classList.remove('hidden');
}

function addSongToSetlist(songId) {
  const setlistId = getCurrentSetlistId();
  const setlists = getSetlists();
  const setlistIndex = setlists.findIndex(s => s.id === setlistId);
  
  if (setlistIndex === -1) return;
  
  if (!setlists[setlistIndex].songIds) {
    setlists[setlistIndex].songIds = [];
  }
  
  if (setlists[setlistIndex].songIds.includes(songId)) {
    return;
  }
  
  setlists[setlistIndex].songIds.push(songId);
  saveSetlists(setlists);
  
  const songElement = document.querySelector(`[data-song-id="${songId}"]`);
  if (songElement) {
    songElement.classList.add('added');
    const btn = songElement.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-check"></i> Added';
  }
  
  loadSetlistSongs();
  
  if (currentUser) {
    syncToCloud();
  }
}

function removeSongFromSetlist(songId) {
  const setlistId = getCurrentSetlistId();
  const setlists = getSetlists();
  const setlistIndex = setlists.findIndex(s => s.id === setlistId);
  
  if (setlistIndex === -1) return;
  
  setlists[setlistIndex].songIds = setlists[setlistIndex].songIds.filter(id => id !== songId);
  saveSetlists(setlists);
  
  loadSetlistSongs();
  
  if (currentUser) {
    syncToCloud();
  }
}

// --- Page setup ---
document.addEventListener("DOMContentLoaded", () => {
  initAuth();
  initSearch();

  const saveLyricBtn = document.getElementById('saveLyric');
  if (saveLyricBtn) {
    saveLyricBtn.addEventListener('click', saveLyric);
  }

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

  const clearAllBtn = document.getElementById('clearAllLyrics');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllLyrics);
  }

  const syncButton = document.getElementById('syncButton');
  if (syncButton) {
    syncButton.addEventListener('click', syncToCloud);
  }

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

  const navLyrics = document.getElementById('navLyrics');
  const backBtn = document.getElementById('backButton');

  if (navLyrics) {
    navLyrics.addEventListener('click', () => {
      document.getElementById('mainPage').classList.add('hidden');
      document.getElementById('setlistsPage').classList.add('hidden');
      document.getElementById('setlistDetailPage').classList.add('hidden');
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

  // Setlist navigation
  const navSetlists = document.getElementById('navSetlists');
  if (navSetlists) {
    navSetlists.addEventListener('click', () => {
      document.getElementById('mainPage').classList.add('hidden');
      document.getElementById('savedPage').classList.add('hidden');
      document.getElementById('songViewPage').classList.add('hidden');
      document.getElementById('setlistsPage').classList.remove('hidden');
      loadSetlists();
    });
  }

  const backFromSetlists = document.getElementById('backFromSetlists');
  if (backFromSetlists) {
    backFromSetlists.addEventListener('click', () => {
      document.getElementById('setlistsPage').classList.add('hidden');
      document.getElementById('mainPage').classList.remove('hidden');
    });
  }

  // CREATE SETLIST BUTTON LISTENER
  const createSetlistBtn = document.getElementById('createSetlist');
  if (createSetlistBtn) {
    createSetlistBtn.addEventListener('click', createSetlist);
  }

  const backToSetlists = document.getElementById('backToSetlists');
  if (backToSetlists) {
    backToSetlists.addEventListener('click', () => {
      document.getElementById('setlistDetailPage').classList.add('hidden');
      document.getElementById('setlistsPage').classList.remove('hidden');
      setCurrentSetlistId(null);
      loadSetlists();
    });
  }

  const addSongsBtn = document.getElementById('addSongsToSetlist');
  if (addSongsBtn) {
    addSongsBtn.addEventListener('click', showAddSongsPanel);
  }

  const closeAddSongs = document.getElementById('closeAddSongs');
  if (closeAddSongs) {
    closeAddSongs.addEventListener('click', () => {
      document.getElementById('addSongsPanel').classList.add('hidden');
    });
  }

  document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.log('Failed to re-acquire wake lock:', err);
      }
    }
  });

  loadLyrics();
});

// Expose functions to window
window.showSong = showSong;
window.deleteLyric = deleteLyric;
window.renameLyric = renameLyric;
window.clearSearch = clearSearch;
window.openSetlist = openSetlist;
window.addSongToSetlist = addSongToSetlist;
window.removeSongFromSetlist = removeSongFromSetlist;
window.renameSetlistPrompt = renameSetlistPrompt;
window.deleteSetlistPrompt = deleteSetlistPrompt;
