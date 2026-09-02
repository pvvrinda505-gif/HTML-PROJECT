
document.addEventListener("DOMContentLoaded", () => {
  console.log("Nav Protect Loaded ✅");

  const isLoggedIn = !!localStorage.getItem("loggedIn");

  document.querySelectorAll(".nav-links a").forEach(link => {
    const href = link.getAttribute("href");

    if (href === "login.html" && window.location.pathname !== "/login.html") {
  if (isLoggedIn) {
    link.textContent = "Profile";
    link.setAttribute("href", "profile.html");
  }
}


    // Protect Planner and Dashboard
    if (href === "planner.html" || href === "dashboard.html") {
      link.addEventListener("click", (e) => {
        if (!localStorage.getItem("loggedIn")) {
          e.preventDefault(); // stop navigation
          alert("Please login or register first!");
          window.location.href = "login.html";
        }
      });
    }
  });

  // Add a Logout link directly in the navbar, right after the Profile link,
  // so logging out doesn't require going into the Profile page first.
  // Uses querySelectorAll (not querySelector) so this still works correctly
  // even if a page accidentally has more than one .nav-links list.
  if (isLoggedIn) {
    document.querySelectorAll(".nav-links").forEach(navList => {
      if (navList.querySelector("#nav-logout-btn")) return; // already added here

      const li = document.createElement("li");
      const logoutLink = document.createElement("a");
      logoutLink.href = "#";
      logoutLink.id = "nav-logout-btn";
      logoutLink.textContent = "Logout";
      logoutLink.addEventListener("click", (e) => {
        e.preventDefault();
        const confirmLogout = confirm("Are you sure you want to log out?");
        if (!confirmLogout) return;
        localStorage.removeItem("loggedIn");
        localStorage.removeItem("userId");
        window.location.href = "index.html";
      });
      li.appendChild(logoutLink);
      navList.appendChild(li);
    });
  }
});
