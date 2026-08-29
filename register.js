document.addEventListener("DOMContentLoaded", () => {
  const registerForm = document.getElementById("register-form");

  // Your URL here was already correct — no change needed to this line.
  const BACKEND_URL = "https://study-planner-backend-8nea.onrender.com";

  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = document.getElementById("register-name").value.trim();
      const email = document.getElementById("register-email").value.trim();
      const password = document.getElementById("register-password").value.trim();
      const confirmPassword = document.getElementById("register-confirm-password").value.trim();

      if (name === "" || email === "" || password === "" || confirmPassword === "") {
        alert("Please fill out all fields!");
        return;
      }

      if (password !== confirmPassword) {
        alert("Passwords do not match!");
        return;
      }

      // ⚠️ FIXED: previously this fetch() had no .then()/.catch() at all,
      // so the "Registration successful!" alert and redirect below used
      // to run IMMEDIATELY, before the backend even responded — meaning
      // it showed "success" even if the request silently failed. Now the
      // alert/redirect only happen AFTER the backend actually confirms it.
      fetch(`${BACKEND_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            alert(data.error || "Registration failed. Please try again.");
            return;
          }

          alert("Registration successful! Please login now.");
          window.location.href = "login.html";
        })
        .catch(err => {
          console.error("Register error:", err);
          alert("Couldn't reach the server. Wait 30-60 seconds (it may be waking up) and try again.");
        });
    });
  }
});
