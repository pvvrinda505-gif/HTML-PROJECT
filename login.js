document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");

  // ⚠️ FIXED: this was pointing at "smart-study-backend.onrender.com"
  // (a placeholder that was never actually created) instead of your
  // real deployed backend. This one line was the main reason login
  // never actually reached your database.
  const BACKEND_URL = "https://study-planner-backend-8nea.onrender.com";

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value.trim();

      if (email === "" || password === "") {
        alert("Please enter both email and password!");
        return;
      }

      // ⚠️ REMOVED: the old localStorage-based check (regEmail/regPassword)
      // is gone — it was letting login "succeed" locally even when the
      // backend call below was silently failing in the background.
      // The backend is now the ONLY thing that decides success/failure.

      fetch(`${BACKEND_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            alert(data.error || "Login failed. Please try again.");
            return;
          }

          // Login confirmed by the backend/database — now safe to store
          // session info (NOT the password) for other pages to use.
          localStorage.setItem("loggedIn", "true");
          localStorage.setItem("userId", data.user.user_id);
          localStorage.setItem("userName", data.user.name);
          localStorage.setItem("userEmail", data.user.email);

          alert("Login successful!");
          window.location.href = "planner.html";
        })
        .catch(err => {
          console.error("Login error:", err);
          alert("Couldn't reach the server. Wait 30-60 seconds (it may be waking up) and try again.");
        });
    });
  }
});