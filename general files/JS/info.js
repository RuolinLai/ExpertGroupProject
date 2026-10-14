
import { initializeApp, getApps, getApp } from
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

/*
 * MUSE CONFIGURATION
 * This must match your existing Firebase project's configuration.
 * Reusing getApps() avoids initializing a second Firebase app.
 */
const firebaseConfig = {
  apiKey: "AIzaSyDW86i3G7eLzX6SbxIk-11rdHMzJYZp4S8",
  authDomain: "muse-ae3dc.firebaseapp.com",
  projectId: "muse-ae3dc",
  storageBucket: "muse-ae3dc.firebasestorage.app",
  messagingSenderId: "286418803489",
  appId: "1:286418803489:web:4472ee6365bffb96c0bc60"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = id => document.getElementById(id);

const ui = {
  signedOut: $("signed-out-view"),
  dashboard: $("profile-dashboard"),
  avatarImage: $("avatar-image"),
  avatarInitials: $("avatar-initials"),
  name: $("profile-name"),
  username: $("profile-username"),
  email: $("profile-email"),
  bio: $("profile-bio"),

  editButton: $("edit-profile-btn"),
  signOutButton: $("sign-out-btn"),
  form: $("profile-form"),
  nameInput: $("edit-name"),
  usernameInput: $("edit-username"),
  bioInput: $("edit-bio"),
  genreInput: $("edit-genre"),
  avatarFile: $("avatar-file"),
  saveButton: $("save-profile-btn"),
  cancelButton: $("cancel-edit-btn"),
  status: $("profile-status"),

  statSessions: $("stat-sessions"),
  statMinutes: $("stat-minutes"),
  statTracks: $("stat-tracks"),
  weeklyChart: $("weekly-chart"),
  weeklyEmpty: $("weekly-empty"),
  genreChart: $("genre-chart"),
  genreEmpty: $("genre-empty"),
  topTracks: $("top-tracks"),
  tracksEmpty: $("tracks-empty"),
  recentSessions: $("recent-sessions"),
  sessionsEmpty: $("sessions-empty"),

  chatTab: $("chat-tab"),
  chatDrawer: $("chat-drawer"),
  chatClose: $("chat-close")
};

let currentUser = null;
let currentProfile = {};
let saving = false;

function showStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.style.color = isError ? "#ffb5c5" : "#d8b9ff";
}

function initialsFor(name = "") {
  return name.trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("") || "M";
}

function showAvatar(url, name) {
  if (url) {
    ui.avatarImage.src = url;
    ui.avatarImage.hidden = false;
    ui.avatarInitials.hidden = true;
    ui.avatarImage.onerror = () => {
      ui.avatarImage.hidden = true;
      ui.avatarInitials.hidden = false;
      ui.avatarInitials.textContent = initialsFor(name);
    };
  } else {
    ui.avatarImage.removeAttribute("src");
    ui.avatarImage.hidden = true;
    ui.avatarInitials.hidden = false;
    ui.avatarInitials.textContent = initialsFor(name);
  }
}

function openEditor() {
  ui.nameInput.value = currentProfile.displayName || currentUser?.displayName || "";
  ui.usernameInput.value = currentProfile.username || "";
  ui.bioInput.value = currentProfile.bio || "";
  ui.genreInput.value = currentProfile.favoriteGenre || "";
  ui.avatarFile.value = "";
  ui.form.classList.add("open");
  showStatus("");
}

function closeEditor() {
  ui.form.classList.remove("open");
  ui.avatarFile.value = "";
}

function setSignedInView(isSignedIn) {
  ui.signedOut.hidden = isSignedIn;
  ui.dashboard.hidden = !isSignedIn;
}

function setLoading(message) {
  ui.name.textContent = message;
}

/*
 * Profiles are stored at:
 * users/{uid}/profile/main
 *
 * Session entries:
 * users/{uid}/sessions/{sessionId}
 *
 * Track entries:
 * users/{uid}/tracks/{trackId}
 */
async function loadOrCreateProfile(user) {
  const profileRef = doc(db, "users", user.uid, "profile", "main");
  const snapshot = await getDoc(profileRef);

  if (snapshot.exists()) {
    return { ref: profileRef, data: snapshot.data() };
  }

  const initialProfile = {
    displayName: user.displayName || "",
    email: user.email || "",
    username: "",
    bio: "",
    favoriteGenre: "",
    photoURL: user.photoURL || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(profileRef, initialProfile, { merge: true });
  return { ref: profileRef, data: initialProfile };
}

function renderProfile(profile, user) {
  currentProfile = profile;

  const displayName = profile.displayName || user.displayName || "MUSE member";
  const username = profile.username || "";
  const bio = profile.bio || "Add a little about yourself and your creative journey.";

  ui.name.textContent = displayName;
  ui.username.textContent = username ? `@${username}` : "Add a username";
  ui.email.textContent = user.email || "";
  ui.bio.textContent = bio;

  showAvatar(profile.photoURL || user.photoURL || "", displayName);
}

/*
 * Uploads a custom avatar to a per-user Storage path.
 * Only image files up to 5 MB are accepted by this UI.
 */
async function uploadAvatar(user, file) {
  if (!file) return currentProfile.photoURL || user.photoURL || "";

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Your profile image must be 5 MB or smaller.");
  }

  const safeExtension = file.type === "image/png"
    ? "png"
    : file.type === "image/webp" ? "webp" : "jpg";

  const avatarRef = ref(storage, `user-avatars/${user.uid}/profile.${safeExtension}`);

  await uploadBytes(avatarRef, file, {
    contentType: file.type
  });

  return await getDownloadURL(avatarRef);
}

