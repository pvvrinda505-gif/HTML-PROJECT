document.addEventListener("DOMContentLoaded", () => {
  console.log("Calendar Loaded ✅");

  const BACKEND_URL = "https://study-planner-backend-8nea.onrender.com";

  function formatMinutesToHM(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}:${String(mins).padStart(2, "0")}`;
  }

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

  let history = []; // now populated from the backend's permanent record,
                     // not localStorage["studyHistory"]

  // ---------------- Subject Color Assignment ----------------
  // Prefer the permanent color saved in the database (bg_color/text_color,
  // returned on every session row) — this is what subjectColorMap holds,
  // built fresh from loadHistory() each time. Falls back to the old
  // per-browser localStorage assignment only for legacy subjects that were
  // created before colors were saved to the database (bg_color/text_color
  // still NULL there).
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

  let subjectColorMap = {}; // subject name -> {bg, text}, from the database

  function getSubjectColor(subject) {
    if (subjectColorMap[subject]) return subjectColorMap[subject];

    let storedColors = JSON.parse(localStorage.getItem("subjectColors")) || {};
    if (!storedColors[subject]) {
      const usedCount = Object.keys(storedColors).length;
      storedColors[subject] = subjectColorPalette[usedCount % subjectColorPalette.length];
      localStorage.setItem("subjectColors", JSON.stringify(storedColors));
    }
    return storedColors[subject];
  }

  // ---------------- Load permanent history from the backend ----------------
  // includeDeleted=true — Calendar shows every session ever created,
  // regardless of whether it was later deleted from the Planner.
  async function loadHistory() {
    try {
      const res = await fetch(`${BACKEND_URL}/sessions?user_id=${userId}&includeDeleted=true`);
      if (!res.ok) throw new Error("Failed to load history");
      const rows = await res.json();

      // Build the color map straight from the database's saved colors
      subjectColorMap = {};
      rows.forEach(s => {
        if (s.subject_name && s.bg_color && s.text_color && !subjectColorMap[s.subject_name]) {
          subjectColorMap[s.subject_name] = { bg: s.bg_color, text: s.text_color };
        }
      });

      // Normalize backend field names to what the render functions expect
      history = rows
        .map(s => ({
          id: s.session_id,
          subject: s.subject_name,
          topic: s.topic,
          duration: s.duration,
          date: s.planned_date ? String(s.planned_date).slice(0, 10) : null, // "YYYY-MM-DD"
          time: s.planned_time,
          completed: !!s.completed,
        }))
        .filter(h => h.date); // skip anything without a planned date

      renderWeeklyUpdate();
      renderTaskSection();
      renderCalendar();
    } catch (err) {
      console.error("Load history error:", err);
      const container = document.getElementById("weekly-update-list");
      if (container) {
        container.innerHTML = `<p class="empty-msg">Couldn't load your history. The server may be waking up — try refreshing in a moment.</p>`;
      }
    }
  }

  // ---------------- Weekly Update (left) ----------------
  function renderWeeklyUpdate() {
    const container = document.getElementById("weekly-update-list");
    container.innerHTML = "";

    if (history.length === 0) {
      container.innerHTML = `<p class="empty-msg">No study sessions logged yet.</p>`;
      return;
    }

    const byDate = {};
    history.forEach(h => {
      if (!byDate[h.date]) byDate[h.date] = [];
      byDate[h.date].push(h);
    });

    const sortedDates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));

    sortedDates.forEach(date => {
      const entries = byDate[date];
      const dayName = new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" });

      const dateBlock = document.createElement("div");
      dateBlock.classList.add("weekly-date-block");

      let html = `<h3>${formatDisplayDate(date)} (${dayName})</h3>`;

      const bySubject = {};
      entries.forEach(e => {
        if (!bySubject[e.subject]) bySubject[e.subject] = [];
        bySubject[e.subject].push(e);
      });

      Object.keys(bySubject).forEach(subject => {
        html += `<p class="weekly-subject">${subject}</p>`;
        bySubject[subject].forEach(topicEntry => {
          html += `
            <div class="weekly-topic-row">
              <span>${topicEntry.topic} — ${formatMinutesToHM(topicEntry.duration)} (h:m)</span>
              <span class="status-badge ${topicEntry.completed ? "badge-completed" : "badge-pending"}">
                ${topicEntry.completed ? "Completed" : "Pending"}
              </span>
            </div>
          `;
        });
      });

      dateBlock.innerHTML = html;
      container.appendChild(dateBlock);
    });
  }

  function formatDisplayDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  // ---------------- Task Section (right) ----------------
  function renderTaskSection() {
    const taskList = document.getElementById("task-list");
    taskList.innerHTML = "";

    const uniqueSubjects = [...new Set(history.map(h => h.subject))];

    if (uniqueSubjects.length === 0) {
      taskList.innerHTML = `<li class="empty-msg">No subjects yet.</li>`;
      return;
    }

    uniqueSubjects.forEach(subject => {
      const li = document.createElement("li");
      li.textContent = subject;
      const color = getSubjectColor(subject);
      li.style.background = color.bg;
      li.style.color = color.text;
      taskList.appendChild(li);
    });
  }

  // ---------------- Calendar Grid (center) ----------------
  const grid = document.getElementById("calendar-grid");
  const monthYearEl = document.getElementById("month-year");
  const prevBtn = document.getElementById("prev-month");
  const nextBtn = document.getElementById("next-month");

  const modalOverlay = document.getElementById("day-modal-overlay");
  const modalTitle = document.getElementById("day-modal-title");
  const modalBody = document.getElementById("day-modal-body");
  const modalClose = document.getElementById("day-modal-close");

  let currentDate = new Date();

  function formatDateKey(year, month, day) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];
    monthYearEl.textContent = `${monthNames[month]} ${year}`;

    grid.innerHTML = "";

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayOfMonth; i++) {
      const empty = document.createElement("div");
      empty.classList.add("cal-day", "empty");
      grid.appendChild(empty);
    }

    const todayKey = formatDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = formatDateKey(year, month, day);
      const cell = document.createElement("div");
      cell.classList.add("cal-day");
      if (dateKey === todayKey) cell.classList.add("today");

      const dayEntries = history.filter(h => h.date === dateKey);
      const totalMinutes = dayEntries.reduce((sum, e) => sum + (Number(e.duration) || 0), 0);
      const uniqueSubjectsToday = [...new Set(dayEntries.map(e => e.subject))];

      let cellHTML = `<div class="cal-day-number">${day}</div>`;

      if (dayEntries.length > 0) {
        cellHTML += `<div class="cal-total">${formatMinutesToHM(totalMinutes)}</div>`;
        uniqueSubjectsToday.slice(0, 2).forEach(subj => {
          const color = getSubjectColor(subj);
          cellHTML += `<div class="cal-chip" style="background:${color.bg}; color:${color.text};">${subj}</div>`;
        });
        if (uniqueSubjectsToday.length > 2) {
          cellHTML += `<div class="cal-more">+${uniqueSubjectsToday.length - 2} more</div>`;
        }
      }

      cell.innerHTML = cellHTML;

      if (dayEntries.length > 0) {
        cell.addEventListener("click", () => openDayModal(dateKey, dayEntries));
      }

      grid.appendChild(cell);
    }
  }

  function openDayModal(dateKey, dayEntries) {
    modalTitle.textContent = formatDisplayDate(dateKey);
    modalBody.innerHTML = "";

    const totalMinutes = dayEntries.reduce((sum, e) => sum + (Number(e.duration) || 0), 0);
    const totalLine = document.createElement("p");
    totalLine.innerHTML = `<strong>Total study time:</strong> ${formatMinutesToHM(totalMinutes)} (h:m)`;
    totalLine.style.marginBottom = "10px";
    modalBody.appendChild(totalLine);

    dayEntries.forEach(e => {
      const card = document.createElement("div");
      card.classList.add("day-session-card");
      card.innerHTML = `
        <h4>${e.subject}</h4>
        <p><strong>Topic:</strong> ${e.topic}</p>
        <p><strong>Duration:</strong> ${formatMinutesToHM(e.duration)} (h:m)</p>
        <p><strong>Time:</strong> ${e.time || "—"}</p>
        <span class="status ${e.completed ? "completed" : "in-progress"}">
          ${e.completed ? "COMPLETED" : "IN PROGRESS"}
        </span>
      `;
      modalBody.appendChild(card);
    });

    modalOverlay.classList.add("active");
  }

  modalClose.addEventListener("click", () => modalOverlay.classList.remove("active"));
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove("active");
  });

  prevBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  // ---------------- Init ----------------
  loadHistory();
});