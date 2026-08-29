document.addEventListener("DOMContentLoaded", () => {
  console.log("Dashboard Loaded ✅");

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

  // ---------------- Duration Helpers ----------------
  function parseDuration(input) {
    // Accepts "1" as 1 hour, "1:75" as 1 hour 75 minutes
    if (input.includes(":")) {
      const [hrs, mins] = input.split(":").map(Number);
      return (hrs * 60) + mins; // total minutes
    } else {
      return Number(input) * 60; // treat plain number as hours
    }
  }

  function formatDuration(minutes) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
    if (hrs > 0) return `${hrs} hr`;
    return `${mins} min`;
  }

  if (!localStorage.getItem("loggedIn")) {
    alert("Please login or register first!");
    window.location.href = "login.html";
  }

  // ---------------- Pomodoro Timer ----------------
  let time = 25 * 60; // default 25 minutes, always defined
  let timerInterval = null;
  let breakInterval = null;
  let pomodoroCompleted = 0;   // mirrors the ACTIVE subject's saved count
  let completedMinutes = 0;   // mirrors the ACTIVE subject's saved minutes
  let roundStartTimestamp = null; // when the current 25-min round began, for logging to the backend

  const timerEl = document.getElementById("timer");
  const startBtn = document.getElementById("start-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const resetBtn = document.getElementById("reset-btn");
  const completedEl = document.getElementById("pomodoro-completed");
  const timerLabelEl = document.getElementById("timer-label");
  const progressCircle = document.getElementById("timer-progress-circle");
  const breakBtn = document.getElementById("break-btn");

  // ---------------- Per-Subject Progress (persistent, from the database) ----------------
  // This now reads/writes the pomodoro_logs table via the backend instead of
  // localStorage — so completed Pomodoro rounds actually survive a browser
  // change, not just a refresh on the same machine.
  async function loadSubjectStats(subject) {
    const session = sessions.find(s => s.subject && s.subject.trim() === subject);
    if (!session || !session.subject_id) {
      completedMinutes = 0;
      pomodoroCompleted = 0;
      if (completedEl) completedEl.textContent = pomodoroCompleted;
      updateProgress();
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/pomodoro-logs/subject/${session.subject_id}`);
      if (!res.ok) throw new Error("Failed to load pomodoro stats");
      const data = await res.json();
      completedMinutes = Number(data.completed_minutes) || 0;
      pomodoroCompleted = Number(data.pomodoro_completed) || 0;
    } catch (err) {
      console.error("Load subject stats error:", err);
      completedMinutes = 0;
      pomodoroCompleted = 0;
    }

    if (completedEl) completedEl.textContent = pomodoroCompleted;
    // Only redraw if this is still the active subject — avoids a slow
    // response overwriting the display after the user already switched.
    if (localStorage.getItem("activeTimerSubject") === subject) {
      updateProgress();
    }
  }

  // Sends one completed 25-minute round to the backend so it's permanently
  // recorded against this session/subject, instead of only living in
  // localStorage.
  async function logPomodoroRound(startTimestamp, endTimestamp) {
    const sessionId = localStorage.getItem("activeSessionId");
    if (!sessionId) return;

    try {
      await fetch(`${BACKEND_URL}/pomodoro-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: Number(sessionId),
          start_time: new Date(startTimestamp).toISOString().slice(0, 19).replace("T", " "),
          end_time: new Date(endTimestamp).toISOString().slice(0, 19).replace("T", " "),
          minutes_completed: 25,
        }),
      });
    } catch (err) {
      console.error("Log pomodoro round error:", err);
    }
  }

  // ---------------- Planner Completion Awareness ----------------
  // Checks the `sessions` array loaded from the backend (see loadDashboardData
  // below). Planner.js no longer writes a "sessions" key to localStorage at
  // all — it saves straight to the database — so reading from localStorage
  // here was always stale/empty. This now reads from the same in-memory
  // array that was fetched from the backend on page load.
  function isSubjectCompleted(subject) {
    const match = sessions.find(s => s.subject && s.subject.trim() === subject);
    return match ? !!match.completed : false;
  }

  // A dynamically-inserted note shown in place of "Sessions Completed: N"
  // when the active subject is already marked complete in the Planner.
  let completionNoteEl = null;

  function updateSubjectCompletionUI(subject) {
    const completed = isSubjectCompleted(subject);

    if (startBtn) {
      startBtn.disabled = completed;
      startBtn.style.opacity = completed ? "0.5" : "1";
      startBtn.style.cursor = completed ? "not-allowed" : "pointer";
      startBtn.title = completed ? "This subject is already marked complete in your Planner." : "";
    }

    if (timerLabelEl) {
      timerLabelEl.textContent = completed ? `✅ ${subject} — already completed` : `Studying: ${subject}`;
    }

    if (completedEl && completedEl.parentElement) {
      const sessionsLine = completedEl.parentElement;
      if (completed) {
        sessionsLine.style.display = "none";
        if (!completionNoteEl) {
          completionNoteEl = document.createElement("p");
          completionNoteEl.textContent = "✅ Marked complete in Planner — no Pomodoro rounds needed.";
          sessionsLine.parentNode.insertBefore(completionNoteEl, sessionsLine.nextSibling);
        } else {
          completionNoteEl.style.display = "";
        }
      } else {
        sessionsLine.style.display = "";
        if (completionNoteEl) completionNoteEl.style.display = "none";
      }
    }
  }

  // Restores the timer label to the correct state for the active subject —
  // "Studying: X" or the "already completed" message — instead of leaving
  // whatever label was showing before (e.g. a stale "On a break ☕").
  function resetTimerLabel() {
    const activeSub = localStorage.getItem("activeTimerSubject");
    if (activeSub) {
      updateSubjectCompletionUI(activeSub);
    } else if (timerLabelEl) {
      timerLabelEl.textContent = "Focus mode is on";
    }
  }

  // ---------------- Pomodoro Persistence (the CURRENT countdown only) ----------------
  // NOTE: this only stores which subject the running/paused countdown
  // belongs to, and how much time is left — NOT completed totals anymore.
  // Completed totals live in subjectStats above so they're never lost.
  function saveRunningState(endTimestamp) {
    localStorage.setItem("pomodoroState", JSON.stringify({
      subject: localStorage.getItem("activeTimerSubject") || null,
      isRunning: true,
      endTimestamp
    }));
  }

  function savePausedState() {
    localStorage.setItem("pomodoroState", JSON.stringify({
      subject: localStorage.getItem("activeTimerSubject") || null,
      isRunning: false,
      remainingSeconds: time
    }));
  }

  function loadPomodoroState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem("pomodoroState"));
    } catch (e) {
      saved = null;
    }

    const activeSubject = localStorage.getItem("activeTimerSubject");

    // Only restore the countdown if it belongs to the currently active subject.
    if (!saved || saved.subject !== activeSubject) {
      time = 25 * 60;
      updateTimer();
      return;
    }

    if (saved.isRunning && saved.endTimestamp) {
      const now = Date.now();
      time = Math.max(0, Math.floor((saved.endTimestamp - now) / 1000));
      updateTimer();
      roundStartTimestamp = saved.endTimestamp - 25 * 60 * 1000;

      if (time > 0) {
        runTimer(saved.endTimestamp);
      } else {
        localStorage.removeItem("pomodoroState");
        handleSessionComplete();
      }
    } else if (typeof saved.remainingSeconds === "number") {
      time = saved.remainingSeconds;
      updateTimer();
    } else {
      time = 25 * 60;
      updateTimer();
    }
  }

  // ---------------- Sessions (now loaded from the backend, not localStorage) ----------------
  // This used to read a "sessions" key from localStorage, which planner.js
  // hasn't written to since it was switched over to the backend — so this
  // was always showing whatever was left over from before that rewire
  // (e.g. a "Physics" subject that was deleted from the database ages ago).
  let sessions = [];

  // ---------------- Subject Selection ----------------
  const subjectOptionsEl = document.getElementById("subject-options");
  const subjectButtons = [];
  let totalDuration = Number(localStorage.getItem("activeTimerDuration"))
                   || Number(localStorage.getItem("plannedDuration"))
                   || 120;

  // A session is "in progress" (locked) if the timer is actively running,
  // on a break, or paused partway through — in all of these cases the
  // user must hit Reset before switching to a different subject.
  function isSessionLocked() {
    return timerInterval !== null || breakInterval !== null || (time > 0 && time < 25 * 60);
  }

  function updateSubjectLockUI() {
    const locked = isSessionLocked();
    subjectButtons.forEach(btn => {
      const isActive = btn.classList.contains("active");
      if (locked && !isActive) {
        btn.disabled = true;
        btn.style.opacity = "0.4";
        btn.style.cursor = "not-allowed";
        btn.title = "Finish or Reset your current session to switch subjects.";
      } else {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.title = "";
      }
    });
  }

  function setActiveSubjectUI(subject) {
    subjectButtons.forEach(b => b.classList.toggle("active", b.textContent === subject));
    localStorage.setItem("activeTimerSubject", subject);

    const session = sessions.find(s => s.subject.trim() === subject);
    if (session) {
      localStorage.setItem("activeTimerDuration", session.duration);
      localStorage.setItem("activeSessionId", session.id);
      localStorage.setItem("activeSubjectId", session.subject_id);
      totalDuration = Number(session.duration);
    }

    if (timerLabelEl) {
      timerLabelEl.textContent = `Studying: ${subject}`;
    }

    loadSubjectStats(subject); // pulls THIS subject's own saved progress
    updateSubjectCompletionUI(subject); // disables Start if already done in Planner
    updateProgress();
  }

  function renderSubjectButtons() {
    if (!subjectOptionsEl) return;

    subjectOptionsEl.innerHTML = "";
    subjectButtons.length = 0;

    const subjects = [...new Set(sessions.map(s => s.subject.trim()))];
    const colorClasses = ["color-1", "color-2", "color-3", "color-4"];

    subjects.forEach((subject, i) => {
      const btn = document.createElement("button");
      btn.classList.add("subject-btn", colorClasses[i % colorClasses.length]);
      btn.textContent = subject;

      btn.addEventListener("click", () => {
        // Extra safety guard — the button should already be disabled
        // while locked, but this prevents any edge-case click-through.
        const currentActive = localStorage.getItem("activeTimerSubject");
        if (isSessionLocked() && subject !== currentActive) {
          return;
        }

        setActiveSubjectUI(subject);

        // Switching subjects always starts that subject at a fresh 25:00 —
        // switching is only ever allowed when nothing is in progress anyway.
        time = 25 * 60;
        updateTimer();
        localStorage.removeItem("pomodoroState");
      });

      subjectOptionsEl.appendChild(btn);
      subjectButtons.push(btn);
    });

    // Restore whichever subject was active before refresh/navigation, but
    // only if it's still a real subject (drop it if it was deleted).
    const activeSubjectSaved = localStorage.getItem("activeTimerSubject");
    if (activeSubjectSaved && subjects.includes(activeSubjectSaved)) {
      setActiveSubjectUI(activeSubjectSaved);
    } else if (activeSubjectSaved) {
      localStorage.removeItem("activeTimerSubject");
    }
  }

  // ---------------- Timer Display ----------------
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  if (progressCircle) {
    progressCircle.style.strokeDasharray = `${circumference}`;
    progressCircle.style.strokeDashoffset = `0`;
  }

  // NOTE: no parameter here — uses the outer `time` variable directly.
  function updateTimer() {
    if (time == null || isNaN(time)) {
      time = 25 * 60; // fallback default
    }
    const minutes = Math.floor(time / 60);
    const secs = time % 60;
    if (timerEl) {
      timerEl.textContent = `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
    }

    if (progressCircle) {
      const fractionElapsed = 1 - time / (25 * 60);
      progressCircle.style.strokeDashoffset = `${circumference * fractionElapsed}`;
    }

    updateSubjectLockUI(); // keeps subject-switch lock in sync with timer state
  }

  function updateProgress() {
    const progressEl = document.getElementById("progress");
    if (!progressEl) return;

    const activeSubject = localStorage.getItem("activeTimerSubject");
    if (!activeSubject) {
      progressEl.textContent = `Completed: 0 min / 0 min`;
    } else if (isSubjectCompleted(activeSubject)) {
      // Planner already says this subject is done — show it as fully
      // complete rather than whatever partial Pomodoro time was logged.
      progressEl.textContent = `✅ Completed: ${formatDuration(totalDuration)} / ${formatDuration(totalDuration)}`;
    } else {
      progressEl.textContent = `Completed: ${formatDuration(completedMinutes)} / ${formatDuration(totalDuration)}`;
    }
  }

  // ---------------- Pomodoro Cycle ----------------
  function startPomodoro() {
    const durationMs = (time && time > 0 ? time : 25 * 60) * 1000;
    const endTimestamp = Date.now() + durationMs;

    roundStartTimestamp = Date.now();
    saveRunningState(endTimestamp);
    runTimer(endTimestamp);
  }

  function runTimer(endTimestamp) {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTimestamp - now) / 1000));
      time = remaining;
      updateTimer();

      if (remaining <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        localStorage.removeItem("pomodoroState");
        handleSessionComplete();
      }
    }, 1000);

    updateSubjectLockUI(); // lock immediately, don't wait for the first tick
  }

  // Runs a 5-minute break countdown (timer face shows the break time),
  // then resets to a fresh 25:00 session for the same subject.
  function startBreakCountdown() {
    let breakTime = 5 * 60;
    updateBreakDisplay(breakTime);
    updateSubjectLockUI(); // stay locked during the break too

    if (breakInterval) clearInterval(breakInterval);
    breakInterval = setInterval(() => {
      breakTime--;
      updateBreakDisplay(breakTime);

      if (breakTime <= 0) {
        clearInterval(breakInterval);
        breakInterval = null;
        alert("✅ Break finished! Ready for next Pomodoro.");
        time = 25 * 60;
        resetTimerLabel(); // clear the stale "On a break ☕" label
        updateTimer(); // also unlocks subject switching again
        localStorage.removeItem("pomodoroState");
      }
    }, 1000);
  }

  function updateBreakDisplay(breakTime) {
    const minutes = Math.floor(breakTime / 60);
    const secs = breakTime % 60;
    if (timerEl) {
      timerEl.textContent = `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
    }
    if (timerLabelEl) {
      timerLabelEl.textContent = "On a break ☕";
    }
  }

  function handleSessionComplete() {
    pomodoroCompleted += 1;
    completedMinutes += 25;
    if (completedEl) completedEl.textContent = pomodoroCompleted;
    updateProgress();

    // Persist to the database — this is what actually fixes "progress not
    // updating" and "nothing in pomodoro_logs": before, this 25 minutes only
    // existed in memory/localStorage and never reached the backend at all.
    const endTimestamp = Date.now();
    const startTimestamp = roundStartTimestamp || (endTimestamp - 25 * 60 * 1000);
    logPomodoroRound(startTimestamp, endTimestamp);
    roundStartTimestamp = null;

    // Give the browser a moment to actually paint the updated progress
    // text before the blocking confirm() dialog freezes rendering.
    setTimeout(() => {
      if (completedMinutes >= totalDuration) {
        alert("🎉 Pomodoro session completed!\n\n⏰ Total study time finished! Great work today.");
        time = 25 * 60;
        updateTimer();
        localStorage.removeItem("pomodoroState");
        return;
      }

      // confirm() gives a real OK / Cancel choice — OK = take the break,
      // Cancel = skip it and go straight to the next session.
      const wantsBreak = confirm(
        "🎉 Pomodoro session completed!\n\nTake a 5-minute break?\n\nOK = Take Break     Cancel = Skip Break"
      );

      if (wantsBreak) {
        startBreakCountdown();
      } else {
        time = 25 * 60;
        updateTimer(); // also unlocks subject switching
        if (timerLabelEl) {
          const activeSub = localStorage.getItem("activeTimerSubject");
          timerLabelEl.textContent = activeSub ? `Studying: ${activeSub}` : "Focus mode is on";
        }
        localStorage.removeItem("pomodoroState");
      }
    }, 50);
  }

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      const activeSubject = localStorage.getItem("activeTimerSubject");
      if (activeSubject && isSubjectCompleted(activeSubject)) {
        alert("This subject is already marked complete in your Planner. Select a different subject to keep studying.");
        return;
      }

      // If a break is currently running, Start means "never mind, skip the
      // rest of the break" — cancel it cleanly before starting the next
      // Pomodoro round. Without this, clicking Start during a break would
      // run two competing timers at once.
      if (breakInterval) {
        clearInterval(breakInterval);
        breakInterval = null;
        time = 25 * 60;
        if (timerLabelEl) {
          timerLabelEl.textContent = activeSubject ? `Studying: ${activeSubject}` : "Focus mode is on";
        }
      }

      if (!timerInterval) startPomodoro();
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      savePausedState();
      updateSubjectLockUI(); // still locked — time hasn't returned to 25:00
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      // Reset abandons only the CURRENT in-progress countdown — it does
      // NOT wipe this subject's already-completed minutes/sessions, since
      // that time was genuinely studied and stays banked in subjectStats.
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      if (breakInterval) {
        clearInterval(breakInterval);
        breakInterval = null;
      }
      time = 25 * 60;
      resetTimerLabel(); // clear any stale "On a break ☕" label
      updateTimer(); // also unlocks subject switching
      updateProgress();
      localStorage.removeItem("pomodoroState");
    });
  }

  if (breakBtn) {
    breakBtn.addEventListener("click", () => {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        savePausedState();
      }
      startBreakCountdown();
    });
  }

  // ---------------- Dashboard Stats + Charts ----------------
  const statTotal = document.getElementById("stat-total");
  const statCompleted = document.getElementById("stat-completed");
  const statPending = document.getElementById("stat-pending");
  const statRate = document.getElementById("stat-rate");
  const statMinutes = document.getElementById("stat-minutes");
  const statusCtx = document.getElementById("statusChart");
  const subjectCtx = document.getElementById("subjectChart");

  let statusChartInstance = null;
  let subjectChartInstance = null;

  function renderStatsAndCharts() {
    const total = sessions.length;
    const completed = sessions.filter(s => s.completed).length;
    const pending = total - completed;
    const rate = total ? Math.round((completed / total) * 100) : 0;
    const minutes = sessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);

    if (statTotal) statTotal.textContent = total;
    if (statCompleted) statCompleted.textContent = completed;
    if (statPending) statPending.textContent = pending;
    if (statRate) statRate.textContent = `${rate}%`;
    if (statMinutes) statMinutes.textContent = formatDuration(minutes);

    // Pie chart — destroy any previous instance first so re-running this
    // (e.g. after a refresh from the backend) doesn't stack duplicate charts
    // on the same canvas.
    if (statusCtx) {
      if (statusChartInstance) statusChartInstance.destroy();
      statusChartInstance = new Chart(statusCtx, {
        type: "pie",
        data: {
          labels: ["Pending", "Completed"],
          datasets: [{ data: [pending, completed], backgroundColor: ["#f59e0b", "#22c55e"] }],
        },
        options: { plugins: { legend: { position: "bottom" } } },
      });
    }

    // Bar chart
    if (subjectCtx) {
      const bySubject = {};
      sessions.forEach((s) => {
        const key = s.subject.trim();
        bySubject[key] = (bySubject[key] || 0) + (Number(s.duration) || 0);
      });

      if (subjectChartInstance) subjectChartInstance.destroy();
      subjectChartInstance = new Chart(subjectCtx, {
        type: "bar",
        data: {
          labels: Object.keys(bySubject),
          datasets: [{
            label: "Total Hours",
            data: Object.values(bySubject).map(m => (m / 60).toFixed(2)), // convert minutes to hours
            backgroundColor: "#0f766e"
          }],
        },
        options: { scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } },
      });
    }
  }

  const clearBtn = document.getElementById("clear-history-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      alert("Study sessions now live in your account on the server — delete or complete individual sessions from the Planner page instead of clearing everything here.");
    });
  }

  // ---------------- Load sessions from the backend, then build the UI ----------------
  async function loadDashboardData() {
    try {
      const res = await fetch(`${BACKEND_URL}/sessions?user_id=${userId}`);
      if (!res.ok) throw new Error("Failed to load sessions");
      const rows = await res.json();
      sessions = rows.map(s => ({
        id: s.session_id,
        subject_id: s.subject_id,
        subject: s.subject_name,
        topic: s.topic,
        duration: s.duration,
        completed: !!s.completed,
      }));
    } catch (err) {
      console.error("Load dashboard data error:", err);
      sessions = [];
    }

    renderSubjectButtons();
    renderStatsAndCharts();
    loadPomodoroState(); // restore running/paused timer if one exists for the active subject
    updateProgress();
  }

  loadDashboardData();
});