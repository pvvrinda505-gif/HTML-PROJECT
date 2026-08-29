document.addEventListener("DOMContentLoaded", () => {
  console.log("Planner Loaded ✅");

  const BACKEND_URL = "https://study-planner-backend-8nea.onrender.com";

  // Converts "1:30" -> 90 minutes, "1" -> 60 minutes, "45" (no colon, under 60) -> 45 minutes
  function parseHoursToMinutes(input) {
    const str = String(input).trim();
    if (str.includes(":")) {
      const [h, m] = str.split(":");
      const hours = Number(h) || 0;
      const mins = Number(m) || 0;
      return hours * 60 + mins;
    }
    return (Number(str) || 0) * 60; // no colon = treat as HOURS
  }

  // Converts total minutes back into "H:MM" for display, e.g. 145 -> "2:25"
  function formatMinutesToHM(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}:${String(mins).padStart(2, "0")}`;
  }

  // ---------------- Subject Colors (assigned once, saved permanently) ----------------
  // Same palette calendar.js uses to display these — assigning the color HERE,
  // at creation time, and saving it to the subjects table means every subject
  // gets one fixed color forever, the same on every device/browser, instead
  // of being reassigned randomly each time a page loads.
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

  // Looks up whether this subject already exists (and already has a color),
  // or picks the next unused palette color for a brand-new subject.
  async function getSubjectColorForCreate(subjectName) {
    try {
      const res = await fetch(`${BACKEND_URL}/subjects?user_id=${userId}`);
      const existing = res.ok ? await res.json() : [];

      const match = existing.find(
        s => s.subject_name.trim().toLowerCase() === subjectName.trim().toLowerCase()
      );
      if (match) {
        // Already exists — keep whatever color it already has (don't reassign).
        return { bg_color: match.bg_color, text_color: match.text_color };
      }

      const next = subjectColorPalette[existing.length % subjectColorPalette.length];
      return { bg_color: next.bg, text_color: next.text };
    } catch (err) {
      console.error("Color lookup error:", err);
      return { bg_color: null, text_color: null };
    }
  }

  if (!localStorage.getItem("loggedIn")) {
    alert("Please login or register first!");
    window.location.href = "login.html";
    return;
  }

  // userId is set by the backend-based login.js — if it's missing, this is
  // an old session from before the backend rewire, so force a fresh login.
  const userId = localStorage.getItem("userId");
  if (!userId) {
    alert("Your session looks outdated. Please log in again.");
    localStorage.removeItem("loggedIn");
    window.location.href = "login.html";
    return;
  }

  const plannerForm = document.getElementById("planner-form");
  const sessionList = document.getElementById("session-list");

  const totalSessionsEl = document.getElementById("total-sessions");
  const completedSessionsEl = document.getElementById("completed-sessions");
  const activeSessionsEl = document.getElementById("active-sessions");

  let sessions = []; // now populated FROM the backend/database, not localStorage

  // ---------------- Fetch + Render ----------------
  async function loadSessions() {
    try {
      const res = await fetch(`${BACKEND_URL}/sessions?user_id=${userId}`);
      if (!res.ok) throw new Error("Failed to load sessions");
      sessions = await res.json();
      renderSessions();
    } catch (err) {
      console.error("Load sessions error:", err);
      if (sessionList) {
        sessionList.innerHTML = `<p class="empty-msg">Couldn't load your sessions. The server may be waking up — try refreshing in a moment.</p>`;
      }
    }
  }

  function renderSessions() {
    sessionList.innerHTML = "";
    let total = 0, completed = 0, active = 0;

    sessions.forEach((s) => {
      total++;
      if (s.completed) completed++;
      else active++;

      const card = document.createElement("div");
      card.classList.add("session-card");
      if (s.completed) card.classList.add("completed");

      card.innerHTML = `
        <h3>${s.subject_name}</h3>
        <p><strong>Topic:</strong> ${s.topic}</p>
        <p><strong>Duration:</strong> ${formatMinutesToHM(s.duration)} (h:m)</p>
        <span class="status ${s.completed ? "completed" : "in-progress"}">
          ${s.completed ? "COMPLETED" : "IN PROGRESS"}
        </span>
        <div class="session-actions">
          <button class="btn-complete" data-id="${s.session_id}">Complete</button>
          <button class="btn-delete" data-id="${s.session_id}">Delete</button>
        </div>
      `;
      sessionList.appendChild(card);
    });

    if (totalSessionsEl) totalSessionsEl.textContent = total;
    if (completedSessionsEl) completedSessionsEl.textContent = completed;
    if (activeSessionsEl) activeSessionsEl.textContent = active;
  }

  // ---------------- Add Session ----------------
  if (plannerForm) {
    plannerForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      const subjectName = document.getElementById("subject").value.trim();
      const topic = document.getElementById("topic").value.trim();
      const durationInput = document.getElementById("duration").value;

      if (!subjectName || !topic || !durationInput) {
        alert("Please fill out all fields!");
        return;
      }

      const duration = parseHoursToMinutes(durationInput);
      const now = new Date();
      const plannedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const plannedTime = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const submitBtn = plannerForm.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Adding...";
      }

      try {
        // Step 1: make sure this subject exists for this user
        // (creates it if it's new, returns the existing one if not).
        // Assign a fixed color from the palette if this is a brand-new subject.
        const { bg_color, text_color } = await getSubjectColorForCreate(subjectName);

        const subjectRes = await fetch(`${BACKEND_URL}/subjects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, subject_name: subjectName, bg_color, text_color }),
        });
        const subjectData = await subjectRes.json();
        if (!subjectRes.ok) throw new Error(subjectData.error || "Could not create subject");

        const subjectId = subjectData.subject.subject_id;

        // Step 2: create the session, linked to that subject
        const sessionRes = await fetch(`${BACKEND_URL}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject_id: subjectId,
            topic,
            duration,
            planned_date: plannedDate,
            planned_time: plannedTime,
          }),
        });
        const sessionData = await sessionRes.json();
        if (!sessionRes.ok) throw new Error(sessionData.error || "Could not create session");

        localStorage.setItem("plannedDuration", duration);

        plannerForm.reset();
        await loadSessions(); // refresh the list straight from the database
      } catch (err) {
        console.error("Add session error:", err);
        alert("Couldn't save this session. Please check your connection and try again.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Add Study Session";
        }
      }
    });
  }

  // ---------------- Complete / Delete ----------------
  if (sessionList) {
    sessionList.addEventListener("click", async function (e) {
      const id = e.target.dataset.id;
      if (!id) return;

      if (e.target.classList.contains("btn-complete")) {
        try {
          const res = await fetch(`${BACKEND_URL}/sessions/${id}/complete`, { method: "PATCH" });
          if (!res.ok) throw new Error("Failed to mark complete");

          // Log this completion to the calendar table too — a permanent
          // record of exactly when this session was finished and how much
          // time it covered, separate from the Pomodoro round-by-round log.
          const completedSession = sessions.find(s => String(s.session_id) === String(id));
          if (completedSession) {
            try {
              await fetch(`${BACKEND_URL}/calendar/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  session_id: completedSession.session_id,
                  completed_at: new Date().toISOString().slice(0, 19).replace("T", " "),
                  duration: completedSession.duration,
                  topic: completedSession.topic,
                }),
              });
            } catch (logErr) {
              // Don't block the Complete action if this secondary log fails —
              // the session itself is already marked complete either way.
              console.error("Log calendar completion error:", logErr);
            }
          }

          await loadSessions();
        } catch (err) {
          console.error("Complete session error:", err);
          alert("Couldn't mark this complete. Please try again.");
        }
      }

      if (e.target.classList.contains("btn-delete")) {
        try {
          const res = await fetch(`${BACKEND_URL}/sessions/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Failed to delete");
          await loadSessions();
        } catch (err) {
          console.error("Delete session error:", err);
          alert("Couldn't delete this session. Please try again.");
        }
      }
    });
  }

  // ---------------- Init ----------------
  loadSessions();
});