async function saveProfile(event) {
  event.preventDefault();
  if (!currentUser || saving) return;

  const displayName = ui.nameInput.value.trim();
  const username = ui.usernameInput.value.trim().replace(/^@+/, "");
  const bio = ui.bioInput.value.trim();
  const favoriteGenre = ui.genreInput.value;
  const file = ui.avatarFile.files?.[0] || null;

  if (!displayName) {
    showStatus("Please enter a display name.", true);
    return;
  }

  if (username && !/^[A-Za-z0-9_.-]{2,30}$/.test(username)) {
    showStatus("Username must be 2–30 characters: letters, numbers, dots, underscores, or hyphens.", true);
    return;
  }

  saving = true;
  ui.saveButton.disabled = true;
  ui.saveButton.textContent = "Saving…";
  showStatus("Saving your profile…");

  try {
    const photoURL = await uploadAvatar(currentUser, file);

    const updatedProfile = {
      displayName,
      username,
      bio,
      favoriteGenre,
      photoURL,
      email: currentUser.email || "",
      updatedAt: serverTimestamp()
    };

    const profileRef = doc(db, "users", currentUser.uid, "profile", "main");
    await setDoc(profileRef, updatedProfile, { merge: true });

    // Update Firebase Auth's display name and photo as well.
    await updateProfile(currentUser, {
      displayName,
      photoURL: photoURL || null
    });

    currentProfile = { ...currentProfile, ...updatedProfile };
    renderProfile(currentProfile, currentUser);
    closeEditor();
    showStatus("Profile saved successfully.");
  } catch (error) {
    console.error("Profile save failed:", error);
    showStatus(error.message || "Couldn't save your profile. Check Firebase setup and try again.", true);
  } finally {
    saving = false;
    ui.saveButton.disabled = false;
    ui.saveButton.textContent = "Save changes";
  }
}

