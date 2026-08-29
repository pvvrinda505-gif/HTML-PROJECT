document.addEventListener("DOMContentLoaded", () => {
  console.log("Profile Loaded ✅");

  const BACKEND_URL = "https://study-planner-backend-8nea.onrender.com";

  if (!localStorage.getItem("loggedIn")) {
    alert("Please login or register first!");
    window.location.href = "login.html";
    return;
  }

  const userId = localStorage.getItem("userId");
  if (!userId) {
    alert("Your session looks outdated. Please log in again.");
    localStorage.removeItem("loggedIn");
    window.location.href = "login.html";
    return;
  }

  // Same fixed palette used across Planner/Calendar, so a subject's
  // color here matches everywhere else if it doesn't have one saved yet.
  const subjectColorPalette = [
    { bg: "#ccfbf1", text: "#0f766e" },
    { bg: "#fee2e2", text: "#b91c1c" },
    { bg: "#fef3c7", text: "#92400e" },
    { bg: "#dbeafe", text: "#1e40af" },
    { bg: "#ede9fe", text: "#6d28d9" },
    { bg: "#fce7f3", text: "#9d174d" },
    { bg: "#d1fae5", text: "#065f46" },
    { bg: "#e0e7ff", text: "#3730a3" },
  ];

  // ---------------- Element refs ----------------
  const avatarInitial = document.getElementById("avatar-initial");
  const displayName = document.getElementById("display-name");
  const displayEmail = document.getElementById("display-email");
  const displayCreated = document.getElementById("display-created");

  const infoName = document.getElementById("info-name");
  const infoEmail = document.getElementById("info-email");
  const infoCreated = document.getElementById("info-created");

  const subjectList = document.getElementById("subject-list");
  const addSubjectBtn = document.getElementById("add-subject-btn");

  const toggleEditBtn = document.getElementById("toggle-edit-btn");
  const editForm = document.getElementById("edit-form");
  const profileNameInput = document.getElementById("profile-name");
  const profileEmailInput = document.getElementById("profile-email");
  const profileStatus = document.getElementById("profile-status");

  const prefPomodoro = document.getElementById("pref-pomodoro");
  const prefShort = document.getElementById("pref-short");
  const prefLong = document.getElementById("pref-long");
  const savePrefsBtn = document.getElementById("save-prefs-btn");
  const prefStatus = document.getElementById("pref-status");

  const changePasswordBtn = document.getElementById("change-password-btn");
  const passwordForm = document.getElementById("password-form");
  const currentPasswordInput = document.getElementById("current-password");
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const savePasswordBtn = document.getElementById("save-password-btn");
  const passwordStatus = document.getElementById("password-status");

  const logoutBtn = document.getElementById("logout-btn");
  const avatarInput = document.getElementById("avatar-input");

  let currentUser = null;

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  // ---------------- Avatar upload ----------------
  // Reads the chosen file, converts it to a base64 data URL (no external
  // image hosting needed), previews it immediately, then saves it.
  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Please choose an image smaller than 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;

      // Preview immediately, before the save even finishes
      avatarInitial.innerHTML = `<img src="${dataUrl}" alt="Profile photo" />`;

      try {
        const res = await fetch(`${BACKEND_URL}/profile/${userId}/avatar`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatar_url: dataUrl }),
        });
        if (!res.ok) throw new Error("Failed to save photo");
      } catch (err) {
        console.error("Avatar upload error:", err);
        alert("Couldn't save your photo. Please try again.");
      }
    };
    reader.readAsDataURL(file);
  });

  // ---------------- Load everything ----------------
  async function loadProfile() {
    try {
      const res = await fetch(`${BACKEND_URL}/profile/${userId}`);
      if (!res.ok) throw new Error("Failed to load profile");
      const user = await res.json();
      currentUser = user;

      avatarInitial.textContent = (user.name || "?").charAt(0).toUpperCase();
      if (user.avatar_url) {
        avatarInitial.innerHTML = `<img src="${user.avatar_url}" alt="Profile photo" />`;
      } else {
        avatarInitial.textContent = (user.name || "?").charAt(0).toUpperCase();
      }
      displayName.textContent = user.name;
      displayEmail.textContent = user.email;
      displayCreated.textContent = `Member since ${formatDate(user.created_at)}`;

      infoName.textContent = user.name;
      infoEmail.textContent = user.email;
      infoCreated.textContent = formatDate(user.created_at);

      profileNameInput.value = user.name;
      profileEmailInput.value = user.email;

      prefPomodoro.value = localStorage.getItem("pomodoroDurationMinutes") || 25;
      prefShort.value = localStorage.getItem("shortBreakDurationMinutes") || 5;
      prefLong.value = localStorage.getItem("longBreakDurationMinutes") || 15;

      renderSubjects(user.subjects || []);
    } catch (err) {
      console.error("Load profile error:", err);
    }
  }

  function renderSubjects(subjects) {
    subjectList.innerHTML = "";
    if (subjects.length === 0) {
      subjectList.innerHTML = `<p style="color:#94a3b8; font-size:14px;">No subjects yet.</p>`;
      return;
    }

    subjects.forEach((s, i) => {
      const color = s.bg_color && s.text_color
        ? { bg: s.bg_color, text: s.text_color }
        : subjectColorPalette[i % subjectColorPalette.length];

      const row = document.createElement("div");
      row.className = "subject-row";
      row.innerHTML = `
        <div class="subject-icon" style="background:${color.bg}; color:${color.text};">
          ${s.subject_name.charAt(0).toUpperCase()}
        </div>
        <span>${s.subject_name}</span>
      `;
      subjectList.appendChild(row);
    });
  }

  // ---------------- Edit profile toggle ----------------
  toggleEditBtn.addEventListener("click", () => {
    editForm.classList.toggle("active");
  });

  document.getElementById("save-profile-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    profileStatus.textContent = "";

    const name = profileNameInput.value.trim();
    const email = profileEmailInput.value.trim();
    if (!name || !email) {
      profileStatus.style.color = "#b91c1c";
      profileStatus.textContent = "Name and email can't be empty.";
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/profile/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      profileStatus.style.color = "#0f766e";
      profileStatus.textContent = "Saved!";
      await loadProfile();
    } catch (err) {
      profileStatus.style.color = "#b91c1c";
      profileStatus.textContent = err.message;
    }
  });

  // ---------------- Add subject ----------------
  addSubjectBtn.addEventListener("click", async () => {
    const subjectName = prompt("New subject name:");
    if (!subjectName || !subjectName.trim()) return;

    try {
      const existingRes = await fetch(`${BACKEND_URL}/subjects?user_id=${userId}`);
      const existing = existingRes.ok ? await existingRes.json() : [];
      const next = subjectColorPalette[existing.length % subjectColorPalette.length];

      await fetch(`${BACKEND_URL}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          subject_name: subjectName.trim(),
          bg_color: next.bg,
          text_color: next.text,
        }),
      });

      await loadProfile();
    } catch (err) {
      console.error("Add subject error:", err);
      alert("Couldn't add that subject. Please try again.");
    }
  });

  // ---------------- Study preferences ----------------
  // Saved to localStorage (not the database) — this browser/device only.
  // dashboard.js reads these same keys when starting a Pomodoro round.
  savePrefsBtn.addEventListener("click", () => {
    prefStatus.textContent = "";

    const pomodoro_duration = Number(prefPomodoro.value);
    const short_break_duration = Number(prefShort.value);
    const long_break_duration = Number(prefLong.value);

    if (!pomodoro_duration || !short_break_duration || !long_break_duration) {
      prefStatus.style.color = "#b91c1c";
      prefStatus.textContent = "Enter valid numbers for all three.";
      return;
    }

    localStorage.setItem("pomodoroDurationMinutes", pomodoro_duration);
    localStorage.setItem("shortBreakDurationMinutes", short_break_duration);
    localStorage.setItem("longBreakDurationMinutes", long_break_duration);

    prefStatus.style.color = "#0f766e";
    prefStatus.textContent = "Preferences saved! They'll apply next time you start a Pomodoro round.";
  });

  // ---------------- Change password ----------------
  changePasswordBtn.addEventListener("click", () => {
    passwordForm.style.display = passwordForm.style.display === "none" ? "block" : "none";
  });

  savePasswordBtn.addEventListener("click", async () => {
    passwordStatus.textContent = "";

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!currentPassword || !newPassword) {
      passwordStatus.style.color = "#b91c1c";
      passwordStatus.textContent = "Fill in all password fields.";
      return;
    }
    if (newPassword.length < 6) {
      passwordStatus.style.color = "#b91c1c";
      passwordStatus.textContent = "New password must be at least 6 characters.";
      return;
    }
    if (newPassword !== confirmPassword) {
      passwordStatus.style.color = "#b91c1c";
      passwordStatus.textContent = "Passwords don't match.";
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/profile/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentUser.name,
          email: currentUser.email,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      passwordStatus.style.color = "#0f766e";
      passwordStatus.textContent = "Password updated!";
      currentPasswordInput.value = "";
      newPasswordInput.value = "";
      confirmPasswordInput.value = "";
    } catch (err) {
      passwordStatus.style.color = "#b91c1c";
      passwordStatus.textContent = err.message;
    }
  });

  // ---------------- Logout ----------------
  logoutBtn.addEventListener("click", () => {
    const confirmLogout = confirm("Are you sure you want to log out?");
    if (!confirmLogout) return;
    localStorage.removeItem("loggedIn");
    localStorage.removeItem("userId");
    window.location.href = "index.html";
  });

  // ---------------- Init ----------------
  loadProfile();
});