/* Small safe DOM helpers: user-provided titles are never inserted as HTML. */
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatDate(value) {
  if (!value) return "Date not provided";
  const date = typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date not provided"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateFromRecord(record) {
  const value = record.date || record.createdAt || record.timestamp;
  if (!value) return null;

  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesFromSession(session) {
  const value = Number(session.durationMinutes ?? session.minutes ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function renderWeeklyChart(sessions) {
  ui.weeklyChart.replaceChildren();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    days.push({ date, minutes: 0 });
  }

  for (const session of sessions) {
    const date = dateFromRecord(session);
    if (!date) continue;
    date.setHours(0, 0, 0, 0);

    const day = days.find(item => item.date.getTime() === date.getTime());
    if (day) day.minutes += minutesFromSession(session);
  }

  const max = Math.max(1, ...days.map(day => day.minutes));
  ui.weeklyEmpty.hidden = days.every(day => day.minutes === 0);

  for (const day of days) {
    const col = makeElement("div", "day-col");
    const bar = makeElement("div", "day-bar");
    bar.style.height = `${Math.max(3, day.minutes / max * 115)}px`;
    bar.title = `${day.minutes} minutes`;

    const label = makeElement("small", "", day.date.toLocaleDateString(undefined, { weekday: "short" }));
    col.append(bar, label);
    ui.weeklyChart.append(col);
  }
}

function renderGenreChart(sessions) {
  ui.genreChart.replaceChildren();

  const counts = new Map();
  for (const session of sessions) {
    const genre = String(session.genre || "").trim();
    if (!genre) continue;
    counts.set(genre, (counts.get(genre) || 0) + minutesFromSession(session));
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  ui.genreEmpty.hidden = ranked.length > 0;

  const max = Math.max(1, ...ranked.map(([, minutes]) => minutes));

  for (const [genre, minutes] of ranked) {
    const row = makeElement("div", "bar-row");
    const label = makeElement("span", "", genre);
    const track = makeElement("div", "bar-track");
    const fill = makeElement("div", "bar-fill");
    fill.style.width = `${minutes / max * 100}%`;
    track.append(fill);
    row.append(label, track, makeElement("span", "", String(minutes)));
    ui.genreChart.append(row);
  }
}

function renderTopTracks(tracks) {
  ui.topTracks.replaceChildren();

  const ranked = tracks
    .map(track => ({
      ...track,
      count: Number(track.playCount ?? track.practiceCount ?? track.count ?? 0)
    }))
    .sort((a, b) => b.count - a.count)
    .filter(track => track.count > 0)
    .slice(0, 5);

  ui.tracksEmpty.hidden = ranked.length > 0;

  ranked.forEach((track, index) => {
    const row = makeElement("article", "track-row");
    row.append(makeElement("span", "rank", String(index + 1)));

    const art = track.artworkURL
      ? document.createElement("img")
      : makeElement("div", "track-art", "♫");

    if (track.artworkURL) {
      art.className = "track-art";
      art.alt = "";
      art.src = track.artworkURL;
      art.onerror = () => {
        const fallback = makeElement("div", "track-art", "♫");
        art.replaceWith(fallback);
      };
    }

    const info = makeElement("div", "track-info");
    info.append(
      makeElement("strong", "", track.title || "Untitled track"),
      makeElement("small", "", track.artist || "Artist not provided")
    );

    row.append(art, info, makeElement("span", "track-count", `${track.count} plays`));
    ui.topTracks.append(row);
  });
}

function renderRecentSessions(sessions) {
  ui.recentSessions.replaceChildren();

  const recent = [...sessions]
    .sort((a, b) => {
      const da = dateFromRecord(a)?.getTime() || 0;
      const db = dateFromRecord(b)?.getTime() || 0;
      return db - da;
    })
    .slice(0, 5);

  ui.sessionsEmpty.hidden = recent.length > 0;

  for (const session of recent) {
    const row = makeElement("article", "session-row");
    row.append(makeElement("span", "track-art", "♫"));

    const info = makeElement("div", "session-info");
    const title = session.title || session.trackTitle || session.activity || "Practice session";
    const detail = [
      session.genre || "Practice",
      formatDate(dateFromRecord(session))
    ].join(" · ");

    info.append(
      makeElement("strong", "", title),
      makeElement("small", "", detail)
    );

    row.append(info, makeElement("span", "track-count", `${minutesFromSession(session)} min`));
    ui.recentSessions.append(row);
  }
}

async function loadActivity(user) {
  const sessionsRef = collection(db, "users", user.uid, "sessions");
  const tracksRef = collection(db, "users", user.uid, "tracks");

  const [sessionSnapshot, trackSnapshot] = await Promise.all([
    getDocs(sessionsRef),
    getDocs(tracksRef)
  ]);

  const sessions = sessionSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const tracks = trackSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));

  const totalMinutes = sessions.reduce((sum, item) => sum + minutesFromSession(item), 0);
  const uniqueTrackIds = new Set(
    sessions.map(item => item.trackId).filter(Boolean)
  );

  ui.statSessions.textContent = String(sessions.length);
  ui.statMinutes.textContent = String(totalMinutes);
  ui.statTracks.textContent = String(Math.max(tracks.length, uniqueTrackIds.size));

  renderWeeklyChart(sessions);
  renderGenreChart(sessions);
  renderTopTracks(tracks);
  renderRecentSessions(sessions);
}

async function loadDashboard(user) {
  currentUser = user;
  setSignedInView(true);
  setLoading("Loading your profile…");

  try {
    const { data } = await loadOrCreateProfile(user);
    renderProfile(data, user);
    await loadActivity(user);
  } catch (error) {
    console.error("Could not load MUSE profile:", error);
    ui.name.textContent = user.displayName || "MUSE member";
    ui.email.textContent = user.email || "";
    showAvatar(user.photoURL || "", user.displayName || "MUSE member");
    showStatus("Your profile couldn't load from Firebase. Check your Firestore and Storage configuration.", true);
  }
}

/* Event listeners are registered only once by this module. */
ui.editButton.addEventListener("click", () => {
  if (ui.form.classList.contains("open")) {
    closeEditor();
  } else {
    openEditor();
  }
});

ui.cancelButton.addEventListener("click", closeEditor);
ui.form.addEventListener("submit", saveProfile);

ui.signOutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error("Sign out failed:", error);
    showStatus("Couldn't sign out. Please try again.", true);
  }
});

/* Empty, collapsible chat panel. No AI behavior is connected. */
function setChatOpen(open) {
  ui.chatDrawer.classList.toggle("open", open);
  ui.chatDrawer.setAttribute("aria-hidden", String(!open));
  ui.chatTab.setAttribute("aria-expanded", String(open));
  ui.chatTab.textContent = open ? "Close Chat" : "MUSE Chat";
}

ui.chatTab.addEventListener("click", () => {
  setChatOpen(!ui.chatDrawer.classList.contains("open"));
});
ui.chatClose.addEventListener("click", () => setChatOpen(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") setChatOpen(false);
});

onAuthStateChanged(auth, user => {
  if (!user) {
    currentUser = null;
    setSignedInView(false);
    return;
  }

  loadDashboard(user);
});

